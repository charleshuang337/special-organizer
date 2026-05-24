export type DomainRuleErrorCode =
  | "INVALID_DATE"
  | "MISSING_EFFECTIVE_START_DATE"
  | "MISSING_EFFECTIVE_END_DATE"
  | "MISSING_SHELF_LIFE_DATE"
  | "MISSING_MANUAL_IDEAL_END_DATE"
  | "MISSING_FIXED_PERIOD"
  | "END_BEFORE_START"
  | "MANUAL_END_REQUIRED"
  | "INVALID_STATUS_TRANSITION"
  | "INVALID_WARNING_WINDOW";

export interface DomainRuleError {
  code: DomainRuleErrorCode;
  field?: string;
  message: string;
}

export type DomainResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: DomainRuleError;
    };

export function ok<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

export function err(error: DomainRuleError): DomainResult<never> {
  return { ok: false, error };
}
