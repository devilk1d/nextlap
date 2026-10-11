import { TeamBar } from "@/components/ui/Swatch";
import { cn } from "@/components/ui/cn";
import type { Run } from "@/lib/race/timeline";

type Props = { runs: Run[]; current: string; onPick: (code: string) => void };

/** Driver list for a Dropdown, ordered by classification. */
export function DriverMenu({ runs, current, onPick }: Props) {
  const ordered = [...runs].sort((a, b) => (a.finish_position ?? 99) - (b.finish_position ?? 99));
  return (
    <>
      {ordered.map((run) => (
        <button
          key={run.driver_code}
          type="button"
          onClick={() => onPick(run.driver_code)}
          className={cn(
            "grid w-full cursor-pointer grid-cols-[28px_4px_minmax(0,1fr)] items-center gap-2.5 rounded-lg border-0 px-2.5 py-2 text-left text-ink",
            run.driver_code === current ? "bg-selected" : "bg-transparent",
          )}
        >
          <span className="font-cond text-[14px] font-semibold text-ink-mute">
            {run.finish_position ?? "–"}
          </span>
          <TeamBar color={run.color} height={22} />
          <span className="flex flex-col">
            <span className="text-[12.5px] font-semibold">{run.name}</span>
            <span className="text-[11px] text-ink-mute">{run.team}</span>
          </span>
        </button>
      ))}
    </>
  );
}
