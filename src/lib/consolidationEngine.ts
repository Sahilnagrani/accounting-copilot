import type { Account, Entity, JournalEntry } from "./types";
import { computeBalances, formatBalance } from "./journalEngine";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function addTo(map: Record<string, number>, key: string, delta: number) {
  map[key] = round2((map[key] ?? 0) + delta);
}

export type EntityBalances = {
  entityId: string;
  opening: Record<string, number>;
  closing: Record<string, number>;
};

export type ConsolidationResult = {
  includedEntityIds: string[];
  entityBalances: EntityBalances[];
  consolidatedOpening: Record<string, number>;
  consolidatedClosing: Record<string, number>;
  eliminationsApplied: { account: string; amount: number; note: string }[];
};

export function consolidateGroup(params: {
  entities: Entity[];
  accountsByEntity: Record<string, Account[]>; // entityId -> chart
  entries: JournalEntry[];
  groupEntityId: string; // parent entity id
}): ConsolidationResult {
  const { entities, accountsByEntity, entries, groupEntityId } = params;

  const group = entities.find((e) => e.id === groupEntityId);
  if (!group) {
    return {
      includedEntityIds: [],
      entityBalances: [],
      consolidatedOpening: {},
      consolidatedClosing: {},
      eliminationsApplied: [],
    };
  }

  // Included entities: parent + any subsidiaries with method != none
  const included = entities.filter((e) => {
    if (e.id === groupEntityId) return true;
    return e.policy.method !== "none" && e.policy.ownershipPct > 0;
  });

  const includedIds = included.map((e) => e.id);

  // Compute balances per entity (opening/closing)
  const entityBalances: EntityBalances[] = included.map((ent) => {
    const entEntries = entries.filter((x) => x.entityId === ent.id);
    const chart = accountsByEntity[ent.id] ?? [];
    const { opening, closing } = computeBalances(chart, entEntries);
    return { entityId: ent.id, opening, closing };
  });

  // Consolidated = sum entity balances
  const consolidatedOpening: Record<string, number> = {};
  const consolidatedClosing: Record<string, number> = {};

  for (const eb of entityBalances) {
    for (const [acc, bal] of Object.entries(eb.opening)) addTo(consolidatedOpening, acc, bal);
    for (const [acc, bal] of Object.entries(eb.closing)) addTo(consolidatedClosing, acc, bal);
  }

  // Apply intercompany eliminations (v1: only if enabled on GROUP policy)
  const eliminationsApplied: { account: string; amount: number; note: string }[] = [];
  if (group.policy.intercompany.enabled) {
    const pol = group.policy.intercompany;

    // helper: eliminate min(Dr,Cr) expressed as signed balances (+Dr / -Cr)
    const eliminatePair = (a: string, b: string, note: string) => {
      const balA = consolidatedClosing[a] ?? 0;
      const balB = consolidatedClosing[b] ?? 0;

      // If A is Dr (+) and B is Cr (-), they are opposite sides; eliminate overlap
      // We eliminate up to the smaller absolute amount on opposite signs.
      if (balA === 0 || balB === 0) return;
      if (balA > 0 && balB < 0) {
        const elim = Math.min(Math.abs(balA), Math.abs(balB));
        // Reduce both toward zero
        addTo(consolidatedClosing, a, -elim);
        addTo(consolidatedClosing, b, +elim);
        eliminationsApplied.push({ account: a, amount: elim, note });
        eliminationsApplied.push({ account: b, amount: elim, note });
      } else if (balA < 0 && balB > 0) {
        const elim = Math.min(Math.abs(balA), Math.abs(balB));
        addTo(consolidatedClosing, a, +elim);
        addTo(consolidatedClosing, b, -elim);
        eliminationsApplied.push({ account: a, amount: elim, note });
        eliminationsApplied.push({ account: b, amount: elim, note });
      }
    };

    eliminatePair(pol.arAccount, pol.apAccount, "Eliminate intercompany A/R vs A/P");
    eliminatePair(pol.loanRecAccount, pol.loanPayAccount, "Eliminate intercompany loans");
  }

  // NOTE (v1): Equity method not fully modeled as Investment/Income lines.
  // We still include entity balances in consolidated totals if method != none.
  // Next step: for "equity" entities, replace full balances with investment line.

  return {
    includedEntityIds: includedIds,
    entityBalances,
    consolidatedOpening,
    consolidatedClosing,
    eliminationsApplied,
  };
}

export function prettyBalance(n: number) {
  const f = formatBalance(n);
  return `${f.amount.toFixed(2)} ${f.side}`;
}