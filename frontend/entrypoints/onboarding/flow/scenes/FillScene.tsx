import { useRef } from "react";
import { GreetingPage, SAMPLE_VALUES, type FieldId } from "./GreetingPage";
import { PanelReplica, type PanelView } from "./PanelReplica";
import { SceneCursor, Stage, type Camera } from "./Stage";

// Milliseconds per phase: open the panel from the page's launcher, press
// 자동 기입, watch the fields fill, then read the result.
export const FILL_PHASES = [
  900, // 0 empty form, launcher on the page
  850, // 1 pointer moves to the launcher
  350, // 2 click
  650, // 3 the panel opens
  800, // 4 pointer moves to 자동 기입
  350, // 5 click
  950, // 6 matching fields to the profile
  550, // 7 이름
  550, // 8 영문이름
  550, // 9 성별
  650, // 10 생년월일
  2800, // 11 result: 입력 완료 and 확인 필요
  600, // 12 reset
] as const;
// Shown without playback when motion is reduced.
export const FILL_STILL = 11;

const ORDER: FieldId[] = ["name", "english", "gender", "birth"];

/** 0: open the application, 1: run 자동 기입, 2: check and submit. */
export function fillChapter(phase: number): 0 | 1 | 2 {
  if (phase === 0) return 0;
  return phase < FILL_STILL ? 1 : 2;
}

function view(phase: number): PanelView {
  if (phase <= 5) return { kind: "home" };
  if (phase === 6) return { kind: "matching" };
  if (phase <= 10) return { kind: "writing", percent: (phase - 6) * 25 };
  return { kind: "results", done: ORDER.length };
}

// Close up on the panel to press 자동 기입, then back to the whole page so the
// fields can be seen filling next to the result.
function camera(phase: number): Camera {
  return phase === 4 || phase === 5 ? "panel" : "page";
}

function target(phase: number) {
  if (phase === 0 || phase === 12) return "park";
  if (phase <= 3) return "launcher";
  if (phase <= 5) return "autofill";
  return "rest";
}

/** Autofill on a Greeting-style form, started from the page's launcher. */
export function FillScene({ phase }: { phase: number }) {
  const stage = useRef<HTMLDivElement>(null);
  const filled =
    phase >= 7 && phase <= 11 ? ORDER.slice(0, Math.min(phase - 6, 4)) : [];
  const values = Object.fromEntries(
    filled.map((id) => [id, SAMPLE_VALUES[id]]),
  );
  const clicking = phase === 2 || phase === 5;
  const pressed = clicking ? target(phase) : undefined;
  return (
    <Stage stage={stage} camera={camera(phase)}>
      <GreetingPage
        values={values}
        active={phase >= 7 && phase <= 10 ? ORDER[phase - 7] : undefined}
        photo={false}
        launcher={phase < 3 || phase === 12}
        pressed={pressed}
      />
      <PanelReplica
        open={phase >= 3 && phase <= 11}
        view={view(phase)}
        pressed={pressed}
      />
      <SceneCursor
        stage={stage}
        target={target(phase)}
        phase={phase}
        clicking={clicking}
      />
    </Stage>
  );
}
