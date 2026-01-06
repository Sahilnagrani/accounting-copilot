"use client";

import React, { useMemo, useState } from "react";
import type { Currency, Entity, BusinessUnit, ConsolidationMethod } from "@/lib/types";
import { Card, CardContent, CardHeader } from "./ui/Card";

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

function Wizard({
  open,
  entity,
  onClose,
  onSave,
}: {
  open: boolean;
  entity: Entity | null;
  onClose: () => void;
  onSave: (e: Entity) => void;
}) {
  const [draft, setDraft] = useState<Entity | null>(entity);

  React.useEffect(() => setDraft(entity), [entity]);
  if (!open || !draft) return null;

  const methodOptions: ConsolidationMethod[] = ["full", "equity", "none"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <div className="text-sm font-medium text-zinc-100">Entity rules</div>
            <div className="mt-1 text-xs text-zinc-400">
              These rules affect consolidation & treatment.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-zinc-400">Ownership %</label>
              <input
                inputMode="numeric"
                value={draft.policy.ownershipPct}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    policy: {
                      ...draft.policy,
                      ownershipPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    },
                  })
                }
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Typical: &gt;50% full, 20–50% equity.
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Consolidation method</label>
              <select
                value={draft.policy.method}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    policy: { ...draft.policy, method: e.target.value as ConsolidationMethod },
                  })
                }
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              >
                {methodOptions.map((m) => (
                  <option key={m} value={m}>
                    {m === "full" ? "Full consolidation" : m === "equity" ? "Equity method" : "Exclude"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Functional currency</label>
              <select
                value={draft.policy.functionalCurrency}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    policy: { ...draft.policy, functionalCurrency: e.target.value as Currency },
                  })
                }
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Intercompany eliminations</label>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.policy.intercompany.enabled}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      policy: {
                        ...draft.policy,
                        intercompany: { ...draft.policy.intercompany, enabled: e.target.checked },
                      },
                    })
                  }
                />
                Enable eliminations
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-xs text-zinc-400">Intercompany account mapping</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {(
                [
                  ["arAccount", "Intercompany Receivable"],
                  ["apAccount", "Intercompany Payable"],
                  ["loanRecAccount", "Intercompany Loan Receivable"],
                  ["loanPayAccount", "Intercompany Loan Payable"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-zinc-500">{label}</label>
                  <input
                    value={draft.policy.intercompany[key]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        policy: {
                          ...draft.policy,
                          intercompany: { ...draft.policy.intercompany, [key]: e.target.value },
                        },
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => onSave(draft)}
              className="rounded-xl border border-emerald-700 bg-emerald-900/30 px-4 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/40"
            >
              Save rules
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EntitiesPanel({
  entities,
  setEntities,
  activeEntityId,
  setActiveEntityId,
}: {
  entities: Entity[];
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>>;
  activeEntityId: string;
  setActiveEntityId: (id: string) => void;
}) {
  const active = useMemo(() => entities.find((e) => e.id === activeEntityId) ?? null, [entities, activeEntityId]);

  const [wizardEntityId, setWizardEntityId] = useState<string | null>(null);
  const wizardEntity = entities.find((e) => e.id === wizardEntityId) ?? null;

  function addEntity() {
    const e = defaultEntity(`Entity ${entities.length + 1}`);
    setEntities((prev) => [...prev, e]);
    setActiveEntityId(e.id);
    setWizardEntityId(e.id); // ask rules immediately
  }

  function updateEntity(id: string, patch: Partial<Entity>) {
    setEntities((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function addBU(entityId: string) {
    setEntities((prev) =>
      prev.map((e) =>
        e.id === entityId
          ? { ...e, businessUnits: [...e.businessUnits, { id: makeId(), name: `BU ${e.businessUnits.length + 1}` }] }
          : e
      )
    );
  }

  function updateBU(entityId: string, buId: string, name: string) {
    setEntities((prev) =>
      prev.map((e) =>
        e.id === entityId
          ? { ...e, businessUnits: e.businessUnits.map((b) => (b.id === buId ? { ...b, name } : b)) }
          : e
      )
    );
  }

  function removeBU(entityId: string, buId: string) {
    setEntities((prev) =>
      prev.map((e) =>
        e.id === entityId ? { ...e, businessUnits: e.businessUnits.filter((b) => b.id !== buId) } : e
      )
    );
  }

  return (
    <>
      <Card className="mt-6">
        <CardHeader title="Entities & Business Units" subtitle="Manage operating entities, business units, and consolidation rules." />
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {entities.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setActiveEntityId(e.id)}
                  className={[
                    "rounded-xl border px-3 py-2 text-xs",
                    e.id === activeEntityId
                      ? "border-emerald-700 bg-emerald-900/25 text-emerald-200"
                      : "border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:border-zinc-700",
                  ].join(" ")}
                >
                  {e.name}
                </button>
              ))}
            </div>

            <button
              onClick={addEntity}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
            >
              + Add entity
            </button>
          </div>

          {active ? (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-zinc-400">Entity name</label>
                  <input
                    value={active.name}
                    onChange={(e) => updateEntity(active.id, { name: e.target.value })}
                    className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Base currency</label>
                  <select
                    value={active.baseCurrency}
                    onChange={(e) => updateEntity(active.id, { baseCurrency: e.target.value as Currency })}
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

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-zinc-100 font-medium">Business Units</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setWizardEntityId(active.id)}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                  >
                    Edit rules
                  </button>
                  <button
                    onClick={() => addBU(active.id)}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"
                  >
                    + Add BU
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {active.businessUnits.map((bu) => (
                  <div key={bu.id} className="flex items-center gap-2">
                    <input
                      value={bu.name}
                      onChange={(e) => updateBU(active.id, bu.id, e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                    />
                    <button
                      onClick={() => removeBU(active.id, bu.id)}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-700"
                      title="Remove BU"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Wizard
        open={Boolean(wizardEntityId)}
        entity={wizardEntity}
        onClose={() => setWizardEntityId(null)}
        onSave={(updated) => {
          setEntities((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          setWizardEntityId(null);
        }}
      />
    </>
  );
}