import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import { browser } from "wxt/browser";

import { trackExtensionEvent } from "../analytics/extension-tracker";
import type { TrackEvent } from "../analytics/events";
import { prepareImportPolicy } from "../profile/page-import/load-import-policy";
import {
  readGreetingImport,
  recognizesGreetingForm,
} from "../profile/page-import/reader";
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
  // One policy request serves the mount-time offer check and a click that
  // arrives while it is still pending.
  const pendingPolicy = useRef<Promise<void> | undefined>(undefined);
  const preparePolicy = useCallback(() => {
    pendingPolicy.current ??= prepareImportPolicy(
      pageDocument,
      apiClient.loadExecutionPolicy?.bind(apiClient),
    ).finally(() => {
      pendingPolicy.current = undefined;
    });
    return pendingPolicy.current;
  }, [pageDocument, apiClient]);
  // Exposure for the import offer: once per panel open, only on a form the
  // installed policy recognizes as Greeting. Only the host is recorded.
  useEffect(() => {
    let active = true;
    void preparePolicy()
      .then(() => {
        if (!active || !recognizesGreetingForm(pageDocument)) return;
        track("greeting_import_offered", {
          surface: "in_page_panel",
          page_host: new URL(pageDocument.URL).hostname,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [preparePolicy, pageDocument, track]);
  const readImportCandidates = useCallback(async () => {
    await preparePolicy();
    return readGreetingImport(pageDocument);
  }, [preparePolicy, pageDocument]);

  return (
    <App
      inPage
      track={track}
      readImportCandidates={readImportCandidates}
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
            onClose={controller.showProfile}
          />
        ) : undefined
      }
    />
  );
}
