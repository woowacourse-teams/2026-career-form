import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import {
  collectFieldsSnapshot,
  collectFieldsSnapshotWithDropdowns,
} from "../dom/collect";
import { collectSemanticContext } from "../dom/semantic-context";
import { buildReviewPlan } from "../review/review-plan";
import { SPLIT_EMAIL_REASON } from "../dom/split-email";

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
  it("recovers the broken birth label only in the generic collection path", async () => {
    collect();
    const snapshot = await collectFieldsSnapshotWithDropdowns(document);
    const fields = snapshot.request.sections.flatMap(
      (section) => section.fields,
    );
    expect(fields.slice(3, 6).map((field) => field.displayName)).toEqual([
      "년",
      "월",
      "일",
    ]);
    for (const field of fields.slice(3, 6)) {
      expect(field.semanticContext?.labels ?? []).toContainEqual({
        source: "label",
        text: "생년월일 *",
      });
    }
    const defaults = collectFieldsSnapshot(document);
    expect(
      defaults.request.sections
        .flatMap((section) => section.fields)
        .slice(3, 6)
        .map(labelTexts),
    ).toEqual([[], [], []]);
  });

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
    expect(labelTexts(fields[3]!)).toContain("생년월일 *");
    const year = document.querySelector<HTMLElement>(
      ".birth-date-selects select",
    )!;
    expect(collectSemanticContext(year, null).labels).toContainEqual({
      source: "label",
      text: "생년월일",
    });
  });

  // The sanitized snapshot keeps the domain select's option values
  // (gmail.com, …) while its labels are "[TEXT]"; the live page labels them
  // with the same domains. Either form marks the pair as a split email.
  it("treats the email id input with a domain-valued select as a split email", () => {
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
    expect(plan.items[0]?.status).not.toBe("available");
    expect(plan.items[0]).toMatchObject({ reason: SPLIT_EMAIL_REASON });
  });

  it("recovers an unassociated sibling title and description without borrowing other questions", () => {
    const { fields } = collect(() => {
      const input = document.querySelector<HTMLInputElement>("#phone")!;
      const title = input.previousElementSibling!;
      const block = document.createElement("div");
      block.innerHTML = "<p>추천인 연락 방법</p><p>본인 연락처가 아닙니다.</p>";
      title.replaceWith(block);
      input.placeholder = "내용 입력";
    });
    expect(fields[1]?.displayName).toBe("추천인 연락 방법");
    expect(fields[1]?.semanticContext?.labels).toContainEqual({
      source: "description",
      text: "본인 연락처가 아닙니다.",
    });
    expect(labelTexts(fields[0]!)).not.toContain("추천인 연락 방법");
    expect(fields.slice(3, 6).map(labelTexts)).toEqual([[], [], []]);
  });
});
