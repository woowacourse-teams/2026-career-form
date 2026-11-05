import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectAiElements,
  currentStep,
  drawAiFrame,
  narrowRowHeight,
  statusCountText,
  type AiElements,
  type AiLayout,
} from "./ai-frame";
import { AiScene } from "./AiScene";
import { AI_PLAYBACK, JEV_STEPS, stepAt } from "./jev";
import { progressAt as at } from "./step-playback";

const progressAt = (u: number) => at(AI_PLAYBACK, u);
import { filledCount, reviewCount, sampleFields } from "./sample-form";
import formStyles from "./SampleForm.module.css";
import styles from "./AiScene.module.css";

const layout: AiLayout = {
  narrow: false,
  rowHeight: 34,
  rowTop: sampleFields.map((_, i) => i * 40),
  shift: sampleFields.map(() => 30),
  rowsHeight: 400,
  heroDx: 100,
  heroDy: 40,
  source: { x: 0, y: 0 },
  targets: sampleFields.filter((f) => f.value).map(() => ({ x: 50, y: 50 })),
  button: { x: 0, y: 0, w: 200, h: 58 },
  grid: sampleFields.map(() => ({ x: 0, y: 0 })),
  list: [],
};

let els: AiElements;
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { container } = render(<AiScene onInstall={() => {}} />);
  els = collectAiElements(container);
  layout.grid = els.cloud.map(() => ({ x: 0, y: 0 }));
  layout.list = els.cloud.map(() => ({ x: 0, y: 0 }));
});

const field = (i: number) => els.rows[i];
const visible = (el: Element | null | undefined) =>
  Number((el as HTMLElement | null)?.style.opacity ?? 0);

describe("의사결정 AI(JEV) scene", () => {
  it("tells the seven steps in order", () => {
    expect(currentStep(0.05)).toBe(-1);
    JEV_STEPS.slice(0, 7).forEach((start, i) =>
      expect(currentStep(start + 0.001)).toBe(i),
    );
    expect(els.captions.map((c) => c.querySelector("h2")?.textContent)).toEqual(
      [
        "자동 기입을 누르면",
        "지원서를 묶음으로 나눠요",
        "묶음의 종류를 판단해요",
        "후보를 좁혀요",
        "하나 고르고 확신을 재요",
        "몇 초 만에 채워요",
        "애매한 칸은 물어봐요",
      ],
    );
    expect(statusCountText(6, 4.2)).toBe(`확인 필요 ${reviewCount}`);
    expect(statusCountText(2, 1.73)).toBe("1.7초");
  });

  it("presses 자동 기입 and flips the panel into the AI console", () => {
    drawAiFrame(els, layout, 0, false);
    expect(visible(els.hero)).toBe(1);
    expect(els.flip?.style.transform).toContain("rotateY(0deg)");
    drawAiFrame(els, layout, stepAt(0, 0.5), false);
    expect(els.ghost?.dataset.pressed).toBe("true");
    drawAiFrame(els, layout, stepAt(1, 0.1), false);
    expect(els.flip?.style.transform).toContain("rotateY(180deg)");
  });

  it("splits the form into labelled groups the AI classifies in plain words", () => {
    drawAiFrame(els, layout, stepAt(2, 0.95), false);
    expect(els.groups.map((g) => g.textContent)).toEqual([
      "인적사항 · 4칸AI 판단 · 확실",
      "학력 · 4칸AI 판단 · 확실",
      "희망 조건 · 2칸AI 판단 · 애매",
    ]);
    expect(visible(els.groups[0])).toBe(1);
    expect(field(9).style.transform).toContain("translate3d(0,30px,0)");
    expect(els.classes[0].textContent).toContain("확신 98%");
    expect(els.root?.textContent).not.toMatch(/0\.\d\d/);
  });

  it("narrows the profile to education candidates for 출신 학교", () => {
    drawAiFrame(els, layout, stepAt(3, 0.9), false);
    expect(els.candTo?.textContent).toBe("6");
    expect(field(4)).toHaveClass(formStyles.focus);
    expect(
      els.cloud.find((c) => c.textContent === "학교명")?.dataset.picked,
    ).toBe("true");
  });

  it("labels every field with how sure the AI is", () => {
    drawAiFrame(els, layout, stepAt(4, 0.95), false);
    const pills = els.rows.map((r) => r.querySelector("[data-ai-confidence]"));
    expect(pills[0]?.textContent).toBe("확실 97%");
    expect(pills[9]?.textContent).toBe("애매 62%");
    expect(pills[8]?.textContent).toBe("모름 31%");
    expect(pills.every((p) => visible(p) === 1)).toBe(true);
  });

  it("fills known fields in 4.2초 and asks about the rest", () => {
    drawAiFrame(els, layout, 1, false);
    sampleFields.forEach((f, i) =>
      f.value
        ? expect(field(i)).toHaveClass(formStyles.done)
        : expect(field(i)).toHaveClass(formStyles.review),
    );
    expect(els.clock?.textContent).toBe("4.2초");
    expect(els.bigNum?.textContent).toBe("4.2");
    expect(visible(els.summary)).toBe(1);
    expect(els.summary?.textContent).toContain(`채움 ${filledCount}칸`);
  });

  it("flies values on a layer above the form and the console", () => {
    expect(els.flies).toHaveLength(filledCount);
    for (const fly of els.flies)
      expect(fly.parentElement).toHaveClass(styles.flyLayer);
  });

  it("shows each step finished, caption and console included, where playback rests", () => {
    const VIEW_AT_REST = [0, 0, 1, 2, 3, 4, 4];
    for (let s = 1; s < AI_PLAYBACK.rests.length; s++) {
      drawAiFrame(els, layout, progressAt(s), false);
      const step = s - 1;
      els.captions.forEach((c, i) =>
        expect(visible(c)).toBe(i === step ? 1 : 0),
      );
      els.views.forEach((v, i) =>
        expect(visible(v)).toBe(i === VIEW_AT_REST[step] ? 1 : 0),
      );
    }
    drawAiFrame(els, layout, progressAt(3), false);
    expect(els.lines.slice(0, 3).map(visible)).toEqual([1, 1, 1]);
    drawAiFrame(els, layout, progressAt(4), false);
    expect(visible(els.lines[3])).toBe(1);
  });

  it("snaps between steps instead of moving with reduced motion", () => {
    drawAiFrame(els, layout, stepAt(1, 0.6), true);
    expect(field(9).style.transform).toContain("translate3d(0,0px,0)");
    drawAiFrame(els, layout, stepAt(1, 0.75), true);
    expect(field(9).style.transform).toContain("translate3d(0,30px,0)");
  });
});

describe("narrowRowHeight", () => {
  // The form measured 300px tall at 20px rows and 500px at 40px rows.
  it("picks the tallest row that keeps the whole form on screen", () => {
    expect(narrowRowHeight(350, 300, 500)).toBe(25);
  });
  it("never grows rows past the desktop size", () => {
    expect(narrowRowHeight(2000, 300, 500)).toBe(34);
  });
  it("reports rows below the readable minimum so the caller can compact", () => {
    expect(narrowRowHeight(300, 300, 500)).toBeLessThan(24);
  });
});
