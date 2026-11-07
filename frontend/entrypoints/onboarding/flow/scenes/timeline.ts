import { useEffect, useState } from "react";

/**
 * Steps through phases on a timer and starts over after the last one. Paused,
 * it holds the current phase; given `still` (reduced motion) it shows that
 * phase and schedules nothing. Pass a module-level `durations` array so its
 * identity stays stable across renders.
 */
export function useLoopTimeline(
  durations: readonly number[],
  { paused, still }: { paused: boolean; still?: number },
): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (paused || still !== undefined) return;
    const timer = setTimeout(
      () => setPhase((current) => (current + 1) % durations.length),
      durations[phase],
    );
    return () => clearTimeout(timer);
  }, [durations, phase, paused, still]);
  return still ?? phase;
}
