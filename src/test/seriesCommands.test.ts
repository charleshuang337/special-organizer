import { describe, expect, it } from "vitest";
import type { SpecialSeries } from "../contracts";
import {
  buildDefaultSeriesInput,
  buildListSeriesQuery,
  buildReapplySeriesInput,
  formatCommandError,
  toSeriesMutationInput,
} from "../features/series/seriesCommands";
import { createEmptyWorkspaceFilters } from "../features/series/workspaceModel";

const baseSeries: SpecialSeries = {
  id: "series-test",
  supplier_id: "LAYBROTHERS",
  series_name: "测试特价",
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
  notes: "note",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

describe("series command adapter helpers", () => {
  it("builds list query from UI filters without using lifecycle as a backend status filter", () => {
    const query = buildListSeriesQuery({
      ...createEmptyWorkspaceFilters(),
      searchText: "  绿茶  ",
      supplierId: "LAYBROTHERS",
      specialType: "WEEKLY_SPECIAL",
      lifecycle: "UPCOMING_END",
    });

    expect(query).toEqual({
      search_text: "绿茶",
      supplier_ids: ["LAYBROTHERS"],
      special_types: ["WEEKLY_SPECIAL"],
      statuses: null,
      include_archived: false,
    });
  });

  it("creates command-valid defaults for weekly and everyday specials", () => {
    const weekly = buildDefaultSeriesInput("LAYBROTHERS", "WEEKLY_SPECIAL", "2026-05-25");
    const everyday = buildDefaultSeriesInput("LAYBROTHERS", "EVERYDAY_SPECIAL", "2026-05-25");

    expect(weekly).toMatchObject({
      effective_start_date: "2026-05-25",
      effective_end_date: "2026-06-01",
      ideal_end_strategy: "EFFECTIVE_PERIOD",
      status: "DRAFT",
    });
    expect(everyday.ideal_end_strategy).toBeNull();
    expect(everyday.effective_end_date).toBeNull();
  });

  it("converts selected series to mutation input and reapply input", () => {
    expect(toSeriesMutationInput(baseSeries)).toMatchObject({
      supplier_id: "LAYBROTHERS",
      series_name: "测试特价",
      status: "UPCOMING_END",
    });

    expect(buildReapplySeriesInput(baseSeries, "2026-06-01")).toMatchObject({
      status: "ACTIVE",
      ideal_end_date: "2026-06-01",
      ideal_end_strategy: "MANUAL",
    });
  });

  it("formats structured command errors for the UI", () => {
    expect(
      formatCommandError({
        code: "REQUIRED_FIELD",
        field: "series_name",
        message: "特价系列名称不能为空。",
      }),
    ).toBe("特价系列名称不能为空。（series_name）");

    expect(formatCommandError("Cannot read properties of undefined (reading 'invoke')")).toBe(
      "当前浏览器预览无法访问 Tauri command；请在 Tauri 桌面窗口运行以读取本地 SQLite。",
    );
  });
});
