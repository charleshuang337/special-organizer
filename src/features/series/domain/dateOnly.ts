import type { ISODateString } from "../../../contracts";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function parseIsoDateOnly(value: ISODateString): Date | null {
  const match = dateOnlyPattern.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatIsoDateOnly(date: Date): ISODateString {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addDaysToDateOnly(date: Date, days: number): Date {
  return new Date(date.getTime() + days * millisecondsPerDay);
}

export function addMonthsToDateOnly(date: Date, months: number): Date {
  const originalYear = date.getUTCFullYear();
  const originalMonth = date.getUTCMonth();
  const originalDay = date.getUTCDate();
  const rawTargetMonth = originalMonth + months;
  const targetYear = originalYear + Math.floor(rawTargetMonth / 12);
  const targetMonth = ((rawTargetMonth % 12) + 12) % 12;
  const targetDay = Math.min(originalDay, getDaysInMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

export function differenceInCalendarDays(to: Date, from: Date): number {
  return Math.round((to.getTime() - from.getTime()) / millisecondsPerDay);
}

export function isBeforeDateOnly(value: Date, comparedWith: Date): boolean {
  return differenceInCalendarDays(value, comparedWith) < 0;
}

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}
