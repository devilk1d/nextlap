import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean };

export function Button({ active, className, ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "cursor-pointer whitespace-nowrap rounded-[7px] border px-2.5 py-[5px] text-[11.5px] font-semibold",
        active
          ? "border-ink-faint bg-pressed text-white"
          : "border-control bg-raised text-ink-soft",
        className,
      )}
    />
  );
}
