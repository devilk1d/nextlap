"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui/cn";
import { distanceAt } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";
import { useReplay } from "@/features/replay/store";
import type { View } from "@/features/dashboard/selection";
import { TOUR_STEPS, VIEW_NAMES } from "./steps";
import { tourSeen, useTour } from "./store";

type Box = { left: number; top: number; width: number; height: number };

/** Space kept between the spotlight and its card, and from the window edge. */
const GAP = 12;
const EDGE = 8;
const PAD = 6;
const CARD_WIDTH = 340;

function measure(target: string): Box | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Below the target if it fits, else above, else beside it, else inside its top edge. */
function place(box: Box | null, vw: number, vh: number, height: number, corner: boolean) {
  const maxLeft = Math.max(EDGE, vw - CARD_WIDTH - EDGE);
  if (!box) return { left: clamp((vw - CARD_WIDTH) / 2, EDGE, maxLeft), top: Math.max(EDGE, vh / 3) };
  if (corner) return { left: maxLeft, top: 72 };
  const left = clamp(box.left, EDGE, maxLeft);
  const below = box.top + box.height + PAD + GAP;
  if (below + height <= vh - EDGE) return { left, top: below };
  const above = box.top - PAD - GAP - height;
  if (above >= EDGE) return { left, top: above };
  const side = clamp(box.top, EDGE, Math.max(EDGE, vh - height - EDGE));
  const right = box.left + box.width + PAD + GAP;
  if (right + CARD_WIDTH <= vw - EDGE) return { left: right, top: side };
  const before = box.left - PAD - GAP - CARD_WIDTH;
  if (before >= EDGE) return { left: before, top: side };
  return { left, top: clamp(box.top + GAP, EDGE, Math.max(EDGE, vh - height - EDGE)) };
}

/**
 * First-visit tour of the replay view: a spotlight on one part of the page at a time with a short
 * card beside it. The page stays usable underneath, so hovering "Why?" or pressing Space works
 * while the card is open. Finishing or skipping is remembered in this browser; the header's "?"
 * button opens it again.
 */
export function Tour({ view, onView }: { view: View; onView: (view: View) => void }) {
  const { driver } = useRace();
  // A link straight to another view is not interrupted; the header's "?" still opens the tour.
  const [startView] = useState(view);
  const open = useTour((s) => s.open);
  const step = useTour((s) => s.step);
  const current = TOUR_STEPS[step];
  const [box, setBox] = useState<Box | null>(null);
  const [screen, setScreen] = useState({ w: 0, h: 0 });
  const [height, setHeight] = useState(220);
  const card = useRef<HTMLDivElement>(null);

  // First visit: open once the layout has settled.
  useEffect(() => {
    if (tourSeen() || startView !== "replay") return;
    const id = window.setTimeout(() => {
      if (!useTour.getState().open) useTour.getState().start();
    }, 700);
    return () => window.clearTimeout(id);
  }, [startView]);

  // The tour owns the view while it is open: each step moves to the page it is about.
  const stepView = current.view;
  useEffect(() => {
    if (open && stepView !== view) onView(stepView);
  }, [open, stepView, view, onView]);

  // Pages that fill in "so far" need the replay part-way through the race to have content.
  const share = current.at;
  useEffect(() => {
    if (!open || share === undefined) return;
    const { end, seek } = useReplay.getState();
    if (end > 0) seek(end * share);
  }, [open, share, step]);

  // The forecast steps need a lap that has a forecast; lap 1 does not.
  const needsForecast = open && current.forecast === true;
  useEffect(() => {
    if (!needsForecast) return;
    const { time, seek } = useReplay.getState();
    const lapNumber = Math.floor(distanceAt(driver.cum, time)) + 1;
    if (driver.laps[lapNumber - 1]?.prediction) return;
    const forecast = driver.laps.filter((lap) => lap.prediction);
    const lap = forecast[1] ?? forecast[0];
    if (lap) seek(driver.cum[lap.lap_number - 1] + 7);
  }, [needsForecast, step, driver]);

  // Follow the target while the layout moves (resize, panels resizing, replay ticks).
  const target = current.target;
  useEffect(() => {
    if (!open) return;
    document
      .querySelector<HTMLElement>(`[data-tour="${target}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    let frame = 0;
    const tick = () => {
      const next = measure(target);
      setBox((previous) => (sameBox(previous, next) ? previous : next));
      const w = window.innerWidth;
      const h = window.innerHeight;
      setScreen((previous) => (previous.w === w && previous.h === h ? previous : { w, h }));
      const cardHeight = card.current?.offsetHeight;
      if (cardHeight) setHeight((previous) => (previous === cardHeight ? previous : cardHeight));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
    // `view` is a dependency so the target is looked up again once the page has switched.
  }, [open, target, view]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") useTour.getState().close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const last = step === TOUR_STEPS.length - 1;
  const at = place(box, screen.w, screen.h, height, current.corner === true);
  const { go, close } = useTour.getState();

  return createPortal(
    <>
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[250] rounded-xl border-2 border-accent transition-[left,top,width,height] duration-200"
          style={{
            left: box.left - PAD,
            top: box.top - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(8,8,10,.68)",
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[250] bg-black/65" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-label="Guided tour"
        className="fixed z-[300] rounded-xl border border-popover bg-tooltip p-4 text-[12.5px] shadow-[0_12px_30px_rgba(0,0,0,.5)] transition-[left,top] duration-200"
        style={{ left: at.left, top: at.top, width: CARD_WIDTH, maxWidth: "calc(100vw - 16px)" }}
      >
        <div className="flex items-center justify-between text-[11px] text-ink-mute">
          <span className="font-bold tracking-[.08em]">
            STEP {step + 1} OF {TOUR_STEPS.length}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(VIEW_NAMES) as View[]).map((name) => (
            <button
              key={name}
              type="button"
              data-tip={`Jump to the ${VIEW_NAMES[name]} part of the tour`}
              onClick={() => go(TOUR_STEPS.findIndex((item) => item.view === name))}
              className={cn(
                "cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                name === current.view
                  ? "border-accent bg-accent/15 text-ink"
                  : "border-control bg-transparent text-ink-mute",
              )}
            >
              {VIEW_NAMES[name]}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[15px] font-bold">{current.title}</div>
        <p className="mt-1.5 leading-[1.55] text-ink-soft">{current.body}</p>
        <p className="mt-2.5 text-[11.5px] leading-[1.45] text-ink-mute">
          <span className="font-bold text-ink-dim">Data · </span>
          {current.data}
        </p>
        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={close}
            className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-ink-mute"
          >
            {last ? "" : "Skip tour"}
          </button>
          <span className="flex-1" />
          {step > 0 && (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="h-8 cursor-pointer rounded-lg border border-control bg-raised px-3 text-[12px] font-semibold text-ink-soft"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? close() : go(step + 1))}
            className="h-8 cursor-pointer rounded-lg border-0 bg-accent px-3.5 text-[12px] font-bold text-[#111]"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
