import { useEffect, useRef, type RefObject } from "react";
import {
  advance,
  progressAt,
  stageForScroll,
  type Playback,
} from "./step-playback";

/** Longest frame gap played in one go, so a backgrounded tab doesn't leap. */
const MAX_FRAME_SECONDS = 0.1;

/**
 * Plays a pinned scene in stages. Scroll only chooses the stage;
 * `render(progress)` is then driven by time on animation frames until the
 * playhead reaches it, and `layout()` runs whenever the viewport size
 * changes. Both write styles directly so scrolling never re-renders React.
 */
export function useSteppedScene(
  track: RefObject<HTMLElement | null>,
  playback: Playback,
  render: (progress: number) => void,
  layout: () => void,
  reduced: boolean,
) {
  const renderRef = useRef(render);
  const layoutRef = useRef(layout);
  const reducedRef = useRef(reduced);
  renderRef.current = render;
  layoutRef.current = layout;
  reducedRef.current = reduced;
  useEffect(() => {
    let frame = 0;
    let lastTime = 0;
    const scrolledStage = () => {
      const el = track.current;
      if (!el) return 0;
      const screens = -el.getBoundingClientRect().top / window.innerHeight;
      return stageForScroll(playback, screens);
    };
    let target = scrolledStage();
    let playhead = target;
    const draw = () => renderRef.current(progressAt(playback, playhead));
    const tick = (now: number) => {
      frame = 0;
      const dt = lastTime
        ? Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS)
        : 0;
      lastTime = now;
      playhead = advance(playback, playhead, target, dt, reducedRef.current);
      draw();
      if (playhead !== target) frame = requestAnimationFrame(tick);
      else lastTime = 0;
    };
    const onScroll = () => {
      target = scrolledStage();
      if (!frame && playhead !== target) frame = requestAnimationFrame(tick);
    };
    // A new viewport height changes how many screens were scrolled.
    const relayout = () => {
      layoutRef.current();
      draw();
      onScroll();
    };
    relayout();
    document.fonts?.ready.then(relayout).catch(() => {});
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", relayout);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", relayout);
    };
  }, [track, playback]);
}
