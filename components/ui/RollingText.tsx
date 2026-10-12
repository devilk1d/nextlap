"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "./cn";

type Props = {
  value: string;
  className?: string;
  /** Colour of the highlight that sweeps behind the new value. */
  flash?: string;
};

/**
 * Keyframes live next to the component so it works wherever it is used. React hoists a `<style>`
 * with `href` and `precedence` into the head once, however many instances there are.
 */
const CSS = `
@keyframes rt-in {
  from { transform: translateY(70%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes rt-out {
  from { transform: translateY(0); opacity: 1; }
  to { transform: translateY(-70%); opacity: 0; }
}
@keyframes rt-flash {
  0% { background-color: var(--rt-flash, transparent); }
  100% { background-color: transparent; }
}
.rt-in { animation: rt-in 380ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.rt-out { animation: rt-out 300ms ease-in both; }
.rt-flash { animation: rt-flash 1400ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .rt-in, .rt-flash { animation: none; }
  .rt-out { display: none; }
}
`;

/**
 * A figure that changes like a timing-board entry: the old value slides up and out, the new one
 * slides in from below, and a highlight in `flash` fades behind it. The text is never split, so
 * spacing and kerning stay exactly as in static text.
 */
export function RollingText({ value, className, flash }: Props) {
  const [state, setState] = useState<{ value: string; from: string | null; run: number }>({
    value,
    from: null,
    run: 0,
  });
  if (state.value !== value) setState({ value, from: state.value, run: state.run + 1 });
  const { from, run } = state;

  return (
    <>
      <style href="rolling-text" precedence="default">
        {CSS}
      </style>
      <span
        // A new key restarts the animations for every change.
        key={run}
        aria-label={value}
        className={cn(
          "relative inline-block overflow-hidden whitespace-nowrap rounded-md px-1.5 -mx-1.5 leading-[1.1]",
          run > 0 && flash && "rt-flash",
          className,
        )}
        style={{ "--rt-flash": flash } as CSSProperties}
      >
        {run > 0 && from !== null && (
          <span aria-hidden className="rt-out absolute left-1.5 top-0">
            {from}
          </span>
        )}
        <span aria-hidden className={cn("inline-block", run > 0 && "rt-in")}>
          {value}
        </span>
      </span>
    </>
  );
}
