"use client";

import Image from "next/image";
import { createContext, useContext } from "react";
import { cn } from "@/components/ui/cn";
import { DRIVER_PHOTO_YEARS, TEAM_LOGO_FILES } from "@/lib/brand-assets.generated";

/** Season of the selected race: drivers change team and photo between seasons. */
const SeasonContext = createContext<number | null>(null);
export const SeasonProvider = SeasonContext.Provider;

function closestYear(years: number[], year: number): number {
  return years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best));
}

/** The official headshot of the season, or the nearest season that has one. */
export function driverPhotoSrc(code: string, year: number | null): string | null {
  const years = DRIVER_PHOTO_YEARS[code];
  if (!years?.length) return null;
  return `/img/drivers/${closestYear(years, year ?? years[years.length - 1])}/${code}.png`;
}

export function teamLogoSrc(team: string, year: number | null): string | null {
  const files = TEAM_LOGO_FILES[team];
  const years = files ? Object.keys(files).map(Number) : [];
  if (!files || !years.length) return null;
  const use = closestYear(years, year ?? years[years.length - 1]);
  return `/img/teams/${use}/${files[use]}.png`;
}

type FaceProps = {
  code: string;
  /** Team colour behind the transparent photo. */
  color: string;
  size: number;
  /** Round avatar (default) or a square tile that fills a card. */
  square?: boolean;
  /** Load at once instead of lazily: for photos that are visible on first paint. */
  eager?: boolean;
  className?: string;
};

/** Official headshot cropped to the face on a team-coloured background. */
export function DriverFace({ code, color, size, square, eager, className }: FaceProps) {
  const season = useContext(SeasonContext);
  const src = driverPhotoSrc(code, season);
  return (
    <span
      aria-hidden
      className={cn(
        "relative block flex-none overflow-hidden",
        square ? "rounded-none" : "rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 45%, #141416) 100%)`,
      }}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          width={Math.ceil(size * 1.5)}
          height={Math.ceil(size * 1.5)}
          className="absolute inset-0 size-full origin-top scale-[1.45] object-cover object-top"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-[10px] font-bold">
          {code}
        </span>
      )}
    </span>
  );
}

/** Official team logo on a light tile (several logos are dark). */
export function TeamLogo({
  team,
  color,
  size = 22,
  className,
}: {
  team: string;
  color: string;
  size?: number;
  className?: string;
}) {
  const season = useContext(SeasonContext);
  const src = teamLogoSrc(team, season);
  if (!src) {
    return (
      <span
        className={cn("block flex-none rounded-[5px]", className)}
        style={{ width: size, height: size, background: color }}
      />
    );
  }
  return (
    <span
      title={team}
      className={cn("grid flex-none place-items-center rounded-[5px] bg-white", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={team}
        width={96}
        height={96}
        unoptimized
        style={{ width: size - 4, height: size - 4 }}
      />
    </span>
  );
}
