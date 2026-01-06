import CopilotComposer from "../components/CopilotComposer";

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          VS Code-style accounting autocomplete
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Accounting Copilot
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-300">
          Type naturally, pick a suggested action, and generate the journal entry
          instantly.
        </p>
      </header>

      <CopilotComposer />
    </main>
  );
}