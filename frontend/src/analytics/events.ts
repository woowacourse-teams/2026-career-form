const analyticsEvents = [
  "autofill_start_clicked",
  "onboarding_first_viewed",
  "onboarding_autofill_selected",
  "onboarding_postings_selected",
  "quick_profile_viewed",
  "profile_first_saved",
  "quick_profile_skipped",
  "autofill_open_succeeded",
  "autofill_open_failed",
  "profile_copy_clicked",
  "profile_management_clicked",
  "profile_export_clicked",
  "profile_import_clicked",
  "greeting_import_viewed",
  "greeting_import_saved",
  "landing_viewed",
  "onboarding_viewed",
  "install_link_clicked",
  "push_subscription_enabled",
  "push_subscription_disabled",
  "posting_notification_shown",
  "posting_notification_opened",
  "posting_notification_saved",
  "posting_inbox_viewed",
  "posting_inbox_saved",
] as const;

const analyticsSurfaces = [
  "in_page_panel",
  "side_panel",
  "options",
  "site",
  "extension_onboarding",
  "notification",
] as const;

// Server posting identifiers only; never company names, links or profile values.
const POSTING_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type AnalyticsEvent = (typeof analyticsEvents)[number];
export interface AnalyticsProperties {
  readonly surface: (typeof analyticsSurfaces)[number];
  readonly page_host?: string;
  readonly posting_id?: string;
}
export type TrackEvent = (
  event: AnalyticsEvent,
  properties: AnalyticsProperties,
) => void;

export function parseAnalyticsMessage(message: unknown) {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "ANALYTICS_TRACK" ||
    !("event" in message) ||
    !("properties" in message)
  ) {
    return undefined;
  }
  const event = analyticsEvents.find((value) => value === message.event);
  const input = message.properties;
  if (
    !event ||
    typeof input !== "object" ||
    input === null ||
    !("surface" in input)
  ) {
    return undefined;
  }
  const surface = analyticsSurfaces.find((value) => value === input.surface);
  if (!surface) return undefined;
  const properties: AnalyticsProperties = {
    surface,
    ...(surface === "in_page_panel" &&
    "page_host" in input &&
    typeof input.page_host === "string" &&
    input.page_host.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(
      input.page_host,
    )
      ? { page_host: input.page_host }
      : {}),
    ...("posting_id" in input &&
    typeof input.posting_id === "string" &&
    POSTING_ID_PATTERN.test(input.posting_id)
      ? { posting_id: input.posting_id }
      : {}),
  };
  return { event, properties };
}
