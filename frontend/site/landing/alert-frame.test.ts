import { describe, expect, it } from "vitest";
import {
  ALERT_PLAYBACK,
  drawAlertFrame,
  type AlertElements,
  type AlertLayout,
} from "./alert-frame";
import alertStyles from "./AlertScene.module.css";

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

  it("shows each beat finished where playback rests", () => {
    const els = alertElements();
    const [, axisUp, alerted, done] = ALERT_PLAYBACK.rests;
    expect(drawAlertFrame(els, layout, axisUp, false)).toBe(false);
    expect(els.caption.style.opacity).toBe("1");
    expect(els.axis.style.transform).toBe("scaleX(1)");
    expect(els.labels.map((l) => l.style.opacity)).toEqual(["1", "1", "1"]);
    expect(els.firstAlert.style.opacity).toBe("0");
    expect(drawAlertFrame(els, layout, alerted, false)).toBe(true);
    expect(els.firstAlert.style.opacity).toBe("1");
    expect(els.applied.style.opacity).toBe("0");
    expect(els.cancelled.style.opacity).toBe("0");
    drawAlertFrame(els, layout, done, false);
    expect(els.applied.style.opacity).toBe("1");
    expect(els.cancelled.style.opacity).toBe("1");
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
