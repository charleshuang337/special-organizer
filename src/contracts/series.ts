export const SPECIAL_TYPES = [
  "EVERYDAY_SPECIAL",
  "WEEKLY_SPECIAL",
  "FAST_REMOVE_SPECIAL",
] as const;

export type SpecialType = (typeof SPECIAL_TYPES)[number];

export const SPECIAL_SERIES_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "UPCOMING_END",
  "ENDED_PENDING_CLEARANCE",
  "CLOSURE_COMPLETED",
  "ARCHIVED",
] as const;

export type SpecialSeriesStatus = (typeof SPECIAL_SERIES_STATUSES)[number];

export const IDEAL_END_STRATEGIES = [
  "FIXED_PERIOD",
  "EFFECTIVE_PERIOD",
  "SHELF_LIFE",
  "MANUAL",
] as const;

export type IdealEndStrategy = (typeof IDEAL_END_STRATEGIES)[number];

export const FIXED_PERIOD_UNITS = ["WEEK", "MONTH"] as const;

export type FixedPeriodUnit = (typeof FIXED_PERIOD_UNITS)[number];

export const FIXED_PERIOD_COUNTS = [1, 2, 3] as const;

export type FixedPeriodCount = (typeof FIXED_PERIOD_COUNTS)[number];

export const DEFAULT_SUPPLIER_IDS = [
  "LAYBROTHERS",
  "ETTASON",
  "ORIENTAL_MERCHANT",
  "TAIWANESE_OVERSEAS",
  "ROCKMAN",
] as const;

export type DefaultSupplierId = (typeof DEFAULT_SUPPLIER_IDS)[number];

export type ISODateString = string;
export type ISODateTimeString = string;
export type Decimal = number;

export interface Supplier {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface SpecialSeries {
  id: string;
  supplier_id: string;
  series_name: string;
  special_type: SpecialType;
  normal_cost?: Decimal | null;
  special_supply_cost?: Decimal | null;
  regular_price?: Decimal | null;
  special_price?: Decimal | null;
  effective_start_date?: ISODateString | null;
  effective_end_date?: ISODateString | null;
  shelf_life_date?: ISODateString | null;
  ideal_end_date?: ISODateString | null;
  ideal_end_strategy: IdealEndStrategy | null;
  fixed_period_unit?: FixedPeriodUnit | null;
  fixed_period_count?: FixedPeriodCount | null;
  status: SpecialSeriesStatus;
  clearance_completed_at?: ISODateTimeString | null;
  notes?: string | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export const SERIES_HISTORY_EVENT_TYPES = [
  "CREATED",
  "UPDATED",
  "STATUS_CHANGED",
  "CLOSURE_COMPLETED",
  "REAPPLIED",
] as const;

export type SeriesHistoryEventType = (typeof SERIES_HISTORY_EVENT_TYPES)[number];

export interface SeriesHistoryEvent {
  id: string;
  series_id: string;
  event_type: SeriesHistoryEventType;
  event_note?: string | null;
  created_at: ISODateTimeString;
}

export interface SeriesMutationInput {
  supplier_id: string;
  series_name: string;
  special_type: SpecialType;
  normal_cost?: Decimal | null;
  special_supply_cost?: Decimal | null;
  regular_price?: Decimal | null;
  special_price?: Decimal | null;
  effective_start_date?: ISODateString | null;
  effective_end_date?: ISODateString | null;
  shelf_life_date?: ISODateString | null;
  ideal_end_date?: ISODateString | null;
  ideal_end_strategy?: IdealEndStrategy | null;
  fixed_period_unit?: FixedPeriodUnit | null;
  fixed_period_count?: FixedPeriodCount | null;
  status?: SpecialSeriesStatus | null;
  notes?: string | null;
}

export interface ListSeriesQuery {
  search_text?: string | null;
  supplier_ids?: string[] | null;
  special_types?: SpecialType[] | null;
  statuses?: SpecialSeriesStatus[] | null;
  date_from?: ISODateString | null;
  date_to?: ISODateString | null;
  include_archived?: boolean | null;
}

export interface ReportSeriesQuery {
  as_of_date: ISODateString;
  within_days?: number | null;
  include_upcoming?: boolean | null;
  include_ended?: boolean | null;
  supplier_ids?: string[] | null;
  special_types?: SpecialType[] | null;
}

export interface ReportSeriesResult {
  upcoming_end: SpecialSeries[];
  ended_pending_clearance: SpecialSeries[];
}

export interface DeleteSeriesResult {
  id: string;
  deleted: boolean;
}

export interface StorageStatus {
  database_path: string;
  schema_version: string;
}

export interface AppStatus {
  app_name: "Special Organizer";
  storage: "sqlite_configured";
  database: StorageStatus;
}

export interface AppError {
  code: string;
  field?: string | null;
  message: string;
}

export const SERIES_COMMANDS = {
  app_status: "app_status",
  list_suppliers: "list_suppliers",
  create_series: "create_series",
  update_series: "update_series",
  archive_series: "archive_series",
  delete_series: "delete_series",
  list_series: "list_series",
  mark_series_closure_completed: "mark_series_closure_completed",
  reapply_series: "reapply_series",
  list_report_series: "list_report_series",
  list_series_history: "list_series_history",
} as const;

export type SeriesCommandName = (typeof SERIES_COMMANDS)[keyof typeof SERIES_COMMANDS];

export const DEFAULT_SUPPLIERS: readonly Supplier[] = DEFAULT_SUPPLIER_IDS.map((id, index) => ({
  id,
  name: id,
  is_default: true,
  is_active: true,
  sort_order: (index + 1) * 10,
}));
