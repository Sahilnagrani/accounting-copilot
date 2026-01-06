// src/lib/journalEngine.ts
import type {
  ActionKind,
  ComposerState,
  Currency,
  JournalEntry,
  JournalLine,
  ParsedEvent,
  Account,
} from "./types";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayISO() {
  return toISODate(new Date());
}

function stripOrdinal(s: string) {
  return s.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function parseAnyDate(text: string): string | undefined {
  const t = stripOrdinal(text.toLowerCase());

  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!isNaN(d.getTime())) return toISODate(d);
  }

  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const dd = Number(slash[1]);
    const mm = Number(slash[2]) - 1;
    let yyyy: number | undefined = slash[3] ? Number(slash[3]) : undefined;
    if (yyyy !== undefined && yyyy < 100) yyyy += 2000;

    const now = new Date();
    if (yyyy === undefined) {
      yyyy = now.getFullYear();
      const candidate = new Date(yyyy, mm, dd);
      if (candidate.getTime() > now.getTime()) yyyy -= 1;
    }
    const d = new Date(yyyy, mm, dd);
    if (!isNaN(d.getTime())) return toISODate(d);
  }

  const dmY = t.match(
    /\b(\d{1,2})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s*(\d{4})?\b/
  );
  if (dmY) {
    const dd = Number(dmY[1]);
    const mm = MONTHS[dmY[2]];
    const now = new Date();
    let yyyy = dmY[3] ? Number(dmY[3]) : now.getFullYear();
    const candidate = new Date(yyyy, mm, dd);
    if (!dmY[3] && candidate.getTime() > now.getTime()) yyyy -= 1;
    const d = new Date(yyyy, mm, dd);
    if (!isNaN(d.getTime())) return toISODate(d);
  }

  const mdY = t.match(
    /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})\s*(\d{4})?\b/
  );
  if (mdY) {
    const mm = MONTHS[mdY[1]];
    const dd = Number(mdY[2]);
    const now = new Date();
    let yyyy = mdY[3] ? Number(mdY[3]) : now.getFullYear();
    const candidate = new Date(yyyy, mm, dd);
    if (!mdY[3] && candidate.getTime() > now.getTime()) yyyy -= 1;
    const d = new Date(yyyy, mm, dd);
    if (!isNaN(d.getTime())) return toISODate(d);
  }

  return undefined;
}

function parseCurrency(text: string): Currency | undefined {
  const t = text.toLowerCase();
  if (/\b(aed|dh|dhs|dirham|dirhams)\b/.test(t)) return "AED";
  if (/\b(usd|dollar|dollars)\b/.test(t) || /\$/.test(t)) return "USD";
  if (/\b(eur|euro|euros)\b/.test(t) || /€/.test(t)) return "EUR";
  return undefined;
}

/**
 * FIXED: ignore dates when searching for the "amount"
 * and pick the LAST remaining number in the segment.
 */
function parseAmount(text: string): number | undefined {
  const scrubbed = stripOrdinal(text)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(
      /\b(\d{1,2})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s*(\d{2,4})?\b/gi,
      " "
    )
    .replace(
      /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})\s*(\d{2,4})?\b/gi,
      " "
    );

  const matches = [
    ...scrubbed.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g),
  ];
  if (matches.length === 0) return undefined;

  const m = matches[matches.length - 1];
  const raw = m[1].replace(/,/g, "") + (m[2] ? `.${m[2]}` : "");
  const n = Number(raw);

  if (!Number.isFinite(n) || n <= 0) return undefined;
  return round2(n);
}

function parseAction(text: string): ActionKind | undefined {
  const t = text.toLowerCase();

  if (/\b(lend|lent|loaned)\b/.test(t)) return "lend";
  if (/\b(borrow|borrowed)\b/.test(t)) return "borrow";
  if (/\b(buy|bought|purchase|purchased)\b/.test(t)) return "buy";
  if (/\b(sell|sold)\b/.test(t)) return "sell";
  if (/\b(spend|spent|pay|paid)\b/.test(t)) return "spend";

  return undefined;
}

function parseCounterparty(text: string, action?: ActionKind): string | undefined {
  const toMatch = text.match(/\bto\s+([a-zA-Z][^,.\n;]*)/i);
  const fromMatch = text.match(/\bfrom\s+([a-zA-Z][^,.\n;]*)/i);

  if (action === "lend" || action === "sell") {
    if (toMatch?.[1]) return toMatch[1].trim();
  }
  if (action === "borrow" || action === "buy") {
    if (fromMatch?.[1]) return fromMatch[1].trim();
  }

  const friend = text.match(/\b(a|my)\s+friend\b/i);
  if (friend) return "Friend";

  return undefined;
}

function parseItem(text: string, action?: ActionKind): string | undefined {
  if (action !== "buy" && action !== "sell") return undefined;
  const m = text.match(
    /\b(buy|bought|purchase|purchased|sell|sold)\b\s+(.+?)\s+\bfor\b/i
  );
  if (m?.[2]) return m[2].trim();
  return undefined;
}

// Extract a candidate expense/category from natural language.
// IMPORTANT: this DOES NOT mean we will post to that account.
// We will only use it if it exists in the chart (strict allow-list).
function parseExpenseAccount(text: string): string | undefined {
  const onMatch = text.match(/\bon\s+([^,.;\n]+)$/i);
  if (onMatch?.[1]) return onMatch[1].trim();

  const forMatch = text.match(/\bfor\s+([^,.;\n]+)$/i);
  if (forMatch?.[1]) return forMatch[1].trim();

  const ofMatch = text.match(/\bof\s+([^,.;\n]+)$/i);
  if (ofMatch?.[1]) return ofMatch[1].trim();

  return undefined;
}

type VatSplit = { base: number; vat: number; total: number };

function splitVAT(amount: number, rate: number, inclusive: boolean): VatSplit {
  if (!rate || rate <= 0) return { base: round2(amount), vat: 0, total: round2(amount) };
  if (inclusive) {
    const base = amount / (1 + rate);
    const vat = amount - base;
    return { base: round2(base), vat: round2(vat), total: round2(amount) };
  }
  const vat = amount * rate;
  return { base: round2(amount), vat: round2(vat), total: round2(amount + vat) };
}

function line(account: string, debit = 0, credit = 0): JournalLine {
  return { account, debit: round2(debit), credit: round2(credit) };
}

function normalizeAccountKey(s: string) {
  return s.trim().toLowerCase();
}

function pickAllowedAccountName(
  candidate: string | undefined,
  allowedNameMap: Map<string, string> | null
): string | null {
  if (!candidate || !allowedNameMap) return null;
  const key = normalizeAccountKey(candidate);
  return allowedNameMap.get(key) ?? null;
}

function generateEntryFromEvent(
  ev: ParsedEvent,
  defaults: Pick<ComposerState, "currency" | "vatEnabled" | "vatRate" | "vatInclusive" | "useARAP">,
  context: { dateISO: string; currency: Currency },
  allowedAccountNameMap: Map<string, string> | null
): JournalEntry | null {
  const action = ev.action;
  const amount = ev.amount;
  if (!action || !amount) return null;

  const dateISO = ev.dateISO ?? context.dateISO;
  const currency = ev.currency ?? context.currency;

  const memoParts: string[] = [];
  memoParts.push(action.toUpperCase());
  if (ev.counterparty) memoParts.push(ev.counterparty);
  if (ev.item) memoParts.push(`(${ev.item})`);
  memoParts.push(ev.raw.trim());
  const memo = memoParts.join(" - ");

  const lines: JournalLine[] = [];

  const needsVAT = action === "buy" || action === "sell";
  const vatRate = needsVAT && defaults.vatEnabled ? defaults.vatRate : 0;
  const vat = splitVAT(amount, vatRate, defaults.vatInclusive);

  switch (action) {
    case "borrow": {
      lines.push(line("Cash", amount, 0));
      lines.push(line("Loan Payable", 0, amount));
      break;
    }
    case "lend": {
      lines.push(line("Loan Receivable", amount, 0));
      lines.push(line("Cash", 0, amount));
      break;
    }
    case "buy": {
      const creditAccount = defaults.useARAP ? "Accounts Payable" : "Cash";

      // STRICT: only use a category account if it exists in the chart
      const allowedDebit =
        pickAllowedAccountName(ev.expenseAccount, allowedAccountNameMap) ?? "Purchases / Expense";

      lines.push(line(allowedDebit, vat.base, 0));
      if (vat.vat > 0) lines.push(line("Input VAT", vat.vat, 0));
      lines.push(line(creditAccount, 0, vat.total));
      break;
    }
    case "sell": {
      const debitAccount = defaults.useARAP ? "Accounts Receivable" : "Cash";
      lines.push(line(debitAccount, vat.total, 0));
      lines.push(line("Revenue", 0, vat.base));
      if (vat.vat > 0) lines.push(line("Output VAT", 0, vat.vat));
      break;
    }
    case "spend": {
      const creditAccount = defaults.useARAP ? "Accounts Payable" : "Cash";

      // STRICT: only use a category account if it exists in the chart
      const allowedDebit =
        pickAllowedAccountName(ev.expenseAccount, allowedAccountNameMap) ?? "Purchases / Expense";

      lines.push(line(allowedDebit, amount, 0));
      lines.push(line(creditAccount, 0, amount));
      break;
    }
  }

  const totalD = sumDebits(lines);
  const totalC = sumCredits(lines);
  if (Math.abs(totalD - totalC) > 0.01) return null;

  return {
  id: makeId(),
  dateISO,
  memo,
  currency,
  lines,
  entityId: "entity-default",
  businessUnitId: undefined,
};
}

export function extractEventsWithContext(text: string): ParsedEvent[] {
  const raw = text.trim();
  if (!raw) return [];

  const segments = raw
    .split(/[\n.;]+/g)
    .flatMap((s) => s.split(/\b(and then|then|also)\b/gi))
    .map((s) => s.trim())
    .filter(Boolean);

  const events: ParsedEvent[] = [];
  let ctxDateISO: string | undefined = parseAnyDate(raw);
  let ctxCurrency: Currency | undefined = parseCurrency(raw);

  for (const seg of segments) {
    const segDate = parseAnyDate(seg);
    if (segDate) ctxDateISO = segDate;

    const segCur = parseCurrency(seg);
    if (segCur) ctxCurrency = segCur;

    const action = parseAction(seg);
    const amount = parseAmount(seg);

    if (action && amount) {
      events.push({
        dateISO: segDate,
        currency: segCur,
        action,
        amount,
        counterparty: parseCounterparty(seg, action),
        item: parseItem(seg, action),
        expenseAccount: action === "spend" || action === "buy" ? parseExpenseAccount(seg) : undefined,
        raw: seg,
      });
    }
  }

  if (events.length === 0) {
    const action = parseAction(raw);
    const amount = parseAmount(raw);
    if (action && amount) {
      events.push({
        dateISO: ctxDateISO,
        currency: ctxCurrency,
        action,
        amount,
        counterparty: parseCounterparty(raw, action),
        item: parseItem(raw, action),
        expenseAccount: action === "spend" || action === "buy" ? parseExpenseAccount(raw) : undefined,
        raw,
      });
    }
  }

  return events;
}

/**
 * NEW: allowedAccounts (optional)
 * If provided, buy/spend will ONLY post to category accounts that exist in allowedAccounts.
 * Otherwise fallback to "Purchases / Expense".
 */
export function generateEntriesFromText(
  text: string,
  defaults: Pick<ComposerState, "currency" | "vatEnabled" | "vatRate" | "vatInclusive" | "useARAP">,
  opts?: { allowedAccounts?: string[] }
): { events: ParsedEvent[]; entries: JournalEntry[] } {
  const events = extractEventsWithContext(text);

  const firstDate = parseAnyDate(text) ?? todayISO();
  const firstCurrency = parseCurrency(text) ?? defaults.currency;

  const ctx = { dateISO: firstDate, currency: firstCurrency };

  const allowedAccountNameMap: Map<string, string> | null =
    opts?.allowedAccounts && opts.allowedAccounts.length
      ? new Map(opts.allowedAccounts.map((n) => [normalizeAccountKey(n), n] as const))
      : null;

  const entries: JournalEntry[] = [];
  const running = { ...ctx };

  for (const ev of events) {
    if (ev.dateISO) running.dateISO = ev.dateISO;
    if (ev.currency) running.currency = ev.currency;

    const entry = generateEntryFromEvent(ev, defaults, running, allowedAccountNameMap);
    if (entry) entries.push(entry);
  }

  return { events, entries };
}

// --------------------------
// Balancing + balances
// --------------------------

export function sumDebits(lines: JournalLine[]): number {
  return round2(lines.reduce((s, l) => s + (l.debit || 0), 0));
}

export function sumCredits(lines: JournalLine[]): number {
  return round2(lines.reduce((s, l) => s + (l.credit || 0), 0));
}

export function isBalancedEntry(entry: JournalEntry): boolean {
  return Math.abs(sumDebits(entry.lines) - sumCredits(entry.lines)) <= 0.01;
}

/**
 * Balance convention:
 * - We store balances as signed numbers:
 *   + => net debit balance
 *   - => net credit balance
 */
export function computeBalances(
  accounts: Account[],
  entries: JournalEntry[]
): {
  opening: Record<string, number>;
  closing: Record<string, number>;
} {
  const opening: Record<string, number> = {};
  const closing: Record<string, number> = {};

  for (const a of accounts) {
    opening[a.name] = round2(a.openingBalance || 0);
    closing[a.name] = round2(a.openingBalance || 0);
  }

  for (const e of entries) {
    for (const ln of e.lines) {
      if (!(ln.account in closing)) closing[ln.account] = 0;
      closing[ln.account] = round2(closing[ln.account] + (ln.debit || 0) - (ln.credit || 0));
    }
  }

  for (const name of Object.keys(closing)) {
    if (!(name in opening)) opening[name] = 0;
  }

  return { opening, closing };
}

export function formatBalance(n: number): { side: "Dr" | "Cr"; amount: number } {
  if (Math.abs(n) < 0.005) return { side: "Dr", amount: 0 };
  if (n >= 0) return { side: "Dr", amount: round2(n) };
  return { side: "Cr", amount: round2(Math.abs(n)) };
}