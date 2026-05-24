use super::error::StorageError;
use super::types::{
    FIXED_PERIOD_COUNTS, FIXED_PERIOD_UNITS, IDEAL_END_STRATEGIES, SPECIAL_SERIES_STATUSES,
    SPECIAL_TYPES, SeriesMutationInput,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DateOnly {
    year: i32,
    month: u32,
    day: u32,
}

#[derive(Debug, Clone)]
pub struct ValidatedSeriesInput {
    pub supplier_id: String,
    pub series_name: String,
    pub special_type: String,
    pub normal_cost: Option<f64>,
    pub special_supply_cost: Option<f64>,
    pub regular_price: Option<f64>,
    pub special_price: Option<f64>,
    pub effective_start_date: Option<String>,
    pub effective_end_date: Option<String>,
    pub shelf_life_date: Option<String>,
    pub ideal_end_date: Option<String>,
    pub ideal_end_strategy: Option<String>,
    pub fixed_period_unit: Option<String>,
    pub fixed_period_count: Option<i64>,
    pub status: Option<String>,
    pub notes: Option<String>,
}

pub fn validate_series_input(
    input: SeriesMutationInput,
) -> Result<ValidatedSeriesInput, StorageError> {
    let supplier_id = trim_required(input.supplier_id, "supplier_id", "供应商不能为空。")?;
    let series_name = trim_required(input.series_name, "series_name", "特价系列名称不能为空。")?;
    let special_type = trim_required(input.special_type, "special_type", "特价类型不能为空。")?;

    ensure_in_set(&special_type, SPECIAL_TYPES, "special_type", "特价类型不受支持。")?;
    ensure_non_negative(input.normal_cost, "normal_cost")?;
    ensure_non_negative(input.special_supply_cost, "special_supply_cost")?;
    ensure_non_negative(input.regular_price, "regular_price")?;
    ensure_non_negative(input.special_price, "special_price")?;

    let effective_start_date = normalize_optional_date(input.effective_start_date, "effective_start_date")?;
    let effective_end_date = normalize_optional_date(input.effective_end_date, "effective_end_date")?;
    let shelf_life_date = normalize_optional_date(input.shelf_life_date, "shelf_life_date")?;
    let raw_ideal_end_date = normalize_optional_date(input.ideal_end_date, "ideal_end_date")?;

    let fixed_period_unit = normalize_optional_enum(
        input.fixed_period_unit,
        FIXED_PERIOD_UNITS,
        "fixed_period_unit",
        "固定周期单位必须是 WEEK 或 MONTH。",
    )?;
    let fixed_period_count = normalize_fixed_period_count(input.fixed_period_count)?;
    let status = normalize_optional_enum(
        input.status,
        SPECIAL_SERIES_STATUSES,
        "status",
        "状态值不受支持。",
    )?;

    let requested_strategy = normalize_optional_enum(
        input.ideal_end_strategy,
        IDEAL_END_STRATEGIES,
        "ideal_end_strategy",
        "理想结束日期策略不受支持。",
    )?;

    let ideal = calculate_ideal_end_date(CalculateIdealEndDateInput {
        special_type: &special_type,
        requested_strategy: requested_strategy.as_deref(),
        effective_start_date: effective_start_date.as_deref(),
        effective_end_date: effective_end_date.as_deref(),
        shelf_life_date: shelf_life_date.as_deref(),
        ideal_end_date: raw_ideal_end_date.as_deref(),
        fixed_period_unit: fixed_period_unit.as_deref(),
        fixed_period_count,
    })?;

    Ok(ValidatedSeriesInput {
        supplier_id,
        series_name,
        special_type,
        normal_cost: input.normal_cost,
        special_supply_cost: input.special_supply_cost,
        regular_price: input.regular_price,
        special_price: input.special_price,
        effective_start_date,
        effective_end_date,
        shelf_life_date,
        ideal_end_date: ideal.ideal_end_date,
        ideal_end_strategy: ideal.strategy,
        fixed_period_unit,
        fixed_period_count,
        status,
        notes: normalize_optional_text(input.notes),
    })
}

pub fn validate_date_query(value: &str, field: &'static str) -> Result<(), StorageError> {
    parse_date_only(value, field).map(|_| ())
}

pub fn validate_enum_values(
    values: Option<&Vec<String>>,
    allowed: &[&str],
    field: &'static str,
) -> Result<(), StorageError> {
    if let Some(values) = values {
        for value in values {
            ensure_in_set(value, allowed, field, "筛选值不受支持。")?;
        }
    }

    Ok(())
}

pub fn can_transition_series_status(from: &str, to: &str) -> bool {
    match from {
        "DRAFT" => matches!(to, "ACTIVE" | "ARCHIVED"),
        "ACTIVE" => matches!(to, "UPCOMING_END" | "ENDED_PENDING_CLEARANCE" | "ARCHIVED"),
        "UPCOMING_END" => matches!(to, "ACTIVE" | "ENDED_PENDING_CLEARANCE" | "ARCHIVED"),
        "ENDED_PENDING_CLEARANCE" => matches!(to, "ACTIVE" | "CLOSURE_COMPLETED" | "ARCHIVED"),
        "CLOSURE_COMPLETED" => matches!(to, "ACTIVE" | "ARCHIVED"),
        "ARCHIVED" => false,
        _ => false,
    }
}

pub fn validate_status_transition(from: &str, to: &str) -> Result<(), StorageError> {
    if from == to || can_transition_series_status(from, to) {
        return Ok(());
    }

    Err(StorageError::validation(
        "INVALID_STATUS_TRANSITION",
        Some("status"),
        format!("{from} 不能直接流转到 {to}。"),
    ))
}

struct CalculateIdealEndDateInput<'a> {
    special_type: &'a str,
    requested_strategy: Option<&'a str>,
    effective_start_date: Option<&'a str>,
    effective_end_date: Option<&'a str>,
    shelf_life_date: Option<&'a str>,
    ideal_end_date: Option<&'a str>,
    fixed_period_unit: Option<&'a str>,
    fixed_period_count: Option<i64>,
}

struct IdealEndCalculation {
    ideal_end_date: Option<String>,
    strategy: Option<String>,
}

fn calculate_ideal_end_date(
    input: CalculateIdealEndDateInput<'_>,
) -> Result<IdealEndCalculation, StorageError> {
    let strategy = input
        .requested_strategy
        .map(str::to_owned)
        .or_else(|| default_ideal_end_strategy(&input).map(str::to_owned));

    let Some(strategy) = strategy else {
        return Ok(IdealEndCalculation {
            ideal_end_date: None,
            strategy: None,
        });
    };

    match strategy.as_str() {
        "FIXED_PERIOD" => calculate_fixed_period_end_date(&input, strategy),
        "EFFECTIVE_PERIOD" => calculate_direct_end_date(
            &input,
            strategy,
            input.effective_end_date,
            "effective_end_date",
            "MISSING_EFFECTIVE_END_DATE",
        ),
        "SHELF_LIFE" => calculate_direct_end_date(
            &input,
            strategy,
            input.shelf_life_date,
            "shelf_life_date",
            "MISSING_SHELF_LIFE_DATE",
        ),
        "MANUAL" => calculate_direct_end_date(
            &input,
            strategy,
            input.ideal_end_date,
            "ideal_end_date",
            "MANUAL_END_REQUIRED",
        ),
        _ => Err(StorageError::validation(
            "INVALID_IDEAL_END_STRATEGY",
            Some("ideal_end_strategy"),
            "理想结束日期策略不受支持。",
        )),
    }
}

fn default_ideal_end_strategy(input: &CalculateIdealEndDateInput<'_>) -> Option<&'static str> {
    match input.special_type {
        "EVERYDAY_SPECIAL" => None,
        "WEEKLY_SPECIAL" => Some("EFFECTIVE_PERIOD"),
        "FAST_REMOVE_SPECIAL" if input.shelf_life_date.is_some() => Some("SHELF_LIFE"),
        "FAST_REMOVE_SPECIAL" if input.effective_end_date.is_some() => Some("EFFECTIVE_PERIOD"),
        "FAST_REMOVE_SPECIAL" => Some("MANUAL"),
        _ => None,
    }
}

fn calculate_fixed_period_end_date(
    input: &CalculateIdealEndDateInput<'_>,
    strategy: String,
) -> Result<IdealEndCalculation, StorageError> {
    let Some(start) = input.effective_start_date else {
        return Err(missing_date(
            "effective_start_date",
            "MISSING_EFFECTIVE_START_DATE",
        ));
    };
    let Some(unit) = input.fixed_period_unit else {
        return Err(missing_fixed_period());
    };
    let Some(count) = input.fixed_period_count else {
        return Err(missing_fixed_period());
    };

    if !FIXED_PERIOD_UNITS.contains(&unit) || !FIXED_PERIOD_COUNTS.contains(&count) {
        return Err(missing_fixed_period());
    }

    let start_date = parse_date_only(start, "effective_start_date")?;
    let end_date = if unit == "WEEK" {
        add_days(start_date, count * 7)
    } else {
        add_months(start_date, count as i32)
    };

    Ok(IdealEndCalculation {
        ideal_end_date: Some(format_date_only(end_date)),
        strategy: Some(strategy),
    })
}

fn calculate_direct_end_date(
    input: &CalculateIdealEndDateInput<'_>,
    strategy: String,
    value: Option<&str>,
    field: &'static str,
    missing_code: &'static str,
) -> Result<IdealEndCalculation, StorageError> {
    let Some(value) = value else {
        return Err(missing_date(field, missing_code));
    };

    let end_date = parse_date_only(value, field)?;
    ensure_not_before_start(input.effective_start_date, end_date, field)?;

    Ok(IdealEndCalculation {
        ideal_end_date: Some(format_date_only(end_date)),
        strategy: Some(strategy),
    })
}

fn ensure_not_before_start(
    start_value: Option<&str>,
    end_date: DateOnly,
    end_field: &'static str,
) -> Result<(), StorageError> {
    let Some(start_value) = start_value else {
        return Ok(());
    };

    let start_date = parse_date_only(start_value, "effective_start_date")?;

    if days_from_civil(end_date) < days_from_civil(start_date) {
        return Err(StorageError::validation(
            "END_BEFORE_START",
            Some(end_field),
            "结束日期不能早于有效开始日期。",
        ));
    }

    Ok(())
}

fn trim_required(
    value: String,
    field: &'static str,
    message: &'static str,
) -> Result<String, StorageError> {
    let trimmed = value.trim().to_owned();

    if trimmed.is_empty() {
        return Err(StorageError::validation(
            "REQUIRED_FIELD",
            Some(field),
            message,
        ));
    }

    Ok(trimmed)
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim().to_owned();

        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn normalize_optional_date(
    value: Option<String>,
    field: &'static str,
) -> Result<Option<String>, StorageError> {
    let Some(value) = normalize_optional_text(value) else {
        return Ok(None);
    };

    let parsed = parse_date_only(&value, field)?;

    Ok(Some(format_date_only(parsed)))
}

fn normalize_optional_enum(
    value: Option<String>,
    allowed: &[&str],
    field: &'static str,
    message: &'static str,
) -> Result<Option<String>, StorageError> {
    let Some(value) = normalize_optional_text(value) else {
        return Ok(None);
    };

    ensure_in_set(&value, allowed, field, message)?;

    Ok(Some(value))
}

fn normalize_fixed_period_count(value: Option<i64>) -> Result<Option<i64>, StorageError> {
    let Some(value) = value else {
        return Ok(None);
    };

    if !FIXED_PERIOD_COUNTS.contains(&value) {
        return Err(missing_fixed_period());
    }

    Ok(Some(value))
}

fn ensure_in_set(
    value: &str,
    allowed: &[&str],
    field: &'static str,
    message: &'static str,
) -> Result<(), StorageError> {
    if allowed.contains(&value) {
        return Ok(());
    }

    Err(StorageError::validation(
        "UNSUPPORTED_VALUE",
        Some(field),
        message,
    ))
}

fn ensure_non_negative(value: Option<f64>, field: &'static str) -> Result<(), StorageError> {
    if let Some(value) = value {
        if !value.is_finite() || value < 0.0 {
            return Err(StorageError::validation(
                "INVALID_DECIMAL",
                Some(field),
                "金额字段必须是非负数字。",
            ));
        }
    }

    Ok(())
}

fn missing_date(field: &'static str, code: &'static str) -> StorageError {
    StorageError::validation(code, Some(field), "缺少计算理想结束日期所需的日期字段。")
}

fn missing_fixed_period() -> StorageError {
    StorageError::validation(
        "MISSING_FIXED_PERIOD",
        Some("fixed_period"),
        "固定周期策略需要 1、2 或 3 个 WEEK 或 MONTH。",
    )
}

fn parse_date_only(value: &str, field: &'static str) -> Result<DateOnly, StorageError> {
    let bytes = value.as_bytes();
    let valid_shape = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());

    if !valid_shape {
        return Err(invalid_date(field));
    }

    let year = value[0..4].parse::<i32>().map_err(|_| invalid_date(field))?;
    let month = value[5..7].parse::<u32>().map_err(|_| invalid_date(field))?;
    let day = value[8..10].parse::<u32>().map_err(|_| invalid_date(field))?;

    if !(1..=12).contains(&month) {
        return Err(invalid_date(field));
    }

    if day == 0 || day > days_in_month(year, month) {
        return Err(invalid_date(field));
    }

    Ok(DateOnly { year, month, day })
}

fn invalid_date(field: &'static str) -> StorageError {
    StorageError::validation(
        "INVALID_DATE",
        Some(field),
        "日期必须是有效的 YYYY-MM-DD 格式。",
    )
}

fn format_date_only(date: DateOnly) -> String {
    format!("{:04}-{:02}-{:02}", date.year, date.month, date.day)
}

fn add_days(date: DateOnly, days: i64) -> DateOnly {
    civil_from_days(days_from_civil(date) + days)
}

fn add_months(date: DateOnly, months: i32) -> DateOnly {
    let month_index = date.month as i32 - 1 + months;
    let year = date.year + month_index.div_euclid(12);
    let month = month_index.rem_euclid(12) as u32 + 1;
    let day = date.day.min(days_in_month(year, month));

    DateOnly { year, month, day }
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_from_civil(date: DateOnly) -> i64 {
    let mut year = date.year as i64;
    let month = date.month as i64;
    let day = date.day as i64;

    year -= (month <= 2) as i64;
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;

    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> DateOnly {
    let days = days + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year =
        day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };

    year += (month <= 2) as i64;

    DateOnly {
        year: year as i32,
        month: month as u32,
        day: day as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> SeriesMutationInput {
        SeriesMutationInput {
            supplier_id: "LAYBROTHERS".to_owned(),
            series_name: "Tea".to_owned(),
            special_type: "WEEKLY_SPECIAL".to_owned(),
            normal_cost: Some(10.0),
            special_supply_cost: Some(8.0),
            regular_price: Some(15.0),
            special_price: Some(12.0),
            effective_start_date: Some("2026-01-31".to_owned()),
            effective_end_date: Some("2026-02-07".to_owned()),
            shelf_life_date: None,
            ideal_end_date: None,
            ideal_end_strategy: None,
            fixed_period_unit: None,
            fixed_period_count: None,
            status: None,
            notes: None,
        }
    }

    #[test]
    fn calculates_default_weekly_end_date() {
        let input = validate_series_input(valid_input()).expect("valid series input");

        assert_eq!(input.ideal_end_date.as_deref(), Some("2026-02-07"));
        assert_eq!(input.ideal_end_strategy.as_deref(), Some("EFFECTIVE_PERIOD"));
    }

    #[test]
    fn clamps_fixed_month_to_month_end() {
        let mut input = valid_input();
        input.ideal_end_strategy = Some("FIXED_PERIOD".to_owned());
        input.fixed_period_unit = Some("MONTH".to_owned());
        input.fixed_period_count = Some(1);

        let input = validate_series_input(input).expect("valid fixed period");

        assert_eq!(input.ideal_end_date.as_deref(), Some("2026-02-28"));
    }

    #[test]
    fn rejects_invalid_calendar_date() {
        let mut input = valid_input();
        input.effective_end_date = Some("2026-02-30".to_owned());

        let error = validate_series_input(input).expect_err("invalid date must fail");

        assert_eq!(error.code(), "INVALID_DATE");
        assert_eq!(error.field(), Some("effective_end_date"));
    }
}
