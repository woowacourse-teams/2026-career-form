import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { AutofillWorkflow } from "./AutofillWorkflow";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import type { FieldsAnalyzeRequest, FieldsAnalyzeResponse } from "../api/types";
import {
  mountDetail,
  detailAnalysis,
} from "../adapters/hplace/detail.test-fixtures";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";

afterEach(() => {
  resetHplacePage();
  installExecutionPolicy(document);
});
const policy = () => structuredClone(seed.executionPolicy) as ExecutionPolicy;

function analysis(
  request: FieldsAnalyzeRequest,
  withPolicy: boolean,
): FieldsAnalyzeResponse {
  const r = detailAnalysis(request);
  r.fields = r.fields.map((f, i) =>
    request.sections.flatMap((s) => s.fields)[i].domName ===
    "hplace.detail.englishName"
      ? {
          candidateId: f.candidateId,
          matchType: "NO_MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "BLOCKED",
          reasonCodes: ["NO_MATCH"],
        }
      : f,
  );
  return withPolicy ? { ...r, executionPolicy: policy() } : r;
}
function wrap() {
  const w = document.createElement("div");
  w.id = "wrapResume";
  const form = document.querySelector("#frm")!;
  w.append(...form.children);
  form.append(w);
}
function profileWithAddress() {
  const profile = createEmptyProfile();
  profile.personal.birthDate = "2000-02-29";
  profile.contact.addressLine2 = "Synthetic detail";
  profile.contact.addressLine1 = "Synthetic road 1";
  profile.contact.postalCode = "12345";
  (
    document.querySelector(
      '[name="currentAddress.address"]',
    ) as HTMLInputElement
  ).value = profile.contact.addressLine1;
  (
    document.querySelector(
      '[name="currentAddress.zipCode"]',
    ) as HTMLInputElement
  ).value = profile.contact.postalCode;
  document.querySelector(
    '[data-type="currentAddress"][data-span="postcode"]',
  )!.textContent = profile.contact.postalCode;
  return profile;
}

it.each([false, true])(
  "legacy detailAddress written (native policy=%s)",
  async (withPolicy) => {
    mountDetail();
    wrap();
    const profile = profileWithAddress();
    render(
      <AutofillWorkflow
        pageDocument={document}
        onExit={() => undefined}
        repository={{ load: async () => profile }}
        apiClient={{
          loadExecutionPolicy: async () => (withPolicy ? policy() : undefined),
          analyzePreparation: async (r) => ({
            snapshotId: r.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            preparationPlans: [],
          }),
          analyzeFields: vi.fn(async (r: FieldsAnalyzeRequest) =>
            analysis(r, withPolicy),
          ),
        }}
      />,
    );
    expect(await screen.findByText("기입 결과")).toBeVisible();
    const detail = (
      document.querySelector(
        '[name="currentAddress.detailAddress"]',
      ) as HTMLInputElement
    ).value;
    expect(detail).toBe("Synthetic detail");
  },
);

it.each([false, true])(
  "profile change during legacy writes is detected (native policy=%s)",
  async (withPolicy) => {
    mountDetail();
    wrap();
    const profile = profileWithAddress();
    profile.personal.englishGivenName = "Synthetic";
    const changed = structuredClone(profile);
    changed.personal.birthDate = "1999-01-01";
    let loads = 0;
    const inputs = vi.fn();
    document
      .querySelectorAll("input")
      .forEach((i) => i.addEventListener("input", inputs));
    render(
      <AutofillWorkflow
        pageDocument={document}
        onExit={() => undefined}
        repository={{ load: async () => (++loads <= 2 ? profile : changed) }}
        apiClient={{
          loadExecutionPolicy: async () => (withPolicy ? policy() : undefined),
          analyzePreparation: async (r) => ({
            snapshotId: r.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            preparationPlans: [],
          }),
          analyzeFields: async (r) => analysis(r, withPolicy),
        }}
      />,
    );
    expect(await screen.findByText("기입 결과")).toBeVisible();
    expect(inputs).not.toHaveBeenCalled();
  },
);

import {
  mountBasicDetail,
  activateBasicDetails,
  basicAnalysis,
} from "../adapters/hplace/basic.test-fixtures";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";

function completeLegacyProfile() {
  const profile = profileWithAddress();
  Object.assign(profile.personal, { gender: "남성", nationality: "대한민국" });
  Object.assign(profile.veteran, {
    veteranStatus: "대상",
    veteranNumber: "1234",
    veteranRelation: "본인",
  });
  Object.assign(profile.disability, {
    disabilityStatus: "대상",
    disabilityGrade: "심한 장애인",
    disabilityType: "지체장애",
  });
  Object.assign(profile.military, {
    militaryStatus: "군필",
    militaryRank: "병장",
    serviceStartDate: "2020-01-10",
    serviceEndDate: "2022-01-10",
    dischargeType: "만기제대",
  });
  profile.contact.emergencyPhoneNumber = "010-0000-0000";
  return profile;
}
function basicWithPolicy(withPolicy: boolean) {
  mountBasicDetail();
  activateBasicDetails();
  document
    .querySelector('section[data-code="13"]')!
    .insertAdjacentHTML(
      "beforeend",
      '<div class="subject"><div class="row"><input type="text" name="emergencyContact.contact" maxlength="64" data-validType="PHONE"><input name="emergencyContact.comment"></div></div>',
    );
  wrap();
  if (withPolicy) installExecutionPolicy(document, policy());
}
it.each([false, true])(
  "preserves all 17 legacy candidates and writes the 16 approved mappings (native=%s)",
  async (withPolicy) => {
    basicWithPolicy(withPolicy);
    const profile = completeLegacyProfile(),
      snapshot = collectFieldsSnapshot(document);
    expect(snapshot.request.sections[0].fields).toHaveLength(17);
    const response = basicAnalysis(snapshot.request),
      details = analysis(snapshot.request, withPolicy);
    response.fields = response.fields.map((f, i) =>
      f.matchType === "MATCH" ? f : details.fields[i],
    );
    response.fields = response.fields.map((f, i) =>
      snapshot.request.sections.flatMap((s) => s.fields)[i].domName ===
      "hplace.detail.englishName"
        ? {
            candidateId: f.candidateId,
            matchType: "NO_MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          }
        : f,
    );
    const plan = buildReviewPlan({
      registry: snapshot.registry,
      profile,
      analysis: response,
    });
    const items = plan.items.filter((i) => i.profileValue);
    items.forEach((i) => {
      i.selected = true;
    });
    const result = await executeApprovedWritesAfterPageSettles({
      items,
      registry: snapshot.registry,
      approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
      document,
      hplaceAddress: {
        address: profile.contact.addressLine1!,
        postalCode: profile.contact.postalCode!,
      },
      beforeMutation: async () => true,
    });
    expect(result.filter((r) => r.status === "written")).toHaveLength(16);
    expect(
      document.querySelector<HTMLInputElement>(
        '[name="currentAddress.detailAddress"]',
      )!.value,
    ).toBe("Synthetic detail");
    expect(
      document.querySelector<HTMLInputElement>(
        '[name="emergencyContact.contact"]',
      )!.value,
    ).toBe("010-0000-0000");
    expect(
      document.querySelector<HTMLInputElement>(
        '[name="military.militaryStartDate"]',
      )!.value,
    ).toBe("2020.01");
    expect(
      document.querySelector<HTMLInputElement>(
        '[name="genderFlag"][value="M"]',
      )!.checked,
    ).toBe(true);
    expect(
      document.querySelector<HTMLSelectElement>('[name="nationality"]')!.value,
    ).toBe("KR");
    expect(
      document.querySelector<HTMLInputElement>('[name="englishName"]')!.value,
    ).toBe("");
  },
);
it.each([false, true])(
  "does not retain a service date invalidated by a later legacy write (native=%s)",
  async (withPolicy) => {
    basicWithPolicy(withPolicy);
    const profile = createEmptyProfile();
    profile.military.serviceStartDate = "2020-01-10";
    profile.veteran.veteranNumber = "1234";
    const snapshot = collectFieldsSnapshot(document);
    const items = buildReviewPlan({
      registry: snapshot.registry,
      profile,
      analysis: basicAnalysis(snapshot.request),
    })
      .items.filter((i) => i.profileValue)
      .sort((a) =>
        a.analysis?.valueBinding?.profileFieldKey ===
        "military.military.serviceStartDate"
          ? -1
          : 1,
      );
    items.forEach((i) => {
      i.selected = true;
    });
    document
      .querySelector('[name="patriot.patriotNumber"]')!
      .addEventListener("change", () => {
        document.querySelector<HTMLInputElement>(
          '[name="military.militaryEndDate"]',
        )!.value = "2019.01";
      });
    const result = await executeApprovedWritesAfterPageSettles({
      items,
      registry: snapshot.registry,
      approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
      document,
    });
    expect(result[0].status).toBe("skipped");
  },
);
