// @vitest-environment node
import { describe, expect, it } from "vitest";
import { releaseFlagViolations } from "./assert-release-flags.mjs";

describe("release flag guard", () => {
  it("rejects the debug flag", () => {
    expect(releaseFlagViolations({ VITE_AUTOFILL_DEBUG: "true" })).toHaveLength(
      1,
    );
    expect(
      releaseFlagViolations({ VITE_AUTOFILL_DEBUG: " TRUE " }),
    ).toHaveLength(1);
  });
  it("allows unset or other values", () => {
    expect(releaseFlagViolations({})).toEqual([]);
    expect(releaseFlagViolations({ VITE_AUTOFILL_DEBUG: "false" })).toEqual([]);
  });
});
