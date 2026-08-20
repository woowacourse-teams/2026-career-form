export const OPEN_AUTOFILL_OVERLAY_MESSAGE = {
  type: "career-form:open-autofill-overlay",
} as const;

export function isOpenAutofillOverlayMessage(
  message: unknown,
): message is typeof OPEN_AUTOFILL_OVERLAY_MESSAGE {
  if (typeof message !== "object" || message === null) return false;
  return (
    "type" in message && message.type === OPEN_AUTOFILL_OVERLAY_MESSAGE.type
  );
}
