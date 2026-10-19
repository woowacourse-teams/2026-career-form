import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { createEmptyProfile } from "../../profile/model";
import {
  mountBasicDetail,
  activateBasicDetails,
  basicAnalysis,
} from "../adapters/hplace/basic.test-fixtures";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import type { FieldsAnalyzeRequest, FieldsAnalyzeResponse } from "../api/types";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
// run1-findings.md + live-dom/gs-step1-basic.md: exact names, labels,
// HTML checked defaults, conditional ownership, and all observed branch codes.
const branches = [
  ["01", "육군"],
  ["02", "해군"],
  ["03", "공군"],
  ["04", "해병"],
  ["05", "전경"],
  ["06", "의경"],
  ["07", "해경"],
  ["08", "공익"],
  ["09", "병역특례"],
  ["10", "카투사"],
  ["11", "의무소방"],
  ["99", "기타"],
];
export const input = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${name}"]`,
  )!;
export function mountRun1() {
  mountBasicDetail();
  activateBasicDetails();
  const root = document.createElement("div");
  root.id = "wrapResume";
  const form = document.getElementById("frm")!;
  root.append(...form.children);
  form.append(root);
  input("military.militaryPositionCode").insertAdjacentHTML(
    "beforebegin",
    `<select id="militaryBranchCode" name="military.militaryBranchCode" data-rel-target="military"><option value="">선택</option>${branches.map(([code, label]) => `<option value="${code}">${label}</option>`).join("")}</select><input type="text" name="military.militaryRole" maxlength="64" data-rel-target="military">`,
  );
  document
    .querySelectorAll<HTMLInputElement>('input[type="radio"]')
    .forEach((e) => {
      e.checked = false;
    });
  for (const name of ["patriot.patriotYn", "handicap.handicapYn"]) {
    document
      .querySelector<HTMLInputElement>(`[name="${name}"][value="false"]`)!
      .setAttribute("checked", "");
    document.querySelector<HTMLInputElement>(
      `[name="${name}"][value="false"]`,
    )!.checked = true;
  }
  const update = () => {
    for (const e of document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("input[data-rel-target],select[data-rel-target]")) {
      const target = e.dataset.relTarget;
      const name =
        target === "patriot"
          ? "patriot.patriotYn"
          : target === "handicap"
            ? "handicap.handicapYn"
            : "military.militaryTypeCode";
      const selected = document.querySelector<HTMLInputElement>(
        `[name="${name}"]:checked`,
      )?.value;
      e.disabled =
        target === "military"
          ? !["01", "04"].includes(selected ?? "")
          : target === "noneMilitary"
            ? selected !== "03"
            : selected !== "true";
    }
  };
  document
    .querySelectorAll<HTMLInputElement>('input[type="radio"]')
    .forEach((e) => e.addEventListener("click", update));
  update();
  const policy = structuredClone(seed.executionPolicy) as ExecutionPolicy;
  installExecutionPolicy(document, policy);
  return { policy, update };
}
export function profile() {
  const p = createEmptyProfile();
  p.personal.gender = "남성";
  p.veteran = {
    veteranStatus: "대상",
    veteranNumber: "SYNTHETIC-001",
    veteranRelation: "본인",
  };
  p.disability = {
    disabilityStatus: "대상",
    disabilityGrade: "심한 장애인",
    disabilityType: "지체장애",
  };
  p.military = {
    militaryStatus: "군필",
    militaryBranch: "육군",
    militaryRank: "병장",
    militarySpecialty: "합성 병과",
    serviceStartDate: "2020-03-01",
    serviceEndDate: "2021-09-30",
    dischargeType: "만기제대",
  };
  return p;
}
export function analysis(
  r: FieldsAnalyzeRequest,
  policy: ExecutionPolicy,
): FieldsAnalyzeResponse {
  const legacy = basicAnalysis(r);
  const rules = seed.fieldRules;
  return {
    ...legacy,
    executionPolicy: policy,
    fields: r.sections
      .flatMap((s) => s.fields)
      .map((f, i) => {
        const rule = rules.find((rule) => rule.structuralName === f.domName);
        return rule
          ? ({
              candidateId: f.candidateId,
              matchType: "MATCH",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "READY",
              autofillPolicy: "ALLOWED",
              valueBinding: rule.valueBinding,
              writePlan: {
                command: f.control === "select" ? "SELECT_OPTION" : "SET_TEXT",
              },
            } as FieldsAnalyzeResponse["fields"][number])
          : legacy.fields[i];
      }),
  };
}
export function run(
  policy: ExecutionPolicy,
  p = profile(),
  shape: (r: FieldsAnalyzeResponse) => FieldsAnalyzeResponse = (r) => r,
) {
  const fields = vi.fn(async (r: FieldsAnalyzeRequest) =>
    shape(analysis(r, policy)),
  );
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => {}}
      repository={{ load: async () => p }}
      apiClient={{
        loadExecutionPolicy: async () => policy,
        analyzePreparation: async (r) => ({
          snapshotId: r.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: [],
        }),
        analyzeFields: fields,
      }}
    />,
  );
  return fields;
}
