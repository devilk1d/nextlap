"use client";

import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { HEIGHT_SCALE, type ElevationTrace } from "@/lib/race/elevation";
import { geometryFor, type TrackGeometry } from "@/lib/race/track";

type Props = {
  /** Dataset short name of the circuit (`Monza`, `Spa-Francorchamps`, …). */
  circuit: string;
  /** Real 3D racing line; without it the flat outline of the circuit is drawn. */
  trace?: ElevationTrace | null;
  className?: string;
  /** Called once when WebGL cannot be created, so the parent can draw a flat outline instead. */
  onUnsupported?: () => void;
};

const SIZE = 10.4; // length of the longest side of the outline, world units (same for every circuit)
const SAMPLES = 480; // points along the smoothed centre line
const HALF = 0.085; // half width of the track: the same for every circuit
const NEAR = Math.round(SAMPLES * 0.035); // points this close along the lap are the same stretch
const THICKNESS = 0.07;
const DECK = 0.09; // thickness of the deck where the track crosses over another stretch
const LAP_SECONDS = 11;
const BUILD_MS = 750;
const SWEEP = 0.24; // share of the lap that stays lit behind the head
const LINE = new Color("#a8481a");
const LINE_HOT = new Color("#fff1e0");
// Vertex colours; the lights decide how bright each face looks, the same for every circuit.
const LOW = new Color("#3b3b45");
const HIGH = new Color("#a7a7b8");
const REF_HEIGHT = 0.9; // world units at which the surface colour reaches `HIGH`, same for all
const WALL_LOW = new Color("#4a4a56");
const WALL_HIGH = new Color("#8d8d9c");
const UNDER = new Color("#2a2a32");

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Centre line samples with a ground-plane normal, the half width of the track at each point and
 * the height of the underside (0 on the ground, higher under a bridge deck).
 */
type Frame = { p: Vector3[]; n: Vector3[]; half: number[]; floor: number[] };

const lapDistance = (i: number, j: number) => {
  const d = Math.abs(i - j);
  return Math.min(d, SAMPLES - d);
};

/** Running filter over the closed lap: `pick` is Math.min, Math.max, or an average. */
function filter(values: number[], radius: number, mode: "min" | "max" | "mean"): number[] {
  const n = values.length;
  return values.map((_, i) => {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const v = values[(i + k + n) % n];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return mode === "min" ? min : mode === "max" ? max : sum / (2 * radius + 1);
  });
}

/** Smoothed closed centre line (3D when a trace is given) with width and underside per point. */
function centreLine(
  geometry: TrackGeometry | null,
  trace: ElevationTrace | null | undefined,
): { frame: Frame; height: number; footprint: { w: number; d: number } } {
  // Centre on the middle of the bounding box and scale the longest side to `SIZE`, so every
  // circuit fills the stage by the same amount whatever its shape.
  let flat: [number, number][];
  let heights: number[];
  if (trace) {
    // x/y are in the frame of the flat maps (official orientation, y down), so z = y keeps it.
    flat = trace.x.map((x, i) => [x, trace.y[i]]);
    heights = trace.z;
  } else {
    flat = geometry!.p.map(([x, y]) => [x, y]);
    heights = flat.map(() => 0);
  }
  const xs = flat.map(([x]) => x);
  const zs = flat.map(([, z]) => z);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  const longest = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const k = SIZE / longest;
  const points = flat.map(
    ([x, z], i) =>
      new Vector3((x - cx) * k, trace ? heights[i] * k * HEIGHT_SCALE : 0, (z - cz) * k),
  );
  const curve = new CatmullRomCurve3(points, true, "centripetal");
  const p = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
  const n = p.map((_, i) => {
    const a = p[(i - 1 + SAMPLES) % SAMPLES];
    const b = p[(i + 1) % SAMPLES];
    return new Vector3(b.z - a.z, 0, -(b.x - a.x)).normalize();
  });

  const half = p.map(() => HALF);

  // Bridge: a point that is directly above another stretch of the track. Its sides stop at the
  // deck instead of the ground, so the lower stretch passes under it like through a tunnel.
  const above = p.map((a, i) => {
    for (let j = 0; j < SAMPLES; j += 1) {
      if (lapDistance(i, j) <= NEAR) continue;
      const b = p[j];
      if (a.y - b.y < 0.12) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < (half[i] + half[j]) * 1.15) return 1;
    }
    return 0;
  });
  const ramp = filter(filter(above, 8, "max"), 10, "mean");
  const floor = p.map((v, i) => Math.max(0, ramp[i] * (v.y + THICKNESS - DECK)));

  const top = Math.max(...p.map((v) => v.y));
  const px = p.map((v) => v.x);
  const pz = p.map((v) => v.z);
  const footprint = {
    w: Math.max(...px) - Math.min(...px),
    d: Math.max(...pz) - Math.min(...pz),
  };
  return { frame: { p, n, half, floor }, height: top, footprint };
}

/**
 * Strip between two offsets from the centre line (in units of the local half width), following
 * the track height plus `y`, or at the absolute height `y` on the ground when `ground`. With
 * `underside` it is the lower face of the track (at `floor`) and faces down.
 */
function strip(
  { p, n, half, floor }: Frame,
  from: number,
  to: number,
  y: number,
  options: { ground?: boolean; shade?: number; underside?: boolean } = {},
): BufferGeometry {
  const pos = new Float32Array(SAMPLES * 2 * 3);
  const nor = new Float32Array(SAMPLES * 2 * 3);
  const col = new Float32Array(SAMPLES * 2 * 3);
  const index: number[] = [];
  const color = new Color();
  const up = options.underside ? -1 : 1;
  for (let i = 0; i < SAMPLES; i += 1) {
    const a = p[i].clone().addScaledVector(n[i], from * half[i]);
    const b = p[i].clone().addScaledVector(n[i], to * half[i]);
    const h = options.underside ? floor[i] : options.ground ? y : p[i].y + y;
    pos.set([a.x, h, a.z, b.x, h, b.z], i * 6);
    nor.set([0, up, 0, 0, up, 0], i * 6);
    if (options.underside) color.copy(UNDER);
    else
      color
        .copy(LOW)
        .lerp(HIGH, options.shade ? Math.min(1, p[i].y / REF_HEIGHT) * options.shade : 0);
    col.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6);
    const j = (i + 1) % SAMPLES;
    // Counter-clockwise seen from the side the face points to, so its lighting is correct.
    if (up === 1) index.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    else index.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new BufferAttribute(nor, 3));
  geometry.setAttribute("color", new BufferAttribute(col, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Vertical wall along one edge, from the underside (ground or bridge deck) to the surface. */
function wall({ p, n, half, floor }: Frame, outward: 1 | -1) {
  const pos = new Float32Array(SAMPLES * 2 * 3);
  const nor = new Float32Array(SAMPLES * 2 * 3);
  const col = new Float32Array(SAMPLES * 2 * 3);
  const index: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const e = p[i].clone().addScaledVector(n[i], outward * half[i]);
    pos.set([e.x, floor[i], e.z, e.x, p[i].y + THICKNESS, e.z], i * 6);
    const nx = n[i].x * outward;
    const nz = n[i].z * outward;
    col.set([WALL_LOW.r, WALL_LOW.g, WALL_LOW.b, WALL_HIGH.r, WALL_HIGH.g, WALL_HIGH.b], i * 6);
    nor.set([nx, 0, nz, nx, 0, nz], i * 6);
    const j = (i + 1) % SAMPLES;
    // Winding follows the outward side so the front face is the one seen from outside.
    if (outward === 1) index.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
    else index.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new BufferAttribute(nor, 3));
  geometry.setAttribute("color", new BufferAttribute(col, 3));
  geometry.setIndex(index);
  return geometry;
}

function checkerTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  for (let x = 0; x < 16; x += 1) {
    for (let y = 0; y < 4; y += 1) {
      ctx.fillStyle = (x + y) % 2 ? "#f4f4f6" : "#0d0d0f";
      ctx.fillRect(x * 4, y * 4, 4, 4);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

type Built = {
  group: Group;
  /** Height of the highest point, to frame the camera. */
  height: number;
  /** Width (x) and depth (z) of the circuit, to fit it in the view. */
  footprint: { w: number; d: number };
  /** Lights the racing line behind `head` (0..1 of the lap) with a fading tail. */
  sweep: (head: number) => void;
  dispose: () => void;
};

function buildTrack(
  geometry: TrackGeometry | null,
  trace: ElevationTrace | null | undefined,
  shared: { checker: Texture },
): Built {
  const { frame, height, footprint } = centreLine(geometry, trace);
  const group = new Group();
  const owned: (BufferGeometry | Material)[] = [];
  const add = (mesh: Mesh) => {
    owned.push(mesh.geometry, mesh.material as Material);
    group.add(mesh);
    return mesh;
  };
  const relief = trace ? 1 : 0;

  const asphalt = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.15,
    side: DoubleSide,
  });
  const side = asphalt;
  add(new Mesh(strip(frame, -1, 1, THICKNESS, { shade: relief }), asphalt));
  add(new Mesh(wall(frame, -1), side));
  add(new Mesh(wall(frame, 1), side));
  add(new Mesh(strip(frame, -1, 1, 0, { underside: true }), side));

  // Thin racing line down the middle; its colours are rewritten every frame by `sweep`.
  const lineGeometry = strip(frame, -0.16, 0.16, THICKNESS + 0.004);
  const lineColors = lineGeometry.getAttribute("color") as BufferAttribute;
  add(new Mesh(lineGeometry, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })));
  const tint = new Color();
  const sweep = (head: number) => {
    const array = lineColors.array as Float32Array;
    for (let i = 0; i < SAMPLES; i += 1) {
      // Fraction of the lap between this point and the head, going backwards.
      const behind = (((head - i / SAMPLES) % 1) + 1) % 1;
      const k = behind < SWEEP ? (1 - behind / SWEEP) ** 1.7 : 0;
      tint.copy(LINE).lerp(LINE_HOT, k);
      array.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], i * 6);
    }
    lineColors.needsUpdate = true;
  };
  sweep(0);

  // Soft contact shadow on the ground, so the height above it can be read.
  const shadow = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: DoubleSide,
  });
  add(new Mesh(strip(frame, -1.3, 1.3, -0.02, { ground: true }), shadow));

  // Start / finish line across the track.
  const finish = new Mesh(
    new BoxGeometry(frame.half[0] * 2, 0.012, 0.09),
    new MeshBasicMaterial({ map: shared.checker }),
  );
  const n0 = frame.n[0];
  finish.position.set(frame.p[0].x, frame.p[0].y + THICKNESS + 0.008, frame.p[0].z);
  finish.rotation.y = Math.atan2(-n0.z, n0.x);
  add(finish);

  return {
    group,
    height,
    footprint,
    sweep,
    dispose: () => {
      for (const item of new Set(owned)) item.dispose();
    },
  };
}

/**
 * The selected circuit as a 3D ribbon with a lap sweep running along it. With a `trace` the ribbon follows
 * the real elevation of the racing line (vertical exaggeration `HEIGHT_SCALE`); without one the
 * flat outline is drawn.
 */
export default function TrackStage({ circuit, trace, className, onUnsupported }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    show: (name: string, trace: ElevationTrace | null | undefined) => void;
  } | null>(null);
  const initial = useRef({ circuit, trace });
  const unsupported = useRef(onUnsupported);

  useEffect(() => {
    unsupported.current = onUnsupported;
  }, [onUnsupported]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      unsupported.current?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block";
    el.appendChild(renderer.domElement);

    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new Scene();
    const camera = new PerspectiveCamera(30, 1, 0.1, 80);

    // Studio light set: sky wash, a warm key from above, an orange rim from behind and two
    // low fills. The same for every circuit and there is no fog, so they all look alike.
    scene.add(new HemisphereLight(0xaab2cc, 0x4a4a58, 1.25));
    scene.add(new AmbientLight(0xffffff, 0.15));
    const key = new DirectionalLight(0xfff0dc, 2.4);
    key.position.set(4, 9, 6);
    scene.add(key);
    const rim = new DirectionalLight(0xff6b1f, 1.2);
    rim.position.set(-7, 3, -6);
    scene.add(rim);
    const fillFront = new DirectionalLight(0xc4ccff, 1.1);
    fillFront.position.set(-4, 1.2, 9);
    scene.add(fillFront);
    const fillBack = new DirectionalLight(0xffe8d6, 0.9);
    fillBack.position.set(6, 1.2, -8);
    scene.add(fillBack);

    const checker = checkerTexture();
    const world = new Group();
    scene.add(world);

    let built: Built | null = null;
    let builtAt = 0;
    let shownKey = "";
    let lift = 0;
    let fit = { w: SIZE, d: SIZE };
    let distance = 17.5;
    const show = (name: string, nextTrace: ElevationTrace | null | undefined) => {
      const geometry = geometryFor(name);
      if (!geometry && !nextTrace) return;
      const id = `${name}:${nextTrace ? "3d" : "flat"}`;
      if (id === shownKey) return;
      shownKey = id;
      if (built) {
        world.remove(built.group);
        built.dispose();
      }
      built = buildTrack(geometry, nextTrace, { checker });
      world.add(built.group);
      builtAt = performance.now();
      lift = built.height;
      fit = built.footprint;
    };
    api.current = { show };
    show(initial.current.circuit, initial.current.trace);

    // Viewing state: the circuit rests in its real orientation. Dragging turns it, and it eases
    // back when released; the pointer also tilts the view a little.
    let yaw = 0;
    let dragging = false;
    let lastX = 0;
    let tiltX = 0;
    let tiltY = 0;
    let targetX = 0;
    let targetY = 0;

    const dom = renderer.domElement;
    const onDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      dom.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      if (!dragging) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      yaw += dx * 0.008;
    };
    const onUp = () => {
      dragging = false;
      // Take the shortest way back to the real orientation.
      yaw = ((((yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const width = el.clientWidth || 1;
      const height = el.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // The title and the elevation card sit above the circuit, the year and facts below it:
      // nudge the picture down a little so it is centred in the free part.
      camera.setViewOffset(width, height, 0, -height * 0.035, width, height);
      camera.fov = camera.aspect < 1.25 ? 40 : 30;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    let visible = true;
    let raf = 0;
    let last = performance.now();
    let u = 0;
    let focus = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!dragging) yaw += (0 - yaw) * Math.min(1, dt * 4);
      tiltX += (targetX - tiltX) * Math.min(1, dt * 4);
      tiltY += (targetY - tiltY) * Math.min(1, dt * 4);

      const t = Math.min(1, (now - builtAt) / BUILD_MS);
      const e = easeOut(t);
      world.scale.set(0.9 + 0.1 * e, Math.max(0.001, e), 0.9 + 0.1 * e);
      world.rotation.y = yaw;

      // Look at the middle of the relief, so tall circuits stay in frame.
      focus += (lift * 0.35 - focus) * Math.min(1, dt * 3);
      const azimuth = tiltX * 0.12;
      const polar = 0.9 + tiltY * 0.08;
      // Pull back just far enough for the whole circuit to sit inside the middle of the stage,
      // whatever its shape and the shape of the stage (overlays take the top and the bottom).
      const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
      const wide = fit.w / 2 / (0.9 * tanHalf * camera.aspect);
      const high = (fit.d * Math.sin(0.9) + lift * Math.cos(0.9)) / 2 / (0.66 * tanHalf);
      const wanted = Math.max(9, wide, high) * 1.02;
      distance += (wanted - distance) * Math.min(1, dt * 3);
      camera.position.set(
        Math.sin(azimuth) * distance,
        Math.sin(polar) * distance,
        Math.cos(polar) * distance,
      );
      camera.lookAt(0, focus, 0);

      if (built) {
        u = (u + dt / LAP_SECONDS) % 1;
        built.sweep(u);
      }

      renderer.render(scene, camera);
    };

    const start = () => {
      if (raf || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(el);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      io.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("pointerleave", onLeave);
      built?.dispose();
      checker.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      dom.remove();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.show(circuit, trace);
  }, [circuit, trace]);

  return (
    <div ref={host} className={className} style={{ position: "relative", touchAction: "pan-y" }} />
  );
}
