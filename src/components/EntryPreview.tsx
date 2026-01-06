"use client";

import React, { useMemo, useState } from "react";
import type { Account, JournalEntry } from "@/lib/types";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { computeBalances, formatBalance } from "@/lib/journalEngine";
import EntryEditorModal from "./EntryEditorModal";

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function BalanceTable({
  title,
  balances,
  currencyLabel,
}: {
  title: string;
  balances: Record<string, number>;
  currencyLabel: string;
}) {
  const rows = Object.entries(balances)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
      <div className="flex items-center justify-between bg-zinc-950/40 px-4 py-3">
        <div className="text-sm font-medium text-zinc-100">{title}</div>
        <div className="text-xs text-zinc-400">{currencyLabel}</div>
      </div>

      <div className="grid grid-cols-12 bg-zinc-950/20 px-4 py-2 text-xs text-zinc-400">
        <div className="col-span-7">Account</div>
        <div className="col-span-5 text-right">Balance</div>
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-zinc-800 px-4 py-3 text-sm text-zinc-400">
          No balances.
        </div>
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

export default function EntryPreview({
  accounts,
  entries,
  onChangeEntries,
}: {
  accounts: Account[];
  entries: JournalEntry[];
  onChangeEntries: (next: JournalEntry[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingEntry = useMemo(
    () => entries.find((e) => e.id === editingId) ?? null,
    [entries, editingId]
  );

  const currencyLabel = entries[0]?.currency ?? "—";

  const { opening, closing } = useMemo(() => computeBalances(accounts, entries), [accounts, entries]);

  return (
    <>
      <Card className="mt-6">
        <CardHeader
          title="Journal Entries (Preview)"
          subtitle={entries.length ? `${entries.length} generated` : "Generate entries to see preview."}
        />
        <CardContent>
          <div className="flex flex-col gap-4">
            <BalanceTable title="Opening Balances" balances={opening} currencyLabel={currencyLabel} />

            {entries.length === 0 ? (
              <div className="text-sm text-zinc-400">
                Nothing generated yet. Click <span className="text-zinc-300">Generate Entries</span>.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {entries.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-zinc-800 overflow-hidden">
                    <div className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-950/40 px-4 py-3">
                      <div>
                        <div className="text-sm text-zinc-100 font-medium">
                          {entry.dateISO} • {entry.currency}
                        </div>
                        <div className="mt-1 text-xs text-zinc-400">{entry.memo}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditingId(entry.id)}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                      >
                        Edit
                      </button>
                    </div>

                    <div className="grid grid-cols-12 bg-zinc-950/20 px-4 py-2 text-xs text-zinc-400">
                      <div className="col-span-6">Account</div>
                      <div className="col-span-3 text-right">Debit</div>
                      <div className="col-span-3 text-right">Credit</div>
                    </div>

                    {entry.lines.map((l, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 border-t border-zinc-800 px-4 py-2 text-sm"
                      >
                        <div className="col-span-6 text-zinc-100">{l.account}</div>
                        <div className="col-span-3 text-right text-zinc-200">
                          {l.debit ? money(l.debit) : "—"}
                        </div>
                        <div className="col-span-3 text-right text-zinc-200">
                          {l.credit ? money(l.credit) : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <BalanceTable title="Closing Balances" balances={closing} currencyLabel={currencyLabel} />
          </div>
        </CardContent>
      </Card>

      <EntryEditorModal
        open={Boolean(editingId)}
        entry={editingEntry}
        accounts={accounts}
        onCancel={() => setEditingId(null)}
        onSave={(updated) => {
          onChangeEntries(entries.map((e) => (e.id === updated.id ? updated : e)));
          setEditingId(null);
        }}
      />
    </>
  );
}