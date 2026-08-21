import { AutofillDemo } from "./AutofillDemo";
import styles from "./AutofillOverlay.module.css";

interface AutofillOverlayProps {
  onClose(): void;
}

export function AutofillOverlay({ onClose }: AutofillOverlayProps) {
  return (
    <div
      className={styles.backdrop}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-label="지원서 자동 기입"
        aria-modal="true"
      >
        <div className={styles.header}>
          <strong>지원서 자동 기입</strong>
          <button
            type="button"
            aria-label="자동 기입 모달 닫기"
            autoFocus
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <div className={styles.body}>
          <AutofillDemo onExit={onClose} />
        </div>
      </section>
    </div>
  );
}
