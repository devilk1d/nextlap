"use client";

import { RollingText } from "@/components/ui/RollingText";
import { cn } from "@/components/ui/cn";

/** Shared by the replay's car-data card and the head-to-head butterfly card. */

export const SPEED_MAX = 360;
/** F1 engines are limited to 15,000 rpm by the regulations. */
export const RPM_MAX = 15000;
export const SPEED_COLOR = "#2b6bff";
export const THROTTLE_COLOR = "var(--color-go)";
export const BRAKE_COLOR = "var(--color-stop)";

export const LABEL = "whitespace-nowrap text-[11px] leading-none text-ink-mute";
export const FIGURE = "font-cond font-semibold leading-none";

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const whole = (value: number | null | undefined) =>
  value == null ? "—" : String(Math.round(value));

/** The fill and the mark of a bar share one transition, so the mark can never drift off its fill. */
export const sweep = (live: boolean, property: "width" | "left" | "height") =>
  `${property} ${live ? "90ms linear" : "600ms cubic-bezier(.2,.8,.2,1)"}`;

/** A number that rolls when it changes, or plain when it follows a live feed. */
export function Figure({
  value,
  live,
  className,
}: {
  value: string;
  live: boolean;
  className?: string;
}) {
  return live ? (
    <span className={cn("inline-block tabular-nums", className)}>{value}</span>
  ) : (
    <RollingText value={value} className={className} />
  );
}
