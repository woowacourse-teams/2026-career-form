export const OPEN_AUTOFILL_OVERLAY_MESSAGE = {
  type: "career-form:open-autofill-overlay",
} as const;

export const OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE = {
  type: "career-form:open-in-page-profile-panel",
} as const;

export const OPEN_SIDE_PANEL_MESSAGE = {
  type: "career-form:open-side-panel",
} as const;

export function isOpenAutofillOverlayMessage(
  message: unknown,
): message is typeof OPEN_AUTOFILL_OVERLAY_MESSAGE {
  if (typeof message !== "object" || message === null) return false;
  return (
    "type" in message && message.type === OPEN_AUTOFILL_OVERLAY_MESSAGE.type
  );
}

export function isOpenInPageProfilePanelMessage(
  message: unknown,
): message is typeof OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE.type
  );
}

export function isOpenSidePanelMessage(
  message: unknown,
): message is typeof OPEN_SIDE_PANEL_MESSAGE {
  if (typeof message !== "object" || message === null) return false;
  return "type" in message && message.type === OPEN_SIDE_PANEL_MESSAGE.type;
}
