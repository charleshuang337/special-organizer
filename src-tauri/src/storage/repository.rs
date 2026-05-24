use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};

use super::error::StorageError;
use super::types::{
    DeleteSeriesResult, ListSeriesQuery, ReportSeriesQuery, ReportSeriesResult, SeriesHistoryEvent,
    SeriesMutationInput, SpecialSeries, StorageStatus, Supplier, DEFAULT_SUPPLIERS,
    IDEAL_END_STRATEGIES, SCHEMA_VERSION, SPECIAL_SERIES_STATUSES, SPECIAL_TYPES,
};
use super::validation::{
    validate_date_query, validate_enum_values, validate_series_input, validate_status_transition,
    ValidatedSeriesInput,
};

const DATABASE_FILE_NAME: &str = "special-organizer.sqlite3";
const INITIAL_SCHEMA_SQL: &str = include_str!("../../migrations/0001_initial_schema.sql");

static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone)]
pub struct Database {
    db_path: PathBuf,
}

struct Migration {
    version: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: SCHEMA_VERSION,
    sql: INITIAL_SCHEMA_SQL,
}];

impl Database {
    pub fn initialize(app_data_dir: impl AsRef<Path>) -> Result<Self, StorageError> {
        let app_data_dir = app_data_dir.as_ref();
        std::fs::create_dir_all(app_data_dir)?;

        let db_path = app_data_dir.join(DATABASE_FILE_NAME);
        let database = Self { db_path };
        let mut connection = database.open_connection()?;

        run_migrations(&mut connection)?;
        seed_default_suppliers(&connection)?;

        Ok(database)
    }

    pub fn status(&self) -> StorageStatus {
        StorageStatus {
            database_path: self.db_path.to_string_lossy().into_owned(),
            schema_version: SCHEMA_VERSION.to_owned(),
        }
    }

    pub fn list_suppliers(&self) -> Result<Vec<Supplier>, StorageError> {
        let connection = self.open_connection()?;
        let mut statement = connection.prepare(
            "SELECT id, name, is_default, is_active, sort_order
             FROM suppliers
             ORDER BY sort_order ASC, name ASC",
        )?;
        let rows = statement.query_map([], row_to_supplier)?;

        collect_rows(rows)
    }

    pub fn create_series(
        &self,
        input: SeriesMutationInput,
    ) -> Result<SpecialSeries, StorageError> {
        let input = validate_series_input(input)?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction()?;

        ensure_supplier_exists(&transaction, &input.supplier_id)?;

        let status = input.status.clone().unwrap_or_else(|| "DRAFT".to_owned());
        if !matches!(status.as_str(), "DRAFT" | "ACTIVE") {
            return Err(StorageError::validation(
                "INVALID_INITIAL_STATUS",
                Some("status"),
                "新建特价系列只能从 DRAFT 或 ACTIVE 开始。",
            ));
        }

        let id = generate_id("series");

        transaction.execute(
            "INSERT INTO special_series (
                id, supplier_id, series_name, special_type,
                normal_cost, special_supply_cost, regular_price, special_price,
                effective_start_date, effective_end_date, shelf_life_date,
                ideal_end_date, ideal_end_strategy, fixed_period_unit, fixed_period_count,
                status, clearance_completed_at, notes, created_at, updated_at
             )
             VALUES (
                ?1, ?2, ?3, ?4,
                ?5, ?6, ?7, ?8,
                ?9, ?10, ?11,
                ?12, ?13, ?14, ?15,
                ?16, NULL, ?17,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             )",
            params![
                id,
                input.supplier_id,
                input.series_name,
                input.special_type,
                input.normal_cost,
                input.special_supply_cost,
                input.regular_price,
                input.special_price,
                input.effective_start_date,
                input.effective_end_date,
                input.shelf_life_date,
                input.ideal_end_date,
                input.ideal_end_strategy,
                input.fixed_period_unit,
                input.fixed_period_count,
                status,
                input.notes,
            ],
        )?;

        insert_history_event(&transaction, &id, "CREATED", Some("创建特价系列"))?;
        transaction.commit()?;

        self.get_series(&id)
    }

    pub fn update_series(
        &self,
        id: &str,
        input: SeriesMutationInput,
    ) -> Result<SpecialSeries, StorageError> {
        let id = normalize_id(id, "series_id")?;
        let input = validate_series_input(input)?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction()?;
        let existing = get_series_by_id(&transaction, &id)?;

        ensure_supplier_exists(&transaction, &input.supplier_id)?;

        let status = input.status.clone().unwrap_or_else(|| existing.status.clone());
        validate_status_transition(&existing.status, &status)?;
        ensure_update_does_not_reapply(&existing.status, &status)?;

        if status == "CLOSURE_COMPLETED" && existing.status != "CLOSURE_COMPLETED" {
            return Err(StorageError::validation(
                "USE_CLOSURE_COMMAND",
                Some("status"),
                "完成收尾请使用 mark_series_closure_completed。",
            ));
        }

        update_series_row(
            &transaction,
            &id,
            &input,
            &status,
            if status == "CLOSURE_COMPLETED" {
                existing.clearance_completed_at.as_deref()
            } else {
                None
            },
        )?;

        let event_type = if status != existing.status {
            "STATUS_CHANGED"
        } else {
            "UPDATED"
        };
        insert_history_event(&transaction, &id, event_type, Some("更新特价系列"))?;
        transaction.commit()?;

        self.get_series(&id)
    }

    pub fn archive_series(&self, id: &str) -> Result<SpecialSeries, StorageError> {
        let id = normalize_id(id, "series_id")?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction()?;
        let existing = get_series_by_id(&transaction, &id)?;

        if existing.status == "ARCHIVED" {
            transaction.commit()?;
            return Ok(existing);
        }

        validate_status_transition(&existing.status, "ARCHIVED")?;
        transaction.execute(
            "UPDATE special_series
             SET status = 'ARCHIVED',
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![id],
        )?;
        insert_history_event(&transaction, &id, "STATUS_CHANGED", Some("归档特价系列"))?;
        transaction.commit()?;

        self.get_series(&id)
    }

    pub fn delete_series(&self, id: &str) -> Result<DeleteSeriesResult, StorageError> {
        let id = normalize_id(id, "series_id")?;
        let connection = self.open_connection()?;
        let deleted = connection.execute("DELETE FROM special_series WHERE id = ?1", params![id])?;

        if deleted == 0 {
            return Err(StorageError::not_found("special_series", id));
        }

        Ok(DeleteSeriesResult { id, deleted: true })
    }

    pub fn mark_series_closure_completed(
        &self,
        id: &str,
        event_note: Option<String>,
        as_of_date: Option<String>,
    ) -> Result<SpecialSeries, StorageError> {
        let id = normalize_id(id, "series_id")?;
        let as_of_date = normalize_optional_report_date(as_of_date)?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction()?;
        let existing = get_series_by_id(&transaction, &id)?;

        if existing.status == "CLOSURE_COMPLETED" {
            transaction.commit()?;
            return Ok(existing);
        }

        let can_close = existing.status == "ENDED_PENDING_CLEARANCE"
            || is_ideal_end_date_past(
                &transaction,
                existing.ideal_end_date.as_deref(),
                as_of_date.as_deref(),
            )?;

        if !can_close || matches!(existing.status.as_str(), "DRAFT" | "ARCHIVED") {
            return Err(StorageError::validation(
                "INVALID_STATUS_TRANSITION",
                Some("status"),
                "只有已结束待清货的特价系列可以标记收尾完成。",
            ));
        }

        transaction.execute(
            "UPDATE special_series
             SET status = 'CLOSURE_COMPLETED',
                 clearance_completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![id],
        )?;
        insert_history_event(
            &transaction,
            &id,
            "CLOSURE_COMPLETED",
            event_note
                .as_deref()
                .or(Some("特价结束收尾完成")),
        )?;
        transaction.commit()?;

        self.get_series(&id)
    }

    pub fn reapply_series(
        &self,
        id: &str,
        input: SeriesMutationInput,
    ) -> Result<SpecialSeries, StorageError> {
        let id = normalize_id(id, "series_id")?;
        let input = validate_series_input(input)?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction()?;
        let existing = get_series_by_id(&transaction, &id)?;

        validate_status_transition(&existing.status, "ACTIVE")?;
        ensure_supplier_exists(&transaction, &input.supplier_id)?;

        if input
            .status
            .as_deref()
            .is_some_and(|status| status != "ACTIVE")
        {
            return Err(StorageError::validation(
                "INVALID_REAPPLY_STATUS",
                Some("status"),
                "重新应用后状态必须是 ACTIVE。",
            ));
        }

        update_series_row(&transaction, &id, &input, "ACTIVE", None)?;
        insert_history_event(&transaction, &id, "REAPPLIED", Some("重新应用特价系列"))?;
        transaction.commit()?;

        self.get_series(&id)
    }

    pub fn list_series(&self, query: ListSeriesQuery) -> Result<Vec<SpecialSeries>, StorageError> {
        validate_list_query(&query)?;

        let connection = self.open_connection()?;
        let mut sql = base_series_select();
        let mut params = Vec::<Value>::new();

        sql.push_str(" WHERE 1 = 1");

        if !query.include_archived.unwrap_or(false) {
            sql.push_str(" AND special_series.status != 'ARCHIVED'");
        }

        if let Some(search_text) = normalize_optional_query_text(query.search_text) {
            let pattern = format!("%{}%", search_text.to_lowercase());
            sql.push_str(
                " AND (
                    lower(special_series.series_name) LIKE ? OR
                    lower(COALESCE(special_series.notes, '')) LIKE ? OR
                    lower(special_series.supplier_id) LIKE ? OR
                    lower(suppliers.name) LIKE ?
                 )",
            );
            for _ in 0..4 {
                params.push(Value::Text(pattern.clone()));
            }
        }

        push_in_clause(
            &mut sql,
            &mut params,
            "special_series.supplier_id",
            query.supplier_ids.as_ref(),
        );
        push_in_clause(
            &mut sql,
            &mut params,
            "special_series.special_type",
            query.special_types.as_ref(),
        );
        push_in_clause(
            &mut sql,
            &mut params,
            "special_series.status",
            query.statuses.as_ref(),
        );

        if let Some(date_from) = query.date_from {
            sql.push_str(
                " AND (
                    special_series.ideal_end_date >= ? OR
                    special_series.effective_start_date >= ? OR
                    special_series.effective_end_date >= ?
                 )",
            );
            for _ in 0..3 {
                params.push(Value::Text(date_from.clone()));
            }
        }

        if let Some(date_to) = query.date_to {
            sql.push_str(
                " AND (
                    special_series.ideal_end_date <= ? OR
                    special_series.effective_start_date <= ? OR
                    special_series.effective_end_date <= ?
                 )",
            );
            for _ in 0..3 {
                params.push(Value::Text(date_to.clone()));
            }
        }

        sql.push_str(
            " ORDER BY
                special_series.ideal_end_date IS NULL ASC,
                special_series.ideal_end_date ASC,
                special_series.updated_at DESC",
        );

        query_series(&connection, &sql, params)
    }

    pub fn list_report_series(
        &self,
        query: ReportSeriesQuery,
    ) -> Result<ReportSeriesResult, StorageError> {
        validate_report_query(&query)?;

        let connection = self.open_connection()?;
        let include_upcoming = query.include_upcoming.unwrap_or(true);
        let include_ended = query.include_ended.unwrap_or(true);

        let upcoming_end = if include_upcoming {
            query_report_series(&connection, &query, ReportQueryKind::Upcoming)?
        } else {
            Vec::new()
        };
        let ended_pending_clearance = if include_ended {
            query_report_series(&connection, &query, ReportQueryKind::Ended)?
        } else {
            Vec::new()
        };

        Ok(ReportSeriesResult {
            upcoming_end,
            ended_pending_clearance,
        })
    }

    pub fn list_series_history(
        &self,
        series_id: Option<String>,
    ) -> Result<Vec<SeriesHistoryEvent>, StorageError> {
        let connection = self.open_connection()?;
        let mut sql = String::from(
            "SELECT id, series_id, event_type, event_note, created_at
             FROM series_history_events",
        );
        let mut params = Vec::<Value>::new();

        if let Some(series_id) = series_id {
            let series_id = normalize_id(&series_id, "series_id")?;
            sql.push_str(" WHERE series_id = ?");
            params.push(Value::Text(series_id));
        }

        sql.push_str(" ORDER BY created_at DESC");

        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(params.iter()), row_to_history_event)?;

        collect_rows(rows)
    }

    fn get_series(&self, id: &str) -> Result<SpecialSeries, StorageError> {
        let connection = self.open_connection()?;

        get_series_by_id(&connection, id)
    }

    fn open_connection(&self) -> Result<Connection, StorageError> {
        let connection = Connection::open(&self.db_path)?;
        connection.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA journal_mode = WAL;",
        )?;

        Ok(connection)
    }
}

fn run_migrations(connection: &mut Connection) -> Result<(), StorageError> {
    connection.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         )",
        [],
    )?;

    let transaction = connection.transaction()?;

    for migration in MIGRATIONS {
        let already_applied = transaction
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = ?1",
                params![migration.version],
                |_| Ok(()),
            )
            .optional()?
            .is_some();

        if !already_applied {
            transaction.execute_batch(migration.sql)?;
            transaction.execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                params![migration.version],
            )?;
        }
    }

    transaction.commit()?;

    Ok(())
}

fn seed_default_suppliers(connection: &Connection) -> Result<(), StorageError> {
    for (id, name, sort_order) in DEFAULT_SUPPLIERS {
        connection.execute(
            "INSERT INTO suppliers (
                id, name, is_default, is_active, sort_order, created_at, updated_at
             )
             VALUES (
                ?1, ?2, 1, 1, ?3,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             )
             ON CONFLICT(id) DO NOTHING",
            params![id, name, sort_order],
        )?;
    }

    Ok(())
}

fn validate_list_query(query: &ListSeriesQuery) -> Result<(), StorageError> {
    validate_enum_values(query.special_types.as_ref(), SPECIAL_TYPES, "special_types")?;
    validate_enum_values(query.statuses.as_ref(), SPECIAL_SERIES_STATUSES, "statuses")?;

    if let Some(date_from) = &query.date_from {
        validate_date_query(date_from, "date_from")?;
    }

    if let Some(date_to) = &query.date_to {
        validate_date_query(date_to, "date_to")?;
    }

    Ok(())
}

fn validate_report_query(query: &ReportSeriesQuery) -> Result<(), StorageError> {
    validate_date_query(&query.as_of_date, "as_of_date")?;
    validate_enum_values(query.special_types.as_ref(), SPECIAL_TYPES, "special_types")?;

    if query.within_days.is_some_and(|days| days < 0) {
        return Err(StorageError::validation(
            "INVALID_REPORT_WINDOW",
            Some("within_days"),
            "报告窗口必须是非负整数天数。",
        ));
    }

    Ok(())
}

fn ensure_update_does_not_reapply(from: &str, to: &str) -> Result<(), StorageError> {
    if to == "ACTIVE" && matches!(from, "ENDED_PENDING_CLEARANCE" | "CLOSURE_COMPLETED") {
        return Err(StorageError::validation(
            "USE_REAPPLY_COMMAND",
            Some("status"),
            "已结束或已收尾完成的特价系列回到 ACTIVE 必须使用 reapply_series。",
        ));
    }

    Ok(())
}

fn ensure_supplier_exists(connection: &Connection, supplier_id: &str) -> Result<(), StorageError> {
    let exists = connection
        .query_row(
            "SELECT 1 FROM suppliers WHERE id = ?1",
            params![supplier_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some();

    if exists {
        Ok(())
    } else {
        Err(StorageError::validation(
            "UNKNOWN_SUPPLIER",
            Some("supplier_id"),
            "供应商不存在。",
        ))
    }
}

fn update_series_row(
    connection: &Connection,
    id: &str,
    input: &ValidatedSeriesInput,
    status: &str,
    clearance_completed_at: Option<&str>,
) -> Result<(), StorageError> {
    connection.execute(
        "UPDATE special_series
         SET supplier_id = ?2,
             series_name = ?3,
             special_type = ?4,
             normal_cost = ?5,
             special_supply_cost = ?6,
             regular_price = ?7,
             special_price = ?8,
             effective_start_date = ?9,
             effective_end_date = ?10,
             shelf_life_date = ?11,
             ideal_end_date = ?12,
             ideal_end_strategy = ?13,
             fixed_period_unit = ?14,
             fixed_period_count = ?15,
             status = ?16,
             clearance_completed_at = ?17,
             notes = ?18,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![
            id,
            input.supplier_id,
            input.series_name,
            input.special_type,
            input.normal_cost,
            input.special_supply_cost,
            input.regular_price,
            input.special_price,
            input.effective_start_date,
            input.effective_end_date,
            input.shelf_life_date,
            input.ideal_end_date,
            input.ideal_end_strategy,
            input.fixed_period_unit,
            input.fixed_period_count,
            status,
            clearance_completed_at,
            input.notes,
        ],
    )?;

    Ok(())
}

fn get_series_by_id(connection: &Connection, id: &str) -> Result<SpecialSeries, StorageError> {
    connection
        .query_row(
            &format!("{} WHERE special_series.id = ?1", base_series_select()),
            params![id],
            row_to_series,
        )
        .optional()?
        .ok_or_else(|| StorageError::not_found("special_series", id))
}

fn insert_history_event(
    connection: &Connection,
    series_id: &str,
    event_type: &str,
    event_note: Option<&str>,
) -> Result<(), StorageError> {
    let id = generate_id("history");

    connection.execute(
        "INSERT INTO series_history_events (id, series_id, event_type, event_note, created_at)
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![id, series_id, event_type, event_note],
    )?;

    Ok(())
}

fn is_ideal_end_date_past(
    connection: &Connection,
    ideal_end_date: Option<&str>,
    as_of_date: Option<&str>,
) -> Result<bool, StorageError> {
    let Some(ideal_end_date) = ideal_end_date else {
        return Ok(false);
    };

    let is_past = if let Some(as_of_date) = as_of_date {
        connection.query_row(
            "SELECT CASE WHEN date(?1) < date(?2) THEN 1 ELSE 0 END",
            params![ideal_end_date, as_of_date],
            |row| row.get::<_, i64>(0),
        )?
    } else {
        connection.query_row(
            "SELECT CASE WHEN date(?1) < date('now') THEN 1 ELSE 0 END",
            params![ideal_end_date],
            |row| row.get::<_, i64>(0),
        )?
    };

    Ok(is_past == 1)
}

fn base_series_select() -> String {
    String::from(
        "SELECT
            special_series.id,
            special_series.supplier_id,
            special_series.series_name,
            special_series.special_type,
            special_series.normal_cost,
            special_series.special_supply_cost,
            special_series.regular_price,
            special_series.special_price,
            special_series.effective_start_date,
            special_series.effective_end_date,
            special_series.shelf_life_date,
            special_series.ideal_end_date,
            special_series.ideal_end_strategy,
            special_series.fixed_period_unit,
            special_series.fixed_period_count,
            special_series.status,
            special_series.clearance_completed_at,
            special_series.notes,
            special_series.created_at,
            special_series.updated_at
         FROM special_series
         JOIN suppliers ON suppliers.id = special_series.supplier_id",
    )
}

fn query_series(
    connection: &Connection,
    sql: &str,
    params: Vec<Value>,
) -> Result<Vec<SpecialSeries>, StorageError> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params_from_iter(params.iter()), row_to_series)?;

    collect_rows(rows)
}

#[derive(Debug, Clone, Copy)]
enum ReportQueryKind {
    Upcoming,
    Ended,
}

fn query_report_series(
    connection: &Connection,
    query: &ReportSeriesQuery,
    kind: ReportQueryKind,
) -> Result<Vec<SpecialSeries>, StorageError> {
    let mut sql = base_series_select();
    let mut params = Vec::<Value>::new();

    match kind {
        ReportQueryKind::Upcoming => {
            sql.push_str(
                " WHERE special_series.status IN ('ACTIVE', 'UPCOMING_END')
                  AND special_series.ideal_end_date IS NOT NULL
                  AND date(special_series.ideal_end_date) >= date(?)
                  AND date(special_series.ideal_end_date) <= date(?, '+' || ? || ' days')",
            );
            params.push(Value::Text(query.as_of_date.clone()));
            params.push(Value::Text(query.as_of_date.clone()));
            params.push(Value::Integer(query.within_days.unwrap_or(7)));
        }
        ReportQueryKind::Ended => {
            sql.push_str(
                " WHERE special_series.status NOT IN ('DRAFT', 'CLOSURE_COMPLETED', 'ARCHIVED')
                  AND (
                    special_series.status = 'ENDED_PENDING_CLEARANCE' OR
                    (
                      special_series.ideal_end_date IS NOT NULL AND
                      date(special_series.ideal_end_date) < date(?)
                    )
                  )",
            );
            params.push(Value::Text(query.as_of_date.clone()));
        }
    }

    push_in_clause(
        &mut sql,
        &mut params,
        "special_series.supplier_id",
        query.supplier_ids.as_ref(),
    );
    push_in_clause(
        &mut sql,
        &mut params,
        "special_series.special_type",
        query.special_types.as_ref(),
    );

    sql.push_str(
        " ORDER BY
            special_series.ideal_end_date IS NULL ASC,
            special_series.ideal_end_date ASC,
            special_series.updated_at DESC",
    );

    query_series(connection, &sql, params)
}

fn push_in_clause(
    sql: &mut String,
    params: &mut Vec<Value>,
    field: &str,
    values: Option<&Vec<String>>,
) {
    let Some(values) = values.filter(|values| !values.is_empty()) else {
        return;
    };

    let placeholders = std::iter::repeat("?")
        .take(values.len())
        .collect::<Vec<_>>()
        .join(", ");
    sql.push_str(" AND ");
    sql.push_str(field);
    sql.push_str(" IN (");
    sql.push_str(&placeholders);
    sql.push(')');

    for value in values {
        params.push(Value::Text(value.clone()));
    }
}

fn row_to_supplier(row: &Row<'_>) -> rusqlite::Result<Supplier> {
    Ok(Supplier {
        id: row.get(0)?,
        name: row.get(1)?,
        is_default: row.get::<_, i64>(2)? == 1,
        is_active: row.get::<_, i64>(3)? == 1,
        sort_order: row.get(4)?,
    })
}

fn row_to_series(row: &Row<'_>) -> rusqlite::Result<SpecialSeries> {
    Ok(SpecialSeries {
        id: row.get(0)?,
        supplier_id: row.get(1)?,
        series_name: row.get(2)?,
        special_type: row.get(3)?,
        normal_cost: row.get(4)?,
        special_supply_cost: row.get(5)?,
        regular_price: row.get(6)?,
        special_price: row.get(7)?,
        effective_start_date: row.get(8)?,
        effective_end_date: row.get(9)?,
        shelf_life_date: row.get(10)?,
        ideal_end_date: row.get(11)?,
        ideal_end_strategy: row.get(12)?,
        fixed_period_unit: row.get(13)?,
        fixed_period_count: row.get(14)?,
        status: row.get(15)?,
        clearance_completed_at: row.get(16)?,
        notes: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
    })
}

fn row_to_history_event(row: &Row<'_>) -> rusqlite::Result<SeriesHistoryEvent> {
    Ok(SeriesHistoryEvent {
        id: row.get(0)?,
        series_id: row.get(1)?,
        event_type: row.get(2)?,
        event_note: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn collect_rows<T, I>(rows: I) -> Result<Vec<T>, StorageError>
where
    I: IntoIterator<Item = rusqlite::Result<T>>,
{
    let mut values = Vec::new();

    for row in rows {
        values.push(row?);
    }

    Ok(values)
}

fn normalize_id(value: &str, field: &'static str) -> Result<String, StorageError> {
    let trimmed = value.trim().to_owned();

    if trimmed.is_empty() {
        return Err(StorageError::validation(
            "REQUIRED_FIELD",
            Some(field),
            "id 不能为空。",
        ));
    }

    Ok(trimmed)
}

fn normalize_optional_query_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim().to_owned();

        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn normalize_optional_report_date(value: Option<String>) -> Result<Option<String>, StorageError> {
    let Some(value) = normalize_optional_query_text(value) else {
        return Ok(None);
    };

    validate_date_query(&value, "as_of_date")?;

    Ok(Some(value))
}

fn generate_id(prefix: &str) -> String {
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    format!("{prefix}_{nanos:x}_{counter:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_database() -> Database {
        let dir = std::env::temp_dir().join(format!("special-organizer-test-{}", generate_id("db")));

        Database::initialize(dir).expect("test database initializes")
    }

    fn series_input(name: &str, end_date: &str) -> SeriesMutationInput {
        SeriesMutationInput {
            supplier_id: "LAYBROTHERS".to_owned(),
            series_name: name.to_owned(),
            special_type: "WEEKLY_SPECIAL".to_owned(),
            normal_cost: Some(10.0),
            special_supply_cost: Some(8.0),
            regular_price: Some(15.0),
            special_price: Some(12.0),
            effective_start_date: Some("2026-05-01".to_owned()),
            effective_end_date: Some(end_date.to_owned()),
            shelf_life_date: None,
            ideal_end_date: None,
            ideal_end_strategy: None,
            fixed_period_unit: None,
            fixed_period_count: None,
            status: Some("ACTIVE".to_owned()),
            notes: Some("test note".to_owned()),
        }
    }

    #[test]
    fn initializes_schema_and_seeds_default_suppliers() {
        let database = test_database();
        let suppliers = database.list_suppliers().expect("suppliers list");

        assert_eq!(suppliers.len(), DEFAULT_SUPPLIERS.len());
        assert_eq!(suppliers[0].id, "LAYBROTHERS");
        assert!(suppliers.iter().all(|supplier| supplier.is_default));
        assert_eq!(database.status().schema_version, SCHEMA_VERSION);
    }

    #[test]
    fn creates_searches_reports_and_archives_series() {
        let database = test_database();
        let series = database
            .create_series(series_input("May tea promo", "2026-05-07"))
            .expect("series created");

        assert_eq!(series.ideal_end_strategy.as_deref(), Some("EFFECTIVE_PERIOD"));
        assert_eq!(series.ideal_end_date.as_deref(), Some("2026-05-07"));

        let listed = database
            .list_series(ListSeriesQuery {
                search_text: Some("tea".to_owned()),
                ..Default::default()
            })
            .expect("series listed");
        assert_eq!(listed.len(), 1);

        let report = database
            .list_report_series(ReportSeriesQuery {
                as_of_date: "2026-05-01".to_owned(),
                within_days: Some(7),
                include_upcoming: Some(true),
                include_ended: Some(true),
                supplier_ids: None,
                special_types: None,
            })
            .expect("report generated");
        assert_eq!(report.upcoming_end.len(), 1);

        let archived = database
            .archive_series(&series.id)
            .expect("series archived");
        assert_eq!(archived.status, "ARCHIVED");

        let visible = database
            .list_series(ListSeriesQuery::default())
            .expect("visible series listed");
        assert!(visible.is_empty());
    }

    #[test]
    fn report_queries_exclude_draft_completed_archived_and_restore_reapplied_active_series() {
        let database = test_database();
        let draft = database
            .create_series(SeriesMutationInput {
                status: Some("DRAFT".to_owned()),
                ..series_input("Draft should stay out", "2026-05-03")
            })
            .expect("draft series created");
        let active = database
            .create_series(series_input("Active report item", "2026-05-04"))
            .expect("active series created");
        let closing = database
            .create_series(series_input("Closing report item", "2026-05-01"))
            .expect("closing series created");
        let archived = database
            .create_series(series_input("Archived report item", "2026-05-05"))
            .expect("archived series created");

        database
            .archive_series(&archived.id)
            .expect("series archived");
        database
            .update_series(
                &closing.id,
                SeriesMutationInput {
                    status: Some("ENDED_PENDING_CLEARANCE".to_owned()),
                    ..series_input("Closing report item", "2026-05-01")
                },
            )
            .expect("series marked ended");

        let report_before_close = database
            .list_report_series(ReportSeriesQuery {
                as_of_date: "2026-05-02".to_owned(),
                within_days: Some(7),
                include_upcoming: Some(true),
                include_ended: Some(true),
                supplier_ids: None,
                special_types: None,
            })
            .expect("report generated before close");
        let before_close_ids = report_ids(&report_before_close);

        assert!(before_close_ids.contains(&active.id));
        assert!(before_close_ids.contains(&closing.id));
        assert!(!before_close_ids.contains(&draft.id));
        assert!(!before_close_ids.contains(&archived.id));

        database
            .mark_series_closure_completed(&closing.id, Some("QA close".to_owned()), None)
            .expect("closure completed");

        let report_after_close = database
            .list_report_series(ReportSeriesQuery {
                as_of_date: "2026-05-02".to_owned(),
                within_days: Some(7),
                include_upcoming: Some(true),
                include_ended: Some(true),
                supplier_ids: None,
                special_types: None,
            })
            .expect("report generated after close");
        let after_close_ids = report_ids(&report_after_close);

        assert!(after_close_ids.contains(&active.id));
        assert!(!after_close_ids.contains(&closing.id));
        assert!(!after_close_ids.contains(&draft.id));
        assert!(!after_close_ids.contains(&archived.id));

        let reapplied = database
            .reapply_series(
                &closing.id,
                SeriesMutationInput {
                    effective_end_date: Some("2026-05-06".to_owned()),
                    ..series_input("Closing report item reapplied", "2026-05-06")
                },
            )
            .expect("series reapplied");

        assert_eq!(reapplied.status, "ACTIVE");
        assert!(reapplied.clearance_completed_at.is_none());

        let report_after_reapply = database
            .list_report_series(ReportSeriesQuery {
                as_of_date: "2026-05-02".to_owned(),
                within_days: Some(7),
                include_upcoming: Some(true),
                include_ended: Some(true),
                supplier_ids: None,
                special_types: None,
            })
            .expect("report generated after reapply");
        let after_reapply_ids = report_ids(&report_after_reapply);

        assert!(after_reapply_ids.contains(&reapplied.id));

        let history = database
            .list_series_history(Some(closing.id))
            .expect("history listed");
        assert!(history
            .iter()
            .any(|event| event.event_type == "CLOSURE_COMPLETED"));
        assert!(history.iter().any(|event| event.event_type == "REAPPLIED"));
    }

    #[test]
    fn update_series_cannot_silently_reapply_ended_or_completed_series() {
        let database = test_database();
        let series = database
            .create_series(series_input("Reapply guard", "2026-05-01"))
            .expect("series created");

        database
            .update_series(
                &series.id,
                SeriesMutationInput {
                    status: Some("ENDED_PENDING_CLEARANCE".to_owned()),
                    ..series_input("Reapply guard", "2026-05-01")
                },
            )
            .expect("series marked ended");

        let ended_error = database
            .update_series(
                &series.id,
                SeriesMutationInput {
                    status: Some("ACTIVE".to_owned()),
                    ..series_input("Reapply guard", "2026-06-01")
                },
            )
            .expect_err("ended series must use reapply");

        assert_eq!(ended_error.code(), "USE_REAPPLY_COMMAND");

        database
            .mark_series_closure_completed(&series.id, None, None)
            .expect("closure completed");

        let completed_error = database
            .update_series(
                &series.id,
                SeriesMutationInput {
                    status: Some("ACTIVE".to_owned()),
                    ..series_input("Reapply guard", "2026-07-01")
                },
            )
            .expect_err("completed series must use reapply");

        assert_eq!(completed_error.code(), "USE_REAPPLY_COMMAND");

        let reapplied = database
            .reapply_series(
                &series.id,
                SeriesMutationInput {
                    effective_end_date: Some("2026-07-01".to_owned()),
                    ..series_input("Reapply guard", "2026-07-01")
                },
            )
            .expect("reapply remains the supported path");

        assert_eq!(reapplied.status, "ACTIVE");
    }

    #[test]
    fn closure_completed_can_use_report_as_of_date_instead_of_machine_today() {
        let database = test_database();
        let series = database
            .create_series(series_input("Future close from report", "2099-05-10"))
            .expect("series created");

        let today_error = database
            .mark_series_closure_completed(&series.id, None, None)
            .expect_err("future series should not close against machine today");

        assert_eq!(today_error.code(), "INVALID_STATUS_TRANSITION");

        let closed = database
            .mark_series_closure_completed(
                &series.id,
                Some("按报告基准日确认收尾".to_owned()),
                Some("2099-05-11".to_owned()),
            )
            .expect("report as_of_date allows closure when report says ended");

        assert_eq!(closed.status, "CLOSURE_COMPLETED");
    }

    #[test]
    fn reapply_moves_completed_series_back_to_active() {
        let database = test_database();
        let series = database
            .create_series(series_input("Closing test", "2026-05-01"))
            .expect("series created");

        let updated = database
            .update_series(
                &series.id,
                SeriesMutationInput {
                    status: Some("ENDED_PENDING_CLEARANCE".to_owned()),
                    ..series_input("Closing test", "2026-05-01")
                },
            )
            .expect("series marked ended");
        assert_eq!(updated.status, "ENDED_PENDING_CLEARANCE");

        let closed = database
            .mark_series_closure_completed(&series.id, None, None)
            .expect("closure completed");
        assert_eq!(closed.status, "CLOSURE_COMPLETED");
        assert!(closed.clearance_completed_at.is_some());

        let reapplied = database
            .reapply_series(
                &series.id,
                SeriesMutationInput {
                    effective_end_date: Some("2026-06-07".to_owned()),
                    ..series_input("Closing test reapplied", "2026-06-07")
                },
            )
            .expect("series reapplied");
        assert_eq!(reapplied.status, "ACTIVE");
        assert!(reapplied.clearance_completed_at.is_none());

        let history = database
            .list_series_history(Some(series.id))
            .expect("history listed");
        assert!(history
            .iter()
            .any(|event| event.event_type == "CLOSURE_COMPLETED"));
        assert!(history.iter().any(|event| event.event_type == "REAPPLIED"));
    }

    fn report_ids(report: &ReportSeriesResult) -> Vec<String> {
        report
            .upcoming_end
            .iter()
            .chain(report.ended_pending_clearance.iter())
            .map(|series| series.id.clone())
            .collect()
    }
}
