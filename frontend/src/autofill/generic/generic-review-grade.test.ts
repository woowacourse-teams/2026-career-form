import { describe, expect, it } from "vitest";
import type { FieldAnalysis } from "../api/types";
import {
  reviewItemsForDisplay,
  type ReviewPlanItem,
} from "../review/review-plan";
import { approvedReviewExecution } from "../workflow/workflow-write-items";
import {
  applyGenericGrade,
  genericGradeFor,
  GENERIC_SECTION_FAILURE,
  GENERIC_UNLINKED_REASON,
  type GenericAnalysisResult,
} from "./generic-analysis";

function item(overrides: Partial<ReviewPlanItem> = {}): ReviewPlanItem {
  return {
    candidateId: "field-1",
    fieldLabel: "합성 칸",
    currentValue: "",
    previewValue: "합성 값",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "",
    ...overrides,
  };
}

function unavailable(candidateId: string): ReviewPlanItem {
  return item({
    candidateId,
    status: "unavailable",
    selected: false,
    disabled: true,
    reason: "연결할 프로필 항목이 없습니다.",
  });
}

describe("applyGenericGrade carries the grade and reason", () => {
  it("keeps an AUTO item selected and records the grade", () => {
    expect(applyGenericGrade(item(), { grade: "AUTO" })).toEqual({
      ...item(),
      genericGrade: "AUTO",
    });
  });

  it("keeps a REVIEW item selected and records grade and reason code", () => {
    expect(
      applyGenericGrade(item(), {
        grade: "REVIEW",
        reason: "NO_FIELD_CONTEXT",
      }),
    ).toMatchObject({
      selected: true,
      disabled: false,
      genericGrade: "REVIEW",
      genericReasonCode: "NO_FIELD_CONTEXT",
    });
  });

  it.each(["MODERATE_CONFIDENCE", "OPTION_VALUE_UNMATCHED"] as const)(
    "unselects a REVIEW item the applicant must decide (%s)",
    (reason) => {
      expect(applyGenericGrade(item(), { grade: "REVIEW", reason })).toMatchObject({
        selected: false,
        disabled: false,
        genericGrade: "REVIEW",
        genericReasonCode: reason,
      });
    },
  );

  it("disables a BLOCKED item and records grade and reason code", () => {
    expect(
      applyGenericGrade(item(), {
        grade: "BLOCKED",
        reason: "FORMAT_KEY_MISMATCH",
      }),
    ).toMatchObject({
      selected: false,
      disabled: true,
      genericGrade: "BLOCKED",
      genericReasonCode: "FORMAT_KEY_MISMATCH",
    });
  });

  it("leaves an item without any grade untouched", () => {
    expect(applyGenericGrade(item(), undefined)).toEqual(item());
  });
});

describe("genericGradeFor", () => {
  const noMatchField = {
    candidateId: "x",
    matchType: "NO_MATCH",
    mappingStatus: "LLM_SUGGESTED",
    interactionStatus: "BLOCKED",
    reasonCodes: ["NO_MATCH"],
  } as FieldAnalysis;
  const matchField = { ...noMatchField, matchType: "MATCH" } as FieldAnalysis;

  function result(
    fields: FieldAnalysis[],
    grades: GenericAnalysisResult["grades"] = new Map(),
  ): GenericAnalysisResult {
    return {
      analysis: { fields } as GenericAnalysisResult["analysis"],
      grades,
      sections: [],
    };
  }

  it("returns the recorded grade first", () => {
    const grade = {
      grade: "BLOCKED",
      reason: GENERIC_SECTION_FAILURE.LLM_UNAVAILABLE,
    } as const;
    expect(
      genericGradeFor(
        result(
          [{ ...noMatchField, candidateId: "a" }],
          new Map([["a", grade]]),
        ),
        "a",
      ),
    ).toBe(grade);
  });

  it("marks an ungraded NO_MATCH field as BLOCKED and unlinked", () => {
    expect(
      genericGradeFor(result([{ ...noMatchField, candidateId: "a" }]), "a"),
    ).toEqual({ grade: "BLOCKED", reason: GENERIC_UNLINKED_REASON });
  });

  it("returns nothing for an ungraded non-NO_MATCH or unknown field", () => {
    expect(
      genericGradeFor(result([{ ...matchField, candidateId: "a" }]), "a"),
    ).toBeUndefined();
    expect(genericGradeFor(result([]), "zzz")).toBeUndefined();
  });
});

describe("reviewItemsForDisplay with generic grades", () => {
  it("still hides unavailable items without a generic grade", () => {
    const items = [item(), unavailable("hidden")];
    expect(reviewItemsForDisplay(items).map((i) => i.candidateId)).toEqual([
      "field-1",
    ]);
  });

  it("shows graded unavailable items (BLOCKED, REVIEW, AUTO) of the generic path", () => {
    const blocked = applyGenericGrade(unavailable("blocked"), {
      grade: "BLOCKED",
      reason: GENERIC_UNLINKED_REASON,
    });
    const review = applyGenericGrade(unavailable("review"), {
      grade: "REVIEW",
    });
    expect(
      reviewItemsForDisplay([item(), blocked, review]).map(
        (i) => i.candidateId,
      ),
    ).toEqual(["field-1", "blocked", "review"]);
  });

  it("hides hidden controls even when graded or available", () => {
    const hiddenReview = {
      ...applyGenericGrade(unavailable("hidden-review"), { grade: "REVIEW" }),
      hiddenFromReview: true,
    };
    const hiddenBlocked = {
      ...applyGenericGrade(unavailable("hidden-blocked"), {
        grade: "BLOCKED",
        reason: GENERIC_UNLINKED_REASON,
      }),
      hiddenFromReview: true,
    };
    const hiddenAvailable = item({
      candidateId: "hidden-available",
      hiddenFromReview: true,
    });
    expect(
      reviewItemsForDisplay([
        item(),
        hiddenReview,
        hiddenBlocked,
        hiddenAvailable,
      ]).map((i) => i.candidateId),
    ).toEqual(["field-1"]);
  });

  it("keeps hidden candidates in write targeting", () => {
    const hidden = item({ candidateId: "hidden-key", hiddenFromReview: true });
    const { approvedCandidateIds } = approvedReviewExecution(
      [item(), hidden],
      new Set(),
    );
    expect([...approvedCandidateIds]).toEqual(["field-1", "hidden-key"]);
  });

  it("keeps static output identical for the same input", () => {
    const items = [
      unavailable("u"),
      item({ candidateId: "b", status: "needs-review", selected: false }),
      item({ candidateId: "a" }),
    ];
    expect(reviewItemsForDisplay(items)).toEqual([items[2], items[1]]);
  });
});
