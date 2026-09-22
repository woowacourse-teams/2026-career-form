import { afterEach, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { createProgressTracker, progressCategory } from "./progress-model";

afterEach(() => document.body.replaceChildren());
function item(candidateId: string): ReviewPlanItem {
  return {
    candidateId,
    fieldLabel: "이름",
    profileFieldKey: "personal.personal.koreanGivenName",
    currentValue: "",
    profileValue: "private-value",
    previewValue: "private-value",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "",
  };
}
function snapshot() {
  const collected = collectFieldsSnapshot(document);
  return {
    registry: collected.registry,
    fields: collected.request.sections.flatMap((s) => s.fields),
  };
}
it("reconciles retries and fresh snapshot IDs for the same control without retaining values", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  const a = item(first.fields[0].candidateId);
  tracker.record(
    a,
    { candidateId: a.candidateId, status: "written" },
    first.registry,
  );
  const next = snapshot();
  const b = item(next.fields[0].candidateId);
  expect(tracker.wasWritten(b.candidateId, next.registry)).toBe(true);
  const entries = tracker.record(
    b,
    {
      candidateId: b.candidateId,
      status: "skipped",
      reason: "verification-failed",
    },
    next.registry,
  );
  expect(entries).toHaveLength(1);
  expect(tracker.wasWritten(b.candidateId, next.registry)).toBe(false);
  expect(entries[0]).toMatchObject({
    category: "기본 인적사항",
    label: "이름",
    status: "skipped",
  });
  expect(JSON.stringify(entries)).not.toContain("private-value");
});
it("keeps different controls with the same binding separate and retains more than six results", () => {
  document.body.innerHTML = Array.from(
    { length: 8 },
    (_, i) => `<label>이름<input id="name-${i}"></label>`,
  ).join("");
  const tracker = createProgressTracker();
  const { registry, fields } = snapshot();
  let entries;
  for (const field of fields)
    entries = tracker.record(
      item(field.candidateId),
      { candidateId: field.candidateId, status: "written" },
      registry,
    );
  expect(entries).toHaveLength(8);
});
it("keeps a uniquely identified control stable when the page replaces it", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  tracker.record(
    item(first.fields[0].candidateId),
    { candidateId: first.fields[0].candidateId, status: "written" },
    first.registry,
  );
  document
    .querySelector("input")!
    .replaceWith(document.querySelector("input")!.cloneNode());
  const next = snapshot();
  expect(
    tracker.record(
      item(next.fields[0].candidateId),
      { candidateId: next.fields[0].candidateId, status: "written" },
      next.registry,
    ),
  ).toHaveLength(1);
});
it("groups mapped categories and derived names without guessing from labels", () => {
  expect(
    progressCategory({
      ...item("a"),
      profileFieldKey: "education.university.schoolName",
    }),
  ).toBe("학력");
  expect(
    progressCategory({
      ...item("a"),
      profileFieldKey: undefined,
      fieldLabel: "학력",
    }),
  ).toBe("기타 항목");
});
