"use client";

import React, { useMemo, useState } from "react";
import type { Account, Entity, JournalEntry } from "@/lib/types";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { computeBalances, formatBalance } from "@/lib/journalEngine";
import EntryInspectorModal from "./EntryInspectorModal";

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthKeyToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function BalanceTable({
  title,
  balances,
}: {
  title: string;
  balances: Record<string, number>;
}) {
  const rows = Object.entries(balances).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
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
    </div>
  );
}

export default function SavedLedgerPanel({
  entities,
  activeEntityId,
  setActiveEntityId,
  accountsByEntity,
  journalEntries,
  setJournalEntries,
}: {
  entities: Entity[];
  activeEntityId: string;
  setActiveEntityId: (id: string) => void;
  accountsByEntity: Record<string, Account[]>;
  journalEntries: JournalEntry[];
  setJournalEntries: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
}) {
  const [periodYYYYMM, setPeriodYYYYMM] = useState<string>(monthKeyToday());
  const [query, setQuery] = useState("");
  const [inspectingId, setInspectingId] = useState<string | null>(null);

  const activeAccounts = accountsByEntity[activeEntityId] ?? [];

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return journalEntries
      .filter((e) => e.entityId === activeEntityId)
      .filter((e) => e.dateISO.slice(0, 7) === periodYYYYMM)
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.memo} ${e.dateISO} ${e.currency}`.toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  }, [journalEntries, activeEntityId, periodYYYYMM, query]);

  const inspectingEntry = useMemo(
    () => journalEntries.find((e) => e.id === inspectingId) ?? null,
    [journalEntries, inspectingId]
  );

  const impact = useMemo(() => {
    // impact of selected period within active entity
    const { opening, closing } = computeBalances(activeAccounts, filteredEntries);
    return { opening, closing };
  }, [activeAccounts, filteredEntries]);

  return (
    <>
      <Card className="mt-6">
        <CardHeader
          title="Saved Ledger (Inspectable)"
          subtitle="Filter by entity + month, inspect entries, and see the calculated balance impact."
        />
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="text-xs text-zinc-400">Entity</label>
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
            </div>

            <div>
              <label className="text-xs text-zinc-400">Period (YYYY-MM)</label>
              <input
                value={periodYYYYMM}
                onChange={(e) => setPeriodYYYYMM(e.target.value)}
                placeholder="2026-01"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400">Search</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="memo / date / currency"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="grid grid-cols-12 bg-zinc-950/20 px-4 py-2 text-xs text-zinc-400">
              <div className="col-span-2">Date</div>
              <div className="col-span-7">Memo</div>
              <div className="col-span-2">Currency</div>
              <div className="col-span-1 text-right">View</div>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="border-t border-zinc-800 px-4 py-3 text-sm text-zinc-500">
                No entries for this entity + period.
              </div>
            ) : (
              filteredEntries.map((e) => (
                <div key={e.id} className="grid grid-cols-12 items-center border-t border-zinc-800 px-4 py-2">
                  <div className="col-span-2 text-sm text-zinc-200">{e.dateISO}</div>
                  <div className="col-span-7">
                    <div className="text-sm text-zinc-100 line-clamp-1">{e.memo}</div>
                    <div className="text-xs text-zinc-500">{e.lines.length} lines</div>
                  </div>
                  <div className="col-span-2 text-sm text-zinc-200">{e.currency}</div>
                  <div className="col-span-1 text-right">
                    <button
                      onClick={() => setInspectingId(e.id)}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <BalanceTable title={`Impact • Opening (${periodYYYYMM})`} balances={impact.opening} />
            <BalanceTable title={`Impact • Closing (${periodYYYYMM})`} balances={impact.closing} />
          </div>

          <div className="mt-4 text-xs text-zinc-500">
            Note: This impact is calculated from the filtered saved entries only (entity + period). If you want “all-time”
            balance sheet, use your Balance Sheet tab (we can wire it to include schedules too).
          </div>
        </CardContent>
      </Card>

      <EntryInspectorModal
        open={Boolean(inspectingId)}
        entry={inspectingEntry}
        accounts={activeAccounts}
        onClose={() => setInspectingId(null)}
        onDelete={(id) => {
          setJournalEntries((prev) => prev.filter((x) => x.id !== id));
          setInspectingId(null);
        }}
        onSave={(updated) => {
          setJournalEntries((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          setInspectingId(null);
        }}
      />
    </>
  );
}