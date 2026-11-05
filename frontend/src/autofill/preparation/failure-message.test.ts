import { describe, expect, it } from "vitest";

import { preparationFailureMessage } from "./failure-message";

describe("preparationFailureMessage", () => {
  it("maps a missing expected field to a safe diagnosis", () => {
    expect(preparationFailureMessage("expected-fields-not-visible")).toBe(
      "조건부 입력 항목이 표시되지 않았습니다",
    );
  });

  it("maps an action re-identification failure to its specific diagnosis", () => {
    expect(preparationFailureMessage("action-not-reidentified")).toBe(
      "화면 갱신 뒤 추가 동작을 다시 찾지 못했습니다",
    );
  });
});
