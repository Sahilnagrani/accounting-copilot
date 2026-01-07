import type { Asset, Loan, JournalEntry, JournalLine, Currency } from "./types";
import { monthEndISO, monthStartISO } from "./journalEngine";

/**
 * These are "UI schedule preview" types used by SchedulesPanel.
 * They are NOT the same as JournalEntry output.
 */
export type ScheduleLine = {
  dateISO: string;
  memo: string;
  lines: JournalLine[];
};

export type AssetSchedule = {
  kind: "asset";
  assetId: string;
  assetName: string;
  periodMonth: string; // YYYY-MM
  monthlyDepreciation: number;
  line: ScheduleLine; // the entry posted for that month
};

export type LoanSchedule = {
  kind: "loan";
  loanId: string;
  loanName: string;
  periodMonth: string; // YYYY-MM
  principalPayment: number;
  interestPayment: number;
  totalPayment: number;
  line: ScheduleLine; // the entry posted for that month
};

/**
 * Marker used to identify scheduled entries and prevent double counting.
 * (Your SchedulesPanel likely references this.)
 */
export const scheduleMarker = "[SCHEDULED]";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

function line(account: string, debit = 0, credit = 0): JournalLine {
  return { account, debit: round2(debit), credit: round2(credit) };
}

function monthsBetweenInclusive(startISO: string, yyyyMm: string) {
  const [sy, sm] = startISO.split("-").map(Number);
  const [ty, tm] = yyyyMm.split("-").map(Number);
  return (ty - sy) * 12 + (tm - sm) + 1; // inclusive
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

type Args = {
  periodMonth: string; // YYYY-MM
  currency: Currency;
  assets: Asset[];
  loans: Loan[];
};

// Backward compatible with older UI code that passes { period: "YYYY-MM" }
type ArgsCompat = Omit<Args, "periodMonth"> & { periodMonth?: string; period?: string };

/**
 * Core: generate journal entries (scheduled) for the selected month.
 */
export function generateScheduledEntriesForPeriod(params: ArgsCompat): JournalEntry[] {
  const periodMonth = params.periodMonth ?? params.period ?? "";
  if (!periodMonth) return [];

  const { currency, assets, loans } = params;
  const periodEnd = monthEndISO(periodMonth);

  const out: JournalEntry[] = [];

  // -------------------------
  // Depreciation (monthly SL)
  // -------------------------
  for (const a of assets) {
    const monthsFromStart = monthsBetweenInclusive(a.acquisitionDateISO, periodMonth);
    if (monthsFromStart <= 0) continue;

    const mIndex = monthsFromStart - 1; // 0-based
    if (mIndex < 0 || mIndex >= a.usefulLifeMonths) continue;

    const monthly = round2(a.cost / a.usefulLifeMonths);
    if (monthly <= 0) continue;

    out.push({
      id: makeId("sched-depr"),
      dateISO: periodEnd,
      memo: `${scheduleMarker} Depreciation - ${a.name} (${periodMonth})`,
      currency,
      entityId: a.entityId,
      businessUnitId: a.businessUnitId,
      source: "scheduled",
      lines: [
        line(a.depreciationExpenseAccount, monthly, 0),
        line(a.accumulatedDepAccount, 0, monthly),
      ],
    });
  }

  // -------------------------
  // Loans (interest-only + SL principal)
  // -------------------------
  for (const l of loans) {
    const monthsFromStart = monthsBetweenInclusive(l.startDateISO, periodMonth);
    if (monthsFromStart <= 0) continue;

    const idx = monthsFromStart - 1;
    if (idx < 0 || idx >= l.termMonths) continue;

    const monthlyPrincipal = round2(l.principal / l.termMonths);
    const remaining = round2(l.principal - monthlyPrincipal * idx);
    const principalPay = round2(clamp(monthlyPrincipal, 0, remaining));

    const monthlyInterest = round2((remaining * (l.annualInterestRate || 0)) / 12);
    const totalPayment = round2(principalPay + monthlyInterest);
    if (totalPayment <= 0) continue;

    out.push({
      id: makeId("sched-loan"),
      dateISO: periodEnd,
      memo: `${scheduleMarker} Loan Payment - ${l.name} (${periodMonth})`,
      currency,
      entityId: l.entityId,
      businessUnitId: l.businessUnitId,
      source: "scheduled",
      lines: [
        line(l.interestExpenseAccount, monthlyInterest, 0),
        line(l.loanPayableAccount, principalPay, 0),
        line(l.cashAccount, 0, totalPayment),
      ],
    });
  }

  return out;
}

/**
 * UI helper: build preview schedule rows for a month.
 * Your SchedulesPanel can show "what will be posted".
 */
export function buildSchedulesForPeriod(params: ArgsCompat): {
  assetSchedules: AssetSchedule[];
  loanSchedules: LoanSchedule[];
} {
  const periodMonth = params.periodMonth ?? params.period ?? "";
  if (!periodMonth) return { assetSchedules: [], loanSchedules: [] };

  const { currency, assets, loans } = params;
  const periodStart = monthStartISO(periodMonth);
  const periodEnd = monthEndISO(periodMonth);

  const assetSchedules: AssetSchedule[] = [];
  const loanSchedules: LoanSchedule[] = [];

  for (const a of assets) {
    const monthsFromStart = monthsBetweenInclusive(a.acquisitionDateISO, periodMonth);
    if (monthsFromStart <= 0) continue;

    const mIndex = monthsFromStart - 1;
    if (mIndex < 0 || mIndex >= a.usefulLifeMonths) continue;

    const monthly = round2(a.cost / a.usefulLifeMonths);
    if (monthly <= 0) continue;

    assetSchedules.push({
      kind: "asset",
      assetId: a.id,
      assetName: a.name,
      periodMonth,
      monthlyDepreciation: monthly,
      line: {
        dateISO: periodEnd,
        memo: `${scheduleMarker} Depreciation - ${a.name} (${periodMonth})`,
        lines: [
          line(a.depreciationExpenseAccount, monthly, 0),
          line(a.accumulatedDepAccount, 0, monthly),
        ],
      },
    });
  }

  for (const l of loans) {
    const monthsFromStart = monthsBetweenInclusive(l.startDateISO, periodMonth);
    if (monthsFromStart <= 0) continue;

    const idx = monthsFromStart - 1;
    if (idx < 0 || idx >= l.termMonths) continue;

    const monthlyPrincipal = round2(l.principal / l.termMonths);
    const remaining = round2(l.principal - monthlyPrincipal * idx);
    const principalPay = round2(clamp(monthlyPrincipal, 0, remaining));

    const monthlyInterest = round2((remaining * (l.annualInterestRate || 0)) / 12);
    const totalPayment = round2(principalPay + monthlyInterest);
    if (totalPayment <= 0) continue;

    loanSchedules.push({
      kind: "loan",
      loanId: l.id,
      loanName: l.name,
      periodMonth,
      principalPayment: principalPay,
      interestPayment: monthlyInterest,
      totalPayment,
      line: {
        dateISO: periodEnd,
        memo: `${scheduleMarker} Loan Payment - ${l.name} (${periodMonth})`,
        lines: [
          line(l.interestExpenseAccount, monthlyInterest, 0),
          line(l.loanPayableAccount, principalPay, 0),
          line(l.cashAccount, 0, totalPayment),
        ],
      },
    });
  }

  return { assetSchedules, loanSchedules };
}