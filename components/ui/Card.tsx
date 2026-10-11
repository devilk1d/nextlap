import type { ReactNode } from "react";
import { cn } from "./cn";

type Props = {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/** Bordered panel with a title row; the building block of every dashboard page. */
export function Card({ title, sub, actions, children, className, bodyClassName }: Props) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-divider px-3.5 py-[9px]">
        <span className="text-[13px] font-semibold">{title}</span>
        {sub && <span className="text-[11.5px] text-ink-mute">{sub}</span>}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1 px-3.5 py-3", bodyClassName)}>{children}</div>
    </section>
  );
}
