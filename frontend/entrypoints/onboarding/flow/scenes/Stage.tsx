import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import styles from "./Scene.module.css";

// The scenes are drawn at this size and scaled to the column, so the Greeting
// form and the panel keep real proportions at any width.
export const STAGE_WIDTH = 880;
export const STAGE_HEIGHT = 560;

/** Where the scene looks: the whole page, or close up on the panel. */
export type Camera = "page" | "panel";

/**
 * Fixed-size drawing surface scaled to fit its container's width. The camera
 * zooms in on the panel while it is being used, so its text stays readable.
 */
export function Stage({
  stage,
  camera,
  children,
}: {
  stage: RefObject<HTMLDivElement | null>;
  camera: Camera;
  children: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  useLayoutEffect(() => {
    const element = outer.current;
    if (!element) return;
    const update = () => {
      if (element.clientWidth > 0) setScale(element.clientWidth / STAGE_WIDTH);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={outer}
      className={styles.viewport}
      style={{ height: STAGE_HEIGHT * scale }}
      aria-hidden="true"
    >
      <div
        className={styles.stage}
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        <div ref={stage} className={styles.camera} data-camera={camera}>
          {children}
        </div>
      </div>
    </div>
  );
}

const PARK = { x: 120, y: STAGE_HEIGHT + 40 };

// Layout position (transforms ignored) of an element's centre inside the stage.
function centreIn(stage: HTMLElement, element: HTMLElement) {
  let x = element.offsetWidth / 2;
  let y = element.offsetHeight / 2;
  let node: HTMLElement | null = element;
  while (node && node !== stage) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === stage ? { x, y } : undefined;
}

/**
 * A pointer that glides to the element marked `data-cursor={target}` and
 * shows a ripple while `clicking`. "park" sends it below the stage.
 */
export function SceneCursor({
  stage,
  target,
  phase,
  clicking,
}: {
  stage: RefObject<HTMLDivElement | null>;
  target: string;
  phase: number;
  clicking: boolean;
}) {
  const [point, setPoint] = useState(PARK);
  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    if (target === "park") {
      setPoint(PARK);
      return;
    }
    const element = root.querySelector<HTMLElement>(
      `[data-cursor="${target}"]`,
    );
    const centre = element && centreIn(root, element);
    if (centre) setPoint(centre);
  }, [stage, target, phase]);
  return (
    <>
      {clicking && (
        <span
          key={phase}
          className={styles.ripple}
          style={{ left: point.x, top: point.y }}
        />
      )}
      <svg
        className={styles.cursor}
        data-parked={target === "park"}
        style={{ transform: `translate(${point.x - 3}px, ${point.y - 3}px)` }}
        viewBox="0 0 28 36"
      >
        <path
          d="M2 2v27l7-7 6 12 5-3-6-11h11Z"
          fill="#111111"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}
