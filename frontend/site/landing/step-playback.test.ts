import { describe, expect, it } from "vitest";
import { currentStep } from "./ai-frame";
import { AI_PLAYBACK as AI } from "./jev";
import {
  advance,
  evenTriggers,
  progressAt,
  stageForScroll,
  type Playback,
} from "./step-playback";

const LAST = AI.rests.length - 1;
const PB: Playback = {
  rests: [0, 0.2, 0.4, 0.6, 0.8, 1],
  triggers: evenTriggers(0, 1, 5),
  seconds: [0.9, 0.9, 0.9, 0.9, 0.6],
};

describe("stageForScroll", () => {
  it("keeps the hero until the visitor starts scrolling, then one stage per section", () => {
    expect(stageForScroll(AI, -1)).toBe(0);
    expect(stageForScroll(AI, 0)).toBe(0);
    expect(stageForScroll(AI, 0.05)).toBe(0);
    expect(stageForScroll(AI, 0.08)).toBe(1);
    expect(stageForScroll(AI, 0.77)).toBe(1);
    expect(stageForScroll(AI, 0.78)).toBe(2);
    expect(stageForScroll(AI, 4.28)).toBe(LAST);
    expect(stageForScroll(AI, 99)).toBe(LAST);
  });

  it("can call up the first stage before the track reaches the top", () => {
    const docking = { ...PB, triggers: evenTriggers(-0.3, 0.7, 5) };
    expect(stageForScroll(docking, -0.5)).toBe(0);
    expect(stageForScroll(docking, -0.3)).toBe(1);
    expect(stageForScroll(docking, 0.4)).toBe(2);
  });
});

describe("progressAt", () => {
  it("rests on the hero, on each finished JEV step, and on the end", () => {
    expect(AI.rests).toHaveLength(8);
    expect(progressAt(AI, 0)).toBe(0);
    for (let s = 1; s < LAST; s++)
      expect(currentStep(progressAt(AI, s))).toBe(s - 1);
    expect(progressAt(AI, LAST)).toBe(1);
  });

  it("interpolates between rests and clamps outside them", () => {
    expect(progressAt(PB, 1.5)).toBeCloseTo(0.3);
    expect(progressAt(PB, -1)).toBe(0);
    expect(progressAt(PB, 9)).toBe(1);
  });
});

describe("advance", () => {
  const frac = (seconds: number, of = 0.9) => seconds / of;

  it("plays the next stage forward in real time without overshooting", () => {
    expect(advance(PB, 0, 1, 0.45, false)).toBeCloseTo(0.5);
    expect(advance(PB, 0.9, 1, 1, false)).toBe(1);
  });

  it("takes each stage's own duration", () => {
    expect(advance(PB, 4, 5, 0.3, false)).toBeCloseTo(4.5);
    expect(advance(PB, 5, 4, 0.2, false)).toBeCloseTo(4.5);
  });

  it("stays put once the target is reached", () => {
    expect(advance(PB, 3, 3, 1, false)).toBe(3);
  });

  it("rewinds to the previous stage faster than it plays", () => {
    expect(advance(PB, 2, 1, 0.3, false)).toBeCloseTo(2 - 1.5 * frac(0.3));
  });

  it("fast-forwards the rest of the playing stage when the target moves past it", () => {
    expect(advance(PB, 1.5, 3, 0.1, false)).toBeCloseTo(1.5 + 3 * frac(0.1));
    expect(advance(PB, 1.9, 3, 0.1, false)).toBe(2);
    expect(advance(PB, 2, 3, 0.09, false)).toBeCloseTo(2 + frac(0.09));
  });

  it("skips stages in between and plays only the target stage", () => {
    expect(advance(PB, 1, 4, 0.09, false)).toBeCloseTo(3 + frac(0.09));
    expect(advance(PB, 4, 1, 0.06, false)).toBeCloseTo(2 - 1.5 * frac(0.06));
  });

  it("rewinds the playing stage quickly before skipping backward", () => {
    expect(advance(PB, 3.5, 1, 0.1, false)).toBeCloseTo(3.5 - 3 * frac(0.1));
    expect(advance(PB, 3.05, 1, 0.1, false)).toBe(3);
  });

  it("jumps straight to the target with reduced motion", () => {
    expect(advance(PB, 0.3, 4, 0.01, true)).toBe(4);
  });
});
