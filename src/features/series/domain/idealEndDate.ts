import {
  FIXED_PERIOD_COUNTS,
  FIXED_PERIOD_UNITS,
  type FixedPeriodCount,
  type FixedPeriodUnit,
  type IdealEndStrategy,
  type ISODateString,
  type SpecialType,
} from "../../../contracts";
import {
  addDaysToDateOnly,
  addMonthsToDateOnly,
  formatIsoDateOnly,
  isBeforeDateOnly,
  parseIsoDateOnly,
} from "./dateOnly";
import { err, ok, type DomainResult, type DomainRuleErrorCode } from "./results";

export interface IdealEndDateInput {
  special_type: SpecialType;
  strategy?: IdealEndStrategy | null;
  effective_start_date?: ISODateString | null;
  effective_end_date?: ISODateString | null;
  shelf_life_date?: ISODateString | null;
  ideal_end_date?: ISODateString | null;
  fixed_period_unit?: FixedPeriodUnit | null;
  fixed_period_count?: FixedPeriodCount | null;
}

export interface IdealEndDateCalculation {
  ideal_end_date: ISODateString | null;
  strategy: IdealEndStrategy | null;
  requires_manual_date: boolean;
}

export function getDefaultIdealEndStrategy(input: {
  special_type: SpecialType;
  effective_end_date?: ISODateString | null;
  shelf_life_date?: ISODateString | null;
}): IdealEndStrategy | null {
  if (input.special_type === "EVERYDAY_SPECIAL") {
    return null;
  }

  if (input.special_type === "WEEKLY_SPECIAL") {
    return "EFFECTIVE_PERIOD";
  }

  if (input.shelf_life_date) {
    return "SHELF_LIFE";
  }

  if (input.effective_end_date) {
    return "EFFECTIVE_PERIOD";
  }

  return "MANUAL";
}

export function calculateIdealEndDate(
  input: IdealEndDateInput,
): DomainResult<IdealEndDateCalculation> {
  const strategy = input.strategy ?? getDefaultIdealEndStrategy(input);

  if (strategy === null) {
    return ok({
      ideal_end_date: null,
      strategy,
      requires_manual_date: false,
    });
  }

  switch (strategy) {
    case "FIXED_PERIOD":
      return calculateFixedPeriodEndDate(input, strategy);
    case "EFFECTIVE_PERIOD":
      return calculateDirectEndDate(
        input,
        strategy,
        input.effective_end_date,
        "effective_end_date",
        "MISSING_EFFECTIVE_END_DATE",
      );
    case "SHELF_LIFE":
      return calculateDirectEndDate(
        input,
        strategy,
        input.shelf_life_date,
        "shelf_life_date",
        "MISSING_SHELF_LIFE_DATE",
      );
    case "MANUAL":
      return calculateManualEndDate(input, strategy);
  }
}

function calculateFixedPeriodEndDate(
  input: IdealEndDateInput,
  strategy: IdealEndStrategy,
): DomainResult<IdealEndDateCalculation> {
  if (!input.effective_start_date) {
    return missingDate("effective_start_date", "MISSING_EFFECTIVE_START_DATE");
  }

  const fixedPeriod = {
    unit: input.fixed_period_unit,
    count: input.fixed_period_count,
  };

  if (!isSupportedFixedPeriod(fixedPeriod)) {
    return err({
      code: "MISSING_FIXED_PERIOD",
      field: "fixed_period",
      message: "固定周期策略需要 1、2 或 3 个 WEEK 或 MONTH。",
    });
  }

  const startDate = parseDate(input.effective_start_date, "effective_start_date");

  if (!startDate.ok) {
    return startDate;
  }

  const endDate =
    fixedPeriod.unit === "WEEK"
      ? addDaysToDateOnly(startDate.value, fixedPeriod.count * 7)
      : addMonthsToDateOnly(startDate.value, fixedPeriod.count);

  return ok({
    ideal_end_date: formatIsoDateOnly(endDate),
    strategy,
    requires_manual_date: false,
  });
}

function calculateManualEndDate(
  input: IdealEndDateInput,
  strategy: IdealEndStrategy,
): DomainResult<IdealEndDateCalculation> {
  if (!input.ideal_end_date) {
    return err({
      code: "MANUAL_END_REQUIRED",
      field: "ideal_end_date",
      message: "手动结束日期策略需要用户选择理想结束日期。",
    });
  }

  return calculateDirectEndDate(
    input,
    strategy,
    input.ideal_end_date,
    "ideal_end_date",
    "MISSING_MANUAL_IDEAL_END_DATE",
    true,
  );
}

function calculateDirectEndDate(
  input: IdealEndDateInput,
  strategy: IdealEndStrategy,
  value: ISODateString | null | undefined,
  field: string,
  missingCode: DomainRuleErrorCode,
  requiresManualDate = false,
): DomainResult<IdealEndDateCalculation> {
  if (!value) {
    return missingDate(field, missingCode);
  }

  const endDate = parseDate(value, field);

  if (!endDate.ok) {
    return endDate;
  }

  const startCheck = ensureNotBeforeStart(input, endDate.value, field);

  if (!startCheck.ok) {
    return startCheck;
  }

  return ok({
    ideal_end_date: formatIsoDateOnly(endDate.value),
    strategy,
    requires_manual_date: requiresManualDate,
  });
}

function ensureNotBeforeStart(
  input: IdealEndDateInput,
  endDate: Date,
  endField: string,
): DomainResult<true> {
  if (!input.effective_start_date) {
    return ok(true);
  }

  const startDate = parseDate(input.effective_start_date, "effective_start_date");

  if (!startDate.ok) {
    return startDate;
  }

  if (isBeforeDateOnly(endDate, startDate.value)) {
    return err({
      code: "END_BEFORE_START",
      field: endField,
      message: "结束日期不能早于有效开始日期。",
    });
  }

  return ok(true);
}

function parseDate(value: ISODateString, field: string): DomainResult<Date> {
  const parsed = parseIsoDateOnly(value);

  if (!parsed) {
    return err({
      code: "INVALID_DATE",
      field,
      message: "日期必须是有效的 YYYY-MM-DD 格式。",
    });
  }

  return ok(parsed);
}

function missingDate(field: string, code: DomainRuleErrorCode): DomainResult<never> {
  return err({
    code,
    field,
    message: "缺少计算理想结束日期所需的日期字段。",
  });
}

function isSupportedFixedPeriod(period: {
  unit: FixedPeriodUnit | null | undefined;
  count: FixedPeriodCount | null | undefined;
}): period is { unit: FixedPeriodUnit; count: FixedPeriodCount } {
  const hasSupportedUnit = FIXED_PERIOD_UNITS.some((candidate) => candidate === period.unit);
  const hasSupportedCount = FIXED_PERIOD_COUNTS.some((candidate) => candidate === period.count);

  return hasSupportedUnit && hasSupportedCount;
}
