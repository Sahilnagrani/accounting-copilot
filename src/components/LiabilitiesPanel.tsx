"use client";

import React, { useMemo, useState } from "react";
import type { Currency, Entity, Liability } from "@/lib/types";
import { Card, CardContent, CardHeader } from "./ui/Card";

function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

const currencies: Currency[] = ["AED", "USD", "EUR"];

export default function LiabilitiesPanel({
  entities,
  liabilities,
  setLiabilities,
  activeEntityId,
}: {
  entities: Entity[];
  liabilities: Liability[];
  setLiabilities: React.Dispatch<React.SetStateAction<Liability[]>>;
  activeEntityId: string;
}) {
  const [open, setOpen] = useState(false);

  const active = useMemo(() => entities.find((e) => e.id === activeEntityId) ?? null, [entities, activeEntityId]);
  const entityLiabs = useMemo(
    () => liabilities.filter((l) => l.entityId === activeEntityId),
    [liabilities, activeEntityId]
  );

  const [draft, setDraft] = useState<Liability>(() => ({
    id: makeId(),
    entityId: activeEntityId,
    businessUnitId: undefined,
    name: "New Liability",
    startDateISO: new Date().toISOString().slice(0, 10),
    principal: 0,
    annualInterestRate: 0.08,
    termMonths: 24,
    currency: active?.baseCurrency ?? "AED",
    liabilityAccount: "Loan Payable",
    interestExpenseAccount: "Interest Expense",
    cashAccount: "Cash",
  }));

  React.useEffect(() => {
    setDraft((d) => ({
      ...d,
      entityId: activeEntityId,
      currency: active?.baseCurrency ?? d.currency,
    }));
  }, [activeEntityId, active?.baseCurrency]);

  function addLiability() {
    setLiabilities((prev) => [...prev, { ...draft, id: makeId() }]);
    setOpen(false);
  }

  function removeLiability(id: string) {
    setLiabilities((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title="Liabilities"
        subtitle="Add liabilities and auto-generate monthly interest + principal schedules."
      />
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            Entity: <span className="text-zinc-200">{active?.name ?? activeEntityId}</span>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
          >
            + Add liability
          </button>
        </div>

        {entityLiabs.length === 0 ? (
          <div className="mt-4 text-sm text-zinc-400">No liabilities for this entity.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {entityLiabs.map((l) => (
              <div key={l.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{l.name}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      start {l.startDateISO} • principal {l.principal.toFixed(2)} • rate {(l.annualInterestRate * 100).toFixed(2)}% • term {l.termMonths}m
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      Accounts: <span className="text-zinc-300">{l.interestExpenseAccount}</span>,{" "}
                      <span className="text-zinc-300">{l.liabilityAccount}</span>,{" "}
                      <span className="text-zinc-300">{l.cashAccount}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeLiability(l.id)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                  <div className="text-sm font-medium text-zinc-100">Add liability</div>
                  <div className="mt-1 text-xs text-zinc-400">Interest-only + straight-line principal (MVP).</div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                >
                  Close
                </button>
              </div>

              <div className="px-5 py-5 space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-zinc-400">Name</label>
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Start date</label>
                    <input
                      value={draft.startDateISO}
                      onChange={(e) => setDraft((d) => ({ ...d, startDateISO: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Principal</label>
                    <input
                      inputMode="decimal"
                      value={draft.principal}
                      onChange={(e) => setDraft((d) => ({ ...d, principal: Number(e.target.value) || 0 }))}
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Annual interest rate (e.g. 0.08)</label>
                    <input
                      inputMode="decimal"
                      value={draft.annualInterestRate}
                      onChange={(e) => setDraft((d) => ({ ...d, annualInterestRate: Math.max(0, Number(e.target.value) || 0) }))}
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Term (months)</label>
                    <input
                      inputMode="numeric"
                      value={draft.termMonths}
                      onChange={(e) => setDraft((d) => ({ ...d, termMonths: Math.max(1, Number(e.target.value) || 1) }))}
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Currency</label>
                    <select
                      value={draft.currency}
                      onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value as Currency }))}
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                    >
                      {currencies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="text-xs text-zinc-400">Account mapping</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {(
                      [
                        ["liabilityAccount", "Liability (Dr for principal payments)"],
                        ["interestExpenseAccount", "Interest expense (Dr)"],
                        ["cashAccount", "Cash (Cr)"],
                      ] as const
                    ).map(([k, label]) => (
                      <div key={k}>
                        <label className="text-xs text-zinc-500">{label}</label>
                        <input
                          value={draft[k]}
                          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                          className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={addLiability}
                    className="rounded-xl border border-emerald-700 bg-emerald-900/30 px-4 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/40"
                  >
                    Save liability
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
