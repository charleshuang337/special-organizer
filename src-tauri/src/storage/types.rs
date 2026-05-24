use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: &str = "0001_initial_schema";

pub const SPECIAL_TYPES: &[&str] = &[
    "EVERYDAY_SPECIAL",
    "WEEKLY_SPECIAL",
    "FAST_REMOVE_SPECIAL",
];

pub const SPECIAL_SERIES_STATUSES: &[&str] = &[
    "DRAFT",
    "ACTIVE",
    "UPCOMING_END",
    "ENDED_PENDING_CLEARANCE",
    "CLOSURE_COMPLETED",
    "ARCHIVED",
];

pub const IDEAL_END_STRATEGIES: &[&str] = &[
    "FIXED_PERIOD",
    "EFFECTIVE_PERIOD",
    "SHELF_LIFE",
    "MANUAL",
];

pub const FIXED_PERIOD_UNITS: &[&str] = &["WEEK", "MONTH"];
pub const FIXED_PERIOD_COUNTS: &[i64] = &[1, 2, 3];

pub const DEFAULT_SUPPLIERS: &[(&str, &str, i64)] = &[
    ("LAYBROTHERS", "LAYBROTHERS", 10),
    ("ETTASON", "ETTASON", 20),
    ("ORIENTAL_MERCHANT", "ORIENTAL_MERCHANT", 30),
    ("TAIWANESE_OVERSEAS", "TAIWANESE_OVERSEAS", 40),
    ("ROCKMAN", "ROCKMAN", 50),
];

#[derive(Debug, Clone, Serialize)]
pub struct StorageStatus {
    pub database_path: String,
    pub schema_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Supplier {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub is_active: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpecialSeries {
    pub id: String,
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
    pub status: String,
    pub clearance_completed_at: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SeriesHistoryEvent {
    pub id: String,
    pub series_id: String,
    pub event_type: String,
    pub event_note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeriesMutationInput {
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

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ListSeriesQuery {
    pub search_text: Option<String>,
    pub supplier_ids: Option<Vec<String>>,
    pub special_types: Option<Vec<String>>,
    pub statuses: Option<Vec<String>>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub include_archived: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReportSeriesQuery {
    pub as_of_date: String,
    pub within_days: Option<i64>,
    pub include_upcoming: Option<bool>,
    pub include_ended: Option<bool>,
    pub supplier_ids: Option<Vec<String>>,
    pub special_types: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReportSeriesResult {
    pub upcoming_end: Vec<SpecialSeries>,
    pub ended_pending_clearance: Vec<SpecialSeries>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeleteSeriesResult {
    pub id: String,
    pub deleted: bool,
}
