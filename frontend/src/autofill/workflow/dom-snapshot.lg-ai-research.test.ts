import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";

const FIXTURE = join(
  process.cwd(),
  "fixtures/dom-snapshots/lg-ai-research-birth-split-email/sanitized.html",
);

afterEach(() => document.body.replaceChildren());

function collect(mutate?: () => void) {
  document.body.innerHTML = readFileSync(FIXTURE, "utf8");
  mutate?.();
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => section.fields);
  return { snapshot, fields };
}

const labelTexts = (field: {
  semanticContext?: { labels?: { text: string }[] };
}) => field.semanticContext?.labels?.map((label) => label.text) ?? [];

// Sanitized structure from a real LG AI Research application page. This is not
// evidence of installed-extension behavior or of live-site success rates.
describe("LG AI Research sanitized application form structure", () => {
  it("collects the birth-date selects without the 생년월일 label context", () => {
    const { fields } = collect();
    expect(fields.map((field) => field.control)).toEqual([
      "text",
      "text",
      "select",
      "select",
      "select",
      "select",
      "text",
      "select",
      "text",
      "checkbox",
    ]);
    expect(fields.slice(3, 6).map((field) => field.displayName)).toEqual([
      "년",
      "월",
      "일",
    ]);
    expect(fields.slice(3, 6).map(labelTexts)).toEqual([[], [], []]);
  });

  it("links the year select to 생년월일 once the broken for target exists", () => {
    const { fields } = collect(() => {
      const label = Array.from(document.querySelectorAll("label")).find(
        (candidate) => candidate.textContent?.includes("생년월일"),
      )!;
      document.querySelector(".birth-date-selects select")!.id = label.htmlFor;
    });
    expect(labelTexts(fields[3]!)).toContain("생년월일");
  });

  it("does not treat the email id input as an unsupported split email", () => {
    const { snapshot, fields } = collect();
    const emailId = fields[6]!;
    const profile = createEmptyProfile();
    profile.contact.email = "qa@example.test";
    const plan = buildReviewPlan({
      analysis: {
        snapshotId: snapshot.request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [
          {
            candidateId: emailId.candidateId,
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "contact.contact.email",
            },
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          },
        ],
      },
      profile,
      registry: snapshot.registry,
    });
    expect(emailId.displayName).toBe("이메일 아이디");
    expect(plan.items[0]).toMatchObject({ status: "available" });
  });
});
