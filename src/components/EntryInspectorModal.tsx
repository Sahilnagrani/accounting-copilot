"use client";

import React, { useMemo, useState } from "react";
import type { Account, JournalEntry, JournalLine } from "@/lib/types";
import { sumDebits, sumCredits } from "@/lib/journalEngine";

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function lineRowKey(l: JournalLine, i: number) {
  return `${i}-${l.account}-${l.debit}-${l.credit}`;
}

export default function EntryInspectorModal({
  open,
  entry,
  accounts,
  onClose,
  onDelete,
  onSave,
}: {
  open: boolean;
  entry: JournalEntry | null;
  accounts: Account[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onSave: (updated: JournalEntry) => void;
}) {
  const [draft, setDraft] = useState<JournalEntry | null>(entry);

  React.useEffect(() => setDraft(entry), [entry]);

  const accountNames = useMemo(() => accounts.map((a) => a.name), [accounts]);

  if (!open || !draft) return null;

  const td = sumDebits(draft.lines);
  const tc = sumCredits(draft.lines);
  const balanced = Math.abs(td - tc) <= 0.01;

  function updateLine(idx: number, patch: Partial<JournalLine>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextLines = prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
      return { ...prev, lines: nextLines };
    });
  }

  function addLine() {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: [...prev.lines, { account: accountNames[0] ?? "Cash", debit: 0, credit: 0 }],
      };
    });
  }

  function removeLine(idx: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, lines: prev.lines.filter((_, i) => i !== idx) };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div>
            <div className="text-sm font-medium text-zinc-100">Entry Inspector</div>
            <div className="mt-1 text-xs text-zinc-400">
              {draft.dateISO} • {draft.currency} • entity: {draft.entityId}
              {draft.businessUnitId ? ` • bu: ${draft.businessUnitId}` : ""}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(draft.id)}
              className="rounded-xl border border-rose-800 bg-rose-950/30 px-3 py-2 text-xs text-rose-200 hover:border-rose-700"
            >
              Delete
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-zinc-400">Date</label>
              <input
                value={draft.dateISO}
                onChange={(e) => setDraft({ ...draft, dateISO: e.target.value })}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400">Currency</label>
              <input
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value as any })}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400">Entity Id</label>
              <input
                value={draft.entityId}
                onChange={(e) => setDraft({ ...draft, entityId: e.target.value })}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400">Memo</label>
            <input
              value={draft.memo}
              onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
            />
          </div>

          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between bg-zinc-950/40 px-4 py-3">
              <div className="text-sm font-medium text-zinc-100">Lines</div>
              <button
                onClick={addLine}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
              >
                + Add line
              </button>
            </div>

            <div className="grid grid-cols-12 bg-zinc-950/20 px-4 py-2 text-xs text-zinc-400">
              <div className="col-span-6">Account</div>
              <div className="col-span-3 text-right">Debit</div>
              <div className="col-span-3 text-right">Credit</div>
            </div>

            {draft.lines.map((l, idx) => (
              <div key={lineRowKey(l, idx)} className="grid grid-cols-12 items-center border-t border-zinc-800 px-4 py-2">
                <div className="col-span-6">
                  <select
                    value={l.account}
                    onChange={(e) => updateLine(idx, { account: e.target.value })}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                  >
                    {accountNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                    {/* allow custom */}
                    {!accountNames.includes(l.account) ? <option value={l.account}>{l.account}</option> : null}
                  </select>
                </div>

                <div className="col-span-3">
                  <input
                    inputMode="decimal"
                    value={l.debit || 0}
                    onChange={(e) => updateLine(idx, { debit: Number(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-right text-sm outline-none focus:border-zinc-700"
                  />
                </div>

                <div className="col-span-3 flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={l.credit || 0}
                    onChange={(e) => updateLine(idx, { credit: Number(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-right text-sm outline-none focus:border-zinc-700"
                  />
                  <button
                    onClick={() => removeLine(idx)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-700"
                    title="Remove line"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-xs text-zinc-400">
              Totals: <span className="text-zinc-200">{money(td)}</span> Dr •{" "}
              <span className="text-zinc-200">{money(tc)}</span> Cr •{" "}
              <span className={balanced ? "text-emerald-200" : "text-rose-200"}>
                {balanced ? "Balanced" : "NOT balanced"}
              </span>
            </div>

            <button
              onClick={() => onSave(draft)}
              disabled={!balanced}
              className={[
                "rounded-xl border px-4 py-2 text-xs font-medium",
                balanced
                  ? "border-emerald-700 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/40"
                  : "border-zinc-800 bg-zinc-950/20 text-zinc-500",
              ].join(" ")}
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}