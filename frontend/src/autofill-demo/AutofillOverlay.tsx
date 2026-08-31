import { RuntimeAnalysisApiClient } from "../autofill/api/runtime-client";
import type { AnalysisApiClient } from "../autofill/api/types";
import { AutofillWorkflow } from "../autofill/workflow/AutofillWorkflow";
import type { ProfileRepository } from "../profile/profile-repository";
import { ChromeProfileStorage } from "../storage/chrome-profile-storage";
import styles from "./AutofillOverlay.module.css";

interface AutofillOverlayProps {
  onClose(): void;
  apiClient?: AnalysisApiClient;
  repository?: Pick<ProfileRepository, "load">;
  pageDocument?: Document;
}

export function AutofillOverlay({
  onClose,
  apiClient = new RuntimeAnalysisApiClient(),
  repository = new ChromeProfileStorage(),
  pageDocument = document,
}: AutofillOverlayProps) {
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
          <AutofillWorkflow
            apiClient={apiClient}
            repository={repository}
            pageDocument={pageDocument}
            onExit={onClose}
          />
        </div>
      </section>
    </div>
  );
}
