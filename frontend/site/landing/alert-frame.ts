// Per-frame drawing for the deadline-alert scene (transform/opacity/class only).
import { applyMotion, back, clamp, ease, lerp, segment } from "./scroll";
import styles from "./AlertScene.module.css";

const NARROW = 900;
// Tick positions along the axis: one day before, two hours before, deadline.
const WIDE_STOPS = [0.5, 0.8, 1];
const NARROW_STOPS = [0.2, 0.55, 0.9];

export type AlertElements = {
  stage?: HTMLDivElement | null;
  caption?: HTMLDivElement | null;
  axis?: HTMLDivElement | null;
  clock?: HTMLImageElement | null;
  post?: HTMLDivElement | null;
  applied?: HTMLSpanElement | null;
  stamp?: HTMLImageElement | null;
  firstAlert?: HTMLDivElement | null;
  cancelled?: HTMLDivElement | null;
  character?: HTMLDivElement | null;
  ticks: (HTMLDivElement | null)[];
  labels: (HTMLDivElement | null)[];
};
export type AlertLayout = { narrow: boolean; postStartX: number };
type Seg = (start: number, end: number) => number;

export function measureAlertLayout(els: AlertElements): AlertLayout | null {
  const { stage, axis, post } = els;
  if (!stage || !axis || !post) return null;
  const w = stage.clientWidth;
  const narrow = w <= NARROW;
  const left = axis.offsetLeft;
  const xs = (narrow ? NARROW_STOPS : WIDE_STOPS).map(
    (s) => left + axis.offsetWidth * s,
  );
  els.ticks.forEach((t, i) => t && (t.style.left = `${xs[i]}px`));
  els.labels.forEach(
    (l, i) => l && (l.style.left = `${Math.min(xs[i], w - 50)}px`),
  );
  stage.style.setProperty("--axis-left", `${left}px`);
  if (els.clock) els.clock.style.left = `${xs[2] - 48}px`;
  if (els.stamp) els.stamp.style.left = `${left + post.offsetWidth - 60}px`;
  const toastWidth = els.firstAlert?.offsetWidth ?? 300;
  const place = (el: HTMLElement | null | undefined, x: number) => {
    if (el)
      el.style.left = `${clamp(x - toastWidth / 2, 10, w - toastWidth - 10)}px`;
  };
  // Narrow screens stack both notifications in one slot under the axis.
  place(els.firstAlert, narrow ? w / 2 : xs[0]);
  place(els.cancelled, narrow ? w / 2 : xs[1]);
  return { narrow, postStartX: w / 2 - post.offsetWidth / 2 - left };
}

/** The posting card flips in, then the axis and its ticks draw. */
function drawTimeline(els: AlertElements, L: AlertLayout, seg: Seg) {
  const intro = ease(seg(0, 0.18));
  applyMotion(els.caption, `translate3d(0,${(1 - intro) * 24}px,0)`, intro);
  const move = ease(seg(0.18, 0.36));
  applyMotion(
    els.post,
    `perspective(900px) translate3d(${lerp(L.postStartX, 0, move)}px,${lerp(-40, 0, move)}px,0) rotateX(${lerp(75, 0, intro)}deg) scale(${lerp(0.8, 1, intro)})`,
    seg(0, 0.08),
  );
  const draw = ease(seg(0.22, 0.42));
  applyMotion(els.axis, `scaleX(${draw})`, draw > 0 ? 1 : 0);
  [0.3, 0.36, 0.41].forEach((t0, i) => {
    const t = seg(t0, t0 + 0.04);
    applyMotion(els.ticks[i], `scale(${back(t)})`, t);
    applyMotion(els.labels[i], `translate3d(-50%,${(1 - t) * 8}px,0)`, t);
  });
  applyMotion(
    els.clock,
    `translate3d(0,${(1 - seg(0.38, 0.46)) * 30}px,0) rotate(${lerp(-14, 6, seg(0.38, 0.6))}deg)`,
    seg(0.38, 0.44),
  );
}

/**
 * A day before, the first notification pops; marking the posting applied
 * then cancels the alarm that has not fired yet. Returns whether the first
 * notification has fully arrived (the character rings its bell then).
 */
function drawNotifications(els: AlertElements, L: AlertLayout, seg: Seg) {
  const first = seg(0.46, 0.53);
  const fade = L.narrow ? 1 - seg(0.7, 0.74) : 1 - seg(0.84, 0.9) * 0.5;
  applyMotion(
    els.firstAlert,
    `translate3d(0,${(1 - first) * 20}px,0) scale(${lerp(0.6, 1, back(first))})`,
    first * fade,
  );
  applyMotion(
    els.character,
    `translate3d(0,${(1 - ease(seg(0.42, 0.52))) * 110}%,0)`,
  );
  const stamped = seg(0.62, 0.7);
  applyMotion(
    els.stamp,
    `translate3d(0,${(1 - stamped) * -80}px,0) scale(${lerp(1.8, 1, back(stamped))}) rotate(${lerp(-30, -8, stamped)}deg)`,
    stamped,
  );
  if (els.applied) els.applied.style.opacity = stamped >= 1 ? "1" : "0";
  const cancel = seg(0.74, 0.84);
  els.labels[1]?.classList.toggle(styles.cancelled, cancel > 0.5);
  els.ticks[1]?.classList.toggle(styles.tickCancelled, cancel > 0.5);
  applyMotion(
    els.cancelled,
    `translate3d(0,${(1 - cancel) * 20}px,0) scale(${lerp(0.7, 1, back(cancel))})`,
    cancel,
  );
  return first >= 1;
}

/** Restarts the bell-ringing animation on the character. */
export function ringBell(character: HTMLElement) {
  character.classList.remove(styles.ring);
  void character.offsetWidth;
  character.classList.add(styles.ring);
}

export function drawAlertFrame(
  els: AlertElements,
  L: AlertLayout,
  p: number,
  reduced: boolean,
) {
  const seg: Seg = (a, b) => segment(p, a, b, reduced);
  drawTimeline(els, L, seg);
  return drawNotifications(els, L, seg);
}
