import { useRef } from "react";
import { GreetingPage, SAMPLE_VALUES } from "./GreetingPage";
import { PanelReplica, type PanelView } from "./PanelReplica";
import { SceneCursor, Stage, type Camera } from "./Stage";

// Milliseconds per phase: open the panel on an application written before,
// choose 프로필 가져오기 under the gear, pick 지원서 화면, confirm the one
// question, save.
export const IMPORT_PHASES = [
  900, // 0 a filled Greeting form, launcher on the page
  850, // 1 pointer moves to the launcher
  350, // 2 click
  650, // 3 the panel opens
  750, // 4 pointer moves to the gear
  450, // 5 click: the menu opens
  700, // 6 pointer moves to 프로필 가져오기
  350, // 7 click
  800, // 8 the source choice
  700, // 9 pointer moves to 지원서 화면
  350, // 10 click
  1400, // 11 review with one question
  750, // 12 pointer moves to 맞아요
  350, // 13 click
  1000, // 14 review confirmed
  750, // 15 pointer moves to 프로필에 저장
  350, // 16 click
  2400, // 17 saved
  600, // 18 reset
] as const;
// Shown without playback when motion is reduced: what would be imported.
export const IMPORT_STILL = 14;

/** 0: open Career Form, 1: gear, 프로필 가져오기 and 지원서 화면, 2: check and save. */
export function importChapter(phase: number): 0 | 1 | 2 {
  if (phase <= 3) return 0;
  return phase <= 10 ? 1 : 2;
}

function view(phase: number): PanelView {
  if (phase <= 7) return { kind: "home", menu: phase >= 5 };
  if (phase <= 10) return { kind: "source" };
  if (phase <= 13) return { kind: "import", confirmed: false };
  if (phase <= 16) return { kind: "import", confirmed: true };
  return { kind: "saved", count: 6 };
}

// The whole page to find the launcher, then close up on the panel.
function camera(phase: number): Camera {
  return phase >= 4 && phase <= 17 ? "panel" : "page";
}

function target(phase: number) {
  if (phase === 0 || phase === 18) return "park";
  if (phase <= 3) return "launcher";
  if (phase <= 5) return "gear";
  if (phase <= 8) return "menu-import";
  if (phase <= 11) return "source-page";
  if (phase <= 14) return "confirm-yes";
  if (phase <= 16) return "save";
  return "rest";
}

/** Importing the profile from a Greeting application written before. */
export function ImportScene({ phase }: { phase: number }) {
  const stage = useRef<HTMLDivElement>(null);
  const clicking = [2, 5, 7, 10, 13, 16].includes(phase);
  const pressed = clicking ? target(phase) : undefined;
  return (
    <Stage stage={stage} camera={camera(phase)}>
      <GreetingPage
        values={SAMPLE_VALUES}
        photo
        launcher={phase < 3 || phase === 18}
        pressed={pressed}
      />
      <PanelReplica
        open={phase >= 3 && phase <= 17}
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
