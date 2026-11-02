import { useEffect, useRef, useState, type RefObject } from "react";

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

/** How far the viewport has travelled through a tall pinned track (0..1). */
export function trackProgress(
  rect: { top: number; height: number },
  viewportHeight: number,
) {
  const travel = rect.height - viewportHeight;
  return travel <= 0 ? 0 : clamp(-rect.top / travel);
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Calls `render(progress)` on every animation frame in which the pinned track
 * is on screen, and `layout()` whenever the viewport size changes. Both write
 * styles directly so scrolling never re-renders React.
 */
export function useScrollScene(
  track: RefObject<HTMLElement | null>,
  render: (progress: number) => void,
  layout: () => void,
) {
  const renderRef = useRef(render);
  const layoutRef = useRef(layout);
  renderRef.current = render;
  layoutRef.current = layout;
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = 0;
      const el = track.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      renderRef.current(trackProgress(rect, window.innerHeight));
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const relayout = () => {
      layoutRef.current();
      draw();
    };
    relayout();
    document.fonts?.ready.then(relayout).catch(() => {});
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", relayout);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", relayout);
    };
  }, [track]);
}
