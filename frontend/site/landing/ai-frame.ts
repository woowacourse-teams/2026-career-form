// Per-frame drawing for the AI scene (hero + seven JEV steps). Everything here
// writes transform, opacity, a class, a data attribute or a short text, so
// scrolling never re-renders React.
import {
  drawConsole,
  measureConsole,
  type ConsoleGeometry,
} from "./jev-console-frame";
import {
  FIELD_GROUPS,
  FOCUS_FIELD,
  JEV_STATUS,
  JEV_STEPS,
  groupOf,
  stepAt,
} from "./jev";
import { reviewCount, sampleFields } from "./sample-form";
import {
  applyMotion as set,
  clamp,
  ease,
  lerp,
  offsetWithin,
  segment,
} from "./scroll";
import formStyles from "./SampleForm.module.css";
import styles from "./AiScene.module.css";

const NARROW = 900;
type Point = { x: number; y: number };
export type Seg = (start: number, end: number) => number;

export type AiElements = {
  root?: HTMLElement | null;
  stage?: HTMLElement | null;
  hero?: HTMLElement | null;
  form?: HTMLElement | null;
  rowsBox?: HTMLElement | null;
  scan?: HTMLElement | null;
  status?: HTMLElement | null;
  statusLabel?: HTMLElement | null;
  statusCount?: HTMLElement | null;
  summary?: HTMLElement | null;
  dots?: HTMLElement | null;
  dotGrid?: HTMLElement | null;
  sparkle?: HTMLElement | null;
  heroCharacter?: HTMLElement | null;
  inspector?: HTMLElement | null;
  console?: HTMLElement | null;
  flip?: HTMLElement | null;
  cursor?: HTMLElement | null;
  ghost?: HTMLElement | null;
  clock?: HTMLElement | null;
  candTo?: HTMLElement | null;
  bigNum?: HTMLElement | null;
  barOld?: HTMLElement | null;
  barNew?: HTMLElement | null;
  kpis?: HTMLElement | null;
  cloudBox?: HTMLElement | null;
  captions: HTMLElement[];
  rows: HTMLElement[];
  flies: HTMLElement[];
  groups: HTMLElement[];
  brackets: HTMLElement[];
  views: HTMLElement[];
  logs: HTMLElement[];
  classes: HTMLElement[];
  cloud: HTMLElement[];
  pins: HTMLElement[];
  marks: HTMLElement[];
  lines: SVGPathElement[];
  lineEnds: SVGCircleElement[];
};

export type AiLayout = ConsoleGeometry & {
  narrow: boolean;
  rowHeight: number;
  rowTop: number[];
  shift: number[];
  rowsHeight: number;
  heroDx: number;
  heroDy: number;
  source: Point;
  targets: Point[];
  button: { x: number; y: number; w: number; h: number };
};

const NAMED = [
  "stage",
  "hero",
  "form",
  "rowsBox",
  "scan",
  "status",
  "statusLabel",
  "statusCount",
  "summary",
  "dots",
  "dotGrid",
  "sparkle",
  "heroCharacter",
  "inspector",
  "console",
  "flip",
  "cursor",
  "ghost",
  "clock",
  "candTo",
  "bigNum",
  "barOld",
  "barNew",
  "kpis",
  "cloudBox",
] as const;

/** Finds the scene's parts by their `data-ai` markers. */
export function collectAiElements(root: HTMLElement): AiElements {
  const all = <T extends Element = HTMLElement>(attr: string) => [
    ...root.querySelectorAll<T>(`[data-ai-${attr}]`),
  ];
  const named = Object.fromEntries(
    NAMED.map((k) => [k, root.querySelector<HTMLElement>(`[data-ai="${k}"]`)]),
  );
  return {
    ...named,
    root,
    captions: all("caption"),
    rows: [
      ...root.querySelectorAll<HTMLElement>('[data-ai="form"] [data-state]'),
    ],
    flies: all("fly"),
    groups: all("group"),
    brackets: all("bracket"),
    views: all("view"),
    logs: all("log"),
    classes: all("class"),
    cloud: all("chip"),
    pins: all("pin"),
    marks: all("mark"),
    lines: all<SVGPathElement>("line"),
    lineEnds: all<SVGCircleElement>("line-end"),
  };
}

/** Writes the stage's size variables and returns the measured frame. */
function sizeStage(stage: HTMLElement, form: HTMLElement) {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const narrow = w <= NARROW;
  const rowHeight = clamp(Math.round(h * (narrow ? 0.038 : 0.04)), 28, 36);
  const gap = Math.round(rowHeight * 0.85);
  const captionsEnd = Math.max(20, w / 2 - 560) + Math.min(300, w * 0.24);
  const fw = narrow ? Math.min(w - 40, 420) : clamp(w * 0.27, 320, 380);
  const fx = narrow ? (w - fw) / 2 : captionsEnd + 40;
  const cx = fx + fw + 56;
  const sizes = { fx, fw, cx, cw: clamp(w * 0.25, 300, 350) };
  for (const [k, v] of Object.entries(sizes))
    stage.style.setProperty(`--${k}`, `${v}px`);
  form.style.setProperty("--row-height", `${rowHeight}px`);
  form.style.setProperty("--row-gap", `${Math.round(rowHeight * 0.22)}px`);
  form.style.setProperty("--group-gap", `${gap}px`);
  const fh = form.offsetHeight;
  const ch = Math.max(fh, 540);
  const fy = narrow
    ? Math.max(h * 0.28, h - fh - 60)
    : Math.max(100, (h - fh) / 2 + 16);
  stage.style.setProperty("--fy", `${fy}px`);
  stage.style.setProperty("--fh", `${fh}px`);
  stage.style.setProperty("--ch", `${ch}px`);
  return { w, h, narrow, rowHeight, gap, fx, fy, fw, cx, ch };
}

/** Places group labels and brackets in the gaps the split opens. */
function placeGroups(
  els: AiElements,
  rowTop: number[],
  rh: number,
  gap: number,
) {
  FIELD_GROUPS.forEach((g, gi) => {
    const head = els.groups[gi];
    const bracket = els.brackets[gi];
    if (head)
      head.style.top = `${rowTop[g.from] + gi * gap + (gap - 22) / 2 - 2}px`;
    if (!bracket) return;
    bracket.style.top = `${rowTop[g.from] + (gi + 1) * gap - 5}px`;
    bracket.style.height = `${rowTop[g.to] + rh - rowTop[g.from] + 10}px`;
  });
}

/** Sizes the form for the screen and records where groups and values land. */
export function measureAiLayout(els: AiElements): AiLayout | null {
  const { stage, form, rowsBox, ghost } = els;
  if (!stage || !form || !rowsBox || !ghost) return null;
  const s = sizeStage(stage, form);
  const base = offsetWithin(rowsBox, stage);
  const rowTop = els.rows.map((r) => r.offsetTop);
  const shift = els.rows.map((_, i) => (groupOf(i) + 1) * s.gap);
  placeGroups(els, rowTop, s.rowHeight, s.gap);
  const fieldAt = (i: number) => ({
    x:
      base.x +
      els.rows[i].offsetLeft +
      ((els.rows[i].children[1] as HTMLElement | undefined)?.offsetLeft ?? 0),
    y: base.y + rowTop[i] + shift[i],
  });
  const targets = sampleFields.flatMap((f, i) =>
    f.value
      ? [{ x: fieldAt(i).x + 6, y: fieldAt(i).y + (s.rowHeight - 30) / 2 }]
      : [],
  );
  const geometry = measureConsole(els, stage, {
    formRight: s.fx + s.fw + 4,
    consoleLeft: s.cx,
    groupMid: FIELD_GROUPS.map(
      (g, gi) =>
        base.y +
        rowTop[g.from] +
        (gi + 1) * s.gap +
        (rowTop[g.to] + s.rowHeight - rowTop[g.from]) / 2,
    ),
    focusY: fieldAt(FOCUS_FIELD).y + s.rowHeight / 2,
  });
  const b = offsetWithin(ghost, stage);
  return {
    ...geometry,
    narrow: s.narrow,
    rowHeight: s.rowHeight,
    rowTop,
    shift,
    rowsHeight: (rowTop[rowTop.length - 1] ?? 0) + s.rowHeight,
    heroDx: s.narrow ? 0 : s.w * 0.56 - s.fx - s.fw / 2,
    heroDy: s.narrow ? s.h * 0.42 : s.h * 0.05,
    source: s.narrow
      ? { x: s.fx + 20, y: s.fy - 40 }
      : { x: s.cx + 24, y: s.fy + s.ch * 0.42 },
    targets,
    button: { x: b.x, y: b.y, w: ghost.offsetWidth, h: ghost.offsetHeight },
  };
}

export function currentStep(p: number) {
  let step = -1;
  for (let i = 0; i < 7; i++) if (p >= JEV_STEPS[i]) step = i;
  return step;
}

export function statusCountText(step: number, clock: number) {
  return step === 6 ? `확인 필요 ${reviewCount}` : `${clock.toFixed(1)}초`;
}

/** Hero leaves, the tilted card flattens and the side panel slides in. */
function drawHero(els: AiElements, L: AiLayout, seg: Seg) {
  const h = ease(seg(0, JEV_STEPS[0]));
  const lift = -60 * seg(0.01, 0.08);
  set(
    els.hero,
    L.narrow
      ? `translate3d(0,${lift}px,0)`
      : `translate3d(0,calc(-50% + ${lift}px),0)`,
    1 - seg(0.01, 0.07),
  );
  set(
    els.form,
    `perspective(1400px) translate3d(${lerp(L.heroDx, 0, h)}px,${lerp(L.heroDy, 0, h)}px,0) rotateX(${lerp(26, 0, h)}deg) rotateZ(${lerp(-9, 0, h)}deg) scale(${lerp(L.narrow ? 0.7 : 0.8, 1, h)})`,
  );
  set(
    els.heroCharacter,
    `translate3d(${lerp(0, 40, h)}px,${lerp(0, 120, h)}%,0)`,
    1 - seg(0.04, 0.09),
  );
  set(
    els.inspector,
    `translate3d(0,${(1 - ease(seg(stepAt(1, 0), stepAt(1, 0.4)))) * 110}%,0)`,
  );
  set(
    els.sparkle,
    `translate3d(${lerp(L.heroDx + 30, 0, h)}px,${lerp(L.heroDy - 30, 0, h)}px,0) scale(${lerp(1.3, 1, h)})`,
  );
  const enter = ease(seg(0.06, JEV_STEPS[0] + 0.02));
  set(els.console, `translate3d(${(1 - enter) * 80}px,0,0)`, enter);
}

/** Step 1: a cursor presses 자동 기입 and the panel flips into the console. */
function drawPress(els: AiElements, L: AiLayout, seg: Seg) {
  const b = L.button;
  const show =
    seg(stepAt(0, 0.05), stepAt(0, 0.15)) *
    (1 - seg(stepAt(0, 0.6), stepAt(0, 0.7)));
  const move = ease(seg(stepAt(0, 0.1), stepAt(0, 0.42)));
  const press = seg(stepAt(0, 0.42), stepAt(0, 0.52));
  const x = lerp(b.x + b.w * 0.75 + 90, b.x + b.w * 0.62, move);
  const y = lerp(b.y + 120, b.y + b.h * 0.55, move);
  set(
    els.cursor,
    `translate3d(${x}px,${y}px,0) scale(${press > 0 && press < 1 ? 0.82 : 1})`,
    show,
  );
  if (els.ghost) els.ghost.dataset.pressed = String(press > 0);
  const f = ease(seg(stepAt(0, 0.55), stepAt(0, 0.92)));
  set(
    els.flip,
    `rotateY(${f * 180}deg) scale(${1 + Math.sin(Math.PI * f) * 0.04})`,
  );
}

/** Captions, progress dots, the status pill, the dot grid and the summary. */
function drawNarration(els: AiElements, seg: Seg, step: number, clock: number) {
  els.captions.forEach((cap, i) => {
    const enter = seg(JEV_STEPS[i], JEV_STEPS[i] + 0.02);
    const leave =
      i === 6 ? 1 : 1 - seg(JEV_STEPS[i + 1] - 0.02, JEV_STEPS[i + 1]);
    set(
      cap,
      `translate3d(0,${(1 - enter) * 18 - (1 - leave) * 18}px,0)`,
      enter * leave,
    );
  });
  els.dots
    ?.querySelectorAll("i")
    .forEach((d, i) => d.classList.toggle(styles.on, i === step));
  if (els.dots)
    els.dots.style.opacity = String(seg(JEV_STEPS[0], JEV_STEPS[0] + 0.03));
  if (els.status)
    els.status.style.opacity = String(seg(stepAt(0, 0.55), stepAt(0, 0.7)));
  if (els.statusLabel)
    els.statusLabel.textContent = `JEV · ${JEV_STATUS[Math.max(step, 0)]}`;
  if (els.statusCount)
    els.statusCount.textContent = statusCountText(step, clock);
  const grid =
    seg(stepAt(0, 0.6), JEV_STEPS[1]) *
    (1 - 0.6 * seg(JEV_STEPS[6], JEV_STEPS[6] + 0.04));
  if (els.dotGrid) els.dotGrid.style.opacity = String(grid);
  const s = seg(stepAt(6, 0.1), stepAt(6, 0.35));
  set(els.summary, `translate3d(0,${(1 - s) * 12}px,0)`, s);
}

function drawFly(
  fly: HTMLElement | undefined,
  L: AiLayout,
  index: number,
  t: number,
) {
  const target = L.targets[index];
  if (!fly || !target) return;
  const e = ease(t);
  const x = lerp(L.source.x, target.x, e);
  const y = lerp(L.source.y, target.y, e) - Math.sin(Math.PI * e) * 60;
  set(
    fly,
    `translate3d(${x}px,${y}px,0) scale(${lerp(0.7, 1, Math.min(1, t * 4))})`,
    t > 0 && t < 1 ? Math.min(1, t * 6, (1 - t) * 8) : 0,
  );
}

/** Step 6 for one known field: its value flies in from the console. */
function drawFill(
  els: AiElements,
  L: AiLayout,
  seg: Seg,
  row: HTMLElement,
  fill: number,
) {
  const start = stepAt(5, 0.02 + fill * 0.08);
  const t = seg(start, start + (JEV_STEPS[6] - JEV_STEPS[5]) * 0.18);
  drawFly(els.flies[fill], L, fill, t);
  const value = row.querySelector<HTMLElement>("[data-value]");
  if (value) value.style.opacity = String(segment(t, 0.85, 1));
  row.classList.toggle(formStyles.done, t >= 1);
  return t;
}

/** One field through every step: read, shift into its group, rate, fill. */
function drawField(
  els: AiElements,
  L: AiLayout,
  p: number,
  seg: Seg,
  i: number,
  fill: number,
) {
  const row = els.rows[i];
  const step = currentStep(p);
  const scan = seg(stepAt(1, 0), stepAt(1, 0.45));
  const split = ease(seg(stepAt(1, 0.5), stepAt(1, 0.9)));
  const dim =
    seg(stepAt(3, 0), stepAt(3, 0.1)) *
    (1 - seg(JEV_STEPS[4], JEV_STEPS[4] + 0.02));
  const read =
    p >= stepAt(1, 0) &&
    (scan >= 1 || L.rowTop[i] + L.rowHeight / 2 < scan * L.rowsHeight);
  row.classList.toggle(formStyles.seen, read);
  row.classList.toggle(formStyles.focus, step === 3 && i === FOCUS_FIELD);
  set(
    row,
    `translate3d(0,${L.shift[i] * split}px,0)`,
    i === FOCUS_FIELD ? 1 : 1 - 0.65 * dim,
  );
  const known = Boolean(sampleFields[i].value);
  const filled = known ? drawFill(els, L, seg, row, fill) : 0;
  if (!known) row.classList.toggle(formStyles.review, step === 6);
  const rate = seg(stepAt(4, 0.05 + i * 0.04), stepAt(4, 0.2 + i * 0.04));
  const keep = step === 6 && !known ? 0 : 1;
  set(
    row.querySelector<HTMLElement>("[data-ai-confidence]"),
    `translate3d(${(1 - rate) * 8}px,0,0)`,
    rate * (1 - filled) * keep,
  );
}

function drawFields(els: AiElements, L: AiLayout, p: number, seg: Seg) {
  const scan = seg(stepAt(1, 0), stepAt(1, 0.45));
  set(
    els.scan,
    `translate3d(0,${scan * L.rowsHeight}px,0)`,
    scan > 0 && scan < 1 ? 1 : 0,
  );
  let fill = 0;
  els.rows.forEach((_, i) => {
    drawField(els, L, p, seg, i, fill);
    if (sampleFields[i].value) fill++;
  });
  const step = currentStep(p);
  FIELD_GROUPS.forEach((_, gi) => {
    set(els.groups[gi], "none", seg(stepAt(1, 0.7), stepAt(1, 0.95)));
    const bracket =
      seg(stepAt(1, 0.75), stepAt(1, 1)) * (p >= JEV_STEPS[5] ? 0.45 : 1);
    set(els.brackets[gi], "none", bracket);
    els.brackets[gi]?.classList.toggle(styles.lit, step === 2);
    const pill = els.groups[gi]?.querySelector<HTMLElement>("b");
    if (pill)
      pill.style.opacity = String(
        seg(stepAt(2, 0.3 + gi * 0.15), stepAt(2, 0.5 + gi * 0.15)),
      );
  });
}

export function drawAiFrame(
  els: AiElements,
  L: AiLayout,
  p: number,
  reduced: boolean,
) {
  const seg: Seg = (a, b) => segment(p, a, b, reduced);
  const step = currentStep(p);
  const clock = 4.2 * seg(stepAt(0, 0.6), stepAt(5, 0.8));
  drawHero(els, L, seg);
  drawPress(els, L, seg);
  drawNarration(els, seg, step, clock);
  drawConsole(els, L, p, seg, step, clock);
  drawFields(els, L, p, seg);
}
