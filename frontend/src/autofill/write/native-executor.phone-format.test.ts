import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => document.body.replaceChildren());

const PHONE_KEY = "contact.contact.phoneNumber";
const DIGITS = "01000000000";

/** A tel box that inserts hyphens as the user types, like the Toss form. */
function phoneBox(format: (digits: string) => string) {
  document.body.innerHTML = `<label>휴대폰 번호<input type="tel" name="fields.phone" autocomplete="tel"></label>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  input.addEventListener("input", () => {
    input.value = format(input.value.replace(/\D/g, ""));
  });
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field-1",
    candidate: {
      candidateId: "field-1",
      element: "input",
      control: "text",
      displayName: "휴대폰 번호",
      visibility: "visible",
    },
    elements: [input],
    optionElements: new Map(),
    sectionId: "section-1",
    signature: createStructuralSignature([input]),
  });
  return { input, registry };
}

function item(key = PHONE_KEY): ReviewPlanItem {
  const analysis: MatchedFieldAnalysis = {
    candidateId: "field-1",
    matchType: "MATCH",
    profileFieldKey: key,
    autofillPolicy: "ALLOWED",
    mappingStatus: "LLM_SUGGESTED",
    interactionStatus: "READY",
    writePlan: { command: "SET_TEXT" },
  };
  return {
    candidateId: "field-1",
    fieldLabel: "휴대폰 번호",
    profileFieldKey: key,
    currentValue: "",
    profileValue: DIGITS,
    previewValue: DIGITS,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "테스트",
    analysis,
  };
}

async function run(registry: CandidateRegistry, entry = item()) {
  const [result] = await executeApprovedWritesAfterPageSettles({
    items: [entry],
    approvedCandidateIds: new Set(["field-1"]),
    registry,
  });
  return result;
}

const hyphenated = (digits: string) =>
  digits.length === 11
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : digits;

describe("phone numbers the site reformats", () => {
  it("counts a hyphenated echo of the same digits as written", async () => {
    const { input, registry } = phoneBox(hyphenated);

    const result = await run(registry);

    expect(input.value).toBe("010-0000-0000");
    expect(result?.status).toBe("written");
  });

  it("still flags a site that changes the digits", async () => {
    const { registry } = phoneBox((digits) => digits.slice(0, 10));

    expect((await run(registry))?.status).not.toBe("written");
  });

  it("keeps exact matching for fields that are not phone numbers", async () => {
    const { registry } = phoneBox(hyphenated);

    expect(
      (await run(registry, item("contact.contact.postalCode")))?.status,
    ).not.toBe("written");
  });
});
