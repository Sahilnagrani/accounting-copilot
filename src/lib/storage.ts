import type { Account, Asset, Entity, JournalEntry, Liability } from "./types";

const KEY = "acopilot:v1";

export type PersistedState = {
  entities: Entity[];
  activeEntityId: string;
  accountsByEntity: Record<string, Account[]>;
  journalEntries: JournalEntry[];
  assets: Asset[];
  liabilities: Liability[];
};

export function loadState(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
}
