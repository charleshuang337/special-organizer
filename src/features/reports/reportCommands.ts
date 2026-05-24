import { invoke } from "@tauri-apps/api/core";
import {
  SERIES_COMMANDS,
  type ReportSeriesQuery,
  type ReportSeriesResult,
  type SeriesCommandName,
} from "../../contracts";
import type { WorkspaceFilters } from "../series/workspaceModel";
import { normalizeReportWindowDays, type ReportFilters } from "./reportModel";

type ReportInvokeCommand = <T>(
  command: SeriesCommandName,
  args?: Record<string, unknown>,
) => Promise<T>;

const defaultInvoker: ReportInvokeCommand = (command, args) => invoke(command, args);

export function listReportSeries(
  query: ReportSeriesQuery,
  invoker: ReportInvokeCommand = defaultInvoker,
): Promise<ReportSeriesResult> {
  return invoker<ReportSeriesResult>(SERIES_COMMANDS.list_report_series, { query });
}

export function buildReportSeriesQuery(
  asOfDate: string,
  filters: WorkspaceFilters,
  reportFilters: ReportFilters,
): ReportSeriesQuery {
  return {
    as_of_date: asOfDate,
    within_days: normalizeReportWindowDays(reportFilters.withinDays),
    include_upcoming: reportFilters.includeUpcoming,
    include_ended: reportFilters.includeEnded,
    supplier_ids: filters.supplierId === "ALL" ? null : [filters.supplierId],
    special_types: filters.specialType === "ALL" ? null : [filters.specialType],
  };
}
