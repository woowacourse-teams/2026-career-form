import { useEffect, useMemo, useSyncExternalStore } from "react";

import { App } from "../../entrypoints/sidepanel/App";
import { RuntimeAnalysisApiClient } from "../autofill/api/runtime-client";
import type { AnalysisApiClient } from "../autofill/api/types";
import { AutofillOverlay } from "../autofill-demo/AutofillOverlay";
import type { ProfileRepository } from "../profile/profile-repository";
import { ChromeProfileStorage } from "../storage/chrome-profile-storage";
import type { ProfilePanelController } from "./profile-panel-controller";

interface InPageProfilePanelProps {
  controller: ProfilePanelController;
  closePanel(): void;
  openOptions(): Promise<void> | void;
  logoUrl: string;
  pageDocument: Document;
  apiClient?: AnalysisApiClient;
  repository?: ProfileRepository;
}

export function InPageProfilePanel({
  controller,
  closePanel,
  openOptions,
  logoUrl,
  pageDocument,
  apiClient: injectedApiClient,
  repository: injectedRepository,
}: InPageProfilePanelProps) {
  const mode = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const apiClient = useMemo(
    () => injectedApiClient ?? new RuntimeAnalysisApiClient(),
    [injectedApiClient],
  );
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );

  useEffect(() => () => controller.showProfile(), [controller]);

  return (
    <App
      inPage
      repository={repository}
      logoUrl={logoUrl}
      openOptions={openOptions}
      closePanel={() => {
        controller.showProfile();
        closePanel();
      }}
      openAutofill={async () => controller.startAutofill()}
      returnToProfile={controller.showProfile}
      autofillView={
        mode === "autofill" ? (
          <AutofillOverlay
            returnInHeader
            apiClient={apiClient}
            repository={repository}
            pageDocument={pageDocument}
            onClose={controller.showProfile}
          />
        ) : undefined
      }
    />
  );
}
