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

import { generateEntriesFromText } from "@/lib/journalEngine";
import { computeBalances, formatBalance } from "@/lib/journalEngine";

/** -----------------------
 * LocalStorage keys
 * ---------------------- */
const LS = {
  entities: "ac.entities.v1",
  accountsByEntity: "ac.accountsByEntity.v1",
  journalEntries: "ac.journalEntries.v1",
  activeEntityId: "ac.activeEntityId.v1",
  composerState: "ac.composerState.v1",
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

    // Intercompany defaults (for eliminations demo)
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
    { k: "spend", label: "Spend", hint: "e.g. spent 120 aed on office supplies" },
    { k: "buy", label: "Buy", hint: "e.g. bought printer for 600 aed" },
    { k: "sell", label: "Sell", hint: "e.g. sold consulting for 2000 aed" },
    { k: "lend", label: "Lend", hint: "e.g. lent 500 aed to friend" },
    { k: "borrow", label: "Borrow", hint: "e.g. borrowed 1000 aed from bank" },
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
            <div className="mt-0.5 text-[11px] text-zinc-500 group-hover:text-zinc-400">
              {x.hint}
            </div>
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
      <div className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
        Showing top 8 (for quick glance)
      </div>
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

  const [tab, setTab] = useState<"copilot" | "entities" | "consolidation" | "ledger">("copilot");

  const [generatedEntries, setGeneratedEntries] = useState<JournalEntry[]>([]);
  const [lastEventsCount, setLastEventsCount] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** -----------------------
   * Ensure active entity
   * ---------------------- */
  useEffect(() => {
    if (!entities.length) return;

    // If no active entity yet, pick first (no ESLint "setState in effect" issue if we guard properly)
    if (!activeEntityId) {
      setActiveEntityId(entities[0].id);
      setState((s) => ({ ...s, entityId: entities[0].id }));
      return;
    }

    // If active entity was deleted, snap to first
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
      // prune removed entities
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
  useEffect(() => {
    localStorage.setItem(LS.entities, JSON.stringify(entities));
  }, [entities]);

  useEffect(() => {
    if (activeEntityId) localStorage.setItem(LS.activeEntityId, activeEntityId);
  }, [activeEntityId]);

  useEffect(() => {
    localStorage.setItem(LS.accountsByEntity, JSON.stringify(accountsByEntity));
  }, [accountsByEntity]);

  useEffect(() => {
    localStorage.setItem(LS.journalEntries, JSON.stringify(journalEntries));
  }, [journalEntries]);

  useEffect(() => {
    localStorage.setItem(LS.composerState, JSON.stringify(state));
  }, [state]);

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

  const allowedAccountNames = useMemo(
    () => activeAccounts.map((a) => a.name),
    [activeAccounts]
  );

  const savedForActiveEntity = useMemo(
    () => journalEntries.filter((e) => e.entityId === activeEntityId),
    [journalEntries, activeEntityId]
  );

  const quickImpact = useMemo(() => {
    const { opening, closing } = computeBalances(activeAccounts, savedForActiveEntity);
    return { opening, closing };
  }, [activeAccounts, savedForActiveEntity]);

  /** -----------------------
   * Helpers to satisfy TS types
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
    setState((s) => ({
      ...s,
      text: s.text.trim() ? `${s.text.trim()}\n${t}` : t,
    }));
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

        {/* active entity chip */}
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {tab === "copilot" ? (
        <>
          <Card>
            <CardHeader
              title="Accounting Copilot"
              subtitle="Type naturally, then generate journal entries for the active entity."
            />
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-8">
                  <label className="text-xs text-zinc-400">Command</label>
                  <textarea
                    ref={textareaRef}
                    value={state.text}
                    onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
                    placeholder={`Examples:
- spent 120 aed on marketing
- bought printer for 600 aed
- sold services for 2000 aed
- borrowed 10000 aed from bank`}
                    className="mt-2 min-h-35 w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-700"
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
                        <input
                          type="checkbox"
                          checked={state.vatEnabled}
                          onChange={(e) => setState((s) => ({ ...s, vatEnabled: e.target.checked }))}
                        />
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
                          <input
                            type="checkbox"
                            checked={state.vatInclusive}
                            onChange={(e) => setState((s) => ({ ...s, vatInclusive: e.target.checked }))}
                          />
                          Inclusive
                        </label>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-zinc-200">
                        <input
                          type="checkbox"
                          checked={state.useARAP}
                          onChange={(e) => setState((s) => ({ ...s, useARAP: e.target.checked }))}
                        />
                        Use A/R + A/P (instead of Cash)
                      </label>

                      <div>
                        <label className="text-xs text-zinc-400">Business Unit (optional)</label>
                        <select
                          value={state.businessUnitId ?? ""}
                          onChange={(e) =>
                            setState((s) => ({ ...s, businessUnitId: e.target.value || undefined }))
                          }
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

                  <BalanceMini title="Saved Impact (All-time, active entity)" balances={quickImpact.closing} />
                </div>
              </div>
            </CardContent>
          </Card>

          <AccountsPanel accounts={activeAccounts} setAccounts={setAccountsForActiveEntity} />

          <EntryPreview
            accounts={activeAccounts}
            entries={generatedEntries}
            onChangeEntries={setGeneratedEntries}
          />
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

      {tab === "consolidation" ? (
        <>
          <ConsolidationPreview
            entities={entities}
            accountsByEntity={accountsByEntity}
            entries={journalEntries}
          />
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