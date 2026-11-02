// Per-frame drawing for the AI scene. Everything here writes transform,
// opacity, a class or a short text directly to the DOM, so scrolling never
// re-renders React.
import { filledCount, reviewCount, sampleFields } from "./sample-form";
import { applyMotion, back, clamp, ease, lerp, segment } from "./scroll";
import formStyles from "./SampleForm.module.css";
import styles from "./AiScene.module.css";

/** Scroll boundaries inside the pinned track: hero, then four AI steps. */
export const STEPS = [0.16, 0.37, 0.58, 0.79, 1];
const NARROW = 900;
export const STATUS_TEXT = [
  "AI가 지원서를 읽는 중",
  "칸의 뜻을 파악하는 중",
  "프로필에서 값을 고르는 중",
  "분석 완료",
];

export type AiElements = {
  stage?: HTMLDivElement | null;
  hero?: HTMLDivElement | null;
  form?: HTMLDivElement | null;
  rowsBox?: HTMLDivElement | null;
  scan?: HTMLDivElement | null;
  status?: HTMLDivElement | null;
  statusLabel?: HTMLSpanElement | null;
  statusCount?: HTMLElement | null;
  summary?: HTMLDivElement | null;
  dots?: HTMLDivElement | null;
  profile?: HTMLDivElement | null;
  sparkle?: HTMLDivElement | null;
  heroCharacter?: HTMLDivElement | null;
  inspector?: HTMLDivElement | null;
  captions: (HTMLDivElement | null)[];
  flies: (HTMLSpanElement | null)[];
  rows: (HTMLDivElement | null)[];
};

export type AiLayout = {
  narrow: boolean;
  heroDx: number;
  heroDy: number;
  rowsHeight: number;
  from: { x: number; y: number };
  targets: { x: number; y: number }[];
};

type Seg = (start: number, end: number) => number;

/** Sum offsets up to `root`; offsets ignore transforms, unlike rects. */
function offsetWithin(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/** Sizes the form to the screen and records where values fly from and to. */
export function measureAiLayout(els: AiElements): AiLayout | null {
  const { stage, form, rowsBox, profile } = els;
  if (!stage || !form || !rowsBox || !profile) return null;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const narrow = w <= NARROW;
  const rowHeight = clamp(Math.round(h * (narrow ? 0.042 : 0.048)), 30, 42);
  const formWidth = narrow ? Math.min(w - 40, 420) : clamp(w * 0.32, 340, 420);
  const captionsEnd = Math.max(20, w / 2 - 560) + Math.min(330, w * 0.28);
  const formX = narrow
    ? (w - formWidth) / 2
    : Math.max(captionsEnd + 60, w * 0.36);
  stage.style.setProperty("--fx", `${formX}px`);
  stage.style.setProperty("--fw", `${formWidth}px`);
  form.style.setProperty("--row-height", `${rowHeight}px`);
  form.style.setProperty("--row-gap", `${Math.round(rowHeight * 0.2)}px`);
  const formHeight = form.offsetHeight;
  const formY = narrow
    ? Math.max(h * 0.3, h - formHeight - 70)
    : Math.max(110, (h - formHeight) / 2 + 10);
  stage.style.setProperty("--fy", `${formY}px`);
  stage.style.setProperty("--fh", `${formHeight}px`);
  const from = offsetWithin(profile, stage);
  return {
    narrow,
    heroDx: narrow ? 0 : w * 0.6 - formX - formWidth / 2,
    heroDy: narrow ? h * 0.42 : h * 0.06,
    rowsHeight: rowsBox.offsetHeight,
    from: {
      x: from.x + profile.offsetWidth * 0.5,
      y: from.y + profile.offsetHeight * 0.4,
    },
    targets: els.rows
      .filter((_, i) => sampleFields[i]?.value)
      .map((row) => {
        const input = row?.children[1] as HTMLElement | undefined;
        if (!input) return { x: 0, y: 0 };
        const at = offsetWithin(input, stage);
        return { x: at.x + 6, y: at.y + (input.offsetHeight - 30) / 2 };
      }),
  };
}

export function currentStep(p: number) {
  let step = -1;
  for (let i = 0; i < 4; i++) if (p >= STEPS[i]) step = i;
  return step;
}

/** The hero copy leaves while the tilted card flattens into the stage. */
function drawHero(els: AiElements, L: AiLayout, seg: Seg) {
  const h = ease(seg(0, STEPS[0]));
  const lift = -60 * seg(0.02, 0.12);
  applyMotion(
    els.hero,
    L.narrow
      ? `translate3d(0,${lift}px,0)`
      : `translate3d(0,calc(-50% + ${lift}px),0)`,
    1 - seg(0.02, 0.11),
  );
  applyMotion(
    els.form,
    `perspective(1400px) translate3d(${lerp(L.heroDx, 0, h)}px,${lerp(L.heroDy, 0, h)}px,0) rotateX(${lerp(26, 0, h)}deg) rotateZ(${lerp(-9, 0, h)}deg) scale(${lerp(L.narrow ? 0.7 : 0.8, 1, h)})`,
  );
  applyMotion(
    els.heroCharacter,
    `translate3d(${lerp(0, 40, h)}px,${lerp(0, 120, h)}%,0)`,
    1 - seg(0.06, 0.14),
  );
  applyMotion(
    els.inspector,
    `translate3d(0,${(1 - ease(seg(0.13, 0.2))) * 110}%,0)`,
  );
  applyMotion(
    els.sparkle,
    `translate3d(${lerp(L.heroDx + 30, 0, h)}px,${lerp(L.heroDy - 30, 0, h)}px,0) scale(${lerp(1.3, 1, h)})`,
  );
  // The profile card arrives just before values start flying out of it.
  const pin = ease(seg(STEPS[1] + 0.12, STEPS[2]));
  applyMotion(
    els.profile,
    `translate3d(${lerp(-40, 0, pin)}px,${lerp(20, 0, pin)}px,0) rotate(${lerp(-12, 0, pin)}deg) scale(${lerp(0.8, 1, pin)})`,
    pin,
  );
}

function drawCaptions(els: AiElements, seg: Seg, step: number) {
  els.captions.forEach((cap, i) => {
    const enter = seg(STEPS[i], STEPS[i] + 0.03);
    const leave = i === 3 ? 1 : 1 - seg(STEPS[i + 1] - 0.03, STEPS[i + 1]);
    applyMotion(
      cap,
      `translate3d(0,${(1 - enter) * 18 - (1 - leave) * 18}px,0)`,
      enter * leave,
    );
  });
  const shown = String(seg(0.14, 0.18));
  els.dots
    ?.querySelectorAll("i")
    .forEach((dot, i) => dot.classList.toggle(styles.on, i === step));
  if (els.dots) els.dots.style.opacity = shown;
  if (els.status) els.status.style.opacity = shown;
  if (els.statusLabel)
    els.statusLabel.textContent = STATUS_TEXT[Math.max(step, 0)];
}

function drawFly(
  fly: HTMLElement | null | undefined,
  L: AiLayout,
  index: number,
  t: number,
) {
  const target = L.targets[index];
  if (!fly || !target) return;
  const e = ease(t);
  const x = lerp(L.from.x, target.x, e);
  const y = lerp(L.from.y, target.y, e) - Math.sin(Math.PI * e) * 70;
  applyMotion(
    fly,
    `translate3d(${x}px,${y}px,0) scale(${lerp(0.7, 1, Math.min(1, t * 4))})`,
    t > 0 && t < 1 ? Math.min(1, t * 6, (1 - t) * 8) : 0,
  );
}

/** Steps 1–4 on the fields: scan, meaning chips, flying values, review. */
function drawRows(els: AiElements, L: AiLayout, p: number, seg: Seg) {
  const scanT = seg(STEPS[0] + 0.01, STEPS[1] - 0.02);
  const scanY = scanT * L.rowsHeight;
  applyMotion(
    els.scan,
    `translate3d(0,${scanY}px,0)`,
    scanT > 0 && scanT < 1 ? 1 : 0,
  );
  const review = seg(STEPS[3], STEPS[3] + 0.04) > 0;
  let seen = 0;
  let filled = 0;
  let fillIndex = 0;
  els.rows.forEach((row, i) => {
    if (!row) return;
    const isSeen =
      p >= STEPS[0] &&
      (scanT >= 1 || row.offsetTop + row.offsetHeight / 2 < scanY);
    if (isSeen) seen++;
    row.classList.toggle(formStyles.seen, isSeen);
    const chipT = seg(STEPS[1] + 0.01 + i * 0.017, STEPS[1] + 0.04 + i * 0.017);
    let chipOpacity = chipT;
    if (sampleFields[i].value) {
      const start = STEPS[2] + 0.01 + fillIndex * 0.022;
      const fillT = seg(start, start + 0.05);
      drawFly(els.flies[fillIndex], L, fillIndex, fillT);
      const value = row.querySelector<HTMLElement>("[data-value]");
      if (value) value.style.opacity = String(segment(fillT, 0.85, 1));
      row.classList.toggle(formStyles.done, fillT >= 1);
      if (fillT >= 1) filled++;
      chipOpacity = chipT * (1 - segment(fillT, 0.5, 1));
      fillIndex++;
    } else row.classList.toggle(formStyles.review, review);
    applyMotion(
      row.querySelector<HTMLElement>("[data-chip]"),
      `translate3d(${(1 - chipT) * -12}px,0,0) scale(${0.9 + 0.1 * back(chipT)})`,
      chipOpacity,
    );
  });
  return { seen, filled };
}

export function statusCountText(step: number, seen: number, filled: number) {
  if (step === 0) return `칸 ${seen}/${sampleFields.length}`;
  if (step === 1) return `칸 ${sampleFields.length}개`;
  if (step === 2) return `${filled}/${filledCount}`;
  if (step === 3) return `확인 필요 ${reviewCount}`;
  return "";
}

export function drawAiFrame(
  els: AiElements,
  L: AiLayout,
  p: number,
  reduced: boolean,
) {
  const seg: Seg = (a, b) => segment(p, a, b, reduced);
  const step = currentStep(p);
  drawHero(els, L, seg);
  drawCaptions(els, seg, step);
  const { seen, filled } = drawRows(els, L, p, seg);
  const summaryT = seg(STEPS[3] + 0.03, STEPS[3] + 0.08);
  applyMotion(
    els.summary,
    `translate3d(0,${(1 - summaryT) * 12}px,0)`,
    summaryT,
  );
  if (els.statusCount)
    els.statusCount.textContent = statusCountText(step, seen, filled);
}
