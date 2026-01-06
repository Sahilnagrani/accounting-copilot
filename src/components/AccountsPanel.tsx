"use client";

import React from "react";
import type { Account } from "@/lib/types";
import { Card, CardContent, CardHeader } from "./ui/Card";

function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

export default function AccountsPanel({
  accounts,
  setAccounts,
}: {
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
}) {
  function addAccount() {
    setAccounts((prev) => [
      ...prev,
      {
        id: makeId(),
        name: "New Account",
        normalSide: "debit",
        openingBalance: 0,
      },
    ]);
  }

  function removeAccount(id: string) {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title="Chart of Accounts"
        subtitle="Add accounts + opening balances. Balances shown in preview are based on these + generated entries."
      />
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            Opening balance stored as <span className="text-zinc-300">Dr positive</span>,{" "}
            <span className="text-zinc-300">Cr negative</span>.
          </div>
          <button
            type="button"
            onClick={addAccount}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900"
          >
            + Add account
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">
          <div className="grid grid-cols-12 bg-zinc-950/40 px-4 py-2 text-xs text-zinc-400">
            <div className="col-span-6">Account</div>
            <div className="col-span-3">Normal side</div>
            <div className="col-span-2 text-right">Opening</div>
            <div className="col-span-1 text-right"> </div>
          </div>

          {accounts.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-12 items-center border-t border-zinc-800 px-4 py-2"
            >
              <div className="col-span-6">
                <input
                  value={a.name}
                  onChange={(e) =>
                    setAccounts((prev) =>
                      prev.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x))
                    )
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                />
              </div>

              <div className="col-span-3">
                <select
                  value={a.normalSide}
                  onChange={(e) =>
                    setAccounts((prev) =>
                      prev.map((x) =>
                        x.id === a.id ? { ...x, normalSide: e.target.value as Account["normalSide"] } : x
                      )
                    )
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                >
                  <option value="debit">Debit-normal</option>
                  <option value="credit">Credit-normal</option>
                </select>
              </div>

              <div className="col-span-2">
                <input
                  inputMode="decimal"
                  value={Number.isFinite(a.openingBalance) ? a.openingBalance : 0}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setAccounts((prev) =>
                      prev.map((x) =>
                        x.id === a.id ? { ...x, openingBalance: Number.isFinite(n) ? n : x.openingBalance } : x
                      )
                    );
                  }}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-right text-sm outline-none focus:border-zinc-700"
                />
              </div>

              <div className="col-span-1 text-right">
                <button
                  type="button"
                  onClick={() => removeAccount(a.id)}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-2 py-2 text-xs text-zinc-300 hover:border-zinc-700"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {accounts.length === 0 ? (
            <div className="border-t border-zinc-800 px-4 py-3 text-sm text-zinc-400">
              No accounts yet. Add at least Cash, Revenue, Expense, etc.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}