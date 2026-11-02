import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  currentStep,
  drawAiFrame,
  statusCountText,
  STEPS,
  type AiElements,
  type AiLayout,
} from "./ai-frame";
import {
  drawAlertFrame,
  type AlertElements,
  type AlertLayout,
} from "./alert-frame";
import { SampleForm } from "./SampleForm";
import { filledCount, reviewCount, sampleFields } from "./sample-form";
import formStyles from "./SampleForm.module.css";
import alertStyles from "./AlertScene.module.css";

const aiLayout: AiLayout = {
  narrow: false,
  heroDx: 100,
  heroDy: 40,
  rowsHeight: 400,
  from: { x: 0, y: 0 },
  targets: sampleFields.filter((f) => f.value).map(() => ({ x: 50, y: 50 })),
};

function aiElements() {
  const rows: HTMLDivElement[] = [];
  const view = render(
    <SampleForm
      idPrefix="t"
      withChips
      rowRef={(i, el) => {
        if (el) rows[i] = el;
      }}
    />,
  );
  const make = () => document.createElement("div");
  const els: AiElements = {
    hero: make(),
    form: make(),
    scan: make(),
    summary: make(),
    statusLabel: document.createElement("span"),
    statusCount: document.createElement("b"),
    captions: [make(), make(), make(), make()],
    flies: sampleFields.filter((f) => f.value).map(() => make()),
    rows,
  };
  return { els, rows, view };
}

describe("AI scene frames", () => {
  it("names the step for each part of the scroll", () => {
    expect(currentStep(0.05)).toBe(-1);
    expect(currentStep(STEPS[0])).toBe(0);
    expect(currentStep(0.5)).toBe(1);
    expect(currentStep(0.6)).toBe(2);
    expect(currentStep(0.99)).toBe(3);
    expect(statusCountText(0, 4, 0)).toBe(`칸 4/${sampleFields.length}`);
    expect(statusCountText(2, 10, 3)).toBe(`3/${filledCount}`);
    expect(statusCountText(3, 10, filledCount)).toBe(
      `확인 필요 ${reviewCount}`,
    );
    expect(statusCountText(-1, 0, 0)).toBe("");
  });

  it("starts with an empty form and the hero copy fully visible", () => {
    const { els, rows } = aiElements();
    drawAiFrame(els, aiLayout, 0, false);
    expect(els.hero?.style.opacity).toBe("1");
    expect(rows.some((r) => r.classList.contains(formStyles.done))).toBe(false);
    expect(rows.some((r) => r.classList.contains(formStyles.seen))).toBe(false);
    expect(els.summary?.style.opacity).toBe("0");
  });

  it("ends with every known field filled and the rest asking for review", () => {
    const { els, rows } = aiElements();
    drawAiFrame(els, aiLayout, 1, false);
    sampleFields.forEach((field, i) => {
      const value = rows[i].querySelector<HTMLElement>("[data-value]")!;
      if (field.value) {
        expect(value.textContent).toBe(field.value);
        expect(value.style.opacity).toBe("1");
        expect(rows[i]).toHaveClass(formStyles.done);
      } else expect(rows[i]).toHaveClass(formStyles.review);
    });
    expect(els.hero?.style.opacity).toBe("0");
    expect(els.summary?.style.opacity).toBe("1");
    expect(els.statusLabel?.textContent).toBe("분석 완료");
    expect(els.statusCount?.textContent).toBe(`확인 필요 ${reviewCount}`);
    expect(els.captions[3]?.style.opacity).toBe("1");
    expect(els.captions[0]?.style.opacity).toBe("0");
  });

  it("shows the meaning chips during the understanding step", () => {
    const { els, rows } = aiElements();
    drawAiFrame(els, aiLayout, STEPS[2] - 0.01, false);
    const chip = rows[0].querySelector<HTMLElement>("[data-chip]")!;
    expect(chip.textContent).toBe("이름 → 내 이름");
    expect(Number(chip.style.opacity)).toBe(1);
    expect(els.statusCount?.textContent).toBe(`칸 ${sampleFields.length}개`);
  });
});

describe("alert scene frames", () => {
  function alertElements() {
    const make = () => document.createElement("div");
    return {
      caption: make(),
      axis: make(),
      post: make(),
      applied: document.createElement("span"),
      firstAlert: make(),
      cancelled: make(),
      character: make(),
      ticks: [make(), make(), make()],
      labels: [make(), make(), make()],
    } satisfies AlertElements;
  }
  const layout: AlertLayout = { narrow: false, postStartX: 200 };

  it("has nothing on screen before the scene starts", () => {
    const els = alertElements();
    expect(drawAlertFrame(els, layout, 0, false)).toBe(false);
    expect(els.firstAlert.style.opacity).toBe("0");
    expect(els.cancelled.style.opacity).toBe("0");
    expect(els.applied.style.opacity).toBe("0");
  });

  it("delivers the day-before alert, then cancels the rest once applied", () => {
    const els = alertElements();
    expect(drawAlertFrame(els, layout, 0.6, false)).toBe(true);
    expect(els.firstAlert.style.opacity).toBe("1");
    expect(els.applied.style.opacity).toBe("0");
    drawAlertFrame(els, layout, 1, false);
    expect(els.applied.style.opacity).toBe("1");
    expect(els.cancelled.style.opacity).toBe("1");
    expect(els.labels[1]).toHaveClass(alertStyles.cancelled);
    expect(els.ticks[1]).toHaveClass(alertStyles.tickCancelled);
  });

  it("swaps the notifications in one slot on narrow screens", () => {
    const els = alertElements();
    drawAlertFrame(els, { narrow: true, postStartX: 0 }, 1, false);
    expect(els.firstAlert.style.opacity).toBe("0");
    expect(els.cancelled.style.opacity).toBe("1");
  });

  it("snaps instead of tweening with reduced motion", () => {
    const els = alertElements();
    drawAlertFrame(els, layout, 0.48, true);
    expect(els.firstAlert.style.opacity).toBe("0");
    drawAlertFrame(els, layout, 0.5, true);
    expect(els.firstAlert.style.opacity).toBe("1");
  });
});
