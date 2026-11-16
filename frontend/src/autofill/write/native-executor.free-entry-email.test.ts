import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => document.body.replaceChildren());

const EMAIL_KEY = "contact.contact.email";

/**
 * A free-entry email box shaped like the live Toss form: role="combobox" with
 * a domain-suggestion popup linked by aria-owns, not a selection listbox.
 */
function emailBox(extra = "") {
  document.body.innerHTML = `<form><div><span>이메일</span>
    <div><input class="input__field" autocomplete="off" name="fields.email"
      id="email" aria-expanded="false" aria-owns="email-suggestions"
      aria-haspopup="true" role="combobox" ${extra}></div>
    <ul id="email-suggestions" role="listbox" hidden></ul></div></form>`;
  const input = document.querySelector<HTMLInputElement>("#email")!;
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field-1",
    candidate: {
      candidateId: "field-1",
      element: "input",
      control: "text",
      displayName: "이메일",
      visibility: "visible",
    },
    elements: [input],
    optionElements: new Map(),
    sectionId: "section-1",
    signature: createStructuralSignature([input]),
  });
  return { input, registry };
}

function item(profileValue: string, key = EMAIL_KEY): ReviewPlanItem {
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
    fieldLabel: "이메일",
    profileFieldKey: key,
    currentValue: "",
    profileValue,
    previewValue: profileValue,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "테스트",
    analysis,
  };
}

async function run(registry: CandidateRegistry, entry: ReviewPlanItem) {
  const [result] = await executeApprovedWritesAfterPageSettles({
    items: [entry],
    approvedCandidateIds: new Set(["field-1"]),
    registry,
  });
  return result;
}

describe("free-entry email combobox", () => {
  it("types the email into a suggestion-only combobox", async () => {
    const { input, registry } = emailBox();
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    const result = await run(registry, item("synthetic@example.test"));

    expect(result?.status).toBe("written");
    expect(input.value).toBe("synthetic@example.test");
    expect(events).toEqual(["input", "change"]);
  });

  it("keeps an existing email and a readonly box", async () => {
    const filled = emailBox('value="mine@example.test"');
    expect(
      (await run(filled.registry, item("synthetic@example.test")))?.status,
    ).not.toBe("written");
    expect(filled.input.value).toBe("mine@example.test");

    const readonly = emailBox("readonly");
    expect(
      (await run(readonly.registry, item("synthetic@example.test")))?.status,
    ).not.toBe("written");
    expect(readonly.input.value).toBe("");
  });

  it("still requires a selection for a non-email combobox", async () => {
    const { input, registry } = emailBox();
    const result = await run(registry, item("서울", "contact.contact.city"));

    expect(result?.status).not.toBe("written");
    expect(input.value).toBe("");
  });

  it("still requires a selection when the combobox controls a listbox", async () => {
    const { input, registry } = emailBox('aria-controls="email-suggestions"');
    const result = await run(registry, item("synthetic@example.test"));

    expect(result?.status).not.toBe("written");
    expect(input.value).toBe("");
  });

  it("does not report success when the page rejects the email", async () => {
    const { input, registry } = emailBox();
    input.addEventListener("input", () => {
      input.value = "";
    });

    expect(
      (await run(registry, item("synthetic@example.test")))?.status,
    ).not.toBe("written");
  });
});
