import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import type {
  AnalysisApiClient,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";

const EDUCATION_ACTIONS = [
  {
    id: "btnAddEducationHigh",
    label: "고등학교 학력 정보 추가",
    rowClass: "educationhigh-item",
    fields:
      '<input name="eduhgEducationName" type="text" /><select name="eduhgEducationRegion"><option value=""></option><option value="101009">서울특별시</option></select>',
  },
  {
    id: "btnAddEducationUniv",
    label: "대학 학력 정보 추가",
    rowClass: "educationUniv-item",
    fields:
      '<input name="eduEducationName" type="text" /><input name="eduCredit" type="text" /><select name="eduEducationRegion"><option value=""></option><option value="101009">서울특별시</option></select><select name="eduDaytimeYN"><option value=""></option><option value="1">주간</option><option value="0">야간</option></select>',
  },
] as const;

type EducationAction = (typeof EDUCATION_ACTIONS)[number];

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function educationRow(action: EducationAction): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `form-item-group ${action.rowClass} no-space`;
  row.innerHTML = `
    <div class="form-item-asset">
      ${action.fields}
      <div class="form-item-column btn-control">
        <div class="form-add-control column">
          <button class="btn medium btn-dashed ${action.id}" type="button">${action.label}</button>
        </div>
      </div>
    </div>`;
  return row;
}

function candidates(request: FieldsAnalyzeRequest): FieldCandidate[] {
  return request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

function fieldsResponse(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: candidates(request).map((field) => {
      const educationBindings: Record<string, string> = {
        eduhgEducationRegion: "education.highSchool.schoolRegion",
        eduEducationRegion: "education.university.schoolRegion",
        eduDaytimeYN: "education.university.attendanceType",
      };
      const profileFieldKey =
        educationBindings[field.domName ?? ""] ??
        (field.domName === "eduhgEducationName"
          ? "education.highSchool.schoolName"
          : field.domName === "eduCredit"
            ? "education.university.gpaScore"
            : undefined);
      return profileFieldKey
        ? {
            candidateId: field.candidateId,
            matchType: "MATCH" as const,
            valueBinding: { type: "DIRECT" as const, profileFieldKey },
            autofillPolicy: "ALLOWED" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "READY" as const,
            writePlan: {
              command:
                field.control === "select"
                  ? ("SELECT_OPTION" as const)
                  : ("SET_TEXT" as const),
            },
          }
        : {
            candidateId: field.candidateId,
            matchType: "NO_MATCH" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "BLOCKED" as const,
            reasonCodes: ["NO_MATCH" as const],
          };
    }),
  };
}

function setup(educationValues: Record<string, string> = {}) {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/synthetic",
  });
  // The row/root semantics are repository fixtures; live verification currently
  // confirms the replacement button and its ancestor chain, not a rendered row.
  document.body.innerHTML = `
    <div id="applyContentAcademic" class="apply-form-box education-root">
      <div class="form-body">
        ${EDUCATION_ACTIONS.map(
          ({ id, label }) =>
            `<div class="form-add-control"><button id="${id}" class="btn medium btn-dashed ${id}" type="button">${label}</button></div>`,
        ).join("")}
      </div>
    </div>`;
  const formBody = document.querySelector<HTMLDivElement>(
    "#applyContentAcademic > .form-body",
  )!;
  const clicks: string[] = [];
  const attach = (action: EducationAction, button: HTMLButtonElement) => {
    button.addEventListener("click", () => {
      clicks.push(action.id);
      button.style.display = "none";
      const row = educationRow(action);
      formBody.append(row);
      attach(action, row.querySelector<HTMLButtonElement>("button")!);
    });
  };
  EDUCATION_ACTIONS.forEach((action) =>
    attach(action, document.querySelector<HTMLButtonElement>(`#${action.id}`)!),
  );

  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "high-school-1",
      sectionId: "highSchool",
      values: { schoolName: "테스트 고등학교", ...educationValues },
    },
    {
      id: "university-1",
      sectionId: "university",
      values: { gpaScore: "4.2", ...educationValues },
    },
  ];
  let preparationCalls = 0;
  let fieldAnalysisCalls = 0;
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => {
      preparationCalls += 1;
      const actions = EDUCATION_ACTIONS.map((education) => {
        const action = request.sections
          .flatMap((section) => section.actionCandidates)
          .find((candidate) => candidate.domId === education.id);
        if (!action)
          throw new Error(
            `missing verified SK education action: ${education.id}`,
          );
        return {
          actionCandidateId: action.candidateId,
          command: "ADD_REPEATABLE_GROUP" as const,
          expectedEffect: "GROUP_COUNT_INCREMENT" as const,
        };
      });
      return {
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: actions,
      };
    },
    analyzeFields: async (request) => {
      fieldAnalysisCalls += 1;
      return fieldsResponse(request);
    },
  };
  const workflow = () => (
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />
  );

  return {
    clicks,
    fieldAnalysisCalls: () => fieldAnalysisCalls,
    formBody,
    preparationCalls: () => preparationCalls,
    workflow,
  };
}

it("prepares ID-less SK education replacements, recollects, and writes high-school and university fields once", async () => {
  const run = setup();

  const first = render(run.workflow());
  await waitFor(() => {
    expect(
      document.querySelector<HTMLInputElement>("[name='eduhgEducationName']")
        ?.value,
    ).toBe("테스트 고등학교");
    expect(
      document.querySelector<HTMLInputElement>("[name='eduCredit']")?.value,
    ).toBe("4.2");
  });

  expect(run.clicks).toEqual(["btnAddEducationHigh", "btnAddEducationUniv"]);
  expect(run.formBody.querySelectorAll(".educationhigh-item")).toHaveLength(1);
  expect(run.formBody.querySelectorAll(".educationUniv-item")).toHaveLength(1);
  expect(run.fieldAnalysisCalls()).toBe(1);

  first.unmount();
  render(run.workflow());
  await waitFor(() => expect(run.preparationCalls()).toBe(4));

  expect(run.clicks).toHaveLength(2);
  expect(run.formBody.querySelectorAll(".educationhigh-item")).toHaveLength(1);
  expect(run.formBody.querySelectorAll(".educationUniv-item")).toHaveLength(1);
});

it.each([
  ["region:seoul", "attendance:day", "1"],
  ["서울", "야간", "0"],
])(
  "writes SK education region %s and attendance %s through the workflow",
  async (schoolRegion, attendanceType, code) => {
    const run = setup({ schoolRegion, attendanceType });
    render(run.workflow());
    await waitFor(() => {
      expect(
        document.querySelector<HTMLSelectElement>("[name=eduhgEducationRegion]")
          ?.value,
      ).toBe("101009");
      expect(
        document.querySelector<HTMLSelectElement>("[name=eduEducationRegion]")
          ?.value,
      ).toBe("101009");
      expect(
        document.querySelector<HTMLSelectElement>("[name=eduDaytimeYN]")?.value,
      ).toBe(code);
    });
  },
);
