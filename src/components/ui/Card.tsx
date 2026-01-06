import React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="border-b border-zinc-800 px-5 py-4">
      <div className="text-sm font-medium text-zinc-100">{title}</div>
      {subtitle ? (
        <div className="mt-1 text-xs text-zinc-400">{subtitle}</div>
      ) : null}
    </div>
  );
}

export function CardContent({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-5">{children}</div>;
}