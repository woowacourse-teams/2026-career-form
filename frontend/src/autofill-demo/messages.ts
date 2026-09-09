export const OPEN_AUTOFILL_OVERLAY_MESSAGE = {
  type: "career-form:open-autofill-overlay",
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

export function isOpenSidePanelMessage(
  message: unknown,
): message is typeof OPEN_SIDE_PANEL_MESSAGE {
  if (typeof message !== "object" || message === null) return false;
  return "type" in message && message.type === OPEN_SIDE_PANEL_MESSAGE.type;
}
