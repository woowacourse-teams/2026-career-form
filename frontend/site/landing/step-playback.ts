// Stepped playback for pinned scenes. Scrolling only picks which stage should
// be on screen; the scene then plays toward that stage in real time, so it
// never freezes halfway through a step.
//
// Playback runs in stage units `u`: stage s is the scene resting at
// `rests[s]`, and fractions are a stage partway through.
import { clamp, lerp } from "./scroll";

/** Rewinding to the previous stage runs this much faster. */
export const REVERSE_RATE = 1.5;
/** Speed for finishing a stage the visitor has already scrolled past. */
export const CATCH_UP_RATE = 3;

export type Playback = {
  /** Scene progress (0..1) at each stage's rest stop; `rests[0]` is the start. */
  rests: readonly number[];
  /** Screens scrolled into the track (negative: still below) that call up stage s; `triggers[0]` is unused. */
  triggers: readonly number[];
  /** Seconds to play from stage s to s+1. */
  seconds: readonly number[];
};

/** Triggers for stages 1..count: the first at `first` screens, then one every `every`. */
export const evenTriggers = (first: number, every: number, count: number) => [
  -Infinity,
  ...Array.from({ length: count }, (_, i) => first + i * every),
];

const lastStage = (pb: Playback) => pb.rests.length - 1;

/** The stage to show after scrolling `screens` viewport heights into the track. */
export function stageForScroll(pb: Playback, screens: number) {
  let stage = 0;
  for (let s = 1; s <= lastStage(pb); s++)
    if (screens >= pb.triggers[s]) stage = s;
  return stage;
}

/** Scene progress for a playhead at stage position `u`. */
export function progressAt(pb: Playback, u: number) {
  const last = lastStage(pb);
  const pos = clamp(u, 0, last);
  const s = Math.min(Math.floor(pos), last - 1);
  return lerp(pb.rests[s], pb.rests[s + 1], pos - s);
}

/**
 * Moves the playhead `u` toward stage `target` over `dt` seconds. The stage
 * being played finishes at normal speed when it is the target (rewinds a bit
 * faster), or fast when the target already lies beyond it. Stages in between
 * are skipped. Reduced motion jumps straight to the target.
 */
export function advance(
  pb: Playback,
  u: number,
  target: number,
  dt: number,
  reduced: boolean,
): number {
  if (reduced || u === target) return target;
  const dir = Math.sign(target - u);
  if (Number.isInteger(u) && Math.abs(target - u) > 1)
    return advance(pb, target - dir, target, dt, reduced);
  const end = dir > 0 ? Math.floor(u) + 1 : Math.ceil(u) - 1;
  const rate = end !== target ? CATCH_UP_RATE : dir > 0 ? 1 : REVERSE_RATE;
  const seconds = pb.seconds[dir > 0 ? end - 1 : end];
  const next = u + (dir * rate * dt) / seconds;
  return dir > 0 ? Math.min(next, end) : Math.max(next, end);
}
