import CopilotComposer from "@/components/CopilotComposer";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <div className="text-xs text-zinc-400">Multi-entity accounting copilot</div>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-100">Accounting Copilot</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Journal → Save → Period Balance Sheet → Consolidation. Assets & liabilities generate scheduled entries per month.
        </p>
      </div>

      <CopilotComposer />
    </main>
  );
}
