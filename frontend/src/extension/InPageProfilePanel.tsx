import { useEffect, useMemo, useSyncExternalStore } from "react";

import { browser } from "wxt/browser";

import { trackExtensionEvent } from "../analytics/extension-tracker";
import type { TrackEvent } from "../analytics/events";
import { App } from "../../entrypoints/sidepanel/App";
import { RuntimeAnalysisApiClient } from "../autofill/api/runtime-client";
import type { AnalysisApiClient } from "../autofill/api/types";
import { AutofillOverlay } from "../autofill-demo/AutofillOverlay";
import type { ProfileRepository } from "../profile/profile-repository";
import { ChromeProfileStorage } from "../storage/chrome-profile-storage";
import { requestPanelShortcut } from "./panel-shortcut";
import type { ProfilePanelController } from "./profile-panel-controller";

interface InPageProfilePanelProps {
  controller: ProfilePanelController;
  closePanel(): void;
  openOptions(): Promise<void> | void;
  logoUrl: string;
  unsupportedImageUrl?: string;
  writingImageUrl?: string;
  pageDocument: Document;
  apiClient?: AnalysisApiClient;
  repository?: ProfileRepository;
  track?: TrackEvent;
  readPanelShortcut?: () => Promise<string | undefined>;
}

// Stable identity so the hint reads the shortcut once per mount, not per render.
// In jsdom `browser.runtime` is missing; the rejection only hides the hint.
const readShortcutFromBackground = async () =>
  requestPanelShortcut(browser.runtime);

export function InPageProfilePanel({
  controller,
  closePanel,
  openOptions,
  logoUrl,
  unsupportedImageUrl,
  writingImageUrl,
  pageDocument,
  apiClient: injectedApiClient,
  repository: injectedRepository,
  track = trackExtensionEvent,
  readPanelShortcut = readShortcutFromBackground,
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
      fitContent
      track={track}
      readPanelShortcut={readPanelShortcut}
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
            unsupportedImageUrl={unsupportedImageUrl}
            writingImageUrl={writingImageUrl}
            onClose={controller.showProfile}
          />
        ) : undefined
      }
    />
  );
}
