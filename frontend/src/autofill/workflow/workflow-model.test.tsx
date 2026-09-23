import { describe, expect, it } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  adapterProfileValue,
  localProfileValue,
  reviewProfileFieldKey,
  shouldRunRevealPlan,
  stateDriverKey,
  writeResultOutcome,
} from "./workflow-model";

function item(overrides: Partial<ReviewPlanItem> = {}): ReviewPlanItem {
  return {
    candidateId: "candidate-1",
    fieldLabel: "field",
    profileFieldKey: "personal.personal.nationality",
    currentValue: "",
    profileValue: "대한민국",
    previewValue: "대한민국",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "",
    analysis: {
      candidateId: "candidate-1",
      matchType: "MATCH",
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "personal.personal.nationality",
      },
      autofillPolicy: "ALLOWED",
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    },
    ...overrides,
  };
}

describe("workflow model safety decisions", () => {
  it("requires reveal plans to match a declared selectable profile value", () => {
    expect(shouldRunRevealPlan("yes", "yes")).toBe(true);
    expect(shouldRunRevealPlan("no", "yes")).toBe(false);
    expect(shouldRunRevealPlan("yes", undefined)).toBe(true);
    expect(shouldRunRevealPlan("yes", "no", ["yes", "maybe"])).toBe(true);
    expect(shouldRunRevealPlan("no", "no", ["yes", "maybe"])).toBe(false);
  });

  it("uses a direct binding over a stale item-level profile key", () => {
    const bound = item({ profileFieldKey: "contact.contact.email" });
    expect(reviewProfileFieldKey(bound)).toBe("personal.personal.nationality");
    expect(
      stateDriverKey(bound, "nation", 2),
    ).toBe("item-2|personal.personal.nationality|nation");
  });

  it("keeps driver identities distinct for profile entries and unbound fields", () => {
    const bound = item({ profileEntryId: "profile-entry" });
    const unbound = item({ analysis: undefined, profileFieldKey: undefined });

    expect(stateDriverKey(bound, undefined, 0)).toBe(
      "profile-entry|personal.personal.nationality|candidate-1",
    );
    expect(stateDriverKey(unbound, undefined, undefined)).toBe(
      "item-single|unbound|candidate-1",
    );
  });

  it("does not manufacture a local value for an unresolved profile key", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";

    expect(localProfileValue(profile, "contact.contact.email")).toBe(
      "me@example.test",
    );
    expect(localProfileValue(profile, "unknown.invalid.key")).toBeUndefined();
  });

  it("applies adapter normalization after canonical profile normalization", () => {
    const adapter = {
      normalizeProfileValue: (key: string, value: string) =>
        `${key}:${value.toUpperCase()}`,
    };

    expect(
      adapterProfileValue(adapter as never, "personal.personal.nationality", "대한민국"),
    ).toBe("personal.personal.nationality:대한민국");
  });

  it("keeps result-only skipped outcomes distinct from writes", () => {
    expect(
      writeResultOutcome({ candidateId: "a", status: "written" }),
    ).toBe("success");
    expect(
      writeResultOutcome({ candidateId: "a", status: "skipped", reason: "x" }),
    ).toBe("needs-verification");
    expect(
      writeResultOutcome({
        candidateId: "a",
        status: "skipped",
        reason: "x",
        outcome: "unchanged",
      }),
    ).toBe("unchanged");
  });
});
