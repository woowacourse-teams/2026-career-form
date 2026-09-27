import { afterEach, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { createProgressTracker } from "./progress-model";
import { resultFieldState } from "./result-field-state";
import { buildResultModel } from "./result-model";
import {
  captureGreetingResultTargets,
  recollectGreetingResultRegistry,
} from "./greeting-result-registry";

const schoolName = "educationalBackground.universities.0.schoolName";
const scoreName = "educationalBackground.universities.0.gpa.score";

function item(
  candidateId: string,
  key: string,
  entryId?: string,
): ReviewPlanItem {
  return {
    candidateId,
    fieldLabel: key,
    profileFieldKey: key,
    ...(entryId ? { profileEntryId: entryId } : {}),
    ...(entryId ? { itemIndex: 0 } : {}),
    currentValue: "",
    profileValue: "4.2",
    previewValue: "4.2",
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
      valueBinding: { type: "DIRECT", profileFieldKey: key },
      writePlan: { command: "SET_TEXT" },
    },
  };
}

function setup() {
  document.body.innerHTML = `<section><div data-scope="accordion" data-part="root">
    <div data-scope="accordion" data-part="item">
      <div data-scope="field" data-part="root"><label>학교명</label><input name="${schoolName}" value="서울대학교"></div>
      <div data-scope="field" data-part="root"><label>학점</label><input name="${scoreName}" value="4.2"></div>
    </div>
  </div></section>`;
  const snapshot = collectFieldsSnapshot(document, {
    executionAdapterId: "greeting-v1",
  });
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((row) => row.fields),
  ]);
  const score = fields.find((field) => field.domName === scoreName)!;
  const review = item(score.candidateId, "education.university.gpa", "entry-1");
  const captured = captureGreetingResultTargets(snapshot.registry, [review]);
  const recollect = (items = [review]) =>
    recollectGreetingResultRegistry(document, captured, items);
  return { snapshot, review, recollect };
}

afterEach(() => document.body.replaceChildren());

it("reconnects a replaced control in the same connected education row", () => {
  const { snapshot, review, recollect } = setup();
  const score = document.querySelector<HTMLInputElement>(
    `input[name="${scoreName}"]`,
  )!;
  score.outerHTML = score.outerHTML;
  expect(snapshot.registry.lookupField(review.candidateId).status).toBe(
    "stale",
  );
  const lookup = recollect().lookupField(review.candidateId);
  expect(lookup.status).toBe("ready");
  if (lookup.status === "ready") {
    expect(lookup.handle.elements[0]?.value).toBe("4.2");
    expect(lookup.handle.candidateId).toBe(review.candidateId);
  }
});

it("does not confuse the old candidate ID with a newly inserted field", () => {
  const { review, recollect } = setup();
  document
    .querySelector("section")!
    .insertAdjacentHTML(
      "afterbegin",
      '<label>새 필드<input name="basicInformation.newField"></label>',
    );
  const lookup = recollect().lookupField(review.candidateId);
  expect(lookup.status).toBe("ready");
  if (lookup.status === "ready")
    expect(lookup.handle.candidate.domName).toBe(scoreName);
});

it("rejects duplicate names and changed review binding", () => {
  const { review, recollect } = setup();
  const changed = {
    ...review,
    profileEntryId: "another-entry",
  };
  expect(recollect([changed]).lookupField(review.candidateId).status).toBe(
    "unknown",
  );
  document
    .querySelector(`input[name="${scoreName}"]`)!
    .insertAdjacentHTML("afterend", `<input name="${scoreName}" value="4.2">`);
  expect(recollect().lookupField(review.candidateId).status).toBe("unknown");
});

it("rejects row-count changes and a different control shape", () => {
  const { review, recollect } = setup();
  const row = document.querySelector(
    `[data-scope="accordion"][data-part="item"]`,
  )!;
  row.insertAdjacentHTML("afterend", row.outerHTML.replaceAll(".0.", ".1."));
  expect(recollect().lookupField(review.candidateId).status).toBe("unknown");
  row.nextElementSibling?.remove();
  document.querySelector(`input[name="${scoreName}"]`)!.outerHTML =
    `<button type="button" name="${scoreName}">4.2</button>`;
  expect(recollect().lookupField(review.candidateId).status).toBe("unknown");
});

it.each(["control", "row"] as const)(
  "keeps one verified completion after a %s replacement, then detects a changed value",
  (replacement) => {
    const { snapshot, review, recollect } = setup();
    const tracker = createProgressTracker();
    const receipt = {
      candidateId: review.candidateId,
      status: "written" as const,
    };
    const progress = tracker.record(review, receipt, snapshot.registry);
    const score = document.querySelector<HTMLInputElement>(
      `input[name="${scoreName}"]`,
    )!;
    const remount =
      replacement === "row"
        ? score.closest('[data-scope="accordion"][data-part="item"]')!
        : score;
    remount.outerHTML = remount.outerHTML;
    const registry = recollect();
    tracker.rebindWritten(review, snapshot.registry, registry);
    const model = () =>
      buildResultModel({
        reviewItems: [review],
        results: [receipt],
        progress,
        fieldStateFor: (id) => resultFieldState(registry, document, id),
        progressIdFor: (id) => tracker.progressIdFor(id, registry),
        progressStateFor: (id) => tracker.progressStateFor(id),
        wasWritten: (id) => tracker.wasWritten(id, registry),
      });
    expect(model().completed).toHaveLength(1);
    expect(model().pending).toHaveLength(0);
    document.querySelector<HTMLInputElement>(
      `input[name="${scoreName}"]`,
    )!.value = "3.9";
    expect(model().completed).toHaveLength(0);
    expect(model().pending).toHaveLength(1);
  },
);

it("does not create a completion from a matching current value without a receipt", () => {
  const { snapshot, review, recollect } = setup();
  const tracker = createProgressTracker();
  const registry = recollect();
  expect(tracker.rebindWritten(review, snapshot.registry, registry)).toBe(
    false,
  );
  expect(tracker.wasWritten(review.candidateId, registry)).toBe(false);
});

// A readback must survive a framework remount while preserving the reviewed row identity.
it("reconnects a remounted education row only in its original connected container", () => {
  const { review, recollect } = setup();
  const row = document.querySelector(
    '[data-scope="accordion"][data-part="item"]',
  )!;
  row.outerHTML = row.outerHTML;
  expect(recollect().lookupField(review.candidateId).status).toBe("ready");
  const container = document.querySelector(
    '[data-scope="accordion"][data-part="root"]',
  )!;
  container.outerHTML = container.outerHTML;
  expect(recollect().lookupField(review.candidateId).status).toBe("unknown");
});

it("does not report completion when a remounted row loses the written value", () => {
  const { snapshot, review, recollect } = setup();
  const tracker = createProgressTracker();
  const receipt = {
    candidateId: review.candidateId,
    status: "written" as const,
  };
  const progress = tracker.record(review, receipt, snapshot.registry);
  const row = document.querySelector(
    '[data-scope="accordion"][data-part="item"]',
  )!;
  row.outerHTML = row.outerHTML;
  const registry = recollect();
  expect(tracker.rebindWritten(review, snapshot.registry, registry)).toBe(true);
  document.querySelector<HTMLInputElement>(
    `input[name="${scoreName}"]`,
  )!.value = "3.9";
  const model = buildResultModel({
    reviewItems: [review],
    results: [receipt],
    progress,
    fieldStateFor: (id) => resultFieldState(registry, document, id),
    progressIdFor: (id) => tracker.progressIdFor(id, registry),
    progressStateFor: (id) => tracker.progressStateFor(id),
    wasWritten: (id) => tracker.wasWritten(id, registry),
  });
  expect(model.completed).toHaveLength(0);
  expect(model.pending).toHaveLength(1);
});

it("rejects a remounted row whose named index changed", () => {
  const { review, recollect } = setup();
  const row = document.querySelector(
    '[data-scope="accordion"][data-part="item"]',
  )!;
  row.outerHTML = row.outerHTML.replaceAll(".0.", ".1.");
  expect(recollect().lookupField(review.candidateId).status).toBe("unknown");
});

it("reconnects an English-name manual-review target without making it writable", () => {
  document.body.innerHTML = `<section><div data-scope="field" data-part="root">
    <label>영문이름</label><input name="basicInformation.englishName" type="text">
  </div></section>`;
  const snapshot = collectFieldsSnapshot(document, {
    executionAdapterId: "greeting-v1",
  });
  const field = snapshot.request.sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.domName === "basicInformation.englishName")!;
  const review: ReviewPlanItem = {
    candidateId: field.candidateId,
    fieldLabel: "영문이름",
    currentValue: "",
    previewValue: "",
    status: "unavailable",
    selected: false,
    disabled: true,
    revealed: false,
    reason: "영문 성·이름 순서를 확인하고 직접 입력해 주세요.",
    manualReviewReason: "영문 이름 순서 확인",
  };
  const captured = captureGreetingResultTargets(snapshot.registry, [review]);
  const input = document.querySelector<HTMLInputElement>(
    'input[name="basicInformation.englishName"]',
  )!;
  input.outerHTML = input.outerHTML;
  const registry = recollectGreetingResultRegistry(document, captured, [
    review,
  ]);
  expect(registry.lookupField(review.candidateId).status).toBe("ready");
  const model = buildResultModel({
    reviewItems: [review],
    results: [],
    fieldStateFor: (id) => resultFieldState(registry, document, id),
  });
  expect(model.pending).toHaveLength(1);
  expect(model.completed).toHaveLength(0);
  expect(input.isConnected).toBe(false);
});
