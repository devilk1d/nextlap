import type { Compound } from "@/server/db/schema";

export type TyreStyle = { short: string; name: string; color: string };

/** Fallback for teams missing from the `teams` table. */
export const NEUTRAL_COLOR = "#9a9aa3";

const TYRES: Record<Compound, TyreStyle> = {
  SOFT: { short: "S", name: "Soft", color: "#FF3341" },
  MEDIUM: { short: "M", name: "Medium", color: "#FFD12E" },
  HARD: { short: "H", name: "Hard", color: "#F0F0F0" },
  INTERMEDIATE: { short: "I", name: "Intermediate", color: "#3DDC84" },
  WET: { short: "W", name: "Wet", color: "#3BA7F0" },
};

const UNKNOWN_TYRE: TyreStyle = { short: "?", name: "Unknown", color: NEUTRAL_COLOR };

export const tyreOf = (compound: Compound | null | undefined): TyreStyle =>
  compound ? TYRES[compound] : UNKNOWN_TYRE;

export const DRY_COMPOUNDS = ["SOFT", "MEDIUM", "HARD"] as const satisfies readonly Compound[];

export type NeutralisedKind = "SC" | "VSC" | "YEL" | "RED";

export const EVENT: Record<NeutralisedKind, { name: string; color: string }> = {
  SC: { name: "Safety Car", color: "#F5C518" },
  VSC: { name: "Virtual Safety Car", color: "#FF9F1C" },
  YEL: { name: "Yellow flag", color: "#E6DB74" },
  RED: { name: "Red flag", color: "#FF3B3B" },
};

/** Sector 1–3 line colours on the track map. */
export const SECTOR_COLORS = ["#E8475F", "#3BA7F0", "#F5C518"] as const;

export const REPLAY_SPEEDS = [1, 2, 5, 10, 30, 60] as const;
