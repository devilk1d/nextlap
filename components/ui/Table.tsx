import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Th({ left, className, ...props }: ComponentProps<"th"> & { left?: boolean }) {
  return (
    <th
      {...props}
      className={cn(
        "sticky top-0 z-[1] whitespace-nowrap border-b border-hairline bg-panel px-2 py-[7px] text-[10px] font-bold tracking-[.06em] text-ink-mute",
        left ? "text-left" : "text-right",
        className,
      )}
    />
  );
}

/** Numeric cell (monospace, right aligned); `left` and `text` switch to a name column. */
export function Td({
  left,
  text,
  className,
  ...props
}: ComponentProps<"td"> & { left?: boolean; text?: boolean }) {
  return (
    <td
      {...props}
      className={cn(
        "whitespace-nowrap border-b border-rowline px-2 py-1.5 text-[12px]",
        left ? "text-left" : "text-right",
        text ? "font-sans" : "font-mono",
        className,
      )}
    />
  );
}

export const Table = ({ className, ...props }: ComponentProps<"table">) => (
  <table {...props} className={cn("w-full border-collapse", className)} />
);
