"use client";

import React, { useMemo, useState } from "react";
import type { Account, Asset, Entity, JournalEntry, Liability } from "@/lib/types";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { computeBalances, formatBalance } from "@/lib/journalEngine";
import { consolidateGroup, prettyBalance } from "@/lib/consolidationEngine";
import { generateScheduledEntriesForPeriod, periodFilter } from "@/lib/schedulesEngine";

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
  const rows = Object.entries(balances).sort((a, b) => a[0].localeCompare(b[0]));

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
        <div className="border-t border-zinc-800 px-4 py-3 text-sm text-zinc-400">No balances.</div>
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

function defaultPeriodYYYYMM() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export default function BalanceSheetPanel({
  entities,
  accountsByEntity,
  journalEntries,
  assets,
  liabilities,
}: {
  entities: Entity[];
  accountsByEntity: Record<string, Account[]>;
  journalEntries: JournalEntry[];
  assets: Asset[];
  liabilities: Liability[];
}) {
  const [period, setPeriod] = useState<string>(defaultPeriodYYYYMM());
  const [groupEntityId, setGroupEntityId] = useState<string>(entities[0]?.id ?? "");

  const scheduledForPeriod = useMemo(() => {
    return generateScheduledEntriesForPeriod({
      periodYYYYMM: period,
      assets,
      liabilities,
    });
  }, [period, assets, liabilities]);

  const entriesForPeriod = useMemo(() => {
    const base = periodFilter(journalEntries, period);
    const sched = scheduledForPeriod;
    return [...base, ...sched];
  }, [journalEntries, period, scheduledForPeriod]);

  const perEntityClosing = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const e of entities) {
      const acc = accountsByEntity[e.id] ?? [];
      const entEntries = entriesForPeriod.filter((x) => x.entityId === e.id);
      const { closing } = computeBalances(acc, entEntries);
      out[e.id] = closing;
    }
    return out;
  }, [entities, accountsByEntity, entriesForPeriod]);

  const consolidated = useMemo(() => {
    if (!groupEntityId) return null;
    return consolidateGroup({
      entities,
      accountsByEntity,
      entries: entriesForPeriod,
      groupEntityId,
    });
  }, [entities, accountsByEntity, entriesForPeriod, groupEntityId]);

  if (!entities.length) return null;

  return (
    <Card className="mt-6">
      <CardHeader
        title="Balance Sheet"
        subtitle="Per-entity + consolidated. Includes scheduled depreciation and liability schedules for the selected month."
      />
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-zinc-400">Period (YYYY-MM)</div>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-32 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
              placeholder="2026-01"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-zinc-400">Group entity</div>
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
        </div>

        {scheduledForPeriod.length ? (
          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
            <div className="text-sm font-medium text-zinc-100">Scheduled entries included</div>
            <div className="mt-1 text-xs text-zinc-400">{scheduledForPeriod.length} auto entries for {period}</div>
            <div className="mt-3 space-y-1">
              {scheduledForPeriod.slice(0, 8).map((e) => (
                <div key={e.id} className="text-xs text-zinc-300">
                  <span className="text-zinc-100">{e.memo}</span> • {e.entityId} • {e.dateISO}
                </div>
              ))}
              {scheduledForPeriod.length > 8 ? (
                <div className="text-xs text-zinc-500">+ {scheduledForPeriod.length - 8} more…</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-zinc-500">No scheduled entries for this period.</div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6">
          {entities.map((e) => (
            <div key={e.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">{e.name}</div>
                <div className="text-xs text-zinc-500">Entity balance • {period}</div>
              </div>
              <BalanceTable
                title="Closing Balances"
                balances={perEntityClosing[e.id] ?? {}}
                currencyLabel={e.baseCurrency}
              />
            </div>
          ))}
        </div>

        {consolidated ? (
          <div className="mt-6 rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="bg-zinc-950/40 px-4 py-3 text-sm font-medium text-zinc-100">
              Consolidated Closing Balances • {period}
            </div>
            <div className="grid grid-cols-12 bg-zinc-950/20 px-4 py-2 text-xs text-zinc-400">
              <div className="col-span-7">Account</div>
              <div className="col-span-5 text-right">Balance</div>
            </div>
            {Object.entries(consolidated.consolidatedClosing)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([acc, bal]) => (
                <div key={acc} className="grid grid-cols-12 border-t border-zinc-800 px-4 py-2 text-sm">
                  <div className="col-span-7 text-zinc-100">{acc}</div>
                  <div className="col-span-5 text-right text-zinc-200">{prettyBalance(bal)}</div>
                </div>
              ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
