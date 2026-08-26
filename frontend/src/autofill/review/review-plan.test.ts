import { describe, expect, it } from "vitest";

import type { FieldsAnalyzeResponse } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { createEmptyProfile, type Profile } from "../../profile/model";
import { buildReviewPlan, resolveProfileFieldValue } from "./review-plan";

function response(
  fields: FieldsAnalyzeResponse["fields"],
  analysisStatus: FieldsAnalyzeResponse["analysisStatus"] = "COMPLETE",
): FieldsAnalyzeResponse {
  return {
    snapshotId: "snapshot-1",
    mode: "GENERIC",
    analysisStatus,
    fields,
  };
}

function registryWithTextField(currentValue = "") {
  const element = document.createElement("input");
  element.type = "email";
  element.value = currentValue;
  document.body.append(element);

  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field-1",
    candidate: {
      candidateId: "field-1",
      element: "input",
      control: "text",
      visibility: "visible",
      displayName: "이메일주소",
    },
    elements: [element],
    optionElements: new Map(),
    sectionId: "section-1",
    signature: createStructuralSignature([element]),
  });

  return registry;
}

const allowedEmail = {
  candidateId: "field-1",
  matchType: "MATCH" as const,
  profileFieldKey: "contact.contact.email",
  autofillPolicy: "ALLOWED" as const,
  mappingStatus: "LLM_SUGGESTED" as const,
  interactionStatus: "READY" as const,
  writePlan: { command: "SET_TEXT" as const },
};

describe("profile value resolution", () => {
  it("resolves a declared single-value profile field", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";

    expect(resolveProfileFieldValue(profile, "contact.contact.email")).toEqual({
      status: "resolved",
      value: "me@example.test",
      sensitive: false,
    });
  });

  it("does not choose between repeated profile entries", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: { name: "자격증 A" },
        },
        {
          id: "certificate-2",
          sectionId: "certificate",
          values: { name: "자격증 B" },
        },
      ],
    };

    expect(
      resolveProfileFieldValue(profile, "certifications.certificate.name"),
    ).toEqual({ status: "ambiguous", sensitive: false });
  });
});

describe("review plan", () => {
  it("selects a ready allowed value when the page field is empty", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";

    const plan = buildReviewPlan({
      analysis: response([allowedEmail]),
      profile,
      registry: registryWithTextField(),
    });

    expect(plan).toMatchObject({
      status: "ready",
      items: [
        {
          candidateId: "field-1",
          fieldLabel: "이메일주소",
          currentValue: "",
          previewValue: "me@example.test",
          status: "available",
          selected: true,
          disabled: false,
        },
      ],
    });
  });

  it.each([
    [
      "conditional policy",
      { ...allowedEmail, autofillPolicy: "CONDITIONAL" as const },
      "needs-review",
    ],
    ["a current page value", allowedEmail, "conflict"],
  ])("leaves %s unselected", (_name, field, expectedStatus) => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";
    const registry = registryWithTextField(
      expectedStatus === "conflict" ? "already@page.test" : "",
    );

    const [item] = buildReviewPlan({
      analysis: response([field]),
      profile,
      registry,
    }).items;

    expect(item).toMatchObject({
      status: expectedStatus,
      selected: false,
      disabled: false,
    });
  });

  it("masks and disables a sensitive value before the user reveals it", () => {
    const profile = createEmptyProfile();
    profile.military.militaryStatus = "복무 완료";
    const registry = registryWithTextField();

    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          profileFieldKey: "military.military.militaryStatus",
          autofillPolicy: "SENSITIVE_CONFIRMATION",
        },
      ]),
      profile,
      registry,
    }).items;

    expect(item).toMatchObject({
      status: "sensitive",
      previewValue: "••••••••",
      selected: false,
      disabled: true,
      revealed: false,
    });
  });

  it("makes unmatched, non-ready, or missing-value fields unavailable", () => {
    const profile = createEmptyProfile();
    const registry = registryWithTextField();

    const plan = buildReviewPlan({
      analysis: response([
        {
          candidateId: "field-1",
          matchType: "NO_MATCH",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "BLOCKED",
          reasonCodes: ["NO_MATCH"],
        },
      ]),
      profile,
      registry,
    });

    expect(plan).toMatchObject({
      status: "ready",
      items: [{ status: "unavailable", selected: false, disabled: true }],
    });
  });

  it("keeps a partial response distinguishable from a blocked response", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";
    const registry = registryWithTextField();

    expect(
      buildReviewPlan({
        analysis: response([allowedEmail], "PARTIAL"),
        profile,
        registry,
      }).status,
    ).toBe("partial");
    expect(
      buildReviewPlan({
        analysis: response([], "BLOCKED"),
        profile,
        registry,
      }),
    ).toEqual({ status: "blocked", items: [] });
  });
});
