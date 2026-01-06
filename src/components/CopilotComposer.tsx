"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "./ui/Card";
import type { Account, Asset, ComposerState, Entity, JournalEntry, Liability } from "@/lib/types";
import { generateEntriesFromText } from "@/lib/journalEngine";
import EntryPreview from "./EntryPreview";
import AccountsPanel from "./AccountsPanel";
import EntitiesPanel from "./EntitiesPanel";
import ConsolidationPreview from "./ConsolidationPreview";
import BalanceSheetPanel from "./BalanceSheetPanel";
import AssetsPanel from "./AssetsPanel";
import LiabilitiesPanel from "./LiabilitiesPanel";
import { loadState, saveState, type PersistedState } from "@/lib/storage";

function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

const DEFAULT_ENTITY_ID = "entity-default";

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

  // Schedule-friendly defaults
  { id: makeId(), name: "Equipment", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Accumulated Depreciation", normalSide: "credit", openingBalance: 0 },
  { id: makeId(), name: "Depreciation Expense", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Interest Expense", normalSide: "debit", openingBalance: 0 },
];

function defaultEntity(): Entity {
  const eid = DEFAULT_ENTITY_ID;
  return {
    id: eid,
    name: "Main Entity",
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

type TabKey = "journal" | "entities" | "balance" | "consolidation" | "schedules";

export default function CopilotComposer() {
  const persisted = useMemo(() => loadState(), []);

  const [entities, setEntities] = useState<Entity[]>(() => persisted?.entities ?? [defaultEntity()]);
  const [activeEntityId, setActiveEntityId] = useState<string>(() => {
    const fallback = (persisted?.entities?.[0]?.id ?? entities[0]?.id ?? DEFAULT_ENTITY_ID) as string;
    return persisted?.activeEntityId ?? fallback;
  });

  const [accountsByEntity, setAccountsByEntity] = useState<Record<string, Account[]>>(() => {
    if (persisted?.accountsByEntity) return persisted.accountsByEntity;
    return { [DEFAULT_ENTITY_ID]: defaultAccounts };
  });

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => persisted?.journalEntries ?? []);
  const [assets, setAssets] = useState<Asset[]>(() => persisted?.assets ?? []);
  const [liabilities, setLiabilities] = useState<Liability[]>(() => persisted?.liabilities ?? []);

  const [tab, setTab] = useState<TabKey>("journal");

  const [state, setState] = useState<ComposerState>({
    text: "",
    currency: "AED",
    vatEnabled: true,
    vatRate: 0.05,
    vatInclusive: true,
    useARAP: false,
    entityId: activeEntityId,
    businessUnitId: undefined,
  });

  const [eventsCount, setEventsCount] = useState(0);
  const [previewEntries, setPreviewEntries] = useState<JournalEntry[]>([]);
  const [lastSavedCount, setLastSavedCount] = useState<number | null>(null);

  // Persist whenever important state changes
  React.useEffect(() => {
    const snapshot: PersistedState = {
      entities,
      activeEntityId,
      accountsByEntity,
      journalEntries,
      assets,
      liabilities,
    };
    saveState(snapshot);
  }, [entities, activeEntityId, accountsByEntity, journalEntries, assets, liabilities]);

  // Keep composer state in sync with active entity
  React.useEffect(() => {
    setState((s) => ({ ...s, entityId: activeEntityId }));
  }, [activeEntityId]);

  const activeEntity = useMemo(
    () => entities.find((e) => e.id === activeEntityId) ?? null,
    [entities, activeEntityId]
  );

  const accounts = useMemo(() => {
    return accountsByEntity[activeEntityId] ?? defaultAccounts;
  }, [accountsByEntity, activeEntityId]);

  const allowedAccountNames = useMemo(() => accounts.map((a) => a.name), [accounts]);

  const needsVATControls = useMemo(() => {
    return /\b(buy|bought|purchase|purchased|sell|sold)\b/i.test(state.text);
  }, [state.text]);

  /**
   * FIX: AccountsPanel expects Dispatch<SetStateAction<Account[]>>
   * So we provide a dispatch-like function that accepts:
   * - next array
   * - updater function (prev => next)
   */
  const setAccountsDispatch = React.useCallback<React.Dispatch<React.SetStateAction<Account[]>>>(
    (value) => {
      setAccountsByEntity((prev) => {
        const current = prev[activeEntityId] ?? defaultAccounts;
        const next = typeof value === "function" ? (value as (p: Account[]) => Account[])(current) : value;
        return { ...prev, [activeEntityId]: next };
      });
    },
    [activeEntityId]
  );

  function generate() {
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
        allowedAccounts: allowedAccountNames,
        entityId: state.entityId,
        businessUnitId: state.businessUnitId,
      }
    );

    setEventsCount(res.events.length);
    setPreviewEntries(res.entries);
    setLastSavedCount(null);
  }

  function savePreviewToLedger() {
    if (!previewEntries.length) return;

    setJournalEntries((prev) => [...prev, ...previewEntries]);
    setLastSavedCount(previewEntries.length);
    setPreviewEntries([]);
  }

  const accountsMapAllEntities = useMemo(() => {
    const out: Record<string, Account[]> = { ...accountsByEntity };
    for (const e of entities) {
      if (!out[e.id]) out[e.id] = defaultAccounts;
    }
    return out;
  }, [accountsByEntity, entities]);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["journal", "Journal"],
            ["entities", "Entities"],
            ["schedules", "Assets & Liabilities"],
            ["balance", "Balance Sheet"],
            ["consolidation", "Consolidation"],
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

      {tab === "journal" ? (
        <>
          <Card>
            <CardHeader
              title="Describe what happened"
              subtitle="Write naturally. Generate preview entries, then save them into the ledger."
            />
            <CardContent>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-2 block text-xs text-zinc-400">Prompt</label>
                  <textarea
                    value={state.text}
                    onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
                    className="min-h-35 w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-100 outline-none focus:border-zinc-700"
                    placeholder={`Examples:
On 25/12/25 I borrowed 1000. Then I lent 500 on 26/12/25.
I spent 300 cash on marketing.
I bought 300 AED worth of goods.`}
                  />
                  <div className="mt-2 text-xs text-zinc-400">
                    Tip: If you want a category, end with:{" "}
                    <span className="text-zinc-300">on Purchases / Expense</span> (must exist in chart).
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="text-xs text-zinc-400">Entity</div>
                    <div className="mt-2 text-sm text-zinc-100">{activeEntity?.name ?? activeEntityId}</div>
                    <div className="mt-2 text-xs text-zinc-500">Entries will be stamped to this entity.</div>
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
                    <div className="text-xs text-zinc-400">Generation</div>
                    <div className="mt-2 text-sm text-zinc-100">Detected events: {eventsCount}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      Preview entries: <span className="text-zinc-300">{previewEntries.length}</span>
                    </div>

                    <button
                      type="button"
                      onClick={generate}
                      className="mt-3 w-full rounded-xl border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/40"
                    >
                      Generate Preview
                    </button>

                    <button
                      type="button"
                      onClick={savePreviewToLedger}
                      disabled={!previewEntries.length}
                      className={[
                        "mt-2 w-full rounded-xl border px-3 py-2 text-xs font-medium",
                        previewEntries.length
                          ? "border-sky-700 bg-sky-900/30 text-sky-200 hover:bg-sky-900/40"
                          : "border-zinc-800 bg-zinc-950/20 text-zinc-500",
                      ].join(" ")}
                    >
                      Save to Ledger
                    </button>

                    {lastSavedCount !== null ? (
                      <div className="mt-2 text-xs text-zinc-400">
                        Saved <span className="text-zinc-200">{lastSavedCount}</span> entries to localStorage.
                      </div>
                    ) : null}
                  </div>
                </div>

                {needsVATControls ? (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-zinc-400">VAT (for buy/sell)</div>
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
                              setState((s) => ({
                                ...s,
                                vatRate: Math.max(0, Number(e.target.value) || 0),
                              }))
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
              </div>
            </CardContent>
          </Card>

          <AccountsPanel accounts={accounts} setAccounts={setAccountsDispatch} />

          <EntryPreview accounts={accounts} entries={previewEntries} onChangeEntries={setPreviewEntries} />

          <div className="mt-6">
            <Card>
              <CardHeader
                title="Saved Ledger (All Entities)"
                subtitle="These are persisted to localStorage and used for Balance Sheet + Consolidation."
              />
              <CardContent>
                <div className="text-xs text-zinc-400">
                  Total saved entries: <span className="text-zinc-200">{journalEntries.length}</span>
                </div>

                {journalEntries.length ? (
                  <div className="mt-4 space-y-2">
                    {journalEntries
                      .slice()
                      .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
                      .slice(0, 12)
                      .map((e) => (
                        <div key={e.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-zinc-100 font-medium">
                                {e.dateISO} • {e.currency}
                              </div>
                              <div className="mt-1 text-xs text-zinc-400">{e.memo}</div>
                              <div className="mt-2 text-xs text-zinc-500">
                                entity: <span className="text-zinc-300">{e.entityId}</span>
                              </div>
                            </div>
                            <div className="text-xs text-zinc-500">{e.lines.length} lines</div>
                          </div>
                        </div>
                      ))}
                    {journalEntries.length > 12 ? <div className="text-xs text-zinc-500">Showing latest 12…</div> : null}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-zinc-500">No saved entries yet.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {tab === "entities" ? (
        <EntitiesPanel
          entities={entities}
          setEntities={setEntities}
          activeEntityId={activeEntityId}
          setActiveEntityId={(id) => {
            setActiveEntityId(id);
            setState((s) => ({ ...s, entityId: id }));
          }}
        />
      ) : null}

      {tab === "schedules" ? (
        <>
          <AssetsPanel entities={entities} assets={assets} setAssets={setAssets} activeEntityId={activeEntityId} />
          <LiabilitiesPanel
            entities={entities}
            liabilities={liabilities}
            setLiabilities={setLiabilities}
            activeEntityId={activeEntityId}
          />
        </>
      ) : null}

      {tab === "balance" ? (
        <BalanceSheetPanel
          entities={entities}
          accountsByEntity={accountsMapAllEntities}
          journalEntries={journalEntries}
          assets={assets}
          liabilities={liabilities}
        />
      ) : null}

      {tab === "consolidation" ? (
        <ConsolidationPreview entities={entities} accountsByEntity={accountsMapAllEntities} entries={journalEntries} />
      ) : null}
    </>
  );
}
