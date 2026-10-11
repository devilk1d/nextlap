import type { ReactNode } from "react";

type Props = { label: string; value: ReactNode; sub?: ReactNode; valueColor?: string };

/** KPI tile: label, large condensed value and a one-line subtitle. */
export function Tile({ label, value, sub, valueColor }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px] overflow-hidden rounded-xl border border-line bg-panel px-3.5 py-[11px]">
      <div className="text-[11.5px] text-ink-mute">{label}</div>
      <div
        className="truncate font-cond text-[26px] font-semibold leading-[1.05]"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      {sub && <div className="truncate text-[11.5px] text-ink-dim">{sub}</div>}
    </div>
  );
}
