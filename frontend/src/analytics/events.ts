const analyticsEvents = [
  "autofill_start_clicked",
  "profile_copy_clicked",
  "profile_management_clicked",
  "profile_export_clicked",
  "profile_import_clicked",
  "landing_viewed",
  "onboarding_viewed",
  "install_link_clicked",
] as const;

const analyticsSurfaces = [
  "in_page_panel",
  "side_panel",
  "options",
  "site",
  "extension_onboarding",
] as const;

export type AnalyticsEvent = (typeof analyticsEvents)[number];
export interface AnalyticsProperties {
  readonly surface: (typeof analyticsSurfaces)[number];
  readonly page_host?: string;
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
  const properties: AnalyticsProperties =
    surface === "in_page_panel" &&
    "page_host" in input &&
    typeof input.page_host === "string" &&
    input.page_host.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(
      input.page_host,
    )
      ? { surface, page_host: input.page_host }
      : { surface };
  return { event, properties };
}
