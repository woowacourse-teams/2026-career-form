import { afterEach, beforeEach, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { createProgressTracker } from "./progress-model";
import { resultFieldState } from "./result-field-state";
import { buildResultModel } from "./result-model";

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://synthetic.career.greetinghr.com/ko/o/1/apply",
  });
});
afterEach(() => document.body.replaceChildren());

function snapshot(checked: boolean, greeting = true) {
  const name = greeting
    ? "workHistory.workExperiences.0.employmentStatus"
    : "newsletter";
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>직장경력</label>
    <div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item">
      <input name="workHistory.workExperiences.0.companyName">
      <label><input type="checkbox" name="${name}" ${checked ? "checked" : ""}>재직 중</label>
    </div></div></div>`;
  const collected = collectFieldsSnapshot(document);
  const field = collected.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ])
    .find((field) => field.domName === name)!;
  expect(field).toBeDefined();
  return {
    registry: collected.registry,
    candidateId: field.candidateId,
    checkbox: document.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!,
  };
}
function item(candidateId: string, value: string): ReviewPlanItem {
  return {
    candidateId,
    fieldLabel: "재직 여부",
    profileFieldKey: "careers.career.employmentStatus",
    currentValue: "",
    profileValue: value,
    previewValue: value,
    itemIndex: 0,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "",
    analysis: {
      candidateId,
      matchType: "MATCH",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      autofillPolicy: "ALLOWED",
      writePlan: { command: "CHECK_CHECKBOX" },
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "careers.career.employmentStatus",
      },
    },
  };
}

it.each([
  [false, "퇴사"],
  [true, "재직중"],
] as const)(
  "retains a written Greeting employment value after recollection: checked=%s, value=%s",
  (checked, value) => {
    const original = snapshot(checked);
    const review = item(original.candidateId, value);
    const tracker = createProgressTracker();
    const written = {
      candidateId: review.candidateId,
      status: "written" as const,
    };
    const progress = tracker.record(review, written, original.registry);
    const next = snapshot(checked);
    expect(next.candidateId).toBe(review.candidateId);
    expect(
      tracker.rebindWritten(review, original.registry, next.registry),
    ).toBe(true);
    const model = () =>
      buildResultModel({
        reviewItems: [review],
        results: [written],
        progress,
        wasWritten: (id) => tracker.wasWritten(id, next.registry),
        progressIdFor: (id) => tracker.progressIdFor(id, next.registry),
        progressStateFor: tracker.progressStateFor,
        fieldStateFor: (id) => resultFieldState(next.registry, document, id),
      });
    expect(
      resultFieldState(next.registry, document, review.candidateId)?.value,
    ).toBe(value);
    expect(tracker.progressStateFor(progress[0].id)).toBe(true);
    expect(model().completed).toHaveLength(1);
    expect(model().pending).toEqual([]);
    next.checkbox.checked = !checked;
    expect(tracker.progressStateFor(progress[0].id)).toBe(false);
    expect(model().completed).toEqual([]);
    expect(model().pending).toMatchObject([{ reason: "입력 결과 확인" }]);
  },
);
it("does not interpret a generic unchecked checkbox as a Greeting resignation value", () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "https://example.com/apply" });
  const original = snapshot(false, false);
  const review = item(original.candidateId, "퇴사");
  const tracker = createProgressTracker();
  const progress = tracker.record(
    review,
    { candidateId: review.candidateId, status: "written" },
    original.registry,
  );
  expect(tracker.progressStateFor(progress[0].id)).toBe(false);
});
