import type {
  ReportSeriesResult,
  SeriesMutationInput,
  SpecialSeries,
  SpecialType,
  Supplier,
} from "../../contracts";
import { toSeriesMutationInput } from "../series/seriesCommands";
import {
  addIsoDays,
  getSupplierName,
  SPECIAL_TYPE_LABELS,
  type WorkspaceFilters,
} from "../series/workspaceModel";

export type ReportFilters = {
  withinDays: number;
  includeUpcoming: boolean;
  includeEnded: boolean;
};

export const REPORT_WINDOW_MIN_DAYS = 0;
export const REPORT_WINDOW_MAX_DAYS = 60;

export function normalizeReportWindowDays(value: number): number {
  if (!Number.isFinite(value)) {
    return REPORT_WINDOW_MIN_DAYS;
  }

  const wholeDays = Math.trunc(value);

  return Math.min(REPORT_WINDOW_MAX_DAYS, Math.max(REPORT_WINDOW_MIN_DAYS, wholeDays));
}

export function dedupeReportResult(result: ReportSeriesResult): ReportSeriesResult {
  const endedIds = new Set(result.ended_pending_clearance.map((series) => series.id));

  return {
    upcoming_end: result.upcoming_end.filter(
      (series) => !endedIds.has(series.id) && !isExcludedFromReport(series),
    ),
    ended_pending_clearance: result.ended_pending_clearance.filter((series) => !isExcludedFromReport(series)),
  };
}

export function getHistorySeries(
  seriesRecords: readonly SpecialSeries[],
  filters: WorkspaceFilters,
): SpecialSeries[] {
  const searchText = filters.searchText.trim().toLocaleLowerCase();

  return seriesRecords
    .filter((series) => {
      const searchableText = `${series.series_name} ${series.supplier_id}`.toLocaleLowerCase();

      return (
        series.status === "CLOSURE_COMPLETED" &&
        (filters.supplierId === "ALL" || series.supplier_id === filters.supplierId) &&
        (filters.specialType === "ALL" || series.special_type === filters.specialType) &&
        (searchText.length === 0 || searchableText.includes(searchText))
      );
    })
    .sort(compareCompletedSeries);
}

export function buildReportScopeText(
  asOfDate: string,
  filters: WorkspaceFilters,
  reportFilters: ReportFilters,
  suppliers: readonly Supplier[],
): string {
  const windowEndDate = addIsoDays(asOfDate, normalizeReportWindowDays(reportFilters.withinDays));
  const includedGroups = [
    reportFilters.includeUpcoming ? "即将结束" : null,
    reportFilters.includeEnded ? "已结束待清货" : null,
  ].filter(Boolean);
  const supplierText =
    filters.supplierId === "ALL" ? "全部供应商" : getSupplierName(suppliers, filters.supplierId);
  const typeText =
    filters.specialType === "ALL"
      ? "全部类型"
      : SPECIAL_TYPE_LABELS[filters.specialType as SpecialType];

  return `基准日 ${asOfDate}，即将结束窗口到 ${windowEndDate}；包含 ${
    includedGroups.length > 0 ? includedGroups.join("、") : "无报告分组"
  }；${supplierText}，${typeText}；收尾完成和已归档不会进入提示。`;
}

export function buildReapplyAsEverydayInput(series: SpecialSeries): SeriesMutationInput {
  return {
    ...toSeriesMutationInput(series),
    special_type: "EVERYDAY_SPECIAL",
    effective_end_date: null,
    ideal_end_date: null,
    ideal_end_strategy: null,
    fixed_period_unit: null,
    fixed_period_count: null,
    status: "ACTIVE",
  };
}

export function isValidIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatReportDateTime(value?: string | null): string {
  if (!value) {
    return "未记录";
  }

  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}

function isExcludedFromReport(series: SpecialSeries): boolean {
  return (
    series.status === "DRAFT" ||
    series.status === "CLOSURE_COMPLETED" ||
    series.status === "ARCHIVED"
  );
}

function compareCompletedSeries(left: SpecialSeries, right: SpecialSeries): number {
  return (right.clearance_completed_at ?? right.updated_at).localeCompare(
    left.clearance_completed_at ?? left.updated_at,
  );
}
