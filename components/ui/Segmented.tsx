import type { ReactNode } from "react";
import { cn } from "./cn";

export type SegmentedOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  title?: string;
};

type Variant = "tab" | "season" | "pill" | "compact" | "plain";

const CONTAINER: Record<Variant, string> = {
  tab: "rounded-lg p-[3px]",
  season: "rounded-lg p-[3px]",
  pill: "rounded-lg p-[3px]",
  compact: "rounded-[7px] p-0.5",
  plain: "rounded-lg p-[3px]",
};

const ITEM: Record<Variant, string> = {
  tab: "rounded-md px-3 py-1.5 text-[12.5px] font-semibold",
  season: "rounded-md px-[9px] py-[5px] font-cond text-[12px] font-bold tracking-[.03em]",
  pill: "rounded-md px-2 py-[5px] font-cond text-[12px] font-bold",
  compact: "rounded-[5px] px-2 py-[3px] text-[11px] font-semibold",
  plain: "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold",
};

const ACTIVE: Record<Variant, string> = {
  tab: "bg-selected text-white shadow-[inset_0_-2px_0_var(--color-accent)]",
  season: "bg-accent text-[#111]",
  pill: "bg-accent text-[#111]",
  compact: "bg-pressed text-white",
  plain: "bg-selected text-ink",
};

const IDLE: Record<Variant, string> = {
  tab: "text-ink-mute",
  season: "text-ink-dim",
  pill: "text-ink-dim",
  compact: "text-ink-mute",
  plain: "text-ink",
};

type Props<T extends string | number> = {
  value: T | null;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  variant?: Variant;
  className?: string;
};

/** Row of mutually exclusive buttons on a recessed track. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  variant = "tab",
  className,
}: Props<T>) {
  return (
    <div className={cn("flex gap-0.5 border border-line bg-well", CONTAINER[variant], className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-tip={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            "cursor-pointer whitespace-nowrap border-0",
            ITEM[variant],
            option.value === value ? ACTIVE[variant] : IDLE[variant],
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
