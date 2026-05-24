import { describe, expect, it } from "vitest";
import { DEFAULT_SUPPLIER_IDS, DEFAULT_SUPPLIERS } from "../contracts";
import {
  calculateIdealEndDate,
  canTransitionSeriesStatus,
  deriveDateDrivenSeriesStatus,
  getAllowedNextStatuses,
  getDefaultIdealEndStrategy,
  requireStatusTransition,
} from "../features/series/domain";

describe("series contracts", () => {
  it("defines the fixed default suppliers in seed order", () => {
    expect(DEFAULT_SUPPLIER_IDS).toEqual([
      "LAYBROTHERS",
      "ETTASON",
      "ORIENTAL_MERCHANT",
      "TAIWANESE_OVERSEAS",
      "ROCKMAN",
    ]);
    expect(DEFAULT_SUPPLIERS.map((supplier) => supplier.id)).toEqual(DEFAULT_SUPPLIER_IDS);
    expect(DEFAULT_SUPPLIERS.every((supplier) => supplier.is_default && supplier.is_active)).toBe(
      true,
    );
  });
});

describe("ideal end date rules", () => {
  it("keeps everyday specials open-ended by default", () => {
    expect(getDefaultIdealEndStrategy({ special_type: "EVERYDAY_SPECIAL" })).toBeNull();

    const result = calculateIdealEndDate({ special_type: "EVERYDAY_SPECIAL" });

    expect(result).toEqual({
      ok: true,
      value: {
        ideal_end_date: null,
        strategy: null,
        requires_manual_date: false,
      },
    });
  });

  it("uses the effective end date by default for weekly specials", () => {
    const result = calculateIdealEndDate({
      special_type: "WEEKLY_SPECIAL",
      effective_start_date: "2026-05-01",
      effective_end_date: "2026-05-07",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        ideal_end_date: "2026-05-07",
        strategy: "EFFECTIVE_PERIOD",
        requires_manual_date: false,
      },
    });
  });

  it("prefers shelf life for fast remove specials and falls back to effective end", () => {
    const shelfLifeResult = calculateIdealEndDate({
      special_type: "FAST_REMOVE_SPECIAL",
      effective_end_date: "2026-05-10",
      shelf_life_date: "2026-05-05",
    });
    const fallbackResult = calculateIdealEndDate({
      special_type: "FAST_REMOVE_SPECIAL",
      effective_end_date: "2026-05-10",
    });

    expect(shelfLifeResult.ok && shelfLifeResult.value).toMatchObject({
      ideal_end_date: "2026-05-05",
      strategy: "SHELF_LIFE",
    });
    expect(fallbackResult.ok && fallbackResult.value).toMatchObject({
      ideal_end_date: "2026-05-10",
      strategy: "EFFECTIVE_PERIOD",
    });
  });

  it("requires a manual date when fast remove has no shelf life or effective end date", () => {
    const result = calculateIdealEndDate({ special_type: "FAST_REMOVE_SPECIAL" });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("MANUAL_END_REQUIRED");
  });

  it.each([
    [1, "2026-05-08"],
    [2, "2026-05-15"],
    [3, "2026-05-22"],
  ] as const)("adds fixed %i week(s) from effective start date", (count, expectedDate) => {
    const result = calculateIdealEndDate({
      special_type: "WEEKLY_SPECIAL",
      strategy: "FIXED_PERIOD",
      effective_start_date: "2026-05-01",
      fixed_period_unit: "WEEK",
      fixed_period_count: count,
    });

    expect(result.ok && result.value.ideal_end_date).toBe(expectedDate);
  });

  it.each([
    [1, "2026-02-15"],
    [2, "2026-03-15"],
    [3, "2026-04-15"],
  ] as const)("adds fixed %i month(s) from effective start date", (count, expectedDate) => {
    const result = calculateIdealEndDate({
      special_type: "WEEKLY_SPECIAL",
      strategy: "FIXED_PERIOD",
      effective_start_date: "2026-01-15",
      fixed_period_unit: "MONTH",
      fixed_period_count: count,
    });

    expect(result.ok && result.value.ideal_end_date).toBe(expectedDate);
  });

  it("clamps fixed month calculations to the target month end", () => {
    const result = calculateIdealEndDate({
      special_type: "WEEKLY_SPECIAL",
      strategy: "FIXED_PERIOD",
      effective_start_date: "2026-01-31",
      fixed_period_unit: "MONTH",
      fixed_period_count: 1,
    });

    expect(result.ok && result.value.ideal_end_date).toBe("2026-02-28");
  });

  it("uses manual ideal end date when strategy is manual", () => {
    const result = calculateIdealEndDate({
      special_type: "EVERYDAY_SPECIAL",
      strategy: "MANUAL",
      effective_start_date: "2026-05-01",
      ideal_end_date: "2026-06-01",
    });

    expect(result.ok && result.value).toMatchObject({
      ideal_end_date: "2026-06-01",
      strategy: "MANUAL",
      requires_manual_date: true,
    });
  });

  it("rejects invalid dates and end dates before effective start", () => {
    const invalidResult = calculateIdealEndDate({
      special_type: "WEEKLY_SPECIAL",
      effective_end_date: "2026-02-30",
    });
    const beforeStartResult = calculateIdealEndDate({
      special_type: "WEEKLY_SPECIAL",
      effective_start_date: "2026-05-10",
      effective_end_date: "2026-05-09",
    });

    expect(invalidResult.ok).toBe(false);
    expect(!invalidResult.ok && invalidResult.error.code).toBe("INVALID_DATE");
    expect(beforeStartResult.ok).toBe(false);
    expect(!beforeStartResult.ok && beforeStartResult.error.code).toBe("END_BEFORE_START");
  });
});

describe("series status machine", () => {
  it("lists allowed transitions and rejects unsupported jumps", () => {
    expect(getAllowedNextStatuses("DRAFT")).toEqual(["ACTIVE", "ARCHIVED"]);
    expect(canTransitionSeriesStatus("ENDED_PENDING_CLEARANCE", "CLOSURE_COMPLETED")).toBe(true);
    expect(canTransitionSeriesStatus("ARCHIVED", "ACTIVE")).toBe(false);

    const result = requireStatusTransition("DRAFT", "CLOSURE_COMPLETED");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("derives active, upcoming, and ended statuses from ideal end date", () => {
    expect(
      deriveDateDrivenSeriesStatus({
        current_status: "ACTIVE",
        as_of_date: "2026-05-20",
        ideal_end_date: "2026-05-30",
        upcoming_warning_days: 3,
      }),
    ).toEqual({ ok: true, value: "ACTIVE" });

    expect(
      deriveDateDrivenSeriesStatus({
        current_status: "ACTIVE",
        as_of_date: "2026-05-27",
        ideal_end_date: "2026-05-30",
        upcoming_warning_days: 3,
      }),
    ).toEqual({ ok: true, value: "UPCOMING_END" });

    expect(
      deriveDateDrivenSeriesStatus({
        current_status: "UPCOMING_END",
        as_of_date: "2026-05-31",
        ideal_end_date: "2026-05-30",
      }),
    ).toEqual({ ok: true, value: "ENDED_PENDING_CLEARANCE" });
  });

  it("does not date-derive draft, closure completed, or archived series", () => {
    expect(
      deriveDateDrivenSeriesStatus({
        current_status: "CLOSURE_COMPLETED",
        as_of_date: "2026-05-31",
        ideal_end_date: "2026-05-01",
      }),
    ).toEqual({ ok: true, value: "CLOSURE_COMPLETED" });
  });
});
