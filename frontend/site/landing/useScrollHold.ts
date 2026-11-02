import { useEffect, useRef, type RefObject } from "react";

const DOWN_KEYS = new Set(["ArrowDown", "PageDown", "End"]);
const NUDGE_INTERVAL_MS = 600;

/** True when the held section has reached the top and still fills most of the screen. */
export function isHolding(
  rect: { top: number; bottom: number },
  viewportHeight: number,
) {
  return rect.top <= 4 && rect.bottom > viewportHeight * 0.6;
}

/**
 * Stops downward scrolling (wheel, touch, keyboard) once `section` reaches the
 * top of the screen, until `active` turns false. Upward scrolling always works
 * and the scrollbar is left alone. Each blocked attempt calls `onBlocked`, at
 * most every 600ms.
 */
export function useScrollHold(
  section: RefObject<HTMLElement | null>,
  active: boolean,
  onBlocked: () => void,
) {
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;
  useEffect(() => {
    if (!active) return;
    let lastNudge = 0;
    let touchY = 0;
    const holding = () => {
      const el = section.current;
      return el
        ? isHolding(el.getBoundingClientRect(), window.innerHeight)
        : false;
    };
    const block = (event: Event) => {
      event.preventDefault();
      const top = section.current?.getBoundingClientRect().top ?? 0;
      if (top < 0)
        window.scrollTo({ top: window.scrollY + top, behavior: "instant" });
      const now = Date.now();
      if (now - lastNudge < NUDGE_INTERVAL_MS) return;
      lastNudge = now;
      blocked.current();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0 && holding()) block(e);
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? touchY;
      if (touchY - y > 0 && holding()) block(e);
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const down =
        DOWN_KEYS.has(e.key) ||
        (e.key === " " && !target?.closest?.("button,a,input,textarea"));
      if (down && holding()) block(e);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, section]);
}
