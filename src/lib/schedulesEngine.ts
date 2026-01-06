import type { Asset, JournalEntry, JournalLine, Liability } from "./types";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function monthKeyFromISO(dateISO: string) {
  return dateISO.slice(0, 7); // YYYY-MM-DD -> YYYY-MM
}

function monthEndISO(yyyyMM: string) {
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, m, 0); // last day of month
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addMonths(yyyyMM: string, delta: number) {
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function line(account: string, debit = 0, credit = 0): JournalLine {
  return { account, debit: round2(debit), credit: round2(credit) };
}

function isWithinInclusive(month: string, startMonth: string, endMonth: string) {
  return month >= startMonth && month <= endMonth;
}

export function generateScheduledEntriesForPeriod(params: {
  periodYYYYMM: string;
  assets: Asset[];
  liabilities: Liability[];
}): JournalEntry[] {
  const { periodYYYYMM, assets, liabilities } = params;
  const out: JournalEntry[] = [];

  // Assets: monthly straight-line depreciation
  for (const a of assets) {
    if (a.method !== "straight_line_monthly") continue;

    const startMonth = monthKeyFromISO(a.purchaseDateISO);
    const endMonth = addMonths(startMonth, Math.max(0, a.usefulLifeMonths - 1));

    if (!isWithinInclusive(periodYYYYMM, startMonth, endMonth)) continue;

    const depreciableBase = Math.max(0, a.cost - (a.salvageValue || 0));
    const monthly = a.usefulLifeMonths > 0 ? depreciableBase / a.usefulLifeMonths : 0;
    const amt = round2(monthly);

    if (amt <= 0) continue;

    out.push({
      id: makeId(),
      dateISO: monthEndISO(periodYYYYMM),
      memo: `AUTO • Depreciation • ${a.name} • ${periodYYYYMM}`,
      currency: a.currency,
      entityId: a.entityId,
      businessUnitId: a.businessUnitId,
      lines: [
        line(a.depreciationExpenseAccount, amt, 0),
        line(a.accumulatedDepAccount, 0, amt),
      ],
    });
  }

  // Liabilities: interest-only + straight-line principal
  for (const l of liabilities) {
    const startMonth = monthKeyFromISO(l.startDateISO);
    const endMonth = addMonths(startMonth, Math.max(0, l.termMonths - 1));

    if (!isWithinInclusive(periodYYYYMM, startMonth, endMonth)) continue;

    const monthlyPrincipal = l.termMonths > 0 ? l.principal / l.termMonths : 0;
    const principalPay = round2(monthlyPrincipal);

    const monthlyInterest = round2(l.principal * (l.annualInterestRate / 12));

    if (monthlyInterest > 0) {
      out.push({
        id: makeId(),
        dateISO: monthEndISO(periodYYYYMM),
        memo: `AUTO • Interest • ${l.name} • ${periodYYYYMM}`,
        currency: l.currency,
        entityId: l.entityId,
        businessUnitId: l.businessUnitId,
        lines: [
          line(l.interestExpenseAccount, monthlyInterest, 0),
          line(l.cashAccount, 0, monthlyInterest),
        ],
      });
    }

    if (principalPay > 0) {
      out.push({
        id: makeId(),
        dateISO: monthEndISO(periodYYYYMM),
        memo: `AUTO • Principal • ${l.name} • ${periodYYYYMM}`,
        currency: l.currency,
        entityId: l.entityId,
        businessUnitId: l.businessUnitId,
        lines: [line(l.liabilityAccount, principalPay, 0), line(l.cashAccount, 0, principalPay)],
      });
    }
  }

  return out;
}

export function periodFilter(entries: JournalEntry[], periodYYYYMM: string) {
  return entries.filter((e) => e.dateISO.slice(0, 7) === periodYYYYMM);
}
