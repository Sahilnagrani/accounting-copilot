"use client";

import React, { useMemo } from "react";
import type { Asset, Loan, Currency } from "@/lib/types";
import {
  buildSchedulesForPeriod,
  generateScheduledEntriesForPeriod,
  type AssetSchedule,
  type LoanSchedule,
  scheduleMarker,
} from "@/lib/schedulesEngine";

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SchedulesPanel(props: {
  periodMonth: string; // YYYY-MM
  currency: Currency;
  assets: Asset[];
  loans: Loan[];
}) {
  const { periodMonth, currency, assets, loans } = props;

  const { assetSchedules, loanSchedules } = useMemo(() => {
    return buildSchedulesForPeriod({ periodMonth, currency, assets, loans });
  }, [periodMonth, currency, assets, loans]);

  const scheduledEntries = useMemo(() => {
    return generateScheduledEntriesForPeriod({ periodMonth, currency, assets, loans });
  }, [periodMonth, currency, assets, loans]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="text-sm font-medium text-zinc-100">Schedules Preview</div>
        <div className="mt-1 text-xs text-zinc-400">
          Month: <span className="text-zinc-200">{periodMonth}</span> • Marker:{" "}
          <span className="text-zinc-200">{scheduleMarker}</span>
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          These are auto-generated entries for the selected month (they flow into Impact automatically).
        </div>
      </div>

      {/* Assets */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="text-sm font-medium text-zinc-100">Assets (Depreciation)</div>
        {assetSchedules.length === 0 ? (
          <div className="mt-2 text-sm text-zinc-400">No depreciation entries for this month.</div>
        ) : (
          <div className="mt-3 space-y-3">
            {assetSchedules.map((s: AssetSchedule) => (
              <div key={`${s.assetId}-${s.periodMonth}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-zinc-100 font-medium">{s.assetName}</div>
                    <div className="text-xs text-zinc-400">{s.line.memo}</div>
                  </div>
                  <div className="text-sm text-zinc-200">{money(s.monthlyDepreciation)}</div>
                </div>

                <div className="mt-2 grid grid-cols-12 text-xs text-zinc-400">
                  <div className="col-span-6">Account</div>
                  <div className="col-span-3 text-right">Dr</div>
                  <div className="col-span-3 text-right">Cr</div>
                </div>
                <div className="mt-1 space-y-1">
                  {s.line.lines.map((ln, idx) => (
                    <div key={idx} className="grid grid-cols-12 text-sm">
                      <div className="col-span-6 text-zinc-200">{ln.account}</div>
                      <div className="col-span-3 text-right text-zinc-200">{ln.debit ? money(ln.debit) : "—"}</div>
                      <div className="col-span-3 text-right text-zinc-200">{ln.credit ? money(ln.credit) : "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loans */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="text-sm font-medium text-zinc-100">Loans (Interest + Principal)</div>
        {loanSchedules.length === 0 ? (
          <div className="mt-2 text-sm text-zinc-400">No loan schedule entries for this month.</div>
        ) : (
          <div className="mt-3 space-y-3">
            {loanSchedules.map((s: LoanSchedule) => (
              <div key={`${s.loanId}-${s.periodMonth}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-zinc-100 font-medium">{s.loanName}</div>
                    <div className="text-sm text-zinc-200">{money(s.totalPayment)}</div>
                  </div>
                  <div className="text-xs text-zinc-400">{s.line.memo}</div>
                  <div className="text-xs text-zinc-500">
                    Principal: {money(s.principalPayment)} • Interest: {money(s.interestPayment)}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-12 text-xs text-zinc-400">
                  <div className="col-span-6">Account</div>
                  <div className="col-span-3 text-right">Dr</div>
                  <div className="col-span-3 text-right">Cr</div>
                </div>
                <div className="mt-1 space-y-1">
                  {s.line.lines.map((ln, idx) => (
                    <div key={idx} className="grid grid-cols-12 text-sm">
                      <div className="col-span-6 text-zinc-200">{ln.account}</div>
                      <div className="col-span-3 text-right text-zinc-200">{ln.debit ? money(ln.debit) : "—"}</div>
                      <div className="col-span-3 text-right text-zinc-200">{ln.credit ? money(ln.credit) : "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw journal entries output */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="text-sm font-medium text-zinc-100">Generated Journal Entries (Scheduled)</div>
        <div className="mt-1 text-xs text-zinc-400">
          This is the actual data that flows into Impact automatically.
        </div>

        {scheduledEntries.length === 0 ? (
          <div className="mt-2 text-sm text-zinc-400">No scheduled entries generated.</div>
        ) : (
          <div className="mt-3 space-y-3">
            {scheduledEntries.map((e) => (
              <div key={e.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-3">
                <div className="text-sm text-zinc-100 font-medium">{e.dateISO}</div>
                <div className="text-xs text-zinc-400">{e.memo}</div>

                <div className="mt-2 grid grid-cols-12 text-xs text-zinc-400">
                  <div className="col-span-6">Account</div>
                  <div className="col-span-3 text-right">Dr</div>
                  <div className="col-span-3 text-right">Cr</div>
                </div>
                <div className="mt-1 space-y-1">
                  {e.lines.map((ln, idx) => (
                    <div key={idx} className="grid grid-cols-12 text-sm">
                      <div className="col-span-6 text-zinc-200">{ln.account}</div>
                      <div className="col-span-3 text-right text-zinc-200">{ln.debit ? money(ln.debit) : "—"}</div>
                      <div className="col-span-3 text-right text-zinc-200">{ln.credit ? money(ln.credit) : "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}