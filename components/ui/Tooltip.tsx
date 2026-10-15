"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/**
 * One hover card for the whole site.
 *
 * Any element can carry a tip with `data-tip="…"`; `<TooltipLayer />` (mounted once in the root
 * layout) shows it. No wrapper element, so SVG shapes, table cells and components that forward
 * their props all work, and it replaces the browser's unstyled `title` tooltip.
 *
 * The text is plain, with a little structure:
 *   `# Heading`        first line, bold (with a colour dot when `data-tip-color` is set)
 *   `Label | value`    a row: label on the left, value in mono on the right
 *   anything else      a muted sentence
 * Lines are separated by "\n". The text is read again while the card is open, so a tip on
 * something that changes with the replay clock stays current.
 */

/** Seconds a card waits before it opens when none is open yet (it follows at once after that). */
const OPEN_DELAY = 140;
/** Elements bigger than this are not a single point: the card follows the cursor over them. */
const LARGE = { width: 220, height: 90 };

type Anchor = { x: number; top: number; bottom: number };

/**
 * Floats next to a point of the screen and picks the side with room: above it when it fits,
 * else below, else beside it; it is always kept inside the window. Fixed and in the body, so no
 * card with `overflow: hidden` can cut it off.
 *
 * `y` is the edge it sits above and `yBelow` the one it sits below (the same for a bare point).
 */
export function HoverCard({
  x,
  y,
  yBelow = y,
  width,
  children,
}: {
  x: number;
  y: number;
  yBelow?: number;
  /** Fixed width in px; by default the card is as wide as its text, up to 300 px. */
  width?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const gap = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(Math.max(v, lo), Math.max(lo, hi));
    let left = clamp(x - w / 2, margin, vw - w - margin);
    let top = y - h - gap;
    if (top < margin) top = yBelow + gap;
    if (top + h > vh - margin) {
      // Neither above nor below fits: put it beside the point, on the roomier side.
      top = clamp(y - h / 2, margin, vh - h - margin);
      left =
        vw - x - gap > x - gap
          ? clamp(x + gap, margin, vw - w - margin)
          : clamp(x - w - gap, margin, vw - w - margin);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, yBelow, children]);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={width ? { width } : undefined}
      className={cn(
        "pointer-events-none fixed left-0 top-0 z-[400] max-w-[min(300px,calc(100vw-16px))] rounded-lg border border-popover bg-tooltip px-2.5 py-2 text-[11.5px] leading-[1.45] shadow-[0_12px_30px_rgba(0,0,0,.55)]",
        !width && "w-max",
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

/** The structured text of a tip (see the format above). */
export function TipBody({ text, color }: { text: string; color?: string | null }) {
  const lines = text.split("\n");
  const heading = lines[0]?.startsWith("# ") ? lines.shift()!.slice(2) : null;
  return (
    <>
      {heading !== null && (
        <div className="flex items-center gap-1.5 font-bold text-ink">
          {color && <span className="size-2 flex-none rounded-full" style={{ background: color }} />}
          {heading}
        </div>
      )}
      {lines.map((line, index) => {
        const cut = line.indexOf(" | ");
        return cut > 0 ? (
          <div key={index} className="mt-0.5 flex justify-between gap-4">
            <span className="text-ink-mute">{line.slice(0, cut)}</span>
            <span className="whitespace-nowrap font-mono text-ink">{line.slice(cut + 3)}</span>
          </div>
        ) : (
          <div key={index} className={cn("text-ink-dim", index > 0 || heading !== null ? "mt-0.5" : "")}>
            {line}
          </div>
        );
      })}
    </>
  );
}

type Shown = { el: HTMLElement; anchor: Anchor; follow: boolean };

/** Mount once. Shows the card of whichever `[data-tip]` element the pointer or focus is on. */
export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [text, setText] = useState("");
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;
    let open = false;
    let follow = false;

    const tipOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      open = false;
      setShown(null);
    };

    const show = (el: HTMLElement, point: { x: number; y: number } | null) => {
      const value = el.dataset.tip;
      if (!value) return;
      const box = el.getBoundingClientRect();
      follow = point !== null && (box.width > LARGE.width || box.height > LARGE.height);
      const anchor: Anchor =
        follow && point
          ? { x: point.x, top: point.y, bottom: point.y + 14 }
          : { x: box.left + box.width / 2, top: box.top, bottom: box.bottom };
      open = true;
      setText(value);
      setColor(el.dataset.tipColor ?? null);
      setShown({ el, anchor, follow });
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const el = tipOf(event.target);
      if (el === current) return;
      window.clearTimeout(timer);
      current = el;
      if (!el) {
        hide();
        return;
      }
      const point = { x: event.clientX, y: event.clientY };
      if (open) show(el, point);
      else timer = window.setTimeout(() => show(el, point), OPEN_DELAY);
    };

    const onMove = (event: PointerEvent) => {
      if (!open || !follow) return;
      const { clientX: x, clientY: y } = event;
      setShown((previous) =>
        previous ? { ...previous, anchor: { x, top: y, bottom: y + 14 } } : previous,
      );
    };

    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };

    const onFocus = (event: FocusEvent) => {
      const el = tipOf(event.target);
      if (el && event.target instanceof Element && event.target.matches(":focus-visible")) {
        current = el;
        show(el, null);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    // The text is read again so a tip on something live stays current, and the card goes when
    // its element is removed from the page (which fires no pointer event).
    const refresh = window.setInterval(() => {
      if (!current || !open) return;
      if (!current.isConnected || !current.dataset.tip) {
        hide();
        return;
      }
      setText(current.dataset.tip);
    }, 250);

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(refresh);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!shown || !text) return null;
  return (
    <HoverCard x={shown.anchor.x} y={shown.anchor.top} yBelow={shown.anchor.bottom}>
      <TipBody text={text} color={color} />
    </HoverCard>
  );
}
