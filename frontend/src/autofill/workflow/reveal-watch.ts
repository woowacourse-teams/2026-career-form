import { newlyRevealedControls } from "./generic-follow-up";

interface RevealWatchOptions {
  document: Document;
  /** Fillable controls when the run ended; only controls outside it count. */
  baseline: ReadonlySet<Element>;
  onReveal(): void;
  debounceMs?: number;
  /** Quiet time after the user's last input before anything is written. */
  idleMs?: number;
  isUserEvent?: (event: Event) => boolean;
  currentUrl?: () => string;
}

const USER_EVENTS = ["input", "keydown", "pointerdown"] as const;

/**
 * Watches for empty fields the page reveals after the run, for example after
 * the user saves a section. It never presses anything itself. It reports once
 * the user is idle and no revealed field holds focus, then stops; a changed
 * page address stops it without a report.
 */
export function watchRevealedFields({
  document,
  baseline,
  onReveal,
  debounceMs = 500,
  idleMs = 1_500,
  isUserEvent = (event) => event.isTrusted,
  currentUrl = () => document.URL,
}: RevealWatchOptions): () => void {
  const view = document.defaultView;
  if (!view?.MutationObserver) return () => undefined;
  const startUrl = currentUrl();
  let lastUserEvent = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const onUserEvent = (event: Event) => {
    if (isUserEvent(event)) lastUserEvent = Date.now();
  };
  const stop = () => {
    stopped = true;
    observer.disconnect();
    if (timer !== undefined) clearTimeout(timer);
    USER_EVENTS.forEach((name) =>
      document.removeEventListener(name, onUserEvent, true),
    );
  };
  const schedule = () => {
    if (stopped) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(check, debounceMs);
  };
  const check = () => {
    timer = undefined;
    if (stopped) return;
    if (currentUrl() !== startUrl) {
      stop();
      return;
    }
    const revealed = newlyRevealedControls(document, baseline);
    if (revealed.length === 0) return;
    const focused = document.activeElement;
    if (
      Date.now() - lastUserEvent < idleMs ||
      revealed.some((control) => control === focused)
    ) {
      schedule();
      return;
    }
    stop();
    onReveal();
  };
  const observer = new view.MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden", "disabled"],
  });
  USER_EVENTS.forEach((name) =>
    document.addEventListener(name, onUserEvent, true),
  );
  return stop;
}
