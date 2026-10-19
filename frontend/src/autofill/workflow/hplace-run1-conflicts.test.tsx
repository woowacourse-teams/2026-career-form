import { cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { buildResultModel } from "./result-model";
import { resultGuidance } from "./result-guidance";
import {
  input,
  mountRun1,
  profile,
  analysis,
} from "./hplace-run1.test-fixtures";
afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(["currentAddress.detailAddress", "military.militaryBranchCode"])(
  "keeps the conflict reason for skipped run-1 %s",
  (name) => {
    const { policy } = mountRun1();
    if (name.startsWith("military")) {
      document.querySelector<HTMLInputElement>(
        '[name="military.militaryTypeCode"][value="01"]',
      )!.checked = true;
      input(name).disabled = false;
    }
    input(name).value = name.startsWith("military")
      ? "02"
      : "기존 합성 상세주소";
    const p = profile();
    p.contact.addressLine2 = "새 합성 상세주소";
    const snap = collectFieldsSnapshot(document);
    const a = analysis(snap.request, policy);
    const field = snap.request.sections
      .flatMap((s) => s.fields)
      .find(
        (f) =>
          f.domName ===
          (name.startsWith("military")
            ? "hplace.mrs2.basic.militaryBranchCode"
            : "hplace.detail.detailAddress"),
      )!;
    if (!name.startsWith("military"))
      a.fields = a.fields.map((f) =>
        f.candidateId === field.candidateId
          ? {
              candidateId: f.candidateId,
              matchType: "MATCH",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "READY",
              autofillPolicy: "ALLOWED",
              valueBinding: {
                type: "DIRECT",
                profileFieldKey: "contact.contact.addressLine2",
              },
              writePlan: { command: "SET_TEXT" },
            }
          : f,
      );
    const item = buildReviewPlan({
      registry: snap.registry,
      profile: p,
      analysis: a,
    }).items.find((i) => i.candidateId === field.candidateId)!;
    expect(item.status).toBe("conflict");
    const result = buildResultModel({
      reviewItems: [item],
      results: [
        {
          candidateId: item.candidateId,
          status: "skipped",
          code: "REVIEW_UNAVAILABLE",
          reason: "검증된 상세 지원서 필드만 입력할 수 있습니다.",
        },
      ],
      profile: p,
    });
    expect(result.pending[0]?.reason).toBe("기존 값과 다름");
    expect(resultGuidance(result.pending[0]!.reason)).toContain(
      "지원서 값과 등록한 값이 달라요",
    );
  },
);
