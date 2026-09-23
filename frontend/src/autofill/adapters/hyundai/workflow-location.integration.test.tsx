import { render, waitFor, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../../profile/model";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../../api/types";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function analysis(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  const bindingFor = (
    id: string,
  ):
    | {
        profileFieldKey: string;
        optionMap: Record<string, string>;
        optionCodeMap: Record<string, string>;
      }
    | undefined => {
    switch (id) {
      case "schClass_1":
        return {
          profileFieldKey: "education.university.attendanceType",
          optionMap: { 주간: "주간" },
          optionCodeMap: { 주간: "D" },
        };
      case "locNation_1":
        return {
          profileFieldKey: "education.university.schoolRegion",
          optionMap: { 서울: "대한민국" },
          optionCodeMap: { 대한민국: "KR" },
        };
      case "locCity_1":
        return {
          profileFieldKey: "education.university.schoolRegion",
          optionMap: { 서울: "서울" },
          optionCodeMap: { 서울: "95" },
        };
      default:
        return undefined;
    }
  };
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections.flatMap((section) =>
      (section.items ?? []).flatMap((item) =>
        item.fields.flatMap((field) => {
          const binding = bindingFor(field.domId ?? "");
          return binding
            ? [
                {
                  candidateId: field.candidateId,
                  matchType: "MATCH" as const,
                  valueBinding: { type: "BUTTON_OPTION" as const, ...binding },
                  autofillPolicy: "CONDITIONAL" as const,
                  mappingStatus: "ADAPTER_VERIFIED" as const,
                  interactionStatus: "READY" as const,
                  writePlan: { command: "SELECT_BUTTON_OPTION" as const },
                },
              ]
            : [];
        }),
      ),
    ),
  };
}

it.each([
  {
    scenario: "exact city",
    nationAvailable: true,
    cityLabels: ["서울"],
    expectedNation: "KR",
    expectedCity: "95",
  },
  {
    scenario: "empty country menu",
    nationAvailable: false,
    cityLabels: [],
    expectedNation: "",
    expectedCity: "",
  },
  {
    scenario: "duplicate city labels",
    nationAvailable: true,
    cityLabels: ["서울", "서울"],
    expectedNation: "KR",
    expectedCity: "",
  },
  {
    scenario: "district without exact city",
    nationAvailable: true,
    cityLabels: ["서울관악"],
    expectedNation: "KR",
    expectedCity: "",
  },
])(
  "keeps unrelated attendance writable with $scenario",
  async ({ nationAvailable, cityLabels, expectedNation, expectedCity }) => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://talent.hyundai.com/apply/applyWrite.hc",
    });
    document.body.innerHTML = `<article id="academic" class="field-form-apply"><div class="field-content"><div class="field-group"><div class="field"><div class="select-wrap"><input class="js-field" type="hidden" name="schGb" value="5"><input class="btn-select" type="button" id="schGb_1" value="학사"><div class="select-option education-option"><button class="selected" type="button" data-code="5">학사</button></div></div></div><div class="js-education"><input id="schNm_1" name="schNm" type="text"><input id="whiStDt_1" name="whiStDt" type="text"><input id="whiEndDt_1" name="whiEndDt" type="text"></div><div class="field"><div class="select-wrap"><input class="js-field" type="hidden" name="schClass"><input class="btn-select" type="button" id="schClass_1" data-codegb="0155"><div class="select-option"><button type="button" data-code="D">주간</button></div></div></div><div class="field"><div class="select-wrap"><input class="btn-select js-refer btn-new-loc locNa" type="text" id="locNation_1" data-codegb="0003"><input class="js-field" type="hidden" name="locNation"><div class="select-option"><button type="button" data-code="KR">대한민국</button></div></div></div><div class="field"><div class="select-wrap"><input class="btn-select js-target btn-new-loc locNa" type="text" id="locCity_1" data-target-codegb="0013" data-refer="locNation" data-attr1="KR"><input class="js-field" type="hidden" name="locCity"><div class="select-option"></div></div></div><input type="checkbox" name="finalEducation" value="Y"></div></article>`;
    for (const option of document.querySelectorAll<HTMLButtonElement>(
      ".select-option button",
    )) {
      Object.defineProperty(option, "offsetParent", { value: document.body });
    }
    const select = (id: string, hiddenName: string) => (event: Event) => {
      const option = event.currentTarget as HTMLButtonElement;
      document.querySelector<HTMLInputElement>(`#${id}`)!.value =
        option.textContent ?? "";
      document.querySelector<HTMLInputElement>(
        `input[name='${hiddenName}']`,
      )!.value = option.dataset.code ?? "";
    };
    const attendanceOption = document
      .querySelector<HTMLInputElement>("#schClass_1")!
      .closest(".select-wrap")!
      .querySelector<HTMLButtonElement>(".select-option button")!;
    attendanceOption.addEventListener(
      "click",
      select("schClass_1", "schClass"),
    );
    const nationOption = document
      .querySelector<HTMLInputElement>("#locNation_1")!
      .closest(".select-wrap")!
      .querySelector<HTMLButtonElement>(".select-option button")!;
    nationOption.addEventListener("click", (event) => {
      select("locNation_1", "locNation")(event);
      const cityOptions = document
        .querySelector<HTMLInputElement>("#locCity_1")!
        .closest(".select-wrap")!
        .querySelector<HTMLElement>(".select-option")!;
      cityOptions.innerHTML = cityLabels
        .map(
          (label) =>
            `<button type="button" data-code="${label === "서울" ? "95" : "01510"}">${label}</button>`,
        )
        .join("");
      for (const city of cityOptions.querySelectorAll<HTMLButtonElement>(
        "button",
      )) {
        Object.defineProperty(city, "offsetParent", { value: document.body });
        city.addEventListener("click", select("locCity_1", "locCity"));
      }
    });

    if (!nationAvailable) nationOption.remove();
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "university-1",
        sectionId: "university",
        values: {
          degreeLevel: "학사",
          attendanceType: "주간",
          schoolRegion: "서울",
        },
      },
    ];
    const apiClient: AnalysisApiClient = {
      analyzePreparation: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
      }),
      analyzeFields: async (request) => analysis(request),
    };
    render(
      <AutofillWorkflow
        apiClient={apiClient}
        repository={{ load: async () => profile }}
        pageDocument={document}
        onExit={() => undefined}
      />,
    );

    await waitFor(
      () => {
        expect(
          document.querySelector<HTMLInputElement>("input[name='schClass']")!
            .value,
        ).toBe("D");
        expect(
          document.querySelector<HTMLInputElement>("input[name='locNation']")!
            .value,
        ).toBe(expectedNation);
        expect(
          document.querySelector<HTMLInputElement>("input[name='locCity']")!
            .value,
        ).toBe(expectedCity);
        expect(
          screen.getByRole("heading", { name: "기입 결과" }),
        ).toBeInTheDocument();
      },
      { timeout: 9000 },
    );
  },
  12000,
);
