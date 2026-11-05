import { describe, expect, it } from "vitest";
import { back, clamp, ease, lerp, segment, trackProgress } from "./scroll";
import { isHolding } from "./useScrollHold";
import { fillSchedule } from "./trial-fill";
import { sampleFields } from "./sample-form";

describe("scroll math", () => {
  it("clamps, interpolates and eases between fixed endpoints", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(back(1)).toBeCloseTo(1);
    expect(back(0.8)).toBeGreaterThan(1); // overshoots before settling
  });

  it("maps progress into a segment, snapping at the midpoint with reduced motion", () => {
    expect(segment(0.25, 0.2, 0.3)).toBeCloseTo(0.5);
    expect(segment(0.1, 0.2, 0.3)).toBe(0);
    expect(segment(0.4, 0.2, 0.3)).toBe(1);
    expect(segment(0.24, 0.2, 0.3, true)).toBe(0);
    expect(segment(0.26, 0.2, 0.3, true)).toBe(1);
  });

  it("measures how far a tall pinned track has scrolled past the viewport", () => {
    expect(trackProgress({ top: 0, height: 4000 }, 1000)).toBe(0);
    expect(trackProgress({ top: -1500, height: 4000 }, 1000)).toBe(0.5);
    expect(trackProgress({ top: -9000, height: 4000 }, 1000)).toBe(1);
    expect(trackProgress({ top: 300, height: 4000 }, 1000)).toBe(0);
    expect(trackProgress({ top: -10, height: 800 }, 1000)).toBe(0);
  });

  it("holds only once the section reaches the top while still filling the screen", () => {
    expect(isHolding({ top: 0, bottom: 900 }, 900)).toBe(true);
    expect(isHolding({ top: -30, bottom: 870 }, 900)).toBe(true);
    expect(isHolding({ top: 200, bottom: 1100 }, 900)).toBe(false);
    expect(isHolding({ top: -700, bottom: 200 }, 900)).toBe(false);
  });

  it("reads every field before filling and flags review last", () => {
    const { steps, end } = fillSchedule(1);
    const at = (state: string) =>
      steps.filter((s) => s.state === state).map((s) => s.at);
    expect(at("seen")).toHaveLength(sampleFields.length);
    expect(Math.max(...at("seen"))).toBeLessThan(Math.min(...at("done")));
    expect(Math.max(...at("done"))).toBeLessThan(end);
    expect(at("review").every((t) => t === end)).toBe(true);
    expect(fillSchedule(0).steps.every((s) => s.at === 0)).toBe(true);
  });
});
