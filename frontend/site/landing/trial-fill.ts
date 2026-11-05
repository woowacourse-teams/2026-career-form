import { useEffect, useRef, useState } from "react";
import type { TrackEvent } from "../../src/analytics/events";
import type { FieldState } from "./SampleForm";
import { sampleFields } from "./sample-form";

export type TrialStage = "ready" | "running" | "complete";
type Step = { at: number; index: number; state: FieldState };

const idle = (): FieldState[] => sampleFields.map(() => "idle");

/** Timeline of the fill, in ms: read every field, then fill, then flag review. */
export function fillSchedule(scale: number) {
  const read: Step[] = sampleFields.map((_, i) => ({
    at: scale * (80 + i * 70),
    index: i,
    state: "seen",
  }));
  const fill: Step[] = sampleFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => field.value)
    .map(({ index }, k) => ({
      at: scale * (1100 + k * 160),
      index,
      state: "done",
    }));
  const end = scale * 2600;
  const review: Step[] = sampleFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => !field.value)
    .map(({ index }) => ({ at: end, index, state: "review" }));
  return { steps: [...read, ...fill, ...review], end };
}

/** Runs the simulated autofill on the sample form and reports trial events. */
export function useTrialFill(track: TrackEvent, reduced: boolean) {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [stage, setStage] = useState<TrialStage>("ready");
  const [fields, setFields] = useState<FieldState[]>(idle);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const start = () => {
    if (stage !== "ready") return;
    setStage("running");
    track("trial_started", { surface: "site" });
    const { steps, end } = fillSchedule(reduced ? 0 : 1);
    const later = (at: number, run: () => void) =>
      timers.current.push(setTimeout(run, at));
    for (const step of steps)
      later(step.at, () =>
        setFields((prev) =>
          prev.map((s, i) => (i === step.index ? step.state : s)),
        ),
      );
    later(end, () => {
      setStage("complete");
      track("trial_completed", { surface: "site" });
    });
  };
  const reset = () => {
    clearTimers();
    setFields(idle());
    setStage("ready");
  };
  return { stage, fields, start, reset };
}
