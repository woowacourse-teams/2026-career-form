import type { TrackEvent } from "../analytics/events";
import type { PushClient } from "./push-client";
import { usePushState } from "./use-push-state";
import { VisibilityCheck } from "./VisibilityCheck";

// Extension onboarding only; the public site never receives a push client.
export function OnboardingNotificationCard({
  client,
  track,
}: {
  client: PushClient;
  track: TrackEvent;
}) {
  const push = usePushState(client);
  return (
    <VisibilityCheck
      variant="onboarding"
      state={push.state}
      busy={push.busy}
      onTest={push.test}
      onAnswer={push.record}
      onDisable={async () => {
        await push.setEnabled(false);
        track("push_subscription_disabled", {
          surface: "extension_onboarding",
        });
      }}
      track={track}
      surface="extension_onboarding"
    />
  );
}
