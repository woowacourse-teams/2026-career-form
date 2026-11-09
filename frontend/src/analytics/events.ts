const analyticsEvents = [
  "autofill_start_clicked",
  "onboarding_first_viewed",
  "onboarding_step_viewed",
  "onboarding_completed",
  "profile_first_saved",
  "autofill_open_succeeded",
  "autofill_open_failed",
  "profile_copy_clicked",
  "profile_management_clicked",
  "profile_export_clicked",
  "profile_import_clicked",
  "greeting_import_offered",
  "greeting_import_viewed",
  "greeting_import_saved",
  "landing_viewed",
  "onboarding_viewed",
  "install_link_clicked",
  "trial_viewed",
  "trial_started",
  "trial_completed",
  "push_subscription_enabled",
  "push_subscription_disabled",
  "push_roles_saved",
  "posting_notification_shown",
  "posting_notification_opened",
  "posting_notification_saved",
  "posting_inbox_viewed",
  "posting_inbox_saved",
  "notification_test_sent",
  "notification_visibility_answered",
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
const visibilityAnswers = ["seen", "not_seen"] as const;
// The six steps of the extension's first-install onboarding, in order.
export const ONBOARDING_STEPS = [
  "name",
  "email",
  "roles",
  "alerts",
  "greeting",
  "usage",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
const saveTriggers = ["button"] as const;

export type AnalyticsEvent = (typeof analyticsEvents)[number];
export interface AnalyticsProperties {
  readonly surface: (typeof analyticsSurfaces)[number];
  readonly page_host?: string;
  readonly posting_id?: string;
  readonly answer?: (typeof visibilityAnswers)[number];
  readonly trigger?: (typeof saveTriggers)[number];
  // Notification display delay in milliseconds; a non-negative integer only.
  readonly delay_ms?: number;
  // How many roles the user keeps selected; never the codes themselves.
  readonly role_count?: number;
  // Which onboarding step was entered; a fixed name, never what was typed.
  readonly step?: OnboardingStep;
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
    ...("answer" in input && visibilityAnswers.some((v) => v === input.answer)
      ? { answer: input.answer as (typeof visibilityAnswers)[number] }
      : {}),
    ...("trigger" in input && saveTriggers.some((v) => v === input.trigger)
      ? { trigger: input.trigger as (typeof saveTriggers)[number] }
      : {}),
    ...("delay_ms" in input &&
    typeof input.delay_ms === "number" &&
    Number.isSafeInteger(input.delay_ms) &&
    input.delay_ms >= 0
      ? { delay_ms: input.delay_ms }
      : {}),
    ...("role_count" in input &&
    typeof input.role_count === "number" &&
    Number.isSafeInteger(input.role_count) &&
    input.role_count >= 0
      ? { role_count: input.role_count }
      : {}),
    ...("step" in input && ONBOARDING_STEPS.some((v) => v === input.step)
      ? { step: input.step as OnboardingStep }
      : {}),
  };
  return { event, properties };
}
