import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

const PAGE_URL = "https://careers.example.test/apply?step=2";

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

afterEach(() => {
  document.body.replaceChildren();
  setPageUrl("http://localhost:3000");
});

const analysis: MatchedFieldAnalysis = {
  candidateId: "field-1",
  matchType: "MATCH",
  profileFieldKey: "contact.contact.email",
  autofillPolicy: "ALLOWED",
  mappingStatus: "LLM_SUGGESTED",
  interactionStatus: "READY",
  writePlan: { command: "SET_TEXT" },
};

const item: ReviewPlanItem = {
  candidateId: "field-1",
  fieldLabel: "지원서 필드",
  profileFieldKey: analysis.profileFieldKey,
  currentValue: "",
  profileValue: "example@example.com",
  previewValue: "example@example.com",
  status: "available",
  selected: true,
  disabled: false,
  revealed: true,
  reason: "테스트",
  analysis,
};

/** Writes one approved text field while the page moves to `next` mid-run. */
async function writeWhileUrlChanges(start: string, next: () => void) {
  setPageUrl(start);
  const input = document.createElement("input");
  document.body.append(input);
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field-1",
    candidate: {
      candidateId: "field-1",
      element: "input",
      control: "text",
      visibility: "visible",
    },
    elements: [input],
    optionElements: new Map(),
    sectionId: "section-1",
    signature: createStructuralSignature([input]),
  });
  const [result] = await executeApprovedWritesAfterPageSettles({
    items: [item],
    approvedCandidateIds: new Set(["field-1"]),
    registry,
    document,
    beforeWrite: async () => next(),
  });
  return { result: result!, input };
}

describe("run currency across same-document fragment changes", () => {
  it.each([
    ["adds an in-page fragment", PAGE_URL, "#a1"],
    ["changes one in-page fragment to another", `${PAGE_URL}#a1`, "#b2"],
    ["clears an in-page fragment", `${PAGE_URL}#a1`, ""],
  ])("keeps the run current when the page %s", async (_case, start, hash) => {
    const { result, input } = await writeWhileUrlChanges(start, () => {
      window.location.hash = hash;
    });
    expect(result.status).toBe("written");
    expect(input.value).toBe("example@example.com");
  });

  it.each([
    ["enters a hash route", PAGE_URL, "#/step3"],
    ["enters a hashbang route", PAGE_URL, "#!/step3"],
    ["leaves a hash route for an in-page fragment", `${PAGE_URL}#/step2`, "#a1"],
    ["moves between hash routes", `${PAGE_URL}#/step2`, "#/step3"],
  ])("invalidates the run when the page %s", async (_case, start, hash) => {
    const { result, input } = await writeWhileUrlChanges(start, () => {
      window.location.hash = hash;
    });
    expect(result.status).not.toBe("written");
    expect(input.value).toBe("");
  });

  it.each([
    ["path", "/apply-other?step=2#a1"],
    ["query", "/apply?step=3#a1"],
  ])(
    "invalidates the run when the %s changes along with the fragment",
    async (_case, next) => {
      const { result, input } = await writeWhileUrlChanges(PAGE_URL, () => {
        window.history.pushState({}, "", next);
      });
      expect(result.status).not.toBe("written");
      expect(input.value).toBe("");
    },
  );
});
