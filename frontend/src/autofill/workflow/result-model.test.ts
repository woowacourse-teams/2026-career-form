import { describe, expect, it } from "vitest";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { GENERIC_SECTION_FAILURE } from "../generic/generic-analysis";
import { genericReasonText } from "../generic/grade-reason-text";
import {
  buildResultModel,
  profileGroups,
  unfilledCandidateIds,
} from "./result-model";

const item = {
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
} satisfies ReviewPlanItem;
const entry = {
  id: "stable-1",
  candidateId: "field-1",
  label: "학위",
  category: "학력",
  status: "written" as const,
};
const written = [{ candidateId: "field-1", status: "written" as const }];

it("keeps an originally matching value excluded when only another search in its row failed", () => {
  const result = buildResultModel({
    reviewItems: [{ ...item, currentValue: "학사" }],
    results: [
      {
        candidateId: "field-1",
        status: "skipped",
        reason: "row deferred",
        failureCode: "ROW_SEARCH_UNCONFIRMED",
      },
    ],
    progress: [{ ...entry, unchanged: true }],
    progressIdFor: () => "stable-1",
    wasWritten: () => true,
  });
  expect(result.pending).toEqual([]);
  expect(result.completed).toEqual([]);
  expect(result.skipped).toMatchObject([{ reason: "기존 값 유지" }]);
});

it.each(["result", "ledger"] as const)(
  "keeps a proven selection failure from %s in review even when the visible text is unchanged",
  (source) => {
    const result = buildResultModel({
      reviewItems: [{ ...item, currentValue: "학사" }],
      results:
        source === "result"
          ? [
              {
                candidateId: "field-1",
                status: "skipped",
                reason: "failed",
                failureCode: "SEARCH_UNCONFIRMED",
              },
            ]
          : [],
      progress: [
        {
          ...entry,
          status: "skipped",
          unchanged: true,
          ...(source === "ledger"
            ? { failureCode: "SEARCH_UNCONFIRMED" as const }
            : {}),
        },
      ],
      progressIdFor: () => "stable-1",
    });
    expect(result.completed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.pending).toMatchObject([
      { failureCode: "SEARCH_UNCONFIRMED", written: false },
    ]);
  },
);

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
it.each(["available", "needs-review"] as const)(
  "counts a generic %s write as completed when the live value matches",
  (status) => {
    const result = buildResultModel({
      reviewItems: [
        {
          ...item,
          status,
          analysis: { ...item.analysis, mappingStatus: "LLM_SUGGESTED" },
        },
      ],
      results: written,
      fieldStateFor: () => ({ visible: true, value: "학사" }),
    });
    expect(result.completed.map((entry) => entry.candidateId)).toEqual([
      "field-1",
    ]);
    expect(result.pending).toEqual([]);
  },
);
it.each([
  "mismatch",
  "empty",
  "missing value",
  "missing reader",
  "failed verifier",
])("keeps a generic write in review with %s", (scenario) => {
  const result = buildResultModel({
    reviewItems: [
      {
        ...item,
        currentValue: "학사",
        analysis: { ...item.analysis, mappingStatus: "LLM_SUGGESTED" },
      },
    ],
    results: written,
    fieldStateFor:
      scenario === "missing reader"
        ? undefined
        : () =>
            scenario === "missing value"
              ? undefined
              : {
                  visible: true,
                  value:
                    scenario === "mismatch"
                      ? "석사"
                      : scenario === "empty"
                        ? ""
                        : "학사",
                },
    progressStateFor: scenario === "failed verifier" ? () => false : undefined,
  });
  expect(result.completed).toEqual([]);
  expect(result.pending).toMatchObject([
    { reason: "입력 결과 확인", written: true },
  ]);
});
it("keeps an unverified conditional write in review when mapping evidence is absent", () => {
  const result = buildResultModel({
    reviewItems: [{ ...item, analysis: undefined }],
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

it("counts a disabled-only retry recovery only with current reflection evidence", () => {
  const result = buildResultModel({
    reviewItems: [item],
    results: [
      {
        candidateId: "field-1",
        status: "skipped",
        reason: "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
      },
    ],
    progress: [{ ...entry, retryRecovered: true }],
    progressIdFor: () => "stable-1",
    progressStateFor: () => true,
    wasWritten: () => true,
    fieldStateFor: () => ({ visible: true, value: "학사" }),
  });
  expect(result.completed.map((entry) => entry.id)).toEqual(["stable-1"]);
  expect(result.pending).toEqual([]);
  expect(result.skipped).toEqual([]);
});

it.each([
  "no recovery",
  "no verifier",
  "no live value",
  "changed value",
  "not recorded",
])(
  "does not infer a successful retry from matching text with %s",
  (missing) => {
    const result = buildResultModel({
      reviewItems: [item],
      results: [
        {
          candidateId: "field-1",
          status: "skipped",
          reason: "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
        },
      ],
      progress: [{ ...entry, retryRecovered: missing !== "no recovery" }],
      progressIdFor: () => "stable-1",
      progressStateFor: missing === "no verifier" ? undefined : () => true,
      wasWritten: () => missing !== "not recorded",
      fieldStateFor: () =>
        missing === "no live value"
          ? undefined
          : {
              visible: true,
              value: missing === "changed value" ? "석사" : "학사",
            },
    });
    expect(result.completed).toEqual([]);
    expect(result.pending).toMatchObject([{ reason: "입력 못함" }]);
  },
);

it("leaves a skipped field that already holds a value out of the unfilled ids but keeps pending ones", () => {
  const skip = (id: string, reason: string) => ({ id, item, reason });
  const model = {
    completed: [],
    pending: [
      { id: "pending-with-value", reason: "기존 값과 다름", written: false },
    ],
    skipped: [
      skip("default-value", "등록된 정보 없음"),
      skip("empty", "등록된 정보 없음"),
      skip("kept", "기존 값 유지"),
    ],
  };
  const values: Record<string, string> = {
    "pending-with-value": "기존",
    "default-value": "사이트 기본값",
    kept: "유지",
  };
  expect(unfilledCandidateIds(model, (id) => values[id])).toEqual([
    "pending-with-value",
    "empty",
  ]);
});

function handleOf(element: HTMLElement) {
  return {
    kind: "field",
    elements: [element],
    candidate: {},
  } as unknown as FieldCandidateHandle;
}

it("merges rows that target the same control and keeps the most actionable reason", () => {
  const control = document.createElement("input");
  const result = buildResultModel({
    reviewItems: [
      {
        ...item,
        candidateId: "a",
        status: "conflict",
        currentValue: "다른 값",
      },
      {
        ...item,
        candidateId: "b",
        status: "needs-review",
        currentValue: "다른 값",
      },
    ],
    results: [],
    fieldStateFor: () => ({
      visible: true,
      value: "다른 값",
      handle: handleOf(control),
    }),
  });
  expect(result.pending).toMatchObject([{ id: "b", reason: "선택 필요" }]);
});

it("keeps rows that target different controls", () => {
  const handles = new Map([
    ["a", handleOf(document.createElement("input"))],
    ["b", handleOf(document.createElement("input"))],
  ]);
  const result = buildResultModel({
    reviewItems: [
      {
        ...item,
        candidateId: "a",
        status: "conflict",
        currentValue: "다른 값",
      },
      {
        ...item,
        candidateId: "b",
        status: "needs-review",
        currentValue: "다른 값",
      },
    ],
    results: [],
    fieldStateFor: (id) => ({
      visible: true,
      value: "다른 값",
      handle: handles.get(id),
    }),
  });
  expect(result.pending.map(({ id }) => id)).toEqual(["a", "b"]);
});

it("lists a manual generic address field as pending with its own reason", () => {
  const address = {
    candidateId: "road",
    fieldLabel: "기본주소",
    profileFieldKey: "contact.contact.addressLine1",
    currentValue: "",
    previewValue: "",
    status: "unavailable",
    selected: false,
    disabled: true,
    revealed: true,
    reason: "address reason",
    addressManualReason: "address reason",
  } satisfies ReviewPlanItem;

  const { pending, skipped } = buildResultModel({
    reviewItems: [address],
    results: [],
    fieldStateFor: () => ({ visible: true, value: "" }),
  });

  expect(pending).toMatchObject([
    {
      id: "road",
      reason: "입력 결과 확인",
      written: false,
      detail: "address reason",
    },
  ]);
  expect(skipped).toEqual([]);
});

describe("fields without a saved value", () => {
  const blocked = (
    id: string,
    extra: Partial<ReviewPlanItem> = {},
  ): ReviewPlanItem => ({
    candidateId: id,
    fieldLabel: `항목 ${id}`,
    currentValue: "",
    previewValue: "",
    status: "unavailable",
    selected: false,
    disabled: true,
    revealed: true,
    reason: "",
    genericGrade: "BLOCKED",
    ...extra,
  });
  const linked = { profileFieldKey: "contact.contact.email" } as const;
  const handleOf = (...elements: Element[]) =>
    ({ elements }) as unknown as FieldCandidateHandle;

  it("skips a linked BLOCKED field without a value instead of asking for review", () => {
    const model = buildResultModel({
      reviewItems: [blocked("a", linked)],
      results: [],
    });
    expect(model.pending).toEqual([]);
    expect(model.skipped).toMatchObject([
      { id: "a", reason: "등록된 정보 없음" },
    ]);
  });

  it("skips an unlinked BLOCKED field without a value as unsupported", () => {
    const model = buildResultModel({
      reviewItems: [blocked("a")],
      results: [],
    });
    expect(model.pending).toEqual([]);
    expect(model.skipped).toMatchObject([
      { id: "a", reason: "자동 입력 미지원" },
    ]);
  });

  it("keeps a BLOCKED field that has a saved value in review", () => {
    const model = buildResultModel({
      reviewItems: [blocked("a", { ...linked, profileValue: "값" })],
      results: [],
    });
    expect(model.skipped).toEqual([]);
    expect(model.pending).toMatchObject([{ id: "a", reason: "입력 못함" }]);
  });

  it("groups skipped fields by reason and counts one entry per control", () => {
    const shared = document.createElement("input");
    const other = document.createElement("input");
    const pendingControl = document.createElement("input");
    const handles: Record<string, FieldCandidateHandle> = {
      a: handleOf(shared),
      b: handleOf(shared),
      c: handleOf(other),
      p: handleOf(pendingControl),
      d: handleOf(pendingControl),
    };
    const model = buildResultModel({
      reviewItems: [
        blocked("a", linked),
        blocked("b", linked),
        blocked("c"),
        blocked("d", linked),
        blocked("e"),
        blocked("f"),
        blocked("p", { ...linked, profileValue: "값" }),
      ],
      results: [],
      fieldStateFor: (id) =>
        id in handles
          ? { visible: true, value: "", handle: handles[id] }
          : { visible: true, value: "" },
    });
    expect(model.pending.map(({ id }) => id)).toEqual(["p"]);
    const groups = profileGroups(model, (id) =>
      id in handles
        ? { visible: true, value: "", handle: handles[id] }
        : { visible: true, value: "" },
    );
    expect(groups.profileUnset.map(({ id }) => id)).toEqual(["a"]);
    expect(groups.notInProfile.map(({ id }) => id)).toEqual(["c", "e", "f"]);
  });

  it("leaves hidden duplicate fields out of the profile groups", () => {
    const model = buildResultModel({
      reviewItems: [
        blocked("a", linked),
        blocked("b", { ...linked, hiddenFromReview: true }),
        blocked("c", { hiddenFromReview: true }),
        blocked("d"),
      ],
      results: [],
    });
    const groups = profileGroups(model);
    expect(groups.profileUnset.map(({ id }) => id)).toEqual(["a"]);
    expect(groups.notInProfile.map(({ id }) => id)).toEqual(["d"]);
  });

  it("marks only pending fields when asked, and keeps the default unchanged", () => {
    const model = buildResultModel({
      reviewItems: [
        blocked("a", linked),
        blocked("b"),
        blocked("p", { ...linked, profileValue: "값" }),
      ],
      results: [],
    });
    expect(unfilledCandidateIds(model)).toEqual(["p", "a", "b"]);
    expect(
      unfilledCandidateIds(model, undefined, { pendingOnly: true }),
    ).toEqual(["p"]);
  });
});

describe("fields whose analysis failed", () => {
  const failed = (
    id: string,
    extra: Partial<ReviewPlanItem> = {},
  ): ReviewPlanItem => ({
    candidateId: id,
    fieldLabel: `항목 ${id}`,
    currentValue: "",
    previewValue: "",
    status: "unavailable",
    selected: false,
    disabled: true,
    revealed: true,
    reason: "",
    genericGrade: "BLOCKED",
    ...extra,
  });

  it.each(Object.values(GENERIC_SECTION_FAILURE))(
    "shows a %s field as not filled in instead of unsupported",
    (code) => {
      const model = buildResultModel({
        reviewItems: [failed("a", { genericReasonCode: code })],
        results: [],
      });
      expect(model.skipped).toEqual([]);
      expect(model.pending).toMatchObject([
        { id: "a", reason: "입력 못함", detail: genericReasonText(code) },
      ]);
    },
  );

  it("keeps an unlinked field without a value skipped as unsupported", () => {
    const model = buildResultModel({
      reviewItems: [failed("a", { genericReasonCode: "UNLINKED" })],
      results: [],
    });
    expect(model.pending).toEqual([]);
    expect(model.skipped).toMatchObject([
      { id: "a", reason: "자동 입력 미지원" },
    ]);
  });

  it("does not list a failed field that is hidden from review", () => {
    const model = buildResultModel({
      reviewItems: [
        failed("a", {
          genericReasonCode: GENERIC_SECTION_FAILURE.LLM_UNAVAILABLE,
          hiddenFromReview: true,
        }),
      ],
      results: [],
    });
    expect(model.pending).toEqual([]);
  });
});

describe("profile groups leave out controls already handled", () => {
  const unsupported = (id: string): ReviewPlanItem => ({
    candidateId: id,
    fieldLabel: `항목 ${id}`,
    currentValue: "",
    previewValue: "",
    status: "unavailable",
    selected: false,
    disabled: true,
    revealed: true,
    reason: "",
    genericGrade: "BLOCKED",
  });

  it("drops a duplicate of a completed or kept control", () => {
    const written = document.createElement("input");
    const kept = document.createElement("input");
    const free = document.createElement("input");
    const controls: Record<string, Element> = {
      done: written,
      dupOfDone: written,
      keep: kept,
      dupOfKeep: kept,
      free,
    };
    const stateFor = (id: string) => ({
      visible: true,
      value: "",
      handle: { elements: [controls[id]] } as unknown as FieldCandidateHandle,
    });
    const model = {
      completed: [
        {
          id: "stable-done",
          candidateId: "done",
          label: "완료",
          category: "기타 항목",
          status: "written" as const,
        },
      ],
      pending: [],
      skipped: [
        { id: "keep", item: unsupported("keep"), reason: "기존 값 유지" },
        {
          id: "dupOfDone",
          item: unsupported("dupOfDone"),
          reason: "자동 입력 미지원",
        },
        {
          id: "dupOfKeep",
          item: unsupported("dupOfKeep"),
          reason: "자동 입력 미지원",
        },
        { id: "free", item: unsupported("free"), reason: "자동 입력 미지원" },
      ],
    };
    const groups = profileGroups(model, stateFor);
    expect(groups.notInProfile.map(({ id }) => id)).toEqual(["free"]);
  });
});
