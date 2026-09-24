import { afterEach, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { createProgressTracker } from "./progress-model";

afterEach(() => document.body.replaceChildren());

function scoreFixture() {
  document.body.innerHTML =
    '<label>점수<input id="point_1" name="point"></label>';
  const input = document.querySelector("input")!;
  const { registry, request } = collectFieldsSnapshot(document);
  const candidateId = request.sections.flatMap((section) => section.fields)[0]
    .candidateId;
  const item: ReviewPlanItem = {
    candidateId,
    fieldLabel: "점수",
    profileFieldKey: "languages.languageTest.grade",
    profileValue: "900",
    currentValue: "",
    previewValue: "900",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "",
    analysis: {
      candidateId,
      matchType: "MATCH",
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "languages.languageTest.grade",
      },
      autofillPolicy: "ALLOWED",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    },
  };
  return { input, item, registry, tracker: createProgressTracker() };
}

it("preserves a successful reflected score when only its final retry is disabled", () => {
  const { input, item, registry, tracker } = scoreFixture();
  input.value = "900";
  tracker.record(
    item,
    { candidateId: item.candidateId, status: "written" },
    registry,
  );
  input.disabled = true;
  const entries = tracker.record(
    item,
    {
      candidateId: item.candidateId,
      status: "skipped",
      reason: "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
    },
    registry,
  );
  expect(entries).toMatchObject([
    { status: "written", retryRecovered: true, unchanged: false },
  ]);
  expect(tracker.progressStateFor(entries[0].id)).toBe(true);
  expect(JSON.stringify(entries)).not.toContain("900");
  input.value = "901";
  expect(tracker.progressStateFor(entries[0].id)).toBe(false);
});

it.each([
  "changed value",
  "hidden",
  "CSS hidden",
  "unverified",
  "different binding",
  "different snapshot",
  "no earlier write",
  "not disabled",
])("does not preserve a failed retry with %s", (change) => {
  const { input, item, registry, tracker } = scoreFixture();
  input.value = "900";
  if (change !== "no earlier write")
    tracker.record(
      item,
      { candidateId: item.candidateId, status: "written" },
      registry,
    );
  input.disabled = change !== "not disabled";
  if (change === "changed value") input.value = "901";
  if (change === "hidden") input.parentElement!.hidden = true;
  if (change === "CSS hidden") input.parentElement!.style.visibility = "hidden";
  const retried = { ...item, analysis: { ...item.analysis! } };
  if (change === "unverified") retried.analysis.mappingStatus = "LLM_SUGGESTED";
  if (change === "different binding")
    retried.analysis.valueBinding = {
      type: "DIRECT",
      profileFieldKey: "education.university.gpa",
    };
  const nextRegistry =
    change === "different snapshot"
      ? collectFieldsSnapshot(document).registry
      : registry;
  const entries = tracker.record(
    retried,
    {
      candidateId: item.candidateId,
      status: "skipped",
      reason: "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
    },
    nextRegistry,
  );
  expect(entries).toMatchObject([{ status: "skipped" }]);
  expect(entries[0].retryRecovered).not.toBe(true);
});

it("retains unchanged evidence when an already equal score becomes disabled", () => {
  const { input, item, registry, tracker } = scoreFixture();
  input.value = "900";
  const equal = { ...item, currentValue: "900" };
  tracker.record(
    equal,
    { candidateId: item.candidateId, status: "written" },
    registry,
  );
  input.disabled = true;
  const entries = tracker.record(
    equal,
    {
      candidateId: item.candidateId,
      status: "skipped",
      reason: "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
    },
    registry,
  );
  expect(entries).toMatchObject([
    { status: "written", retryRecovered: true, unchanged: true },
  ]);
});
