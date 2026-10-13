import { cn } from "@/components/ui/cn";
import type { Run } from "@/lib/race/timeline";
import { DriverFace, TeamLogo } from "./Brand";

type Props = { runs: Run[]; current: string; onPick: (code: string) => void };

/** Width and height cap a Dropdown needs to show this menu without scrolling. */
export const DRIVER_MENU_SIZE = { width: 480, maxHeight: 520 } as const;

const surname = (name: string) => name.split(" ").slice(1).join(" ") || name;

/** Drivers grouped by team (teams in classification order), two drivers beside each logo. */
export function DriverMenu({ runs, current, onPick }: Props) {
  const rank = (run: Run) => run.finish_position ?? 99;
  const teams = new Map<string, Run[]>();
  for (const run of [...runs].sort((a, b) => rank(a) - rank(b))) {
    teams.set(run.team, [...(teams.get(run.team) ?? []), run]);
  }

  return (
    <div className="flex flex-col gap-0.5">
      {[...teams].map(([team, members]) => (
        // Inline grid styles: these must never depend on a Tailwind class being generated.
        <div
          key={team}
          className="grid gap-x-2 px-1"
          style={{ gridTemplateColumns: "30px minmax(0,1fr) minmax(0,1fr)" }}
        >
          <div
            className="flex items-center"
            style={{ gridColumn: 1, gridRow: `1 / span ${Math.ceil(members.length / 2)}` }}
          >
            <TeamLogo team={team} color={members[0].color} size={30} />
          </div>
          {members.map((run) => (
            <button
              key={run.driver_code}
              type="button"
              onClick={() => onPick(run.driver_code)}
              className={cn(
                "flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border-0 px-1.5 py-1 text-left text-ink",
                run.driver_code === current ? "bg-selected" : "bg-transparent hover:bg-raised",
              )}
            >
              <DriverFace code={run.driver_code} color={run.color} size={34} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[14px] font-semibold">
                  {surname(run.name)}
                </span>
                <span className="block truncate text-[12px] text-ink-mute">
                  {run.driver_code} · {run.finish_position ? `P${run.finish_position}` : "DNF"}
                </span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
