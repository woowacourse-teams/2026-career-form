import { useEffect, useMemo, useRef } from "react";

import { RuntimeAnalysisApiClient } from "../autofill/api/runtime-client";
import type { AnalysisApiClient } from "../autofill/api/types";
import { AutofillWorkflow } from "../autofill/workflow/AutofillWorkflow";
import type { ProfileRepository } from "../profile/profile-repository";
import { ChromeProfileStorage } from "../storage/chrome-profile-storage";
import styles from "./AutofillOverlay.module.css";

interface AutofillOverlayProps {
  passive?: boolean;
  onClose(): void;
  apiClient?: AnalysisApiClient;
  repository?: Pick<ProfileRepository, "load">;
  pageDocument?: Document;
}

export function AutofillOverlay({
  passive = false,
  onClose,
  apiClient: injectedApiClient,
  repository: injectedRepository,
  pageDocument = document,
}: AutofillOverlayProps) {
  const apiClient = useMemo(
    () => injectedApiClient ?? new RuntimeAnalysisApiClient(),
    [injectedApiClient],
  );
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const region = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!passive) region.current?.focus();
  }, [passive]);

  return (
    <section
      ref={region}
      className={styles.panel}
      role="region"
      aria-label="지원서 자동 기입"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className={styles.toolbar}>
        <button type="button" onClick={onClose}>
          목록으로 돌아가기
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
  );
}
