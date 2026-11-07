import styles from "./Scene.module.css";

/** A quiet media control for the looping scenes, not a page action. */
export function PauseButton({
  paused,
  onToggle,
}: {
  paused: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.pause}
      aria-pressed={paused}
      onClick={onToggle}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {paused ? (
          <path d="M4.5 2.5v11l9-5.5Z" fill="currentColor" />
        ) : (
          <path d="M4 2.5h3v11H4Zm5 0h3v11H9Z" fill="currentColor" />
        )}
      </svg>
      {paused ? "계속 재생" : "일시정지"}
    </button>
  );
}
