import { cn } from "./cn";

type Props = {
  color: string;
  /** Size in px: [width, height]. */
  size?: [number, number];
  radius?: number;
  className?: string;
};

/** Small colour chip: team bar, tyre dot or legend key. */
export function Swatch({ color, size = [8, 8], radius = 2, className }: Props) {
  return (
    <span
      className={cn("inline-block flex-none", className)}
      style={{ width: size[0], height: size[1], borderRadius: radius, background: color }}
    />
  );
}

/** Vertical team-colour bar used next to driver codes. */
export const TeamBar = ({ color, height = 14 }: { color: string; height?: number }) => (
  <Swatch color={color} size={[3, height]} />
);

export const TyreDot = ({ color, size = 8 }: { color: string; size?: number }) => (
  <Swatch color={color} size={[size, size]} radius={size} />
);
