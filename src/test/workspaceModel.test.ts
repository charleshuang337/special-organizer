import { describe, expect, it } from "vitest";
import {
  buildCalendarDays,
  createEmptyWorkspaceFilters,
  filterWorkspaceSeries,
  getLifecycleCounts,
  isSeriesVisibleOnDate,
} from "../features/series/workspaceModel";
import { fixtureSeries, fixtureSuppliers } from "./fixtures/seriesFixtures";

describe("workspace model", () => {
  it("filters series by supplier and search text", () => {
    const filters = {
      ...createEmptyWorkspaceFilters(),
      supplierId: "LAYBROTHERS",
      searchText: "绿茶",
    };

    const result = filterWorkspaceSeries(fixtureSeries, fixtureSuppliers, filters);

    expect(result).toHaveLength(1);
    expect(result[0]?.series_name).toContain("绿茶");
  });

  it("counts lifecycle navigation items", () => {
    const counts = getLifecycleCounts(fixtureSeries);

    expect(counts.ALL).toBe(4);
    expect(counts.UPCOMING_END).toBe(1);
    expect(counts.ENDED_PENDING_CLEARANCE).toBe(1);
    expect(counts.CLOSURE_COMPLETED).toBe(1);
  });

  it("builds a Monday-first 42 day calendar grid", () => {
    const days = buildCalendarDays("2026-05");

    expect(days).toHaveLength(42);
    expect(days[0]?.isoDate).toBe("2026-04-27");
    expect(days.some((day) => day.isoDate === "2026-05-31")).toBe(true);
  });

  it("keeps completed history out of normal calendar reminders", () => {
    const completed = fixtureSeries.find((series) => series.status === "CLOSURE_COMPLETED");

    expect(completed).toBeDefined();
    expect(completed ? isSeriesVisibleOnDate(completed, "2026-05-15") : false).toBe(false);
    expect(
      filterWorkspaceSeries(fixtureSeries, fixtureSuppliers, createEmptyWorkspaceFilters()).some(
        (series) => series.status === "CLOSURE_COMPLETED",
      ),
    ).toBe(false);
  });
});
