import {
  type IdealEndStrategy,
  type SpecialSeries,
  type SpecialSeriesStatus,
  type SpecialType,
  type Supplier,
} from "../../contracts";
import { deriveDateDrivenSeriesStatus } from "./domain";

export const SPECIAL_TYPE_LABELS: Record<SpecialType, string> = {
  EVERYDAY_SPECIAL: "日常特价",
  WEEKLY_SPECIAL: "每周特价",
  FAST_REMOVE_SPECIAL: "快速清货",
};

export const STATUS_LABELS: Record<SpecialSeriesStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "正在生效",
  UPCOMING_END: "即将结束",
  ENDED_PENDING_CLEARANCE: "已结束待清货",
  CLOSURE_COMPLETED: "历史记录",
  ARCHIVED: "已归档",
};

export const IDEAL_END_STRATEGY_LABELS: Record<IdealEndStrategy, string> = {
  FIXED_PERIOD: "固定周期",
  EFFECTIVE_PERIOD: "按有效期",
  SHELF_LIFE: "按保质期",
  MANUAL: "手动日期",
};

export type LifecycleFilter =
  | "ALL"
  | "ACTIVE"
  | "UPCOMING_END"
  | "ENDED_PENDING_CLEARANCE"
  | "CLOSURE_COMPLETED";

export type WorkspaceFilters = {
  searchText: string;
  supplierId: "ALL" | string;
  specialType: "ALL" | SpecialType;
  lifecycle: LifecycleFilter;
};

export type CalendarDay = {
  isoDate: string;
  dayNumber: number;
  isCurrentMonth: boolean;
};

export function createEmptyWorkspaceFilters(): WorkspaceFilters {
  return {
    searchText: "",
    supplierId: "ALL",
    specialType: "ALL",
    lifecycle: "ALL",
  };
}

export function getTodayIsoDate(): string {
  const now = new Date();
  return formatUtcDate(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function getSupplierName(suppliers: readonly Supplier[], supplierId: string): string {
  return suppliers.find((supplier) => supplier.id === supplierId)?.name ?? supplierId;
}

export function filterWorkspaceSeries(
  series: readonly SpecialSeries[],
  suppliers: readonly Supplier[],
  filters: WorkspaceFilters,
  asOfDate?: string,
): SpecialSeries[] {
  const searchText = filters.searchText.trim().toLocaleLowerCase();

  return series.filter((item) => {
    const supplierName = getSupplierName(suppliers, item.supplier_id).toLocaleLowerCase();
    const searchableText = `${item.series_name} ${item.supplier_id} ${supplierName}`.toLocaleLowerCase();
    const matchesSearch = searchText.length === 0 || searchableText.includes(searchText);
    const matchesSupplier = filters.supplierId === "ALL" || item.supplier_id === filters.supplierId;
    const matchesType = filters.specialType === "ALL" || item.special_type === filters.specialType;
    const lifecycleStatus = asOfDate ? getDateDrivenStatus(item, asOfDate) : item.status;
    const matchesLifecycle =
      filters.lifecycle === "ALL"
        ? !isHistoricalOrArchivedStatus(lifecycleStatus)
        : lifecycleStatus === filters.lifecycle;

    return matchesSearch && matchesSupplier && matchesType && matchesLifecycle;
  });
}

export function getLifecycleCounts(
  series: readonly SpecialSeries[],
  asOfDate?: string,
): Record<LifecycleFilter, number> {
  const statusFor = (item: SpecialSeries) => (asOfDate ? getDateDrivenStatus(item, asOfDate) : item.status);

  return {
    ALL: series.filter((item) => !isHistoricalOrArchivedStatus(statusFor(item))).length,
    ACTIVE: series.filter((item) => statusFor(item) === "ACTIVE").length,
    UPCOMING_END: series.filter((item) => statusFor(item) === "UPCOMING_END").length,
    ENDED_PENDING_CLEARANCE: series.filter((item) => statusFor(item) === "ENDED_PENDING_CLEARANCE").length,
    CLOSURE_COMPLETED: series.filter((item) => statusFor(item) === "CLOSURE_COMPLETED").length,
  };
}

export function buildCalendarDays(monthIso: string): CalendarDay[] {
  const [year, month] = monthIso.split("-").map(Number);
  const firstOfMonth = Date.UTC(year, month - 1, 1);
  const firstWeekday = new Date(firstOfMonth).getUTCDay();
  const mondayOffset = (firstWeekday + 6) % 7;
  const start = addUtcDays(firstOfMonth, -mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const timestamp = addUtcDays(start, index);
    const date = new Date(timestamp);

    return {
      isoDate: formatUtcDate(timestamp),
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCMonth() === month - 1,
    };
  });
}

export function getMonthLabel(monthIso: string): string {
  const [year, month] = monthIso.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

export function moveMonth(monthIso: string, offset: number): string {
  const [year, month] = monthIso.split("-").map(Number);
  return formatUtcMonth(Date.UTC(year, month - 1 + offset, 1));
}

export function isSeriesVisibleOnDate(series: SpecialSeries, isoDate: string): boolean {
  if (series.status === "CLOSURE_COMPLETED" || series.status === "ARCHIVED") {
    return false;
  }

  if (series.ideal_end_date === isoDate) {
    return true;
  }

  if (
    getDateDrivenStatus(series, isoDate) === "ENDED_PENDING_CLEARANCE" &&
    series.ideal_end_date &&
    isoDate >= series.ideal_end_date
  ) {
    return true;
  }

  if (series.effective_start_date && series.effective_end_date) {
    return isoDate >= series.effective_start_date && isoDate <= series.effective_end_date;
  }

  if (series.effective_start_date && !series.effective_end_date) {
    return isoDate >= series.effective_start_date && ["ACTIVE", "UPCOMING_END"].includes(series.status);
  }

  return false;
}

export function getDateTaskReason(series: SpecialSeries, isoDate: string): string {
  if (series.ideal_end_date === isoDate) {
    return "理想结束日";
  }

  if (
    getDateDrivenStatus(series, isoDate) === "ENDED_PENDING_CLEARANCE" &&
    series.ideal_end_date &&
    isoDate >= series.ideal_end_date
  ) {
    return "待清货收尾";
  }

  return "有效期内";
}

export function getDateDrivenStatus(series: SpecialSeries, asOfDate: string): SpecialSeriesStatus {
  if (series.status === "ENDED_PENDING_CLEARANCE") {
    return series.status;
  }

  const result = deriveDateDrivenSeriesStatus({
    current_status: series.status,
    as_of_date: asOfDate,
    ideal_end_date: series.ideal_end_date,
  });

  return result.ok ? result.value : series.status;
}

export function addIsoDays(isoDate: string, days: number): string {
  const [year, month, date] = isoDate.split("-").map(Number);
  return formatUtcDate(addUtcDays(Date.UTC(year, month - 1, date), days));
}

function addUtcDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.getTime();
}

function formatUtcDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUtcMonth(timestamp: number): string {
  return formatUtcDate(timestamp).slice(0, 7);
}

function isHistoricalOrArchivedStatus(status: SpecialSeriesStatus): boolean {
  return status === "CLOSURE_COMPLETED" || status === "ARCHIVED";
}
