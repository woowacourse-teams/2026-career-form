import { useCallback, useEffect, useMemo, useRef } from "react";
import { browser } from "wxt/browser";
import type { TrackEvent } from "../../src/analytics/events";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import {
  ChromeProfileStorage,
  PROFILE_STORAGE_KEY,
} from "../../src/storage/chrome-profile-storage";
import { trackExtensionEvent } from "../../src/analytics/extension-tracker";
import {
  pushClient as defaultPushClient,
  type PushClient,
} from "../../src/job-postings/push-client";
import { SiteApp } from "../../site/SiteApp";
import { SiteUrlContext } from "../../site/site-navigation";
import { OnboardingFlow } from "./flow/OnboardingFlow";
import { createStepStore, type StepStore } from "./flow/steps";
import styles from "./App.module.css";

export function extensionSiteUrl(path: string): string {
  if (path.startsWith("/demo/"))
    return `/onboarding-guide.html${path.slice(path.indexOf("?"))}`;
  return path.startsWith("/")
    ? `/onboarding.html?page=${encodeURIComponent(path)}`
    : path;
}

// Tells the Greeting step that an import saved the profile from another tab.
function watchStoredProfile(listener: () => void): () => void {
  const onChanged = (changes: Record<string, unknown>, area: string) => {
    if (area === "local" && PROFILE_STORAGE_KEY in changes) listener();
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}

export function App({
  repository: injectedRepository,
  track = trackExtensionEvent,
  pushClient = defaultPushClient,
  stepStore: injectedStepStore,
  watchProfile = watchStoredProfile,
}: {
  repository?: ProfileRepository;
  track?: TrackEvent;
  pushClient?: PushClient;
  stepStore?: StepStore;
  watchProfile?: (listener: () => void) => () => void;
} = {}) {
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const stepStore = useMemo(
    () => injectedStepStore ?? createStepStore(browser.storage.local),
    [injectedStepStore],
  );
  const firstViewSent = useRef(false);
  const path =
    new URLSearchParams(window.location.search).get("page") ?? "/onboarding/";
  const onboarding = path.replace(/\/$/, "") === "/onboarding";
  useEffect(() => {
    if (!onboarding || firstViewSent.current) return;
    firstViewSent.current = true;
    track("onboarding_first_viewed", { surface: "extension_onboarding" });
  }, [onboarding, track]);
  const openProfile = useCallback(() => {
    window.location.assign("/options.html");
  }, []);
  const openPostings = useCallback(() => {
    window.location.assign("/options.html#postings");
  }, []);
  // The first-install flow replaces the site's usage guide at this path; the
  // landing, trial, tech and policy pages still render through the site.
  if (onboarding)
    return (
      <OnboardingFlow
        repository={repository}
        pushClient={pushClient}
        track={track}
        stepStore={stepStore}
        watchProfile={watchProfile}
        onOpenProfile={openProfile}
        onOpenPostings={openPostings}
      />
    );
  return (
    <SiteUrlContext value={extensionSiteUrl}>
      <div className={styles.shell}>
        <SiteApp path={path} track={track} surface="extension_onboarding" />
      </div>
    </SiteUrlContext>
  );
}
