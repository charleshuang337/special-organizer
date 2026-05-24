CREATE TABLE suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE special_series (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  series_name TEXT NOT NULL CHECK (length(trim(series_name)) > 0),
  special_type TEXT NOT NULL CHECK (
    special_type IN ('EVERYDAY_SPECIAL', 'WEEKLY_SPECIAL', 'FAST_REMOVE_SPECIAL')
  ),
  normal_cost REAL CHECK (normal_cost IS NULL OR normal_cost >= 0),
  special_supply_cost REAL CHECK (special_supply_cost IS NULL OR special_supply_cost >= 0),
  regular_price REAL CHECK (regular_price IS NULL OR regular_price >= 0),
  special_price REAL CHECK (special_price IS NULL OR special_price >= 0),
  effective_start_date TEXT CHECK (
    effective_start_date IS NULL OR effective_start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  effective_end_date TEXT CHECK (
    effective_end_date IS NULL OR effective_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  shelf_life_date TEXT CHECK (
    shelf_life_date IS NULL OR shelf_life_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  ideal_end_date TEXT CHECK (
    ideal_end_date IS NULL OR ideal_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  ideal_end_strategy TEXT CHECK (
    ideal_end_strategy IS NULL OR ideal_end_strategy IN ('FIXED_PERIOD', 'EFFECTIVE_PERIOD', 'SHELF_LIFE', 'MANUAL')
  ),
  fixed_period_unit TEXT CHECK (
    fixed_period_unit IS NULL OR fixed_period_unit IN ('WEEK', 'MONTH')
  ),
  fixed_period_count INTEGER CHECK (
    fixed_period_count IS NULL OR fixed_period_count IN (1, 2, 3)
  ),
  status TEXT NOT NULL CHECK (
    status IN ('DRAFT', 'ACTIVE', 'UPCOMING_END', 'ENDED_PENDING_CLEARANCE', 'CLOSURE_COMPLETED', 'ARCHIVED')
  ),
  clearance_completed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_special_series_supplier_id ON special_series(supplier_id);
CREATE INDEX idx_special_series_special_type ON special_series(special_type);
CREATE INDEX idx_special_series_status ON special_series(status);
CREATE INDEX idx_special_series_ideal_end_date ON special_series(ideal_end_date);
CREATE INDEX idx_special_series_effective_dates ON special_series(effective_start_date, effective_end_date);
CREATE INDEX idx_special_series_series_name ON special_series(series_name);

CREATE TABLE series_history_events (
  id TEXT PRIMARY KEY NOT NULL,
  series_id TEXT NOT NULL REFERENCES special_series(id) ON UPDATE CASCADE ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'CLOSURE_COMPLETED', 'REAPPLIED')
  ),
  event_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_series_history_events_series_id ON series_history_events(series_id);
CREATE INDEX idx_series_history_events_created_at ON series_history_events(created_at);
