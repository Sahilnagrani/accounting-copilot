// src/lib/schedulesEngine.ts
import type { Currency, JournalEntry, JournalLine } from "@/lib/types";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

/**
 * Period format: YYYY-MM
 */
export function isPeriod(s: string) {
  return /^\d{4}-\d{2}$/.test(s);
}

export function periodFromISO(dateISO: string) {
  return dateISO.slice(0, 7);
}

export function periodToISODate(period: string, day = 1) {
  const dd = String(day).padStart(2, "0");
  return `${period}-${dd}`;
}

export type DepreciationMethod = "straight_line_monthly";

export type AssetSchedule = {
  id: string;
  entityId: string;

  name: string;

  // posting
  currency: Currency;
  assetAccount: string; // e.g. "Equipment"
  accumulatedDepreciationAccount: string; // e.g. "Accumulated Depreciation"
  depreciationExpenseAccount: string; // e.g. "Depreciation Expense"

  // terms
  inServicePeriod: string; // YYYY-MM (start)
  cost: number;
  salvageValue?: number;
  usefulLifeMonths: number;

  method: DepreciationMethod; // MVP: straight_line_monthly
  enabled: boolean;
};

export type LiabilitySchedule = {
  id: string;
  entityId: string;

  name: string;

  currency: Currency;

  // posting
  liabilityAccount: string; // e.g. "Loan Payable"
  interestExpenseAccount: string; // e.g. "Interest Expense"
  cashAccount: string; // e.g. "Cash"

  // terms
  startPeriod: string; // YYYY-MM (start)
  principal: number;
  annualInterestRate: number; // e.g. 0.12 for 12%
  termMonths: number;

  // MVP: interest-only + straight-line principal (each month)
  enabled: boolean;
};

export type SchedulesState = {
  assets: AssetSchedule[];
  liabilities: LiabilitySchedule[];
};

/**
 * Marker used to dedupe vs already-saved schedule entries.
 * If a saved entry memo contains this exact marker, we won't generate a duplicate.
 */
export function scheduleMarker(kind: "DEP" | "LOAN", scheduleId: string, period: string) {
  return `[AUTO:${kind}:${scheduleId}:${period}]`;
}

function line(account: string, debit = 0, credit = 0): JournalLine {
  return { account, debit: round2(debit), credit: round2(credit) };
}

/**
 * Generate *AUTO* entries for a selected month (YYYY-MM).
 * - Depreciation: straight-line monthly
 * - Loan schedule: interest-only + straight-line principal repayment
 *
 * IMPORTANT:
 * - We do NOT persist these entries automatically.
 * - You can merge them into "impact" views safely.
 * - Dedupe by checking saved entries for scheduleMarker().
 */
export function generateScheduledEntriesForPeriod(args: {
  period: string; // YYYY-MM
  entityId: string;
  savedEntries: JournalEntry[]; // used for dedupe
  schedules: SchedulesState;
}): JournalEntry[] {
  const { period, entityId, savedEntries, schedules } = args;
  if (!isPeriod(period)) return [];

  const savedMemoIndex = new Set<string>(
    savedEntries
      .filter((e) => e.entityId === entityId)
      .map((e) => e.memo ?? "")
  );

  const out: JournalEntry[] = [];

  // --------------------
  // Depreciation entries
  // --------------------
  for (const a of schedules.assets) {
    if (!a.enabled) continue;
    if (a.entityId !== entityId) continue;
    if (!isPeriod(a.inServicePeriod)) continue;
    if (period < a.inServicePeriod) continue;

    const start = a.inServicePeriod;
    const endPeriod = addMonths(start, a.usefulLifeMonths - 1);
    if (period > endPeriod) continue;

    const salvage = a.salvageValue ?? 0;
    const depBase = Math.max(0, a.cost - salvage);
    const monthly = a.usefulLifeMonths > 0 ? round2(depBase / a.usefulLifeMonths) : 0;
    if (monthly <= 0) continue;

    const marker = scheduleMarker("DEP", a.id, period);
    if ([...savedMemoIndex].some((m) => m.includes(marker))) continue;

    const dateISO = periodToISODate(period, 28); // “end-ish” of month
    const memo = `Depreciation • ${a.name} ${marker}`;

    out.push({
      id: makeId(),
      entityId,
      dateISO,
      memo,
      currency: a.currency,
      businessUnitId: undefined,
      lines: [
        line(a.depreciationExpenseAccount, monthly, 0),
        line(a.accumulatedDepreciationAccount, 0, monthly),
      ],
    });
  }

  // ----------------
  // Loan schedule
  // ----------------
  for (const l of schedules.liabilities) {
    if (!l.enabled) continue;
    if (l.entityId !== entityId) continue;
    if (!isPeriod(l.startPeriod)) continue;
    if (period < l.startPeriod) continue;

    const endPeriod = addMonths(l.startPeriod, l.termMonths - 1);
    if (period > endPeriod) continue;

    const principalPerMonth = l.termMonths > 0 ? round2(l.principal / l.termMonths) : 0;
    const monthlyRate = (l.annualInterestRate ?? 0) / 12;
    const interest = round2(l.principal * monthlyRate); // MVP: interest on original principal
    const principalPay = Math.max(0, principalPerMonth);

    const marker = scheduleMarker("LOAN", l.id, period);
    if ([...savedMemoIndex].some((m) => m.includes(marker))) continue;

    // If both are 0, skip
    if (interest <= 0 && principalPay <= 0) continue;

    const dateISO = periodToISODate(period, 28);
    const memo = `Loan schedule • ${l.name} ${marker}`;

    const lines: JournalLine[] = [];
    if (interest > 0) lines.push(line(l.interestExpenseAccount, interest, 0));
    if (principalPay > 0) lines.push(line(l.liabilityAccount, principalPay, 0));
    lines.push(line(l.cashAccount, 0, round2(interest + principalPay)));

    out.push({
      id: makeId(),
      entityId,
      dateISO,
      memo,
      currency: l.currency,
      businessUnitId: undefined,
      lines,
    });
  }

  return out;
}

// ---------
// Helpers
// ---------
function addMonths(period: string, deltaMonths: number) {
  const [yS, mS] = period.split("-");
  const y = Number(yS);
  const m = Number(mS) - 1;
  const d = new Date(y, m, 1);
  d.setMonth(d.getMonth() + deltaMonths);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}