import type { ActionKind } from "@/lib/types";

const ACTIONS: { kind: ActionKind; label: string; hint: string }[] = [
  { kind: "borrow", label: "Borrow", hint: "Create loan payable entry" },
  { kind: "lend", label: "Lend", hint: "Create loan receivable entry" },
  { kind: "buy", label: "Buy", hint: "Expense + optional VAT" },
  { kind: "sell", label: "Sell", hint: "Revenue + optional VAT" },
];

export default function SuggestionChips({
  visible,
  onPick,
}: {
  visible: boolean;
  onPick: (k: ActionKind) => void;
}) {
  if (!visible) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {ACTIONS.map((a) => (
        <button
          key={a.kind}
          onClick={() => onPick(a.kind)}
          className="group rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-100 transition hover:border-zinc-700 hover:bg-zinc-900"
          type="button"
        >
          <span className="font-medium">{a.label}</span>
          <span className="ml-2 text-xs text-zinc-400 group-hover:text-zinc-300">
            {a.hint}
          </span>
        </button>
      ))}
    </div>
  );
}