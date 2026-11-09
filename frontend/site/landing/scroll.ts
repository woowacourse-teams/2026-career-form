import { useEffect, useState } from "react";

export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, t: number) =>
  from + (to - from) * t;

/** Smooth in-out curve for camera-like moves. */
export const ease = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** Slight overshoot for things that pop in. */
export const back = (t: number) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/**
 * Local progress of `p` inside [start, end]. With reduced motion every change
 * snaps at its midpoint instead of tweening, so the story still advances
 * without movement.
 */
export function segment(p: number, start: number, end: number, snap = false) {
  const t = clamp((p - start) / (end - start));
  return snap ? (t >= 0.5 ? 1 : 0) : t;
}

/** Subscribes to a media query; false where `matchMedia` is unavailable. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia?.(query).matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setMatches(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export const usePrefersReducedMotion = () =>
  useMediaQuery("(prefers-reduced-motion: reduce)");

/** Writes one frame of motion: a transform and, optionally, an opacity. */
export function applyMotion(
  el: HTMLElement | null | undefined,
  transform: string,
  opacity?: number,
) {
  if (!el) return;
  el.style.transform = transform;
  if (opacity !== undefined) el.style.opacity = String(opacity);
}

/** Sums offsets up to `root`; offsets ignore transforms, unlike rects. */
export function offsetWithin(
  el: Element | null | undefined,
  root: HTMLElement,
) {
  let x = 0;
  let y = 0;
  let node = el as HTMLElement | null;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}
