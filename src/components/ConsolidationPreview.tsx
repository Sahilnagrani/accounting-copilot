"use client";

import React, { useMemo, useState } from "react";
import type { Account, Entity, JournalEntry } from "@/lib/types";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { consolidateGroup, prettyBalance } from "@/lib/consolidationEngine";

export default function ConsolidationPreview({
  entities,
  accountsByEntity,
  entries,
}: {
  entities: Entity[];
  accountsByEntity: Record<string, Account[]>;
  entries: JournalEntry[];
}) {
  const [groupEntityId, setGroupEntityId] = useState<string>(entities[0]?.id ?? "");

  const result = useMemo(() => {
    if (!groupEntityId) return null;
    return consolidateGroup({ entities, accountsByEntity, entries, groupEntityId });
  }, [entities, accountsByEntity, entries, groupEntityId]);

  if (!entities.length) return null;

  return (
    <Card className="mt-6">
      <CardHeader title="Consolidation" subtitle="Auto-rollup across entities + intercompany eliminations (v1)." />
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">Group entity (parent)</div>
          <select
            value={groupEntityId}
            onChange={(e) => setGroupEntityId(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        {result ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
              <div className="text-sm text-zinc-100 font-medium">Included entities</div>
              <div className="mt-1 text-xs text-zinc-400">
                {result.includedEntityIds.length} included
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.includedEntityIds.map((id) => {
                  const e = entities.find((x) => x.id === id);
                  return (
                    <span key={id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-1 text-xs text-zinc-200">
                      {e?.name ?? id}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="bg-zinc-950/40 px-4 py-3 text-sm font-medium text-zinc-100">Consolidated Closing Balances</div>
              <div className="grid grid-cols-12 bg-zinc-950/20 px-4 py-2 text-xs text-zinc-400">
                <div className="col-span-7">Account</div>
                <div className="col-span-5 text-right">Balance</div>
              </div>
              {Object.entries(result.consolidatedClosing)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([acc, bal]) => (
                  <div key={acc} className="grid grid-cols-12 border-t border-zinc-800 px-4 py-2 text-sm">
                    <div className="col-span-7 text-zinc-100">{acc}</div>
                    <div className="col-span-5 text-right text-zinc-200">{prettyBalance(bal)}</div>
                  </div>
                ))}
            </div>

            {result.eliminationsApplied.length ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
                <div className="text-sm text-zinc-100 font-medium">Eliminations applied</div>
                <div className="mt-3 space-y-2">
                  {result.eliminationsApplied.map((x, i) => (
                    <div key={i} className="text-xs text-zinc-300">
                      <span className="text-zinc-100">{x.note}</span> • {x.account} • {x.amount.toFixed(2)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 text-sm text-zinc-400">Pick a group entity to consolidate.</div>
        )}
      </CardContent>
    </Card>
  );
}