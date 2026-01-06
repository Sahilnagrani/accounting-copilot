"use client";

import React, { useMemo, useState } from "react";
import type { Account, JournalEntry, JournalLine, Currency } from "@/lib/types";
import { isBalancedEntry, sumCredits, sumDebits } from "@/lib/journalEngine";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function cleanNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? round2(n) : 0;
}

function emptyLine(accountName?: string): JournalLine {
  return { account: accountName ?? "Cash", debit: 0, credit: 0 };
}

export default function EntryEditorModal({
  open,
  entry,
  accounts,
  onCancel,
  onSave,
}: {
  open: boolean;
  entry: JournalEntry | null;
  accounts: Account[];
  onCancel: () => void;
  onSave: (updated: JournalEntry) => void;
}) {
  const [draft, setDraft] = useState<JournalEntry | null>(entry);

  React.useEffect(() => {
    setDraft(entry);
  }, [entry]);

  const totals = useMemo(() => {
    if (!draft) return { d: 0, c: 0, ok: false };
    const d = sumDebits(draft.lines);
    const c = sumCredits(draft.lines);
    return { d, c, ok: Math.abs(d - c) <= 0.01 };
  }, [draft]);

  if (!open || !draft) return null;

  const currencyOptions: Currency[] = ["AED", "USD", "EUR"];

  function setLine(idx: number, patch: Partial<JournalLine>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const lines = prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
      return { ...prev, lines };
    });
  }

  function addLine() {
    setDraft((prev) => {
      if (!prev) return prev;
      const defaultAccount = accounts[0]?.name ?? "Cash";
      return { ...prev, lines: [...prev.lines, emptyLine(defaultAccount)] };
    });
  }

  function removeLine(idx: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const lines = prev.lines.filter((_, i) => i !== idx);
      return { ...prev, lines: lines.length ? lines : [emptyLine(accounts[0]?.name)] };
    });
  }

  const saveDisabled = !isBalancedEntry(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <div className="text-sm font-medium text-zinc-100">Edit Journal Entry</div>
            <div className="mt-1 text-xs text-zinc-400">
              Must be balanced to save. Debits {totals.d.toFixed(2)} / Credits {totals.c.toFixed(2)}
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-zinc-400">Date (YYYY-MM-DD)</label>
              <input
                value={draft.dateISO}
                onChange={(e) => setDraft({ ...draft, dateISO: e.target.value })}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400">Currency</label>
              <select
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value as Currency })}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              >
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Memo</label>
              <input
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
            <div className="grid grid-cols-12 bg-zinc-950/40 px-4 py-2 text-xs text-zinc-400">
              <div className="col-span-6">Account</div>
              <div className="col-span-3 text-right">Debit</div>
              <div className="col-span-3 text-right">Credit</div>
            </div>

            {draft.lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center border-t border-zinc-800 px-4 py-2">
                <div className="col-span-6 flex items-center gap-2">
                  <select
                    value={l.account}
                    onChange={(e) => setLine(idx, { account: e.target.value })}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                    {/* allow unknown accounts already in entry */}
                    {!accounts.some((a) => a.name === l.account) ? (
                      <option value={l.account}>{l.account}</option>
                    ) : null}
                  </select>

                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-2 py-2 text-xs text-zinc-300 hover:border-zinc-700"
                    title="Remove line"
                  >
                    ✕
                  </button>
                </div>

                <div className="col-span-3">
                  <input
                    inputMode="decimal"
                    value={l.debit ? l.debit : ""}
                    onChange={(e) => {
                      const v = cleanNum(e.target.value);
                      // enforce single-sided line: typing debit clears credit
                      setLine(idx, { debit: v, credit: v > 0 ? 0 : l.credit });
                    }}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-right text-sm outline-none focus:border-zinc-700"
                    placeholder="0.00"
                  />
                </div>

                <div className="col-span-3">
                  <input
                    inputMode="decimal"
                    value={l.credit ? l.credit : ""}
                    onChange={(e) => {
                      const v = cleanNum(e.target.value);
                      setLine(idx, { credit: v, debit: v > 0 ? 0 : l.debit });
                    }}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-right text-sm outline-none focus:border-zinc-700"
                    placeholder="0.00"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={addLine}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900"
            >
              + Add line
            </button>

            <div className="flex items-center gap-3">
              {!totals.ok ? (
                <div className="text-xs text-amber-300">
                  Not balanced: {Math.abs(totals.d - totals.c).toFixed(2)}
                </div>
              ) : (
                <div className="text-xs text-emerald-300">Balanced</div>
              )}

              <button
                type="button"
                disabled={saveDisabled}
                onClick={() => onSave(draft)}
                className={[
                  "rounded-xl px-4 py-2 text-xs font-medium",
                  saveDisabled
                    ? "cursor-not-allowed border border-zinc-800 bg-zinc-900/30 text-zinc-500"
                    : "border border-emerald-700 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/40",
                ].join(" ")}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}