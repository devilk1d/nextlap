import type { ReactNode } from "react";

/** Wrapping row of `[key, label]` pairs under a chart. */
export function Legend({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-ink-dim">
      {items.map(([key, label], i) => (
        <span key={i} className="flex items-center gap-1.5">
          {key}
          {label}
        </span>
      ))}
    </div>
  );
}
