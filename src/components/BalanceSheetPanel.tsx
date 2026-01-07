// src/components/BalanceSheetPanel.tsx
"use client";

import React, { useMemo } from "react";
import type { Account, JournalEntry } from "@/lib/types";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { computeBalances, formatBalance } from "@/lib/journalEngine";

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BalanceSheetPanel({
  title,
  subtitle,
  accounts,
  entries,
  period,
}: {
  title: string;
  subtitle: string;
  accounts: Account[];
  entries: JournalEntry[];
  period: string; // YYYY-MM
}) {
  const periodEntries = useMemo(
    () => entries.filter((e) => (e.dateISO ?? "").startsWith(period)),
    [entries, period]
  );

  const { closing } = useMemo(
    () => computeBalances(accounts, periodEntries),
    [accounts, periodEntries]
  );

  const rows = Object.entries(closing).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <Card className="mt-6">
      <CardHeader title={title} subtitle={subtitle} />
      <CardContent>
        <div className="rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="flex items-center justify-between bg-zinc-950/40 px-4 py-3">
            <div className="text-sm font-medium text-zinc-100">Closing balances • {period}</div>
            <div className="text-xs text-zinc-400">{periodEntries.length} entries in period</div>
          </div>

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
      </CardContent>
    </Card>
  );
}