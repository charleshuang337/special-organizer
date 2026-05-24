import { describe, expect, it } from "vitest";
import type { SpecialSeries } from "../contracts";
import { buildReportSeriesQuery } from "../features/reports/reportCommands";
import {
  buildReapplyAsEverydayInput,
  buildReportScopeText,
  dedupeReportResult,
  getHistorySeries,
  isValidIsoDateOnly,
  normalizeReportWindowDays,
} from "../features/reports/reportModel";
import { createEmptyWorkspaceFilters } from "../features/series/workspaceModel";
import { fixtureSuppliers } from "./fixtures/seriesFixtures";

const baseSeries: SpecialSeries = {
  id: "series-report-test",
  supplier_id: "LAYBROTHERS",
  series_name: "报告测试特价",
  special_type: "WEEKLY_SPECIAL",
  normal_cost: 10,
  special_supply_cost: 8,
  regular_price: 12,
  special_price: 9,
  effective_start_date: "2026-05-01",
  effective_end_date: "2026-05-08",
  shelf_life_date: null,
  ideal_end_date: "2026-05-08",
  ideal_end_strategy: "EFFECTIVE_PERIOD",
  fixed_period_unit: null,
  fixed_period_count: null,
  status: "UPCOMING_END",
  clearance_completed_at: null,
  notes: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

describe("report model", () => {
  it("builds report command query from report-owned filters", () => {
    const query = buildReportSeriesQuery(
      "2026-05-25",
      {
        ...createEmptyWorkspaceFilters(),
        supplierId: "ETTASON",
        specialType: "FAST_REMOVE_SPECIAL",
      },
      {
        withinDays: 0,
        includeUpcoming: false,
        includeEnded: true,
      },
    );

    expect(query).toEqual({
      as_of_date: "2026-05-25",
      within_days: 0,
      include_upcoming: false,
      include_ended: true,
      supplier_ids: ["ETTASON"],
      special_types: ["FAST_REMOVE_SPECIAL"],
    });

    expect(
      buildReportSeriesQuery(
        "2026-05-25",
        createEmptyWorkspaceFilters(),
        { withinDays: 90, includeUpcoming: true, includeEnded: true },
      ).within_days,
    ).toBe(60);
  });

  it("normalizes report windows and validates date-only input", () => {
    expect(normalizeReportWindowDays(-2)).toBe(0);
    expect(normalizeReportWindowDays(12.8)).toBe(12);
    expect(normalizeReportWindowDays(90)).toBe(60);
    expect(isValidIsoDateOnly("2026-02-28")).toBe(true);
    expect(isValidIsoDateOnly("2026-02-30")).toBe(false);
  });

  it("keeps draft, completed, and archived series out of report groups and exposes completed as history", () => {
    const draft: SpecialSeries = {
      ...baseSeries,
      id: "series-draft",
      status: "DRAFT",
    };
    const completed: SpecialSeries = {
      ...baseSeries,
      id: "series-completed",
      status: "CLOSURE_COMPLETED",
      clearance_completed_at: "2026-05-09T00:00:00.000Z",
    };
    const archived: SpecialSeries = {
      ...baseSeries,
      id: "series-archived",
      status: "ARCHIVED",
    };

    expect(
      dedupeReportResult({
        upcoming_end: [baseSeries, draft, completed, archived],
        ended_pending_clearance: [draft, completed, archived],
      }),
    ).toEqual({
      upcoming_end: [baseSeries],
      ended_pending_clearance: [],
    });

    expect(getHistorySeries([baseSeries, draft, completed, archived], createEmptyWorkspaceFilters())).toEqual([
      completed,
    ]);
  });

  it("builds an everyday reapply mutation that restores historical series to active", () => {
    const completed: SpecialSeries = {
      ...baseSeries,
      status: "CLOSURE_COMPLETED",
      clearance_completed_at: "2026-05-09T00:00:00.000Z",
    };

    expect(buildReapplyAsEverydayInput(completed)).toMatchObject({
      special_type: "EVERYDAY_SPECIAL",
      status: "ACTIVE",
      effective_end_date: null,
      ideal_end_date: null,
      ideal_end_strategy: null,
    });

    expect(
      buildReportScopeText(
        "2026-05-25",
        createEmptyWorkspaceFilters(),
        { withinDays: 7, includeUpcoming: true, includeEnded: true },
        fixtureSuppliers,
      ),
    ).toContain("即将结束窗口到 2026-06-01");
  });
});
