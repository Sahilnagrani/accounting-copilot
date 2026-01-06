export type ActionKind = "borrow" | "lend" | "buy" | "sell" | "spend";
export type Currency = "AED" | "USD" | "EUR";

export type JournalLine = {
  account: string;
  debit: number;
  credit: number;
};

export type JournalEntry = {
  id: string;
  dateISO: string;
  memo: string;
  currency: Currency;
  entityId: string; // NEW
  businessUnitId?: string; // NEW
  lines: JournalLine[];
};

export type ParsedEvent = {
  dateISO?: string;
  action?: ActionKind;
  amount?: number;
  currency?: Currency;
  counterparty?: string;
  item?: string;
  expenseAccount?: string;
  raw: string;
};

export type AccountNormalSide = "debit" | "credit";

export type Account = {
  id: string;
  name: string;
  normalSide: AccountNormalSide;
  openingBalance: number; // +Dr / -Cr
};

// -------------------------
// Entities + Business Units
// -------------------------
export type BusinessUnit = {
  id: string;
  name: string;
};

export type ConsolidationMethod = "full" | "equity" | "none";

export type IntercompanyEliminationPolicy = {
  enabled: boolean;

  // account names used in your chart
  arAccount: string; // e.g. "Intercompany Receivable"
  apAccount: string; // e.g. "Intercompany Payable"
  loanRecAccount: string; // e.g. "Intercompany Loan Receivable"
  loanPayAccount: string; // e.g. "Intercompany Loan Payable"
};

export type EntityPolicy = {
  ownershipPct: number; // 0-100
  method: ConsolidationMethod;
  functionalCurrency: Currency;
  intercompany: IntercompanyEliminationPolicy;
};

export type Entity = {
  id: string;
  name: string;
  baseCurrency: Currency;
  businessUnits: BusinessUnit[];
  policy: EntityPolicy;
};

export type ComposerState = {
  text: string;
  currency: Currency;

  vatEnabled: boolean;
  vatRate: number;
  vatInclusive: boolean;

  useARAP: boolean;

  entityId: string; // NEW
  businessUnitId?: string; // NEW
};