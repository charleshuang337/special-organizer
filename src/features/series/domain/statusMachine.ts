import type { ISODateString, SpecialSeriesStatus } from "../../../contracts";
import { differenceInCalendarDays, parseIsoDateOnly } from "./dateOnly";
import { err, ok, type DomainResult } from "./results";

export const STATUS_TRANSITIONS = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["UPCOMING_END", "ENDED_PENDING_CLEARANCE", "ARCHIVED"],
  UPCOMING_END: ["ACTIVE", "ENDED_PENDING_CLEARANCE", "ARCHIVED"],
  ENDED_PENDING_CLEARANCE: ["ACTIVE", "CLOSURE_COMPLETED", "ARCHIVED"],
  CLOSURE_COMPLETED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
} as const satisfies Record<SpecialSeriesStatus, readonly SpecialSeriesStatus[]>;

export interface DateDrivenStatusInput {
  current_status: SpecialSeriesStatus;
  as_of_date: ISODateString;
  ideal_end_date?: ISODateString | null;
  upcoming_warning_days?: number;
}

export function getAllowedNextStatuses(status: SpecialSeriesStatus): readonly SpecialSeriesStatus[] {
  return STATUS_TRANSITIONS[status];
}

export function canTransitionSeriesStatus(
  from: SpecialSeriesStatus,
  to: SpecialSeriesStatus,
): boolean {
  const allowed = STATUS_TRANSITIONS[from] as readonly SpecialSeriesStatus[];

  return allowed.includes(to);
}

export function requireStatusTransition(
  from: SpecialSeriesStatus,
  to: SpecialSeriesStatus,
): DomainResult<SpecialSeriesStatus> {
  if (canTransitionSeriesStatus(from, to)) {
    return ok(to);
  }

  return err({
    code: "INVALID_STATUS_TRANSITION",
    field: "status",
    message: `${from} 不能直接流转到 ${to}。`,
  });
}

export function deriveDateDrivenSeriesStatus(
  input: DateDrivenStatusInput,
): DomainResult<SpecialSeriesStatus> {
  if (
    input.current_status === "DRAFT" ||
    input.current_status === "CLOSURE_COMPLETED" ||
    input.current_status === "ARCHIVED"
  ) {
    return ok(input.current_status);
  }

  if (!input.ideal_end_date) {
    return ok("ACTIVE");
  }

  const warningDays = input.upcoming_warning_days ?? 7;

  if (!Number.isInteger(warningDays) || warningDays < 0) {
    return err({
      code: "INVALID_WARNING_WINDOW",
      field: "upcoming_warning_days",
      message: "即将结束提醒窗口必须是非负整数天数。",
    });
  }

  const asOfDate = parseIsoDateOnly(input.as_of_date);
  const idealEndDate = parseIsoDateOnly(input.ideal_end_date);

  if (!asOfDate) {
    return err({
      code: "INVALID_DATE",
      field: "as_of_date",
      message: "日期必须是有效的 YYYY-MM-DD 格式。",
    });
  }

  if (!idealEndDate) {
    return err({
      code: "INVALID_DATE",
      field: "ideal_end_date",
      message: "日期必须是有效的 YYYY-MM-DD 格式。",
    });
  }

  const daysUntilEnd = differenceInCalendarDays(idealEndDate, asOfDate);

  if (daysUntilEnd < 0) {
    return ok("ENDED_PENDING_CLEARANCE");
  }

  if (daysUntilEnd <= warningDays) {
    return ok("UPCOMING_END");
  }

  return ok("ACTIVE");
}
