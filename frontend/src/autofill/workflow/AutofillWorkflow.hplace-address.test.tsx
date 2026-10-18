import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { createEmptyProfile } from "../../profile/model";
import { setHplacePage, resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import {
  mountAddress,
  addressExpected,
  addressContract,
} from "../policy/__fixtures__/hplace-mrs2-address.synthetic";
import { collectFieldsSnapshot } from "../dom/collect";
import { detailAnalysis } from "../adapters/hplace/detail.test-fixtures";
import type { FieldsAnalyzeResponse } from "../api/types";
afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
});
function mountWorkflow(
  existing: boolean | "all" = false,
  withAction = true,
  spaced = false,
) {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const s = mountAddress(
    spaced
      ? {
          results: [
            { ...addressExpected, address: "서울특별시  가상구 가상새봄로 50" },
          ],
        }
      : {},
  );
  document.head.innerHTML =
    '<script src="/mrs2/release/js/applicant/writeResume/writeResume.js"></script><script src="/mrs2/release/js/applicant/writeResume/writeResumeTemplate.js"></script>';
  document.querySelector('[data-code="11"]')!.innerHTML =
    '<div class="subject"><label for="englishName">영문이름</label><input name="englishName" id="englishName" maxlength="64"><label for="birthday">생년월일</label><input name="birthday" id="birthday" class="date" data-dates="birthday:YMD"></div>';
  const section = document.querySelector('[data-code="13"]')!,
    subject = document.createElement("div");
  subject.className = "subject";
  while (section.firstChild) subject.append(section.firstChild);
  section.append(subject);
  if (existing) {
    s.inputs()[0].value = "00001";
    s.inputs()[1].value = addressExpected.address;
    document.querySelector("span.postCode")!.textContent = "00001";
  }
  if (existing === "all") s.inputs()[2].value = addressExpected.detail;
  let detailWrites = 0;
  s.inputs()[2].addEventListener("input", () => detailWrites++);
  const fields = collectFieldsSnapshot(document).request.sections.flatMap(
    (s) => s.fields,
  );
  expect(
    fields.filter((f) => f.domName === "hplace.detail.detailAddress"),
  ).toHaveLength(1);
  expect(
    fields.filter(
      (f) => f.domName === "hplace.mrs2.currentAddress.detailAddress",
    ),
  ).toHaveLength(0);
  const profile = createEmptyProfile();
  profile.contact = {
    ...profile.contact,
    postalCode: "00001",
    addressLine1: addressExpected.address,
    addressLine2: addressExpected.detail,
  };
  let calls = 0;
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => {}}
      repository={{ load: async () => profile }}
      apiClient={{
        loadExecutionPolicy: async () => s.policy,
        analyzePreparation: async (r) => ({
          snapshotId: r.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: withAction
            ? [
                {
                  command: "SEARCH_ADDRESS",
                  actionCandidateId: "staged-address-action",
                  expectedEffect: "ADDRESS_SELECTED",
                },
              ]
            : [],
        }),
        analyzeFields: async (r) => {
          calls++;
          return {
            ...detailAnalysis(r),
            executionPolicy: s.policy,
            fields: r.sections
              .flatMap((s) => s.fields)
              .map((f) => {
                const address = addressContract().fields.find(
                  (a) => a.name === f.domName || a.legacyName === f.domName,
                );
                return address
                  ? {
                      candidateId: f.candidateId,
                      matchType: "MATCH",
                      mappingStatus: "ADAPTER_VERIFIED",
                      interactionStatus: "READY",
                      autofillPolicy: "ALLOWED",
                      valueBinding: {
                        type: "DIRECT",
                        profileFieldKey: address.key,
                      },
                      writePlan: { command: "SET_TEXT" },
                    }
                  : {
                      candidateId: f.candidateId,
                      matchType: "NO_MATCH",
                      mappingStatus: "ADAPTER_VERIFIED",
                      interactionStatus: "BLOCKED",
                      reasonCodes: ["NO_MATCH"],
                    };
              }),
          } as FieldsAnalyzeResponse;
        },
      }}
    />,
  );
  return { s, detailWrites: () => detailWrites, calls: () => calls };
}
it("uses one staged owner for the triplet and never writes its reused legacy detail again", async () => {
  const { s, detailWrites, calls } = mountWorkflow();
  expect(await screen.findByLabelText("입력 완료 3개")).toBeVisible();
  expect(s.inputs().map((e) => e.value)).toEqual([
    "00001",
    addressExpected.address,
    addressExpected.detail,
  ]);
  expect(s.events.filter((e) => e === "open")).toHaveLength(1);
  expect(detailWrites()).toBe(0);
  expect(calls()).toBeLessThanOrEqual(3);
});
it.each([true, false])(
  "preserves existing base and leaves detail-only filling with legacy rules (action=%s)",
  async (withAction) => {
    const { s, detailWrites } = mountWorkflow(true, withAction);
    expect(await screen.findByLabelText("입력 완료 1개")).toBeVisible();
    expect(s.events).toEqual([]);
    expect(s.inputs()[2].value).toBe(addressExpected.detail);
    expect(detailWrites()).toBe(1);
  },
);

it("preserves a complete identical triplet as already entered without a second writer", async () => {
  const { s, detailWrites } = mountWorkflow("all");
  await screen.findByText("자동 기입을 마쳤어요");
  expect(screen.queryByLabelText("확인 필요 1개")).toBeNull();
  expect(screen.queryByLabelText("확인 필요 2개")).toBeNull();
  expect(s.events).toEqual([]);
  expect(detailWrites()).toBe(0);
});

it("reports all three committed values when only road whitespace differs", async () => {
  const { s } = mountWorkflow(false, true, true);
  expect(await screen.findByLabelText("입력 완료 3개")).toBeVisible();
  expect(s.inputs()[1].value).toBe("서울특별시  가상구 가상새봄로 50");
});
