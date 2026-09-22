import { expect, it } from "vitest";
import type { ReviewPlanItem } from "../review/review-plan";
import { buildResultModel } from "./result-model";

const item: ReviewPlanItem = {
  candidateId: "field-1",
  fieldLabel: "학위",
  currentValue: "",
  profileValue: "학사",
  previewValue: "학사",
  status: "needs-review",
  selected: true,
  disabled: false,
  revealed: true,
  reason: "지원서 조건 확인",
  analysis: {
    candidateId: "field-1",
    matchType: "MATCH",
    mappingStatus: "ADAPTER_VERIFIED",
    interactionStatus: "READY",
    autofillPolicy: "CONDITIONAL",
    writePlan: { command: "SELECT_OPTION" },
    valueBinding: {
      type: "DIRECT",
      profileFieldKey: "education.university.degreeLevel",
    },
  },
};
const entry = {
  id: "stable-1",
  candidateId: "field-1",
  label: "학위",
  category: "학력",
  status: "written" as const,
};
const written = [{ candidateId: "field-1", status: "written" as const }];

it("counts a verified conditional write only as completed", () => {
  const result = buildResultModel({
    reviewItems: [item],
    results: written,
    progress: [entry],
    progressIdFor: () => "stable-1",
    wasWritten: () => true,
    fieldStateFor: () => ({ visible: true, value: "학사" }),
  });
  expect(result.completed.map((e) => e.id)).toEqual(["stable-1"]);
  expect(result.pending).toEqual([]);
});
it("moves an uncertain write out of completed even after snapshot IDs change", () => {
  const result = buildResultModel({
    reviewItems: [{ ...item, candidateId: "field-9" }],
    results: [{ candidateId: "field-9", status: "written" }],
    progress: [entry],
    progressIdFor: () => "stable-1",
    wasWritten: () => true,
    fieldStateFor: () => ({ visible: true, value: "석사" }),
  });
  expect(result.completed).toEqual([]);
  expect(result.pending).toMatchObject([
    { id: "field-9", written: true, reason: "입력 결과 확인" },
  ]);
});
it("does not call an unverified suggestion complete just because its text matches", () => {
  const result = buildResultModel({
    reviewItems: [
      {
        ...item,
        analysis: { ...item.analysis!, mappingStatus: "LLM_SUGGESTED" },
      },
    ],
    results: written,
    fieldStateFor: () => ({ visible: true, value: "학사" }),
  });
  expect(result.completed).toEqual([]);
  expect(result.pending).toMatchObject([{ reason: "입력 결과 확인" }]);
});
it("puts a failed actual write in required review with a concise reason", () => {
  const result = buildResultModel({
    reviewItems: [item],
    results: [
      {
        candidateId: "field-1",
        status: "skipped",
        reason: "네이티브 컨트롤에 안전하게 입력할 수 없습니다.",
      },
    ],
  });
  expect(result.completed).toEqual([]);
  expect(result.pending).toMatchObject([
    { id: "field-1", written: false, reason: "입력 못함" },
  ]);
  expect(result.skipped).toEqual([]);
});
it("keeps unsupported saved data actionable instead of hiding it among skipped items", () => {
  const result = buildResultModel({
    reviewItems: [
      { ...item, status: "unavailable", disabled: true, selected: false },
    ],
    results: [],
  });
  expect(result.pending).toMatchObject([{ reason: "선택 필요" }]);
  expect(result.skipped).toEqual([]);
});
it("explains conflicts without replacing the existing application value", () => {
  const conflict = {
    ...item,
    status: "conflict" as const,
    currentValue: "석사",
    selected: false,
  };
  const result = buildResultModel({ reviewItems: [conflict], results: [] });
  expect(result.pending).toMatchObject([{ reason: "기존 값과 다름" }]);
  expect(conflict.currentValue).toBe("석사");
});
it("puts already equal, missing, and unmapped values only in skipped details with actual reasons", () => {
  const result = buildResultModel({
    reviewItems: [
      { ...item, candidateId: "same", currentValue: "학사" },
      { ...item, candidateId: "empty", profileValue: undefined },
      {
        ...item,
        candidateId: "unmapped",
        profileValue: undefined,
        analysis: undefined,
      },
    ],
    results: [],
  });
  expect(result.completed).toEqual([]);
  expect(result.pending).toEqual([]);
  expect(result.skipped.map((e) => [e.id, e.reason])).toEqual([
    ["same", "기존 값 유지"],
    ["empty", "등록된 정보 없음"],
    ["unmapped", "자동 입력 미지원"],
  ]);
});
it("does not promote a synthetic written result with no recorded write", () => {
  const result = buildResultModel({
    reviewItems: [item],
    results: written,
    progress: [],
    wasWritten: () => false,
    fieldStateFor: () => ({ visible: true, value: "" }),
  });
  expect(result.completed).toEqual([]);
  expect(result.pending).toMatchObject([
    { reason: "선택 필요", written: false },
  ]);
});
it("does not count an unchanged field as a new completed write", () => {
  const result = buildResultModel({
    reviewItems: [item],
    results: written,
    progress: [{ ...entry, unchanged: true }],
    progressIdFor: () => "stable-1",
    wasWritten: () => true,
    fieldStateFor: () => ({ visible: true, value: "학사" }),
  });
  expect(result.completed).toEqual([]);
  expect(result.pending).toEqual([]);
  expect(result.skipped).toMatchObject([
    { id: "field-1", reason: "기존 값 유지" },
  ]);
});
it("does not list a conditionally hidden field as requiring review", () => {
  const result = buildResultModel({
    reviewItems: [item],
    results: [],
    fieldStateFor: () => ({ visible: false, value: "" }),
  });
  expect(result.pending).toEqual([]);
  expect(result.skipped).toMatchObject([{ reason: "현재 표시되지 않는 항목" }]);
});
it("keeps earlier completed writes that are not in the latest analysis", () => {
  const result = buildResultModel({
    reviewItems: [],
    results: [],
    progress: [entry],
  });
  expect(result.completed).toEqual([entry]);
});
it("does not reuse a candidate ID as a ledger key after a different field is inserted", () => {
  const result = buildResultModel({
    reviewItems: [item],
    results: [],
    progress: [{ ...entry, id: "field-1" }],
    progressIdFor: () => undefined,
    wasWritten: () => false,
  });
  expect(result.completed.map((e) => e.id)).toEqual(["field-1"]);
  expect(result.pending).toMatchObject([
    { id: "field-1", reason: "선택 필요" },
  ]);
});
it("keeps an earlier failed write actionable when the last analysis omitted it", () => {
  const result = buildResultModel({
    reviewItems: [],
    results: [],
    progress: [{ ...entry, status: "skipped" }],
  });
  expect(result.pending).toMatchObject([
    { item: { fieldLabel: "학위" }, reason: "입력 못함" },
  ]);
  expect(result.pending[0].id).not.toBe("field-1");
});
it("requires review when a written field can no longer be inspected", () => {
  const result = buildResultModel({
    reviewItems: [{ ...item, status: "available" }],
    results: written,
    fieldStateFor: () => undefined,
  });
  expect(result.completed).toEqual([]);
  expect(result.pending).toMatchObject([{ reason: "입력 결과 확인" }]);
});
