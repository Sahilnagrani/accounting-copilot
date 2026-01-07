// src/components/CopilotComposer.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Account, ActionKind, ComposerState, Currency, Entity, JournalEntry } from "@/lib/types";
import { Card, CardContent, CardHeader } from "./ui/Card";

import EntitiesPanel from "./EntitiesPanel";
import AccountsPanel from "./AccountsPanel";
import EntryPreview from "./EntryPreview";
import ConsolidationPreview from "./ConsolidationPreview";
import SavedLedgerPanel from "./SavedLedgerPanel";
import BalanceSheetPanel from "./BalanceSheetPanel";

import { generateEntriesFromText, computeBalances, formatBalance } from "@/lib/journalEngine";
import {
  generateScheduledEntriesForPeriod,
  type AssetSchedule,
  type LiabilitySchedule,
} from "@/lib/schedulesEngine";

/** -----------------------
 * LocalStorage keys
 * ---------------------- */
const LS = {
  entities: "ac.entities.v1",
  accountsByEntity: "ac.accountsByEntity.v1",
  journalEntries: "ac.journalEntries.v1",
  activeEntityId: "ac.activeEntityId.v1",
  composerState: "ac.composerState.v1",

  // NEW: schedules storage (simple MVP)
  assetSchedules: "ac.schedules.assets.v1", // AssetSchedule[]
  liabilitySchedules: "ac.schedules.liabilities.v1", // LiabilitySchedule[]
  selectedPeriod: "ac.selectedPeriod.v1", // YYYY-MM
};

function safeJSONParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

const currencies: Currency[] = ["AED", "USD", "EUR"];

function yyyyMMNow() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

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

function defaultChart(): Account[] {
  return [
    { id: makeId(), name: "Cash", normalSide: "debit", openingBalance: 0 },
    { id: makeId(), name: "Accounts Receivable", normalSide: "debit", openingBalance: 0 },
    { id: makeId(), name: "Accounts Payable", normalSide: "credit", openingBalance: 0 },
    { id: makeId(), name: "Loan Receivable", normalSide: "debit", openingBalance: 0 },
    { id: makeId(), name: "Loan Payable", normalSide: "credit", openingBalance: 0 },
    { id: makeId(), name: "Revenue", normalSide: "credit", openingBalance: 0 },
    { id: makeId(), name: "Purchases / Expense", normalSide: "debit", openingBalance: 0 },
    { id: makeId(), name: "Input VAT", normalSide: "debit", openingBalance: 0 },
    { id: makeId(), name: "Output VAT", normalSide: "credit", openingBalance: 0 },

    // Schedules defaults (so balances look nice immediately)
    { id: makeId(), name: "Depreciation Expense", normalSide: "debit", openingBalance: 0 },
    { id: makeId(), name: "Accumulated Depreciation", normalSide: "credit", openingBalance: 0 },
    { id: makeId(), name: "Interest Expense", normalSide: "debit", openingBalance: 0 },

    // Intercompany defaults
    { id: makeId(), name: "Intercompany Receivable", normalSide: "debit", openingBalance: 0 },
    { id: makeId(), name: "Intercompany Payable", normalSide: "credit", openingBalance: 0 },
    { id: makeId(), name: "Intercompany Loan Receivable", normalSide: "debit", openingBalance: 0 },
    { id: makeId(), name: "Intercompany Loan Payable", normalSide: "credit", openingBalance: 0 },
  ];
}

/** -----------------------
 * Quick Actions (simple)
 * ---------------------- */
function QuickActions({
  visible,
  onPick,
}: {
  visible: boolean;
  onPick: (k: ActionKind) => void;
}) {
  if (!visible) return null;

  const items: { k: ActionKind; label: string; hint: string }[] = [
    { k: "spend", label: "Spend", hint: "spent 120 aed on office supplies" },
    { k: "buy", label: "Buy", hint: "bought printer for 600 aed" },
    { k: "sell", label: "Sell", hint: "sold consulting for 2000 aed" },
    { k: "lend", label: "Lend", hint: "lent 500 aed to friend" },
    { k: "borrow", label: "Borrow", hint: "borrowed 10000 aed from bank" },
  ];

  return (
    <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/30 p-3">
      <div className="text-xs text-zinc-400">Quick actions</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((x) => (
          <button
            key={x.k}
            onClick={() => onPick(x.k)}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left text-xs text-zinc-200 hover:border-zinc-700"
            title={x.hint}
          >
            <div className="text-zinc-100">{x.label}</div>
            <div className="mt-0.5 text-[11px] text-zinc-500 group-hover:text-zinc-400">{x.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function BalanceMini({
  title,
  balances,
}: {
  title: string;
  balances: Record<string, number>;
}) {
  const rows = Object.entries(balances)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 8);

  return (
    <div className="rounded-2xl border border-zinc-800 overflow-hidden">
      <div className="bg-zinc-950/40 px-4 py-3 text-sm font-medium text-zinc-100">{title}</div>
      <div className="grid grid-cols-12 bg-zinc-950/20 px-4 py-2 text-xs text-zinc-400">
        <div className="col-span-7">Account</div>
        <div className="col-span-5 text-right">Balance</div>
      </div>
      {rows.length === 0 ? (
        <div className="border-t border-zinc-800 px-4 py-3 text-sm text-zinc-500">No balances.</div>
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
      <div className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">Showing top 8</div>
    </div>
  );
}

export default function CopilotComposer() {
  /** -----------------------
   * Core state
   * ---------------------- */
  const [entities, setEntities] = useState<Entity[]>(() => {
    const saved = safeJSONParse<Entity[]>(typeof window !== "undefined" ? localStorage.getItem(LS.entities) : null);
    if (saved && saved.length) return saved;
    return [defaultEntity("Main Entity")];
  });

  const [activeEntityId, setActiveEntityId] = useState<string>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS.activeEntityId) : null;
    return saved ?? "";
  });

  const [accountsByEntity, setAccountsByEntity] = useState<Record<string, Account[]>>(() => {
    const saved = safeJSONParse<Record<string, Account[]>>(
      typeof window !== "undefined" ? localStorage.getItem(LS.accountsByEntity) : null
    );
    return saved ?? {};
  });

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    const saved = safeJSONParse<JournalEntry[]>(
      typeof window !== "undefined" ? localStorage.getItem(LS.journalEntries) : null
    );
    return saved ?? [];
  });

  // NEW: schedules (MVP storage)
  const [assetSchedules, setAssetSchedules] = useState<AssetSchedule[]>(() => {
    const saved = safeJSONParse<AssetSchedule[]>(
      typeof window !== "undefined" ? localStorage.getItem(LS.assetSchedules) : null
    );
    return saved ?? [];
  });

  const [liabilitySchedules, setLiabilitySchedules] = useState<LiabilitySchedule[]>(() => {
    const saved = safeJSONParse<LiabilitySchedule[]>(
      typeof window !== "undefined" ? localStorage.getItem(LS.liabilitySchedules) : null
    );
    return saved ?? [];
  });

  // NEW: selected month filter
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS.selectedPeriod) : null;
    return saved ?? yyyyMMNow();
  });

  const [state, setState] = useState<ComposerState>(() => {
    const saved = safeJSONParse<ComposerState>(
      typeof window !== "undefined" ? localStorage.getItem(LS.composerState) : null
    );
    return (
      saved ?? {
        text: "",
        currency: "AED",
        vatEnabled: true,
        vatRate: 0.05,
        vatInclusive: false,
        useARAP: false,
        entityId: "",
        businessUnitId: undefined,
      }
    );
  });

  const [tab, setTab] = useState<"copilot" | "entities" | "consolidation" | "ledger" | "balanceSheet">(
    "copilot"
  );

  const [generatedEntries, setGeneratedEntries] = useState<JournalEntry[]>([]);
  const [lastEventsCount, setLastEventsCount] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** -----------------------
   * Ensure active entity
   * ---------------------- */
  useEffect(() => {
    if (!entities.length) return;

    if (!activeEntityId) {
      setActiveEntityId(entities[0].id);
      setState((s) => ({ ...s, entityId: entities[0].id }));
      return;
    }

    const stillExists = entities.some((e) => e.id === activeEntityId);
    if (!stillExists) {
      const fallback = entities[0].id;
      setActiveEntityId(fallback);
      setState((s) => ({ ...s, entityId: fallback }));
    }
  }, [entities, activeEntityId]);

  /** -----------------------
   * Ensure chart exists per entity
   * ---------------------- */
  useEffect(() => {
    if (!entities.length) return;

    setAccountsByEntity((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const e of entities) {
        if (!next[e.id] || next[e.id].length === 0) {
          next[e.id] = defaultChart();
          changed = true;
        }
      }

      for (const k of Object.keys(next)) {
        if (!entities.some((e) => e.id === k)) {
          delete next[k];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [entities]);

  /** -----------------------
   * Persist
   * ---------------------- */
  useEffect(() => localStorage.setItem(LS.entities, JSON.stringify(entities)), [entities]);
  useEffect(() => {
    if (activeEntityId) localStorage.setItem(LS.activeEntityId, activeEntityId);
  }, [activeEntityId]);
  useEffect(() => localStorage.setItem(LS.accountsByEntity, JSON.stringify(accountsByEntity)), [accountsByEntity]);
  useEffect(() => localStorage.setItem(LS.journalEntries, JSON.stringify(journalEntries)), [journalEntries]);
  useEffect(() => localStorage.setItem(LS.composerState, JSON.stringify(state)), [state]);

  // NEW: persist schedules + period
  useEffect(() => localStorage.setItem(LS.assetSchedules, JSON.stringify(assetSchedules)), [assetSchedules]);
  useEffect(() => localStorage.setItem(LS.liabilitySchedules, JSON.stringify(liabilitySchedules)), [liabilitySchedules]);
  useEffect(() => localStorage.setItem(LS.selectedPeriod, selectedPeriod), [selectedPeriod]);

  /** -----------------------
   * Derived
   * ---------------------- */
  const activeEntity = useMemo(
    () => entities.find((e) => e.id === activeEntityId) ?? null,
    [entities, activeEntityId]
  );

  const activeAccounts = useMemo(
    () => accountsByEntity[activeEntityId] ?? [],
    [accountsByEntity, activeEntityId]
  );

  const allowedAccountNames = useMemo(() => activeAccounts.map((a) => a.name), [activeAccounts]);

  const savedForActiveEntity = useMemo(
    () => journalEntries.filter((e) => e.entityId === activeEntityId),
    [journalEntries, activeEntityId]
  );

  // ✅ NEW: Scheduled entries for selectedPeriod, auto-added to impact tabs
  const scheduledForPeriod = useMemo(() => {
    return generateScheduledEntriesForPeriod({
      period: selectedPeriod,
      entityId: activeEntityId,
      savedEntries: journalEntries, // dedupe against all saved
      schedules: { assets: assetSchedules, liabilities: liabilitySchedules },
    });
  }, [selectedPeriod, activeEntityId, journalEntries, assetSchedules, liabilitySchedules]);

  // ✅ NEW: month-filtered entries including schedules (no double count)
  const effectiveEntriesForPeriod = useMemo(() => {
    const savedInPeriod = savedForActiveEntity.filter((e) => (e.dateISO ?? "").startsWith(selectedPeriod));
    // scheduledForPeriod is already deduped vs saved using markers
    return [...savedInPeriod, ...scheduledForPeriod];
  }, [savedForActiveEntity, scheduledForPeriod, selectedPeriod]);

  // ✅ NEW: impact uses selected month + schedules
  const impactForPeriod = useMemo(() => {
    const { opening, closing } = computeBalances(activeAccounts, effectiveEntriesForPeriod);
    return { opening, closing };
  }, [activeAccounts, effectiveEntriesForPeriod]);

  /** -----------------------
   * Helpers: satisfy TS for AccountsPanel
   * ---------------------- */
  const setAccountsForActiveEntity: React.Dispatch<React.SetStateAction<Account[]>> = (value) => {
    setAccountsByEntity((prev) => {
      const current = prev[activeEntityId] ?? [];
      const nextAccounts = typeof value === "function" ? value(current) : value;
      return { ...prev, [activeEntityId]: nextAccounts };
    });
  };

  /** -----------------------
   * Actions
   * ---------------------- */
  function applyActionTemplate(k: ActionKind) {
    const templates: Record<ActionKind, string> = {
      spend: "spent 120 aed on office supplies",
      buy: "bought a laptop for 3500 aed",
      sell: "sold consulting for 2000 aed",
      lend: "lent 500 aed to friend",
      borrow: "borrowed 10000 aed from bank",
    };

    const t = templates[k];
    setState((s) => ({ ...s, text: s.text.trim() ? `${s.text.trim()}\n${t}` : t }));
    setTab("copilot");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function generatePreview() {
    const text = state.text.trim();
    if (!text) {
      setGeneratedEntries([]);
      setLastEventsCount(0);
      return;
    }

    const { events, entries } = generateEntriesFromText(
      text,
      {
        currency: state.currency,
        vatEnabled: state.vatEnabled,
        vatRate: state.vatRate,
        vatInclusive: state.vatInclusive,
        useARAP: state.useARAP,
      },
      { allowedAccounts: allowedAccountNames }
    );

    const patched = entries.map((e) => ({
      ...e,
      entityId: activeEntityId,
      businessUnitId: state.businessUnitId,
    }));

    setGeneratedEntries(patched);
    setLastEventsCount(events.length);
  }

  function saveGeneratedToLedger() {
    if (!generatedEntries.length) return;
    setJournalEntries((prev) => [...prev, ...generatedEntries]);
    setGeneratedEntries([]);
    setState((s) => ({ ...s, text: "" }));
  }

  /** -----------------------
   * UI
   * ---------------------- */
  return (
    <div className="space-y-6">
      {/* Top nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["copilot", "Copilot"],
              ["entities", "Entities"],
              ["balanceSheet", "Balance Sheet"],
              ["consolidation", "Consolidation"],
              ["ledger", "Ledger"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={[
                "rounded-xl border px-3 py-2 text-xs",
                tab === k
                  ? "border-emerald-700 bg-emerald-900/25 text-emerald-200"
                  : "border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:border-zinc-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">Active:</span>
          <select
            value={activeEntityId}
            onChange={(e) => {
              const id = e.target.value;
              setActiveEntityId(id);
              setState((s) => ({ ...s, entityId: id, businessUnitId: undefined }));
            }}
            className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-700"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          <span className="ml-2 text-xs text-zinc-500">Month:</span>
          <input
            type="month"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-700"
          />
        </div>
      </div>

      {/* Period impact summary (includes schedules automatically) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="md:col-span-7">
          <BalanceMini title={`Impact (saved + schedules) • ${selectedPeriod}`} balances={impactForPeriod.closing} />
        </div>
        <div className="md:col-span-5">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
            <div className="text-sm font-medium text-zinc-100">Auto schedule entries (this month)</div>
            <div className="mt-1 text-xs text-zinc-500">
              Depreciation + loan schedules are injected into impact & balance sheet views automatically.
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Generated</span>
              <span className="text-zinc-200">{scheduledForPeriod.length}</span>
            </div>

            <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/30">
              {scheduledForPeriod.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-500">No schedule entries for this month.</div>
              ) : (
                scheduledForPeriod.map((e) => (
                  <div key={e.id} className="border-t border-zinc-800 px-3 py-2 text-xs">
                    <div className="text-zinc-200">{e.memo}</div>
                    <div className="mt-0.5 text-zinc-500">{e.dateISO}</div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 text-[11px] text-zinc-500">
              Tip: these are <span className="text-zinc-300">not saved</span> unless you explicitly add a “save schedules” flow later.
              They’re only for reporting/impact right now.
            </div>
          </div>
        </div>
      </div>

      {tab === "copilot" ? (
        <>
          <Card>
            <CardHeader title="Accounting Copilot" subtitle="Type naturally, then generate journal entries for the active entity." />
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-8">
                  <label className="text-xs text-zinc-400">Command</label>
                  <textarea
                    ref={textareaRef}
                    value={state.text}
                    onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
                    className="mt-2 min-h-35 w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-700"
                    placeholder={`Examples:
- spent 120 aed on marketing
- bought printer for 600 aed
- sold services for 2000 aed
- borrowed 10000 aed from bank`}
                  />

                  <QuickActions visible={true} onPick={applyActionTemplate} />

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      onClick={generatePreview}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                    >
                      Generate Entries
                    </button>

                    <button
                      disabled={!generatedEntries.length}
                      onClick={saveGeneratedToLedger}
                      className={[
                        "rounded-xl border px-4 py-2 text-xs",
                        generatedEntries.length
                          ? "border-emerald-700 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/40"
                          : "border-zinc-800 bg-zinc-950/20 text-zinc-500",
                      ].join(" ")}
                    >
                      Save to Ledger
                    </button>

                    <button
                      onClick={() => {
                        setGeneratedEntries([]);
                        setLastEventsCount(0);
                      }}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-4 py-2 text-xs text-zinc-300 hover:border-zinc-700"
                    >
                      Clear Preview
                    </button>

                    <div className="ml-auto text-xs text-zinc-500">
                      Parsed events: <span className="text-zinc-300">{lastEventsCount}</span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-4 space-y-4">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
                    <div className="text-sm font-medium text-zinc-100">Defaults</div>

                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <div>
                        <label className="text-xs text-zinc-400">Currency</label>
                        <select
                          value={state.currency}
                          onChange={(e) => setState((s) => ({ ...s, currency: e.target.value as Currency }))}
                          className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                        >
                          {currencies.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-zinc-200">
                        <input type="checkbox" checked={state.vatEnabled} onChange={(e) => setState((s) => ({ ...s, vatEnabled: e.target.checked }))} />
                        VAT enabled
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-zinc-400">VAT rate</label>
                          <input
                            inputMode="decimal"
                            value={state.vatRate}
                            onChange={(e) => setState((s) => ({ ...s, vatRate: Number(e.target.value) || 0 }))}
                            className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                          />
                        </div>

                        <label className="mt-6 flex items-center gap-2 text-sm text-zinc-200">
                          <input type="checkbox" checked={state.vatInclusive} onChange={(e) => setState((s) => ({ ...s, vatInclusive: e.target.checked }))} />
                          Inclusive
                        </label>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-zinc-200">
                        <input type="checkbox" checked={state.useARAP} onChange={(e) => setState((s) => ({ ...s, useARAP: e.target.checked }))} />
                        Use A/R + A/P (instead of Cash)
                      </label>

                      <div>
                        <label className="text-xs text-zinc-400">Business Unit (optional)</label>
                        <select
                          value={state.businessUnitId ?? ""}
                          onChange={(e) => setState((s) => ({ ...s, businessUnitId: e.target.value || undefined }))}
                          className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                        >
                          <option value="">(none)</option>
                          {(activeEntity?.businessUnits ?? []).map((bu) => (
                            <option key={bu.id} value={bu.id}>
                              {bu.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* This is now month-based + schedules (shown above), so keep this area clean */}
                </div>
              </div>
            </CardContent>
          </Card>

          <AccountsPanel accounts={activeAccounts} setAccounts={setAccountsForActiveEntity} />

          <EntryPreview accounts={activeAccounts} entries={generatedEntries} onChangeEntries={setGeneratedEntries} />
        </>
      ) : null}

      {tab === "entities" ? (
        <>
          <EntitiesPanel
            entities={entities}
            setEntities={setEntities}
            activeEntityId={activeEntityId}
            setActiveEntityId={(id) => {
              setActiveEntityId(id);
              setState((s) => ({ ...s, entityId: id, businessUnitId: undefined }));
            }}
          />
          <AccountsPanel accounts={activeAccounts} setAccounts={setAccountsForActiveEntity} />
        </>
      ) : null}

      {tab === "balanceSheet" ? (
        <>
          <BalanceSheetPanel
            title="Balance Sheet"
            subtitle="This view automatically includes saved entries + schedule entries (depreciation + loan schedules) for the selected month."
            accounts={activeAccounts}
            entries={effectiveEntriesForPeriod}
            period={selectedPeriod}
          />
        </>
      ) : null}

      {tab === "consolidation" ? (
        <>
          <ConsolidationPreview entities={entities} accountsByEntity={accountsByEntity} entries={journalEntries} />
        </>
      ) : null}

      {tab === "ledger" ? (
        <>
          <SavedLedgerPanel
            entities={entities}
            activeEntityId={activeEntityId}
            setActiveEntityId={(id) => {
              setActiveEntityId(id);
              setState((s) => ({ ...s, entityId: id, businessUnitId: undefined }));
            }}
            accountsByEntity={accountsByEntity}
            journalEntries={journalEntries}
            setJournalEntries={setJournalEntries}
          />
        </>
      ) : null}
    </div>
  );
}