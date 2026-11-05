import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_PLAYBACK } from "./jev";
import { progressAt as at } from "./step-playback";
import { useSteppedScene } from "./useSteppedScene";

let frames: FrameRequestCallback[] = [];
let top = 0;
const STAGE_SECONDS = AI_PLAYBACK.seconds[0];
const progressAt = (u: number) => at(AI_PLAYBACK, u);
const track = { current: document.createElement("section") };

const flush = (now: number) => {
  const pending = frames;
  frames = [];
  pending.forEach((cb) => cb(now));
};
/** Runs ~60fps frames for `ms`, starting at `from`. */
const playFor = (from: number, ms: number) => {
  for (let t = from; t <= from + ms; t += 16) flush(t);
};
const scrollTo = (screens: number) => {
  top = -screens * window.innerHeight;
  window.dispatchEvent(new Event("scroll"));
};

beforeEach(() => {
  frames = [];
  top = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  vi.spyOn(track.current, "getBoundingClientRect").mockImplementation(
    () => ({ top, bottom: top + 5000, height: 5000 }) as DOMRect,
  );
});
afterEach(() => vi.restoreAllMocks());

const mount = (reduced = false) => {
  const render = vi.fn();
  const layout = vi.fn();
  renderHook(() =>
    useSteppedScene(track, AI_PLAYBACK, render, layout, reduced),
  );
  return { render, layout };
};
const lastFrame = (render: ReturnType<typeof vi.fn>) =>
  render.mock.calls.at(-1)?.[0] as number;

describe("useSteppedScene", () => {
  it("lays out and draws the hero on mount", () => {
    const { render, layout } = mount();
    expect(layout).toHaveBeenCalled();
    expect(lastFrame(render)).toBe(0);
  });

  it("starts at the stage under the scroll position without replaying earlier ones", () => {
    top = -3 * window.innerHeight;
    const { render } = mount();
    expect(lastFrame(render)).toBe(progressAt(5));
  });

  it("plays a stage to its end in time once the visitor scrolls into it", () => {
    const { render } = mount();
    scrollTo(0.1);
    playFor(0, (STAGE_SECONDS * 1000) / 2);
    expect(lastFrame(render)).toBeCloseTo(progressAt(0.5), 2);
    playFor(STAGE_SECONDS * 500 + 16, STAGE_SECONDS * 500 + 32);
    expect(lastFrame(render)).toBe(progressAt(1));
    expect(frames).toHaveLength(0);
  });

  it("keeps playing after scrolling stops", () => {
    const { render } = mount();
    scrollTo(0.1);
    playFor(0, STAGE_SECONDS * 1000 + 32);
    expect(lastFrame(render)).toBe(progressAt(1));
    expect(frames).toHaveLength(0);
  });

  it("caps long frame gaps so a background tab doesn't leap ahead", () => {
    const { render } = mount();
    scrollTo(0.1);
    flush(0);
    flush(5000);
    expect(lastFrame(render)).toBeLessThan(progressAt(0.2));
  });

  it("re-picks the stage when a resize changes how many screens were scrolled", () => {
    const { render, layout } = mount(true);
    top = -2 * window.innerHeight;
    window.dispatchEvent(new Event("resize"));
    expect(layout).toHaveBeenCalledTimes(2);
    flush(0);
    expect(lastFrame(render)).toBe(progressAt(3));
  });

  it("snaps to the target stage with reduced motion", () => {
    const { render } = mount(true);
    scrollTo(2);
    flush(0);
    expect(lastFrame(render)).toBe(progressAt(3));
  });
});
