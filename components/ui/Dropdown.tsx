"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

type Props = {
  trigger: ReactNode;
  width: number;
  /** Receives `close` so a choice can dismiss the menu. */
  children: (close: () => void) => ReactNode;
  className?: string;
  /** Replaces the default bordered-button look of the trigger. */
  triggerClassName?: string;
};

/**
 * Trigger button with a floating menu. The menu is fixed-positioned so it is never clipped by
 * scrolling panels; it closes on outside click, Escape, resize or scroll.
 */
export function Dropdown({ trigger, width, children, className, triggerClassName }: Props) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setAnchor(null);
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const toggle = (button: HTMLButtonElement) => {
    if (open) return setAnchor(null);
    const rect = button.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        onClick={(event) => toggle(event.currentTarget)}
        className={cn(
          "flex cursor-pointer items-center gap-2 whitespace-nowrap text-[12.5px] font-semibold text-ink",
          triggerClassName ?? "rounded-lg border border-control bg-raised px-3 py-[7px]",
        )}
      >
        {trigger}
        <span className="text-[10px] text-ink-mute">▼</span>
      </button>
      {anchor && (
        <div
          style={{ width, top: anchor.top, left: anchor.left }}
          className="fixed z-60 max-h-[430px] overflow-auto rounded-xl border border-popover bg-inset p-1.5 shadow-[0_20px_50px_rgba(0,0,0,.6)]"
        >
          {children(() => setAnchor(null))}
        </div>
      )}
    </div>
  );
}
