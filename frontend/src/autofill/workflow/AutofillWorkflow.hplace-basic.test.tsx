import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { AutofillWorkflow } from "./AutofillWorkflow";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  ValueBinding,
} from "../api/types";
import {
  mountBasicDetail,
  activateBasicDetails,
} from "../adapters/hplace/basic.test-fixtures";
import { resetHplacePage } from "./test-utils/hplace.fixture";

afterEach(resetHplacePage);

// Hand-authored policy responses: expectations below are literal site codes,
// independent of the production Hplace spec table.
const bindings: Record<string, ValueBinding> = {
  birthday: { type: "DIRECT", profileFieldKey: "personal.personal.birthDate" },
  gender: {
    type: "LOOKUP",
    profileFieldKey: "personal.personal.gender",
    optionMap: { 남성: "남", 여성: "여" },
  },
  nationality: {
    type: "LOOKUP",
    profileFieldKey: "personal.personal.nationality",
    optionMap: { 대한민국: "대한민국" },
  },
  veteranStatus: {
    type: "DERIVED",
    recipe: "BOOLEAN_YN",
    profileFieldKey: "veteran.veteran.veteranStatus",
    trueLabel: "대상",
    falseLabel: "비대상",
  },
  disabilityStatus: {
    type: "DERIVED",
    recipe: "BOOLEAN_YN",
    profileFieldKey: "disability.disability.disabilityStatus",
    trueLabel: "대상",
    falseLabel: "비대상",
  },
  militaryStatus: {
    type: "LOOKUP",
    profileFieldKey: "military.military.militaryStatus",
    optionMap: { 군필: "군필", 면제: "면제", 비대상: "비대상" },
  },
  veteranNumber: {
    type: "DIRECT",
    profileFieldKey: "veteran.veteran.veteranNumber",
  },
  veteranRelation: {
    type: "DIRECT",
    profileFieldKey: "veteran.veteran.veteranRelation",
  },
  disabilityGrade: {
    type: "LOOKUP",
    profileFieldKey: "disability.disability.disabilityGrade",
    optionMap: { "심한 장애인": "심한 장애인" },
  },
  disabilityType: {
    type: "LOOKUP",
    profileFieldKey: "disability.disability.disabilityType",
    optionMap: { 지체장애: "지체장애" },
  },
  militaryRank: {
    type: "LOOKUP",
    profileFieldKey: "military.military.militaryRank",
    optionMap: { 병장: "병장" },
  },
  serviceStartDate: {
    type: "DIRECT",
    profileFieldKey: "military.military.serviceStartDate",
  },
  serviceEndDate: {
    type: "DIRECT",
    profileFieldKey: "military.military.serviceEndDate",
  },
  dischargeType: {
    type: "LOOKUP",
    profileFieldKey: "military.military.dischargeType",
    optionMap: { 만기제대: "만기제대" },
  },
  exemptionReason: {
    type: "DIRECT",
    profileFieldKey: "military.military.exemptionReason",
  },
};

function policy(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((s) => s.fields)
      .map((f) => {
        const key = f.domName?.split(".").at(-1) ?? "";
        const binding = bindings[key];
        return binding
          ? {
              candidateId: f.candidateId,
              matchType: "MATCH",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "READY",
              autofillPolicy: ["gender", "nationality"].includes(key)
                ? "CONDITIONAL"
                : "ALLOWED",
              valueBinding: binding,
              writePlan: {
                command:
                  f.control === "radio"
                    ? "CHECK_RADIO"
                    : f.control === "select"
                      ? "SELECT_OPTION"
                      : "SET_TEXT",
              },
            }
          : {
              candidateId: f.candidateId,
              matchType: "NO_MATCH",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "BLOCKED",
              reasonCodes: ["NO_MATCH"],
            };
      }),
  };
}

function mountConditionalForm() {
  mountBasicDetail();
  activateBasicDetails();
  document
    .querySelectorAll<HTMLInputElement>('input[type="radio"]')
    .forEach((e) => {
      e.checked = false;
    });
  const update = () => {
    const selected = (name: string) =>
      document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)
        ?.value;
    for (const element of document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("input[data-rel-target],select[data-rel-target]")) {
      const target = element.dataset.relTarget;
      element.disabled =
        target === "patriot"
          ? selected("patriot.patriotYn") !== "true"
          : target === "handicap"
            ? selected("handicap.handicapYn") !== "true"
            : target === "noneMilitary"
              ? selected("military.militaryTypeCode") !== "03"
              : !["01", "04"].includes(
                  selected("military.militaryTypeCode") ?? "",
                );
    }
  };
  document
    .querySelectorAll<HTMLInputElement>('input[type="radio"]')
    .forEach((e) => e.addEventListener("click", update));
  update();
  return update;
}

function profileWithBasicFields() {
  const profile = createEmptyProfile();
  profile.personal = {
    birthDate: "2000-02-29",
    gender: "여성",
    nationality: "대한민국",
  };
  profile.veteran = {
    veteranStatus: "veteran-status:eligible",
    veteranNumber: "SYNTHETIC-001",
    veteranRelation: "본인",
  };
  profile.disability = {
    disabilityStatus: "disability-status:eligible",
    disabilityGrade: "심한 장애인",
    disabilityType: "지체장애",
  };
  profile.military = {
    militaryStatus: "military-status:served",
    militaryRank: "military-rank:byeongjang",
    serviceStartDate: "2020-03-01",
    serviceEndDate: "2021-09-30",
    dischargeType: "만기제대",
    exemptionReason: "합성 테스트 사유",
  };
  return profile;
}

function setup(profile = profileWithBasicFields()) {
  const fields = vi.fn<AnalysisApiClient["analyzeFields"]>(async (request) =>
    policy(request),
  );
  const preparation = vi.fn<AnalysisApiClient["analyzePreparation"]>(
    async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
  );
  const props = {
    pageDocument: document,
    onExit: () => undefined,
    repository: { load: async () => profile },
    apiClient: { analyzeFields: fields, analyzePreparation: preparation },
  };
  return { fields, preparation, props };
}

it("fills three independent conditional groups in one reanalysis and preserves them on rerun", async () => {
  mountConditionalForm();
  const { fields, preparation, props } = setup();
  const changes = vi.fn();
  document.getElementById("frm")!.addEventListener("change", changes);
  const forbidden = vi.fn();
  document
    .querySelectorAll("button")
    .forEach((e) => e.addEventListener("click", forbidden));
  const view = render(<AutofillWorkflow {...props} />);
  await screen.findByText("기입 결과", {}, { timeout: 120_000 });
  for (const [name, value] of [
    ["genderFlag", "F"],
    ["patriot.patriotYn", "true"],
    ["handicap.handicapYn", "true"],
    ["military.militaryTypeCode", "01"],
  ]) {
    expect(
      document.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)
        ?.value,
    ).toBe(value);
  }
  for (const [name, value] of [
    ["nationality", "KR"],
    ["birthday", "2000.02.29"],
    ["patriot.patriotNumber", "SYNTHETIC-001"],
    ["patriot.relationship", "본인"],
    ["handicap.handicapGradeCode", "100"],
    ["handicap.handicapContentsCode", "17"],
    ["military.militaryPositionCode", "04"],
    ["military.militaryStartDate", "2020.03"],
    ["military.militaryEndDate", "2021.09"],
    ["military.militaryDischargeCode", "01"],
  ]) {
    expect(
      document.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[name="${name}"]`,
      )?.value,
    ).toBe(value);
  }
  expect(fields).toHaveBeenCalledTimes(2);
  expect(preparation).toHaveBeenCalledTimes(1);
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="military.exemptionReason"]',
    )!.value,
  ).toBe("");
  expect(
    document.querySelector<HTMLInputElement>('[type="password"]')!.value,
  ).toBe("");
  expect(forbidden).not.toHaveBeenCalled();
  const count = changes.mock.calls.length;
  view.unmount();
  render(<AutofillWorkflow {...props} />);
  await screen.findByText("기입 결과", {}, { timeout: 120_000 });
  expect(changes).toHaveBeenCalledTimes(count);
  expect(fields.mock.calls.length).toBeLessThanOrEqual(4);
}, 120_000);

it("preserves an existing opposite veteran status and still fills independent fields", async () => {
  const update = mountConditionalForm();
  document.querySelector<HTMLInputElement>(
    '[name="patriot.patriotYn"][value="false"]',
  )!.checked = true;
  update();
  const { props } = setup();
  render(<AutofillWorkflow {...props} />);
  await screen.findByText("기입 결과", {}, { timeout: 120_000 });
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="patriot.patriotYn"]:checked',
    )!.value,
  ).toBe("false");
  expect(
    document.querySelector<HTMLInputElement>('[name="patriot.patriotNumber"]')!
      .value,
  ).toBe("");
  expect(
    document.querySelector<HTMLInputElement>('[name="birthday"]')!.value,
  ).toBe("2000.02.29");
});

it("fills exemption reason only for the matching exemption state", async () => {
  mountConditionalForm();
  const profile = profileWithBasicFields();
  profile.military.militaryStatus = "military-status:exempt";
  const { props, fields } = setup(profile);
  render(<AutofillWorkflow {...props} />);
  await screen.findByText("기입 결과", {}, { timeout: 120_000 });
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="military.exemptionReason"]',
    )!.value,
  ).toBe("합성 테스트 사유");
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="military.militaryStartDate"]',
    )!.value,
  ).toBe("");
  expect(fields).toHaveBeenCalledTimes(2);
});

it("says the site policy is not registered when a recognized Hplace page is policy-blocked", async () => {
  mountConditionalForm();
  const { props } = setup();
  props.apiClient.analyzeFields = vi.fn<AnalysisApiClient["analyzeFields"]>(
    async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "BLOCKED",
      fields: [],
      blockCode: "ADAPTER_POLICY_UNAVAILABLE",
    }),
  );
  render(<AutofillWorkflow {...props} />);
  expect(
    await screen.findByText(
      "이 지원서의 자동 기입 정책이 아직 등록되지 않았어요. 수동 복사를 이용해 주세요.",
      {},
      { timeout: 120_000 },
    ),
  ).toBeVisible();
});
