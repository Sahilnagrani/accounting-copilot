export type ActionKind = "borrow" | "lend" | "buy" | "sell" | "spend";
export type Currency = "AED" | "USD" | "EUR";

export type JournalLine = {
  account: string;
  debit: number;
  credit: number;
};

export type JournalEntrySource = "saved" | "scheduled";

export type JournalEntry = {
  id: string;
  dateISO: string;
  memo: string;
  currency: Currency;
  entityId: string;
  businessUnitId?: string;
  source?: JournalEntrySource; // "saved" | "scheduled"
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
  arAccount: string;
  apAccount: string;
  loanRecAccount: string;
  loanPayAccount: string;
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

  entityId: string;
  businessUnitId?: string;

  // NEW: period selection (YYYY-MM)
  periodMonth: string;
};

// -------------------------
// Schedules (Assets + Loans)
// -------------------------
export type DepreciationMethod = "straight_line_monthly";

export type Asset = {
  id: string;
  entityId: string;
  businessUnitId?: string;

  name: string;
  acquisitionDateISO: string; // when purchased/capitalized
  cost: number;

  assetAccount: string; // e.g. "Equipment"
  accumulatedDepAccount: string; // e.g. "Accumulated Depreciation"
  depreciationExpenseAccount: string; // e.g. "Depreciation Expense"

  method: DepreciationMethod;
  usefulLifeMonths: number; // straight-line months
};

export type Loan = {
  id: string;
  entityId: string;
  businessUnitId?: string;

  name: string;
  startDateISO: string;
  principal: number;
  annualInterestRate: number; // e.g. 0.12 = 12%
  termMonths: number;

  loanPayableAccount: string; // "Loan Payable"
  interestExpenseAccount: string; // "Interest Expense"
  cashAccount: string; // "Cash"
};