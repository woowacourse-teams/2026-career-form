import { useEffect, useMemo, useRef, useState } from "react";
import type { TrackEvent } from "../../src/analytics/events";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { ChromeProfileStorage } from "../../src/storage/chrome-profile-storage";
import { QuickStart } from "../../src/profile/components/QuickStart";
import { trackExtensionEvent } from "../../src/analytics/extension-tracker";
import {
  pushClient as defaultPushClient,
  type PushClient,
} from "../../src/job-postings/push-client";
import { SiteApp } from "../../site/SiteApp";
import { SiteUrlContext } from "../../site/site-navigation";

export function extensionSiteUrl(path: string): string {
  if (path.startsWith("/demo/"))
    return `/onboarding-guide.html${path.slice(path.indexOf("?"))}`;
  return path.startsWith("/")
    ? `/onboarding.html?page=${encodeURIComponent(path)}`
    : path;
}

export function App({
  repository: injectedRepository,
  track = trackExtensionEvent,
  pushClient = defaultPushClient,
}: {
  repository?: ProfileRepository;
  track?: TrackEvent;
  pushClient?: PushClient;
} = {}) {
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const [quickStart, setQuickStart] = useState(false);
  const firstViewSent = useRef(false);
  const path =
    new URLSearchParams(window.location.search).get("page") ?? "/onboarding/";
  useEffect(() => {
    if (path.replace(/\/$/, "") !== "/onboarding" || firstViewSent.current)
      return;
    firstViewSent.current = true;
    track("onboarding_first_viewed", { surface: "extension_onboarding" });
  }, [path, track]);
  return (
    <SiteUrlContext value={extensionSiteUrl}>
      {quickStart ? (
        <QuickStart
          repository={repository}
          track={track}
          onOpenProfile={() => {
            window.location.assign("/options.html");
          }}
        />
      ) : (
        <SiteApp
          path={path}
          installed
          profileHref="/options.html"
          postingsHref="/options.html#postings/new"
          pushClient={pushClient}
          track={track}
          onStartAutofill={() => setQuickStart(true)}
          surface="extension_onboarding"
        />
      )}
    </SiteUrlContext>
  );
}
