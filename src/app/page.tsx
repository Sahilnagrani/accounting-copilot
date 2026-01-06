// src/app/page.tsx
import CopilotComposer from "@/components/CopilotComposer";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <div className="text-xs text-zinc-400">VS Code-style accounting autocomplete</div>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-100">Accounting Copilot</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Type naturally, pick a suggested action, and generate the journal entry instantly.
        </p>
      </div>

      <CopilotComposer />
    </main>
  );
}