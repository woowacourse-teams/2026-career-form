import { describe, expect, it } from "vitest";

import {
  isOpenAutofillOverlayMessage,
  isOpenOptionsPageMessage,
  isOpenSidePanelMessage,
} from "./messages";

describe("autofill overlay messages", () => {
  it("accepts only the message that opens the webpage overlay", () => {
    expect(
      isOpenAutofillOverlayMessage({
        type: "career-form:open-autofill-overlay",
      }),
    ).toBe(true);
    expect(
      isOpenAutofillOverlayMessage({ type: "career-form:close-overlay" }),
    ).toBe(false);
    expect(isOpenAutofillOverlayMessage(null)).toBe(false);
  });
});

it("accepts only the message that asks the background to open profile management", () => {
  expect(
    isOpenOptionsPageMessage({ type: "career-form:open-options-page" }),
  ).toBe(true);
  expect(
    isOpenOptionsPageMessage({ type: "career-form:open-side-panel" }),
  ).toBe(false);
});

it("accepts only the message that opens the side panel", () => {
  expect(isOpenSidePanelMessage({ type: "career-form:open-side-panel" })).toBe(
    true,
  );
  expect(
    isOpenSidePanelMessage({ type: "career-form:open-autofill-overlay" }),
  ).toBe(false);
});
