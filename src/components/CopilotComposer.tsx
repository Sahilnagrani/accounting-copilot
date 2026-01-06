// src/components/CopilotComposer.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "./ui/Card";
import type { Account, ComposerState, JournalEntry, JournalLine } from "@/lib/types";
import { generateEntriesFromText } from "@/lib/journalEngine";
import EntryPreview from "./EntryPreview";
import AccountsPanel from "./AccountsPanel";

function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

const DEFAULT_ENTITY_ID = "entity-default";

const defaultAccounts: Account[] = [
  { id: makeId(), name: "Cash", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Accounts Receivable", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Accounts Payable", normalSide: "credit", openingBalance: 0 },
  { id: makeId(), name: "Loan Receivable", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Loan Payable", normalSide: "credit", openingBalance: 0 },
  { id: makeId(), name: "Revenue", normalSide: "credit", openingBalance: 0 },
  { id: makeId(), name: "Purchases / Expense", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Input VAT", normalSide: "debit", openingBalance: 0 },
  { id: makeId(), name: "Output VAT", normalSide: "credit", openingBalance: 0 },
];

function normalizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  const t = normalizeName(s);
  // keep "/" separated words too
  return t
    .split(/[\s/]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !["a", "an", "the", "of", "for", "to", "and", "in", "on"].includes(x));
}

function levenshtein(a: string, b: string) {
  const aa = a;
  const bb = b;
  const m = aa.length;
  const n = bb.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarity(a: string, b: string) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;

  if (na === nb) return 1;

  // substring bonus
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  // token overlap
  const ta = new Set(tokens(na));
  const tb = new Set(tokens(nb));
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  const union = ta.size + tb.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;

  // edit distance similarity
  const dist = levenshtein(na, nb);
  const editSim = 1 - dist / Math.max(na.length, nb.length);

  // weighted
  return Math.max(jaccard * 0.75 + editSim * 0.25, editSim * 0.85);
}

function canonicalizeExact(entries: JournalEntry[], accounts: Account[]) {
  const nameMap = new Map<string, string>();
  for (const a of accounts) nameMap.set(normalizeName(a.name), a.name);

  return entries.map((e) => ({
    ...e,
    lines: e.lines.map((ln) => {
      const canon = nameMap.get(normalizeName(ln.account));
      return canon ? { ...ln, account: canon } : ln;
    }),
  }));
}

function resolveClosestAccounts(params: {
  entries: JournalEntry[];
  accounts: Account[];
  minScore?: number;
}): { entries: JournalEntry[]; unresolved: string[]; resolvedMap: Record<string, string> } {
  const { entries, accounts } = params;
  const minScore = params.minScore ?? 0.72; // tune this if needed

  const byNorm = new Map<string, string>();
  for (const a of accounts) byNorm.set(normalizeName(a.name), a.name);

  // ✅ Fallback account to prevent "invented" accounts appearing in entries
  const fallback = byNorm.get(normalizeName("Purchases / Expense")) ?? null;

  const unresolvedSet = new Set<string>();
  const resolvedMap: Record<string, string> = {};

  const out = entries.map((e) => {
    const newLines: JournalLine[] = e.lines.map((ln) => {
      const rawName = ln.account.trim();
      const norm = normalizeName(rawName);

      // exact/canonical
      const exact = byNorm.get(norm);
      if (exact) return { ...ln, account: exact };

      // find closest existing account
      let bestName: string | null = null;
      let bestScore = 0;

      for (const a of accounts) {
        const sc = similarity(rawName, a.name);
        if (sc > bestScore) {
          bestScore = sc;
          bestName = a.name;
        }
      }

      if (bestName && bestScore >= minScore) {
        resolvedMap[rawName] = bestName;
        return { ...ln, account: bestName };
      }

      // ✅ FIX: do NOT leave unknown accounts in the entry (they look "created")
      // Instead, route debits to Purchases / Expense when available.
      if (fallback && (ln.debit || 0) > 0 && (ln.credit || 0) === 0) {
        resolvedMap[rawName] = fallback;
        return { ...ln, account: fallback };
      }

      // leave it unresolved only if we truly can't safely route it
      unresolvedSet.add(rawName);
      return ln;
    });

    return { ...e, lines: newLines };
  });

  return {
    entries: out,
    unresolved: Array.from(unresolvedSet).sort((a, b) => a.localeCompare(b)),
    resolvedMap,
  };
}

export default function CopilotComposer() {
  const [state, setState] = useState<ComposerState>({
    text: "",
    currency: "AED",
    vatEnabled: true,
    vatRate: 0.05,
    vatInclusive: true,
    useARAP: false,
    entityId: DEFAULT_ENTITY_ID,
    businessUnitId: undefined,
  });

  const [accounts, setAccounts] = useState<Account[]>(defaultAccounts);
  const [eventsCount, setEventsCount] = useState(0);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [unresolvedAccounts, setUnresolvedAccounts] = useState<string[]>([]);
  const [resolvedHints, setResolvedHints] = useState<Record<string, string>>({});

  const needsVATControls = useMemo(() => {
    return /\b(buy|bought|purchase|purchased|sell|sold)\b/i.test(state.text);
  }, [state.text]);

  function generate() {
    const res = generateEntriesFromText(state.text, {
      currency: state.currency,
      vatEnabled: state.vatEnabled,
      vatRate: state.vatRate,
      vatInclusive: state.vatInclusive,
      useARAP: state.useARAP,
    });

    setEventsCount(res.events.length);

    // stamp entity/BU
    const stamped: JournalEntry[] = res.entries.map((e) => ({
      ...e,
      entityId: state.entityId,
      businessUnitId: state.businessUnitId,
    }));

    // 1) exact canonicalization (case/spacing)
    const exact = canonicalizeExact(stamped, accounts);

    // 2) fuzzy resolve to closest existing accounts (NO auto-create)
    // ✅ plus fallback routing to Purchases / Expense for unknown debit accounts
    const resolved = resolveClosestAccounts({ entries: exact, accounts, minScore: 0.72 });

    setEntries(resolved.entries);
    setUnresolvedAccounts(resolved.unresolved);
    setResolvedHints(resolved.resolvedMap);
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Describe what happened"
          subtitle="Write naturally. Click Generate to extract transactions and create journal entries."
        />
        <CardContent>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-2 block text-xs text-zinc-400">Prompt</label>
              <textarea
                value={state.text}
                onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
                className="min-h-[140px] w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-100 outline-none focus:border-zinc-700"
                placeholder={`Examples:
On 25/12/25 I borrowed 1000. Then I lent 500 on 26/12/25.
I spent 300 cash on marketing.
I bought 300 AED worth of goods.`}
              />
              <div className="mt-2 text-xs text-zinc-400">
                Tip: it emits an entry whenever it detects{" "}
                <span className="text-zinc-300">action + amount</span>, and carries context across sentences.
              </div>

              {unresolvedAccounts.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-amber-800 bg-amber-950/30 p-3">
                  <div className="text-xs font-medium text-amber-200">
                    Unrecognized accounts (not auto-created)
                  </div>
                  <div className="mt-1 text-xs text-amber-200/80">
                    Create these in your Chart of Accounts, or rephrase using an existing account name.
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {unresolvedAccounts.map((a) => (
                      <span
                        key={a}
                        className="rounded-xl border border-amber-800 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-100"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {Object.keys(resolvedHints).length > 0 ? (
                <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/30 p-3">
                  <div className="text-xs font-medium text-zinc-200">Auto-mapped to closest accounts</div>
                  <div className="mt-2 space-y-1">
                    {Object.entries(resolvedHints).map(([from, to]) => (
                      <div key={from} className="text-xs text-zinc-400">
                        <span className="text-zinc-200">{from}</span> →{" "}
                        <span className="text-zinc-100">{to}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">Default currency</div>
                <div className="mt-3">
                  <select
                    value={state.currency}
                    onChange={(e) =>
                      setState((s) => ({ ...s, currency: e.target.value as typeof s.currency }))
                    }
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                  >
                    <option value="AED">AED</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">Mode</div>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={state.useARAP}
                    onChange={(e) => setState((s) => ({ ...s, useARAP: e.target.checked }))}
                  />
                  Use A/R & A/P instead of Cash
                </label>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">Generation</div>
                <div className="mt-2 text-sm text-zinc-100">Detected events: {eventsCount}</div>
                <div className="mt-1 text-xs text-zinc-400">
                  Current entries: <span className="text-zinc-300">{entries.length}</span>
                </div>

                <button
                  type="button"
                  onClick={generate}
                  className="mt-3 w-full rounded-xl border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/40"
                >
                  Generate Entries
                </button>
              </div>
            </div>

            {needsVATControls ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-zinc-400">VAT (for buy/sell)</div>
                    <div className="mt-1 text-sm text-zinc-100">UAE default 5%</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={state.vatEnabled}
                        onChange={(e) => setState((s) => ({ ...s, vatEnabled: e.target.checked }))}
                      />
                      VAT enabled
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-400">Rate</span>
                      <input
                        inputMode="decimal"
                        value={state.vatRate}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            vatRate: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-24 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                      />
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={state.vatInclusive}
                        onChange={(e) => setState((s) => ({ ...s, vatInclusive: e.target.checked }))}
                      />
                      Amount includes VAT
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <AccountsPanel accounts={accounts} setAccounts={setAccounts} />
      <EntryPreview accounts={accounts} entries={entries} onChangeEntries={setEntries} />
    </>
  );
}