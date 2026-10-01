import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile, type Profile } from "../../../profile/model";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  ValueBinding,
} from "../../api/types";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";

const bindings: Record<string, ValueBinding> = {
  milCd: {
    type: "BUTTON_OPTION",
    profileFieldKey: "military.military.militaryStatus",
    optionMap: {
      군필: "필",
      만기전역: "필",
      미필: "미필",
      면제: "면제",
      비대상: "비대상(여성/해외국적)",
    },
    optionCodeMap: {
      필: "1",
      미필: "2",
      면제: "5",
      "비대상(여성/해외국적)": "7",
    },
  },
  milExcptCd: {
    type: "BUTTON_OPTION",
    profileFieldKey: "military.military.exemptionReason",
    optionMap: { 신체문제: "신체문제" },
    optionCodeMap: { 신체문제: "01" },
  },
  milRank: {
    type: "BUTTON_OPTION",
    profileFieldKey: "military.military.militaryRank",
    optionMap: { 병장: "병장" },
    optionCodeMap: { 병장: "41" },
  },
  milDitinc: {
    type: "BUTTON_OPTION",
    profileFieldKey: "military.military.militaryBranch",
    optionMap: { 육군: "육군" },
    optionCodeMap: { 육군: "1" },
  },
  branchYn: {
    type: "BUTTON_OPTION",
    profileFieldKey: "veteran.veteran.veteranStatus",
    optionMap: { 대상: "예", 비대상: "아니오" },
    optionCodeMap: { 예: "Y", 아니오: "N" },
  },
  branchRel: {
    type: "BUTTON_OPTION",
    profileFieldKey: "veteran.veteran.veteranRelation",
    optionMap: { 본인: "대상(본인)" },
    optionCodeMap: { "대상(본인)": "1" },
  },
  milStartDt: {
    type: "DERIVED",
    recipe: "YEAR_MONTH",
    profileFieldKey: "military.military.serviceStartDate",
  },
  milEndDt: {
    type: "DERIVED",
    recipe: "YEAR_MONTH",
    profileFieldKey: "military.military.serviceEndDate",
  },
  branchNo: {
    type: "DIRECT",
    profileFieldKey: "veteran.veteran.veteranNumber",
  },
  injuryYn: {
    type: "BUTTON_OPTION",
    profileFieldKey: "disability.disability.disabilityStatus",
    optionMap: { 대상: "예", 비대상: "아니오" },
    optionCodeMap: { 예: "Y", 아니오: "N" },
  },
  injuryGrade: {
    type: "BUTTON_OPTION",
    profileFieldKey: "disability.disability.disabilityGrade",
    optionMap: { 중증: "심한 장애인", 경증: "심하지 않은 장애인" },
    optionCodeMap: { "심한 장애인": "10", "심하지 않은 장애인": "11" },
  },
  injuryType: {
    type: "BUTTON_OPTION",
    profileFieldKey: "disability.disability.disabilityType",
    optionMap: { 지체장애: "지체장애" },
    optionCodeMap: { 지체장애: "10" },
  },
  engNm: {
    type: "DIRECT",
    profileFieldKey: "personal.personal.englishGivenName",
  },
};
const service = "milStartDt,milEndDt,milRank,milDitinc,milSpeNm";
const allMilitary = `milExcptCd,${service}`;
const allVeteran = "branchRel,branchSupplyYn,branchAddPoint,branchNo";
const transitions: Record<string, Record<string, [string, string, string]>> = {
  milCd: {
    "1": [service, "milExcptCd", service],
    "2": ["", allMilitary, ""],
    "5": ["milExcptCd", service, "milExcptCd"],
    "7": ["", allMilitary, ""],
  },
  branchYn: {
    Y: [allVeteran, "", "branchRel,branchAddPoint,branchNo"],
    N: ["", allVeteran, ""],
  },
  injuryYn: {
    Y: ["injuryGrade,injuryType,injuryTypeNm,injuryCont", "", ""],
    N: ["", "injuryGrade,injuryType,injuryTypeNm,injuryCont", ""],
  },
};

function control(id: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`input#${id}`)!;
}
function hidden(id: string): string {
  return document.querySelector<HTMLInputElement>(
    `article#etc input[type=hidden][name=${id}]`,
  )!.value;
}

function renderApplication(options: { failMilitaryTransition?: boolean } = {}) {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
  document.body.innerHTML = `<form><article id="personal" class="field-form-apply"><label for="engNm">영문 이름</label><input id="engNm" name="engNm" type="text"></article><article id="etc" class="field-form-apply"><div class="field-content"><div class="field-group"></div></div></article></form>`;
  const group = document.querySelector<HTMLElement>("#etc .field-group")!;
  const clicks: Record<string, number> = {};
  for (const [id, codegb, labels] of [
    [
      "milCd",
      "0004",
      [
        ["필", "1"],
        ["미필", "2"],
        ["면제", "5"],
        ["비대상(여성/해외국적)", "7"],
      ],
    ],
    ["milExcptCd", "0094", [["신체문제", "01"]]],
    ["milRank", "0006", [["병장", "41"]]],
    ["milDitinc", "0005", [["육군", "1"]]],
    [
      "branchYn",
      "1502",
      [
        ["예", "Y"],
        ["아니오", "N"],
      ],
    ],
    ["branchRel", "0007", [["대상(본인)", "1"]]],
    [
      "injuryYn",
      "1503",
      [
        ["예", "Y"],
        ["아니오", "N"],
      ],
    ],
    [
      "injuryGrade",
      "0164",
      [
        ["심한 장애인", "10"],
        ["심하지 않은 장애인", "11"],
      ],
    ],
    ["injuryType", "0368", [["지체장애", "10"]]],
    [
      "branchAddPoint",
      "0136",
      [
        ["10", "10"],
        ["5", "5"],
        ["0", "0"],
      ],
    ],
  ] as const) {
    const field = document.createElement("div");
    field.className = "field col-medium js-required";
    field.innerHTML = `<div class="select-wrap"><input type="hidden" class="js-field" name="${id}"><input type="button" class="btn-select" id="${id}" data-codegb="${codegb}" required value=""><label class="field-title" for="${id}">${id}</label><div class="select-option" style="display:none"></div></div>`;
    group.append(field);
    const trigger = control(id);
    if (id === "injuryGrade" || id === "injuryType") trigger.disabled = true;
    const menu = field.querySelector<HTMLElement>(".select-option")!;
    trigger.addEventListener("click", () => {
      menu.style.display = "block";
    });
    for (const [label, code] of labels) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.textContent = label;
      choice.dataset.code = code;
      const transition = transitions[id]?.[code];
      if (transition)
        [
          choice.dataset.enabled,
          choice.dataset.disabled,
          choice.dataset.valid,
        ] = transition;
      Object.defineProperty(choice, "offsetParent", {
        get: () => (menu.style.display === "none" ? null : menu),
      });
      choice.addEventListener("click", () => {
        clicks[id] = (clicks[id] ?? 0) + 1;
        trigger.value = label;
        field.querySelector<HTMLInputElement>("input[type=hidden]")!.value =
          code;
        menu.style.display = "none";
        if (!transition || (id === "milCd" && options.failMilitaryTransition))
          return;
        const [enabled, disabled, required] = transition;
        for (const targetId of `${enabled},${disabled}`
          .split(",")
          .filter(Boolean)) {
          const target = document.querySelector<
            HTMLInputElement | HTMLTextAreaElement
          >(`#${targetId}`);
          if (!target) continue;
          target.disabled = disabled.split(",").includes(targetId);
          target.required = required.split(",").includes(targetId);
        }
      });
      menu.append(choice);
    }
  }
  for (const id of ["milStartDt", "milEndDt"]) {
    group.insertAdjacentHTML(
      "beforeend",
      `<div class="field calendar col-medium js-date-start js-required"><input class="js-field" type="text" id="${id}" name="${id}" maxlength="7" data-date-format="yyyy-mm" data-min-view="months" data-view="months" required><label for="${id}">${id}</label></div>`,
    );
  }
  group.insertAdjacentHTML(
    "beforeend",
    `<div class="field col-medium js-required"><input class="js-field" type="text" id="branchNo" name="branchNo" maxlength="10" data-parsley-type="digits" required><label for="branchNo">보훈번호</label></div><input type="hidden" name="branchSupplyYn" value=""><input type="checkbox" id="branchSupplyYn"><textarea id="injuryCont" name="injuryCont" disabled></textarea><input type="text" id="injuryMemo" value="기존 장애 메모">`,
  );
  return clicks;
}

function fixtureProfile(): Profile {
  const profile = createEmptyProfile();
  profile.personal = { englishGivenName: "Fixture" };
  profile.military = {
    militaryStatus: "군필",
    militaryBranch: "육군",
    militaryRank: "병장",
    serviceStartDate: "2020-03-01",
    serviceEndDate: "2021-09-30",
  };
  profile.veteran = {
    veteranStatus: "대상",
    veteranRelation: "본인",
    veteranNumber: "1234567890",
  };
  return profile;
}

function fieldsResponse(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ])
      .flatMap((field) => {
        const binding = bindings[field.domId ?? ""];
        return binding
          ? [
              {
                candidateId: field.candidateId,
                matchType: "MATCH" as const,
                valueBinding: binding,
                autofillPolicy: "ALLOWED" as const,
                mappingStatus: "ADAPTER_VERIFIED" as const,
                interactionStatus: "READY" as const,
                writePlan: {
                  command:
                    binding.type === "BUTTON_OPTION"
                      ? ("SELECT_BUTTON_OPTION" as const)
                      : ("SET_TEXT" as const),
                },
              },
            ]
          : [];
      }),
  };
}

function run(profile: Profile) {
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => fieldsResponse(request),
  };
  return render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
}

export { control, fixtureProfile, hidden, renderApplication, run, service };
