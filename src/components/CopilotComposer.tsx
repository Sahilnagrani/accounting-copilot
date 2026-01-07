"use client";

import React, { useMemo, useState, useEffect } from "react";
import type { Account, ComposerState, JournalEntry, JournalLine, Entity, Asset, Loan, Currency } from "@/lib/types";
import { generateEntriesFromText, isoInMonth, monthEndISO, computeBalancesAsOf, formatBalance } from "@/lib/journalEngine";
import { generateScheduledEntriesForPeriod } from "@/lib/schedulesEngine";
import { Card, CardContent, CardHeader } from "./ui/Card";

// If you already have these components, keep them.
// This file does NOT require them anymore to function.
function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

const DEFAULT_ENTITY_ID = "entity-default";

function currentYYYYMM(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

const defaultAccounts: Account[] = [
  { id: makeId(), name: "Cash", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Accounts Receivable", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Accounts Payable", normalSide: "credit", openingBalance: 0 },
  { id: makeId(), name: "Loan Receivable", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Loan Payable", normalSide: "credit", openingBalance: 0 },
  { id: makeId(), name: "Revenue", normalSide: "credit", openingBalance: 0 },
  { id: makeId(), name: "Purchases / Expense", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Input VAT", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Output VAT", normalSide: "credit", openingBalance: 0 },

  // schedule defaults
  { id: makeId(), name: "Equipment", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Accumulated Depreciation", normalSide: "credit", openingBalance: 0 },
  { id: makeId(), name: "Depreciation Expense", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Interest Expense", normalSide: "debit", openingBalance: 0 },
];

function defaultEntity(name: string): Entity {
  return {
    id: makeId(),
    name,
    baseCurrency: "AED",
    businessUnits: [{ id: makeId(), name: "General" }],
    policy: {
      ownershipPct: 100,
      method: "full",
      functionalCurrency: "AED",
      intercompany: {
        enabled: true,
        arAccount: "Intercompany Receivable",
        apAccount: "Intercompany Payable",
        loanRecAccount: "Intercompany Loan Receivable",
        loanPayAccount: "Intercompany Loan Payable",
      },
    },
  };
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-2 text-xs",
        active
          ? "border-emerald-700 bg-emerald-900/25 text-emerald-200"
          : "border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:border-zinc-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function BalanceGrid({ title, balances }: { title: string; balances: Record<string, number> }) {
  const rows = Object.entries(balances).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
      <div className="bg-zinc-950/40 px-4 py-3 text-sm font-medium text-zinc-100">{title}</div>
      <div className="grid grid-cols-12 bg-zinc-950/20 px-4 py-2 text-xs text-zinc-400">
        <div className="col-span-7">Account</div>
        <div className="col-span-5 text-right">Balance</div>
      </div>
      {rows.length === 0 ? (
        <div className="border-t border-zinc-800 px-4 py-3 text-sm text-zinc-400">No balances.</div>
      ) : (
        rows.map(([name, bal]) => {
          const f = formatBalance(bal);
          return (
            <div key={name} className="grid grid-cols-12 border-t border-zinc-800 px-4 py-2 text-sm">
              <div className="col-span-7 text-zinc-100">{name}</div>
              <div className="col-span-5 text-right text-zinc-200">
                {money(f.amount)} {f.side}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// -------------------------
// localStorage persistence
// -------------------------
const LS_KEY = "acctcopilot:v1";

type Persisted = {
  entities: Entity[];
  accountsByEntity: Record<string, Account[]>;
  savedEntries: JournalEntry[];
  assets: Asset[];
  loans: Loan[];
};

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export default function CopilotComposer() {
  // ------------ state ------------
  const [tab, setTab] = useState<"compose" | "saved" | "schedules" | "impact">("compose");

  const [entities, setEntities] = useState<Entity[]>(() => [defaultEntity("Main Entity")]);
  const [activeEntityId, setActiveEntityId] = useState<string>(() => entities[0]?.id ?? DEFAULT_ENTITY_ID);

  const [accountsByEntity, setAccountsByEntity] = useState<Record<string, Account[]>>(() => ({
    [DEFAULT_ENTITY_ID]: defaultAccounts,
  }));

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [savedEntries, setSavedEntries] = useState<JournalEntry[]>([]);

  const [state, setState] = useState<ComposerState>({
    text: "",
    currency: "AED",
    vatEnabled: true,
    vatRate: 0.05,
    vatInclusive: true,
    useARAP: false,
    entityId: DEFAULT_ENTITY_ID,
    businessUnitId: undefined,
    periodMonth: currentYYYYMM(),
  });

  // restore persisted
  useEffect(() => {
    const loaded = safeParse<Persisted>(localStorage.getItem(LS_KEY));
    if (!loaded) return;

    setEntities(loaded.entities?.length ? loaded.entities : [defaultEntity("Main Entity")]);
    setAccountsByEntity(loaded.accountsByEntity && Object.keys(loaded.accountsByEntity).length ? loaded.accountsByEntity : { [DEFAULT_ENTITY_ID]: defaultAccounts });
    setSavedEntries(Array.isArray(loaded.savedEntries) ? loaded.savedEntries : []);
    setAssets(Array.isArray(loaded.assets) ? loaded.assets : []);
    setLoans(Array.isArray(loaded.loans) ? loaded.loans : []);
  }, []);

  // persist
  useEffect(() => {
    const payload: Persisted = {
      entities,
      accountsByEntity,
      savedEntries,
      assets,
      loans,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  }, [entities, accountsByEntity, savedEntries, assets, loans]);

  // keep state.entityId consistent with activeEntityId without illegal effect loops
  useEffect(() => {
    setState((s) => ({ ...s, entityId: activeEntityId }));
  }, [activeEntityId]);

  const activeEntity = useMemo(() => entities.find((e) => e.id === activeEntityId) ?? null, [entities, activeEntityId]);

  const activeAccounts = useMemo<Account[]>(
    () => accountsByEntity[activeEntityId] ?? accountsByEntity[DEFAULT_ENTITY_ID] ?? defaultAccounts,
    [accountsByEntity, activeEntityId]
  );

  // Fix TS error: provide a real Dispatch<SetStateAction<Account[]>>
  const setActiveAccounts: React.Dispatch<React.SetStateAction<Account[]>> = (value) => {
    setAccountsByEntity((prev) => {
      const current = prev[activeEntityId] ?? [];
      const next = typeof value === "function" ? (value as (p: Account[]) => Account[])(current) : value;
      return { ...prev, [activeEntityId]: next };
    });
  };

  // ------------ scheduled + month filtering ------------
  const periodMonth = state.periodMonth;

  const scheduledEntriesForMonth = useMemo(() => {
    return generateScheduledEntriesForPeriod({
      periodMonth,
      currency: state.currency,
      assets,
      loans,
    });
  }, [periodMonth, state.currency, assets, loans]);

  const savedEntriesForMonth = useMemo(() => {
    return savedEntries.filter((e) => isoInMonth(e.dateISO, periodMonth));
  }, [savedEntries, periodMonth]);

  // avoid double-counting: scheduled IDs are "sched-*"
  const monthEntriesAll = useMemo(() => {
    const scheduled = scheduledEntriesForMonth.filter((x) => x.source === "scheduled");
    const saved = savedEntriesForMonth.map((x) => ({ ...x, source: "saved" as const }));
    return [...saved, ...scheduled].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }, [savedEntriesForMonth, scheduledEntriesForMonth]);

  // compute balances impact as-of end of selected month
  const impact = useMemo(() => {
    const through = monthEndISO(periodMonth);
    const entityEntries = monthEntriesAll.filter((e) => e.entityId === activeEntityId);
    const asOf = computeBalancesAsOf(activeAccounts, entityEntries, through);
    return asOf.closing;
  }, [monthEntriesAll, activeEntityId, activeAccounts, periodMonth]);

  const needsVATControls = useMemo(() => {
    return /\b(buy|bought|purchase|purchased|sell|sold)\b/i.test(state.text);
  }, [state.text]);

  // ------------ generate from text ------------
  const [previewEntries, setPreviewEntries] = useState<JournalEntry[]>([]);
  const [eventsCount, setEventsCount] = useState(0);
  const [unresolvedAccounts, setUnresolvedAccounts] = useState<string[]>([]);
  const [resolvedHints, setResolvedHints] = useState<Record<string, string>>({});

  // strict allow-list of account names
  function normalizeName(s: string) {
    return s
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9\s/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalizeExact(entries: JournalEntry[], accounts: Account[]) {
    const nameMap = new Map<string, string>();
    for (const a of accounts) nameMap.set(normalizeName(a.name), a.name);

    return entries.map((e) => ({
      ...e,
      lines: e.lines.map((ln) => {
        const canon = nameMap.get(normalizeName(ln.account));
        return canon ? { ...ln, account: canon } : ln;
      }),
    }));
  }

  function tokens(s: string): string[] {
    const t = normalizeName(s);
    return t
      .split(/[\s/]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => !["a", "an", "the", "of", "for", "to", "and", "in", "on"].includes(x));
  }

  function levenshtein(a: string, b: string) {
    const aa = a;
    const bb = b;
    const m = aa.length;
    const n = bb.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[] = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;

    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
        prev = tmp;
      }
    }
    return dp[n];
  }

  function similarity(a: string, b: string) {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.92;

    const ta = new Set(tokens(na));
    const tb = new Set(tokens(nb));
    let inter = 0;
    for (const x of ta) if (tb.has(x)) inter++;
    const union = ta.size + tb.size - inter;
    const jaccard = union === 0 ? 0 : inter / union;

    const dist = levenshtein(na, nb);
    const editSim = 1 - dist / Math.max(na.length, nb.length);

    return Math.max(jaccard * 0.75 + editSim * 0.25, editSim * 0.85);
  }

  function resolveClosestAccounts(params: {
    entries: JournalEntry[];
    accounts: Account[];
    minScore?: number;
  }): { entries: JournalEntry[]; unresolved: string[]; resolvedMap: Record<string, string> } {
    const { entries, accounts } = params;
    const minScore = params.minScore ?? 0.72;

    const byNorm = new Map<string, string>();
    for (const a of accounts) byNorm.set(normalizeName(a.name), a.name);

    const unresolvedSet = new Set<string>();
    const resolvedMap: Record<string, string> = {};

    const out = entries.map((e) => {
      const newLines: JournalLine[] = e.lines.map((ln) => {
        const rawName = ln.account.trim();
        const norm = normalizeName(rawName);

        const exact = byNorm.get(norm);
        if (exact) return { ...ln, account: exact };

        let bestName: string | null = null;
        let bestScore = 0;

        for (const a of accounts) {
          const sc = similarity(rawName, a.name);
          if (sc > bestScore) {
            bestScore = sc;
            bestName = a.name;
          }
        }

        if (bestName && bestScore >= minScore) {
          resolvedMap[rawName] = bestName;
          return { ...ln, account: bestName };
        }

        unresolvedSet.add(rawName);
        return ln;
      });

      return { ...e, lines: newLines };
    });

    return {
      entries: out,
      unresolved: Array.from(unresolvedSet).sort((a, b) => a.localeCompare(b)),
      resolvedMap,
    };
  }

  function generatePreview() {
    const allowedAccounts = activeAccounts.map((a) => a.name);

    const res = generateEntriesFromText(
      state.text,
      {
        currency: state.currency,
        vatEnabled: state.vatEnabled,
        vatRate: state.vatRate,
        vatInclusive: state.vatInclusive,
        useARAP: state.useARAP,
      },
      {
        allowedAccounts,
        entityId: state.entityId,
        businessUnitId: state.businessUnitId,
      }
    );

    setEventsCount(res.events.length);

    const exact = canonicalizeExact(res.entries, activeAccounts);
    const resolved = resolveClosestAccounts({ entries: exact, accounts: activeAccounts, minScore: 0.72 });

    setPreviewEntries(resolved.entries);
    setUnresolvedAccounts(resolved.unresolved);
    setResolvedHints(resolved.resolvedMap);
  }

  function savePreviewEntries() {
    if (!previewEntries.length) return;
    const stamped = previewEntries.map((e) => ({ ...e, source: "saved" as const }));
    setSavedEntries((prev) => [...stamped, ...prev]);
    setPreviewEntries([]);
    setState((s) => ({ ...s, text: "" }));
    setTab("saved");
  }

  // ------------ schedules CRUD ------------
  function ensureAccountExists(name: string) {
    const exists = activeAccounts.some((a) => a.name === name);
    if (exists) return;
    setActiveAccounts((prev) => [...prev, { id: makeId(), name, normalSide: "debit", openingBalance: 0 }]);
  }

  function addAsset() {
    // ensure typical accounts exist (per entity chart)
    ensureAccountExists("Equipment");
    ensureAccountExists("Accumulated Depreciation");
    ensureAccountExists("Depreciation Expense");

    const a: Asset = {
      id: makeId(),
      entityId: activeEntityId,
      businessUnitId: state.businessUnitId,
      name: `Asset ${assets.length + 1}`,
      acquisitionDateISO: `${state.periodMonth}-01`,
      cost: 0,
      assetAccount: "Equipment",
      accumulatedDepAccount: "Accumulated Depreciation",
      depreciationExpenseAccount: "Depreciation Expense",
      method: "straight_line_monthly",
      usefulLifeMonths: 36,
    };
    setAssets((prev) => [a, ...prev]);
    setTab("schedules");
  }

  function addLoan() {
    ensureAccountExists("Loan Payable");
    ensureAccountExists("Interest Expense");
    ensureAccountExists("Cash");

    const l: Loan = {
      id: makeId(),
      entityId: activeEntityId,
      businessUnitId: state.businessUnitId,
      name: `Loan ${loans.length + 1}`,
      startDateISO: `${state.periodMonth}-01`,
      principal: 0,
      annualInterestRate: 0.12,
      termMonths: 12,
      loanPayableAccount: "Loan Payable",
      interestExpenseAccount: "Interest Expense",
      cashAccount: "Cash",
    };
    setLoans((prev) => [l, ...prev]);
    setTab("schedules");
  }

  function capitalizeAssetToJournal(asset: Asset) {
    // creates a SAVED entry for acquisition (Dr Asset / Cr Cash)
    const e: JournalEntry = {
      id: makeId(),
      dateISO: asset.acquisitionDateISO,
      memo: `Capitalize Asset - ${asset.name}`,
      currency: state.currency,
      entityId: asset.entityId,
      businessUnitId: asset.businessUnitId,
      source: "saved",
      lines: [
        { account: asset.assetAccount, debit: asset.cost || 0, credit: 0 },
        { account: "Cash", debit: 0, credit: asset.cost || 0 },
      ],
    };
    setSavedEntries((prev) => [e, ...prev]);
    setTab("saved");
  }

  // ------------ UI helpers ------------
  const entityBusinessUnits = activeEntity?.businessUnits ?? [];

  const entityAccountsCount = activeAccounts.length;

  return (
    <>
      {/* Top controls */}
      <Card>
        <CardHeader
          title="Accounting Copilot"
          subtitle="Compose entries, save them, and auto-generate depreciation + loan schedules into Impact."
        />
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* entity + period */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">Entity</div>
                <select
                  value={activeEntityId}
                  onChange={(e) => setActiveEntityId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                >
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-zinc-500">Accounts: {entityAccountsCount}</div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">Business Unit</div>
                <select
                  value={state.businessUnitId ?? ""}
                  onChange={(e) => setState((s) => ({ ...s, businessUnitId: e.target.value || undefined }))}
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                >
                  <option value="">(All / none)</option>
                  {entityBusinessUnits.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-zinc-500">Entries will be stamped with this BU.</div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">Period (YYYY-MM)</div>
                <input
                  value={state.periodMonth}
                  onChange={(e) => setState((s) => ({ ...s, periodMonth: e.target.value }))}
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                  placeholder="2026-01"
                />
                <div className="mt-2 text-xs text-zinc-500">
                  Impact includes: <span className="text-zinc-300">Saved + Scheduled</span> for this month.
                </div>
              </div>
            </div>

            {/* tabs */}
            <div className="flex flex-wrap gap-2">
              <TabButton active={tab === "compose"} onClick={() => setTab("compose")}>
                Compose
              </TabButton>
              <TabButton active={tab === "saved"} onClick={() => setTab("saved")}>
                Saved Entries ({savedEntriesForMonth.length} this month)
              </TabButton>
              <TabButton active={tab === "schedules"} onClick={() => setTab("schedules")}>
                Assets & Loans ({assets.length + loans.length})
              </TabButton>
              <TabButton active={tab === "impact"} onClick={() => setTab("impact")}>
                Impact (Auto)
              </TabButton>

              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    const e = defaultEntity(`Entity ${entities.length + 1}`);
                    setEntities((prev) => [...prev, e]);
                    setAccountsByEntity((prev) => ({ ...prev, [e.id]: [...defaultAccounts] }));
                    setActiveEntityId(e.id);
                  }}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                >
                  + Add entity
                </button>
                <button
                  onClick={addAsset}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                >
                  + Add asset
                </button>
                <button
                  onClick={addLoan}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                >
                  + Add loan
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* COMPOSE */}
      {tab === "compose" ? (
        <Card className="mt-6">
          <CardHeader
            title="Describe what happened"
            subtitle="Generate preview entries (strict account allow-list). Then Save."
          />
          <CardContent>
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-2 block text-xs text-zinc-400">Prompt</label>
                <textarea
                  value={state.text}
                  onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
                  className="min-h-[140px] w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-100 outline-none focus:border-zinc-700"
                  placeholder={`Examples:
On 25/12/25 I borrowed 1000. Then I lent 500 on 26/12/25.
I spent 300 cash on marketing.
I bought 300 AED worth of goods.
I bought 1200 AED equipment (use Purchases / Expense unless you created Equipment).`}
                />
                <div className="mt-2 text-xs text-zinc-400">
                  Strict rule: it will <span className="text-zinc-200">never invent accounts</span>. It only maps to closest existing,
                  otherwise marks as unrecognized.
                </div>

                {unresolvedAccounts.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-amber-800 bg-amber-950/30 p-3">
                    <div className="text-xs font-medium text-amber-200">Unrecognized accounts (not auto-created)</div>
                    <div className="mt-1 text-xs text-amber-200/80">
                      Create them in your chart or rephrase using an existing account name.
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {unresolvedAccounts.map((a) => (
                        <span
                          key={a}
                          className="rounded-xl border border-amber-800 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-100"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {Object.keys(resolvedHints).length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/30 p-3">
                    <div className="text-xs font-medium text-zinc-200">Auto-mapped to closest accounts</div>
                    <div className="mt-2 space-y-1">
                      {Object.entries(resolvedHints).map(([from, to]) => (
                        <div key={from} className="text-xs text-zinc-400">
                          <span className="text-zinc-200">{from}</span> → <span className="text-zinc-100">{to}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="text-xs text-zinc-400">Currency</div>
                  <select
                    value={state.currency}
                    onChange={(e) => setState((s) => ({ ...s, currency: e.target.value as Currency }))}
                    className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                  >
                    <option value="AED">AED</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="text-xs text-zinc-400">Mode</div>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={state.useARAP}
                      onChange={(e) => setState((s) => ({ ...s, useARAP: e.target.checked }))}
                    />
                    Use A/R & A/P instead of Cash
                  </label>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="text-xs text-zinc-400">Generate</div>
                  <div className="mt-2 text-sm text-zinc-100">Detected events: {eventsCount}</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Preview entries: <span className="text-zinc-300">{previewEntries.length}</span>
                  </div>

                  <button
                    type="button"
                    onClick={generatePreview}
                    className="mt-3 w-full rounded-xl border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/40"
                  >
                    Generate Preview
                  </button>

                  <button
                    type="button"
                    onClick={savePreviewEntries}
                    disabled={!previewEntries.length}
                    className={[
                      "mt-2 w-full rounded-xl border px-3 py-2 text-xs font-medium",
                      previewEntries.length
                        ? "border-zinc-700 bg-zinc-900/40 text-zinc-200 hover:border-zinc-600"
                        : "border-zinc-900 bg-zinc-950/20 text-zinc-600 cursor-not-allowed",
                    ].join(" ")}
                  >
                    Save Preview Entries
                  </button>
                </div>
              </div>

              {needsVATControls ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-zinc-400">VAT</div>
                      <div className="mt-1 text-sm text-zinc-100">UAE default 5%</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={state.vatEnabled}
                          onChange={(e) => setState((s) => ({ ...s, vatEnabled: e.target.checked }))}
                        />
                        VAT enabled
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-zinc-400">Rate</span>
                        <input
                          inputMode="decimal"
                          value={state.vatRate}
                          onChange={(e) =>
                            setState((s) => ({ ...s, vatRate: Math.max(0, Number(e.target.value) || 0) }))
                          }
                          className="w-24 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                        />
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={state.vatInclusive}
                          onChange={(e) => setState((s) => ({ ...s, vatInclusive: e.target.checked }))}
                        />
                        Amount includes VAT
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Preview list */}
              {previewEntries.length ? (
                <div className="rounded-2xl border border-zinc-800 overflow-hidden">
                  <div className="bg-zinc-950/40 px-4 py-3 text-sm font-medium text-zinc-100">Preview</div>
                  {previewEntries.map((e) => (
                    <div key={e.id} className="border-t border-zinc-800 p-4">
                      <div className="text-sm text-zinc-100 font-medium">{e.dateISO} • {e.currency}</div>
                      <div className="mt-1 text-xs text-zinc-400">{e.memo}</div>

                      <div className="mt-3 grid grid-cols-12 bg-zinc-950/20 px-3 py-2 text-xs text-zinc-400 rounded-xl">
                        <div className="col-span-6">Account</div>
                        <div className="col-span-3 text-right">Debit</div>
                        <div className="col-span-3 text-right">Credit</div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {e.lines.map((ln, idx) => (
                          <div key={idx} className="grid grid-cols-12 px-1 text-sm">
                            <div className="col-span-6 text-zinc-200">{ln.account}</div>
                            <div className="col-span-3 text-right text-zinc-200">{ln.debit ? money(ln.debit) : "—"}</div>
                            <div className="col-span-3 text-right text-zinc-200">{ln.credit ? money(ln.credit) : "—"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* SAVED */}
      {tab === "saved" ? (
        <Card className="mt-6">
          <CardHeader
            title="Saved Journal Entries"
            subtitle="These are your persisted entries. Impact tab uses these + scheduled entries for the selected month."
          />
          <CardContent>
            <div className="flex flex-col gap-4">
              {savedEntriesForMonth.length === 0 ? (
                <div className="text-sm text-zinc-400">
                  No saved entries in <span className="text-zinc-200">{periodMonth}</span>.
                  Create some in Compose, or capitalize an asset in Schedules.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {savedEntriesForMonth.map((e) => (
                    <div key={e.id} className="rounded-2xl border border-zinc-800 overflow-hidden">
                      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-950/40 px-4 py-3">
                        <div>
                          <div className="text-sm text-zinc-100 font-medium">
                            {e.dateISO} • {e.currency}
                          </div>
                          <div className="mt-1 text-xs text-zinc-400">{e.memo}</div>
                          <div className="mt-1 text-[11px] text-zinc-500">
                            Entity: {entities.find((x) => x.id === e.entityId)?.name ?? e.entityId}
                          </div>
                        </div>
                        <button
                          onClick={() => setSavedEntries((prev) => prev.filter((x) => x.id !== e.id))}
                          className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="grid grid-cols-12 bg-zinc-950/20 px-4 py-2 text-xs text-zinc-400">
                        <div className="col-span-6">Account</div>
                        <div className="col-span-3 text-right">Debit</div>
                        <div className="col-span-3 text-right">Credit</div>
                      </div>

                      {e.lines.map((l, idx) => (
                        <div key={idx} className="grid grid-cols-12 border-t border-zinc-800 px-4 py-2 text-sm">
                          <div className="col-span-6 text-zinc-100">{l.account}</div>
                          <div className="col-span-3 text-right text-zinc-200">{l.debit ? money(l.debit) : "—"}</div>
                          <div className="col-span-3 text-right text-zinc-200">{l.credit ? money(l.credit) : "—"}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* SCHEDULES */}
      {tab === "schedules" ? (
        <Card className="mt-6">
          <CardHeader
            title="Assets & Loans (Schedules)"
            subtitle="Add assets (depreciation) and loans (interest + principal). Scheduled entries auto-flow into Impact."
          />
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Assets */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">Assets</div>
                    <div className="text-xs text-zinc-400">Monthly straight-line depreciation.</div>
                  </div>
                  <button
                    onClick={addAsset}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                  >
                    + Add
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {assets.filter((a) => a.entityId === activeEntityId).length === 0 ? (
                    <div className="text-sm text-zinc-400">No assets for this entity.</div>
                  ) : (
                    assets
                      .filter((a) => a.entityId === activeEntityId)
                      .map((a) => (
                        <div key={a.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="w-full">
                              <input
                                value={a.name}
                                onChange={(e) =>
                                  setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))
                                }
                                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                              />
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <input
                                  value={a.acquisitionDateISO}
                                  onChange={(e) =>
                                    setAssets((prev) =>
                                      prev.map((x) => (x.id === a.id ? { ...x, acquisitionDateISO: e.target.value } : x))
                                    )
                                  }
                                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                                  placeholder="YYYY-MM-DD"
                                />
                                <input
                                  inputMode="decimal"
                                  value={a.cost}
                                  onChange={(e) =>
                                    setAssets((prev) =>
                                      prev.map((x) => (x.id === a.id ? { ...x, cost: Number(e.target.value) || 0 } : x))
                                    )
                                  }
                                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                                  placeholder="Cost"
                                />
                                <input
                                  inputMode="numeric"
                                  value={a.usefulLifeMonths}
                                  onChange={(e) =>
                                    setAssets((prev) =>
                                      prev.map((x) =>
                                        x.id === a.id ? { ...x, usefulLifeMonths: Math.max(1, Number(e.target.value) || 1) } : x
                                      )
                                    )
                                  }
                                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                                  placeholder="Life (months)"
                                />
                                <button
                                  onClick={() => capitalizeAssetToJournal(a)}
                                  className="rounded-xl border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/40"
                                >
                                  Capitalize (create journal)
                                </button>
                              </div>
                            </div>

                            <button
                              onClick={() => setAssets((prev) => prev.filter((x) => x.id !== a.id))}
                              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-700"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                            <input
                              value={a.assetAccount}
                              onChange={(e) =>
                                setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, assetAccount: e.target.value } : x)))
                              }
                              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                              placeholder="Asset account"
                            />
                            <input
                              value={a.accumulatedDepAccount}
                              onChange={(e) =>
                                setAssets((prev) =>
                                  prev.map((x) => (x.id === a.id ? { ...x, accumulatedDepAccount: e.target.value } : x))
                                )
                              }
                              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                              placeholder="Accumulated dep."
                            />
                            <input
                              value={a.depreciationExpenseAccount}
                              onChange={(e) =>
                                setAssets((prev) =>
                                  prev.map((x) => (x.id === a.id ? { ...x, depreciationExpenseAccount: e.target.value } : x))
                                )
                              }
                              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                              placeholder="Depreciation expense"
                            />
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Loans */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">Loans</div>
                    <div className="text-xs text-zinc-400">Interest-only + straight-line principal payment.</div>
                  </div>
                  <button
                    onClick={addLoan}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                  >
                    + Add
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {loans.filter((l) => l.entityId === activeEntityId).length === 0 ? (
                    <div className="text-sm text-zinc-400">No loans for this entity.</div>
                  ) : (
                    loans
                      .filter((l) => l.entityId === activeEntityId)
                      .map((l) => (
                        <div key={l.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="w-full">
                              <input
                                value={l.name}
                                onChange={(e) =>
                                  setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))
                                }
                                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                              />
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <input
                                  value={l.startDateISO}
                                  onChange={(e) =>
                                    setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, startDateISO: e.target.value } : x)))
                                  }
                                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                                  placeholder="YYYY-MM-DD"
                                />
                                <input
                                  inputMode="decimal"
                                  value={l.principal}
                                  onChange={(e) =>
                                    setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, principal: Number(e.target.value) || 0 } : x)))
                                  }
                                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                                  placeholder="Principal"
                                />
                                <input
                                  inputMode="decimal"
                                  value={l.annualInterestRate}
                                  onChange={(e) =>
                                    setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, annualInterestRate: Number(e.target.value) || 0 } : x)))
                                  }
                                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                                  placeholder="Annual rate (0.12)"
                                />
                                <input
                                  inputMode="numeric"
                                  value={l.termMonths}
                                  onChange={(e) =>
                                    setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, termMonths: Math.max(1, Number(e.target.value) || 1) } : x)))
                                  }
                                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                                  placeholder="Term months"
                                />
                              </div>
                            </div>

                            <button
                              onClick={() => setLoans((prev) => prev.filter((x) => x.id !== l.id))}
                              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-700"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                            <input
                              value={l.loanPayableAccount}
                              onChange={(e) =>
                                setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, loanPayableAccount: e.target.value } : x)))
                              }
                              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                              placeholder="Loan payable"
                            />
                            <input
                              value={l.interestExpenseAccount}
                              onChange={(e) =>
                                setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, interestExpenseAccount: e.target.value } : x)))
                              }
                              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                              placeholder="Interest expense"
                            />
                            <input
                              value={l.cashAccount}
                              onChange={(e) =>
                                setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, cashAccount: e.target.value } : x)))
                              }
                              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                              placeholder="Cash account"
                            />
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
              <div className="text-sm font-medium text-zinc-100">Scheduled entries preview (selected month)</div>
              <div className="mt-1 text-xs text-zinc-400">
                These entries are generated automatically into Impact. They are not “saved entries” unless you decide to materialize them later.
              </div>

              <div className="mt-3 space-y-3">
                {scheduledEntriesForMonth.filter((e) => e.entityId === activeEntityId).length === 0 ? (
                  <div className="text-sm text-zinc-400">No scheduled entries for this entity in {periodMonth}.</div>
                ) : (
                  scheduledEntriesForMonth
                    .filter((e) => e.entityId === activeEntityId)
                    .map((e) => (
                      <div key={e.id} className="rounded-2xl border border-zinc-800 overflow-hidden">
                        <div className="border-b border-zinc-800 bg-zinc-950/40 px-4 py-3">
                          <div className="text-sm text-zinc-100 font-medium">{e.dateISO} • Scheduled</div>
                          <div className="mt-1 text-xs text-zinc-400">{e.memo}</div>
                        </div>
                        {e.lines.map((ln, idx) => (
                          <div key={idx} className="grid grid-cols-12 border-t border-zinc-800 px-4 py-2 text-sm">
                            <div className="col-span-6 text-zinc-100">{ln.account}</div>
                            <div className="col-span-3 text-right text-zinc-200">{ln.debit ? money(ln.debit) : "—"}</div>
                            <div className="col-span-3 text-right text-zinc-200">{ln.credit ? money(ln.credit) : "—"}</div>
                          </div>
                        ))}
                      </div>
                    ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* IMPACT */}
      {tab === "impact" ? (
        <Card className="mt-6">
          <CardHeader
            title="Impact (Selected Month)"
            subtitle="This is the computed closing balances as-of end of month using: Saved entries + auto-generated depreciation + loan schedules."
          />
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <BalanceGrid title={`Entity Closing Balances (${activeEntity?.name ?? activeEntityId})`} balances={impact} />

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
                <div className="text-sm font-medium text-zinc-100">What’s included</div>
                <div className="mt-2 text-xs text-zinc-400">
                  Month: <span className="text-zinc-200">{periodMonth}</span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-zinc-400">
                  <div>
                    Saved entries in month: <span className="text-zinc-200">{savedEntriesForMonth.length}</span>
                  </div>
                  <div>
                    Scheduled entries in month:{" "}
                    <span className="text-zinc-200">
                      {scheduledEntriesForMonth.filter((e) => e.entityId === activeEntityId).length}
                    </span>
                  </div>
                  <div>
                    Total considered (this entity):{" "}
                    <span className="text-zinc-200">
                      {monthEntriesAll.filter((e) => e.entityId === activeEntityId).length}
                    </span>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="text-xs text-zinc-400">
                    If you want a true Balance Sheet grouping (Assets/Liabilities/Equity) next, we’ll add account “types”.
                    For now, this shows the raw closing balances that your schedules affect automatically.
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
              <div className="text-sm font-medium text-zinc-100">Entries used (this month)</div>
              <div className="mt-2 space-y-2">
                {monthEntriesAll
                  .filter((e) => e.entityId === activeEntityId)
                  .map((e) => (
                    <div key={e.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-zinc-100 font-medium">
                            {e.dateISO} • {e.source === "scheduled" ? "Scheduled" : "Saved"}
                          </div>
                          <div className="mt-1 text-xs text-zinc-400">{e.memo}</div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-12 text-xs text-zinc-400">
                        <div className="col-span-6">Account</div>
                        <div className="col-span-3 text-right">Dr</div>
                        <div className="col-span-3 text-right">Cr</div>
                      </div>
                      <div className="mt-1 space-y-1">
                        {e.lines.map((ln, idx) => (
                          <div key={idx} className="grid grid-cols-12 text-sm">
                            <div className="col-span-6 text-zinc-200">{ln.account}</div>
                            <div className="col-span-3 text-right text-zinc-200">{ln.debit ? money(ln.debit) : "—"}</div>
                            <div className="col-span-3 text-right text-zinc-200">{ln.credit ? money(ln.credit) : "—"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}