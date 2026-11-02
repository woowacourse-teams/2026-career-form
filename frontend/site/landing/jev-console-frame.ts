// Per-frame drawing for the JEV console: analysis log, section classes,
// candidate cloud, confidence gauge and the result, plus the glowing lines
// that tie the form to the console.
import type { AiElements, AiLayout, Seg } from "./ai-frame";
import {
  ANALYSIS_RESULT,
  CONFIDENCE_EXAMPLES,
  EDUCATION_ITEMS,
  FIELD_GROUPS,
  JEV_STEPS,
  PICKED_ITEM,
  PROFILE_ITEMS,
  percent,
  stepAt,
} from "./jev";
import { applyMotion as set, back, ease, lerp } from "./scroll";

type Point = { x: number; y: number };
export type ConsoleGeometry = { grid: Point[]; list: Point[] };
type Anchors = {
  formRight: number;
  consoleLeft: number;
  groupMid: number[];
  focusY: number;
};

const within = (el: Element | null | undefined, root: HTMLElement): Point => {
  let x = 0;
  let y = 0;
  let node = el as HTMLElement | null;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
};

/** Draws the four connection curves; jsdom has no path length, so guard it. */
function placeLines(els: AiElements, ends: number[][]) {
  ends.forEach(([x1, y1, x2, y2], k) => {
    const path = els.lines[k];
    const end = els.lineEnds[k];
    if (!path) return;
    path.setAttribute(
      "d",
      `M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`,
    );
    const length =
      typeof path.getTotalLength === "function" ? path.getTotalLength() : 1;
    path.dataset.length = String(length);
    path.style.strokeDasharray = String(length);
    end?.setAttribute("cx", String(x2));
    end?.setAttribute("cy", String(y2));
  });
}

/** Lays out the candidate cloud and the connection lines. */
export function measureConsole(
  els: AiElements,
  stage: HTMLElement,
  a: Anchors,
): ConsoleGeometry {
  const width = els.cloudBox?.clientWidth ?? 300;
  const cols = 6;
  const cell = (width - (cols - 1) * 6) / cols;
  els.cloud.forEach((c) => (c.style.width = `${cell}px`));
  const grid = els.cloud.map((_, i) => ({
    x: (i % cols) * (cell + 6),
    y: Math.floor(i / cols) * 30 + 86,
  }));
  const list = els.cloud.map((c) => {
    const j = EDUCATION_ITEMS.indexOf(c.textContent ?? "");
    return {
      x: width / 2 + ((j % 3) - 1) * (cell * 1.3 + 16) - cell / 2,
      y: 4 + Math.floor(j / 3) * 38,
    };
  });
  const classY = els.classes.map((c) => within(c, stage).y + 10);
  const cloudY = within(els.cloudBox, stage).y + 40;
  placeLines(els, [
    ...FIELD_GROUPS.map((_, gi) => [
      a.formRight,
      a.groupMid[gi],
      a.consoleLeft,
      classY[gi],
    ]),
    [a.formRight, a.focusY, a.consoleLeft, cloudY],
  ]);
  return { grid, list };
}

const visible = (seg: Seg, from: number, to: number) =>
  seg(from, from + 0.015) * (to >= 1 ? 1 : 1 - seg(to - 0.015, to));

function drawViews(els: AiElements, seg: Seg) {
  const windows = [
    [stepAt(0, 0.8), JEV_STEPS[2]],
    [JEV_STEPS[2], JEV_STEPS[3]],
    [JEV_STEPS[3], JEV_STEPS[4]],
    [JEV_STEPS[4], JEV_STEPS[5]],
    [JEV_STEPS[5], 1],
  ];
  els.views.forEach((v, i) =>
    set(v, "none", visible(seg, windows[i][0], windows[i][1])),
  );
  els.logs.forEach((li, i) => {
    const t = seg(stepAt(1, 0.05 + i * 0.25), stepAt(1, 0.2 + i * 0.25));
    set(li, `translate3d(${(1 - t) * -10}px,0,0)`, t);
  });
  FIELD_GROUPS.forEach((g, gi) => {
    const t = ease(
      seg(stepAt(2, 0.1 + gi * 0.15), stepAt(2, 0.45 + gi * 0.15)),
    );
    const row = els.classes[gi];
    const bar = row?.querySelector<HTMLElement>("u");
    const value = row?.querySelector<HTMLElement>("b");
    if (bar) bar.style.transform = `scaleX(${t * g.confidence})`;
    if (value) value.textContent = `확신 ${percent(t * g.confidence)}`;
  });
}

/** Step 4: 42 profile items shrink to the six education candidates. */
function drawCloud(els: AiElements, L: AiLayout, p: number, seg: Seg) {
  const n = ease(seg(stepAt(3, 0.35), stepAt(3, 0.75)));
  els.cloud.forEach((chip, i) => {
    const appear = seg(
      stepAt(3, 0.02 + i * 0.003),
      stepAt(3, 0.12 + i * 0.003),
    );
    const g = L.grid[i] ?? { x: 0, y: 0 };
    const name = chip.textContent ?? "";
    if (EDUCATION_ITEMS.includes(name)) {
      const l = L.list[i] ?? g;
      set(
        chip,
        `translate3d(${lerp(g.x, l.x, n)}px,${lerp(g.y, l.y, n)}px,0) scale(${lerp(0.6, 1, appear) * lerp(1, 1.3, n)})`,
        appear,
      );
    } else {
      set(
        chip,
        `translate3d(${g.x}px,${g.y + n * 14}px,0) scale(${lerp(0.6, 1, appear) * lerp(1, 0.85, n)})`,
        appear * lerp(1, 0.14, n),
      );
    }
    if (name === PICKED_ITEM) chip.dataset.picked = String(p >= stepAt(3, 0.8));
  });
  const total = PROFILE_ITEMS.length;
  if (els.candTo)
    els.candTo.textContent = String(
      Math.round(lerp(total, EDUCATION_ITEMS.length, n)),
    );
}

/** Step 5 gauge and step 6 result: time, comparison bars, figures. */
function drawScores(els: AiElements, seg: Seg, clock: number) {
  CONFIDENCE_EXAMPLES.forEach((_, j) => {
    const t = seg(stepAt(4, 0.2 + j * 0.18), stepAt(4, 0.4 + j * 0.18));
    set(
      els.pins[j],
      `translate3d(0,${(1 - t) * -14}px,0) scale(${back(t)})`,
      t,
    );
    set(els.marks[j], `translate3d(${(1 - t) * 10}px,0,0)`, t);
  });
  if (els.clock) els.clock.textContent = `${clock.toFixed(1)}초`;
  if (els.bigNum) els.bigNum.textContent = clock.toFixed(1);
  const ratio = ANALYSIS_RESULT.seconds / ANALYSIS_RESULT.previousSeconds;
  if (els.barOld)
    els.barOld.style.transform = `scaleX(${ease(seg(stepAt(5, 0.3), stepAt(5, 0.6)))})`;
  if (els.barNew)
    els.barNew.style.transform = `scaleX(${ratio * ease(seg(stepAt(5, 0.6), stepAt(5, 0.85)))})`;
  const k = seg(stepAt(5, 0.75), stepAt(5, 0.95));
  set(els.kpis, `translate3d(0,${(1 - k) * 10}px,0)`, k);
}

function drawLines(els: AiElements, seg: Seg, step: number) {
  els.lines.forEach((path, k) => {
    const group = k < 3;
    const t = group
      ? seg(stepAt(2, 0.05 + k * 0.12), stepAt(2, 0.4 + k * 0.12))
      : seg(stepAt(3, 0.05), stepAt(3, 0.35));
    const live = group ? step === 2 : step === 3;
    const fade = group
      ? 1 - seg(stepAt(2, 0.92), JEV_STEPS[3])
      : 1 - seg(stepAt(3, 0.92), JEV_STEPS[4]);
    const length = Number(path.dataset.length ?? 1);
    path.style.strokeDashoffset = String(length * (1 - t));
    path.style.opacity = String(live ? fade : 0);
    const end = els.lineEnds[k];
    if (end) end.style.opacity = String(live && t >= 1 ? fade : 0);
  });
}

export function drawConsole(
  els: AiElements,
  L: AiLayout,
  p: number,
  seg: Seg,
  step: number,
  clock: number,
) {
  drawViews(els, seg);
  drawCloud(els, L, p, seg);
  drawScores(els, seg, clock);
  drawLines(els, seg, step);
}
