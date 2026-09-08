import { render, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../../profile/model";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../../api/types";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";
beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});
function response(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((s) => [
        ...s.fields,
        ...(s.items ?? []).flatMap((i) => i.fields),
      ])
      .map((f) =>
        f.domName === "nationCd1Nm"
          ? {
              candidateId: f.candidateId,
              matchType: "MATCH",
              valueBinding: {
                type: "LOOKUP",
                profileFieldKey: "personal.personal.nationality",
                optionMap: { 대한민국: "대한민국" },
              },
              autofillPolicy: "CONDITIONAL",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "READY",
              writePlan: { command: "SET_TEXT" },
            }
          : {
              candidateId: f.candidateId,
              matchType: "NO_MATCH",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "BLOCKED",
              reasonCodes: ["NO_MATCH"],
            },
      ),
  };
}
it("uses normal nationality search before reanalysis and preserves nationality2", async () => {
  document.body.innerHTML =
    '<article class="field-form-apply"><div class="field search"><input type="hidden" name="nationCd1" class="js-field"><input type="text" id="nationCd1Nm" name="nationCd1Nm" data-auto-type="basic" data-auto-api="0200" data-auto-params="0003"><div class="field-search-view"><ul class="search-result-list"></ul></div></div><input name="nationCd2" type="hidden" value="original-code"><input id="nationCd2Nm" name="nationCd2Nm" value="기존 국적"></article>';
  const input = document.querySelector<HTMLInputElement>("#nationCd1Nm")!;
  input.addEventListener("keyup", () =>
    setTimeout(() => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "auto_result";
      button.dataset.code = "KR";
      button.dataset.search = "대한민국";
      button.dataset.result = "대한민국";
      button.textContent = "대한민국";
      button.addEventListener("click", () => {
        document.querySelector<HTMLInputElement>("[name=nationCd1]")!.value =
          "KR";
        input.value = "대한민국";
        input.setAttribute("data-search-result", "대한민국");
      });
      const li = document.createElement("li");
      li.append(button);
      document.querySelector(".search-result-list")!.replaceChildren(li);
    }, 0),
  );
  const profile = createEmptyProfile();
  profile.personal.nationality = "대한민국";
  let analyses = 0;
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (req) => ({
      snapshotId: req.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (req) => {
      analyses++;
      return response(req);
    },
  };
  render(
    createElement(AutofillWorkflow, {
      apiClient,
      repository: { load: async () => profile },
      pageDocument: document,
      onExit: () => undefined,
    }),
  );
  await waitFor(() =>
    expect(
      document.querySelector<HTMLInputElement>("[name=nationCd1]")!.value,
    ).toBe("KR"),
  );
  expect(input.getAttribute("data-search-result")).toBe("대한민국");
  expect(document.querySelector<HTMLInputElement>("#nationCd2Nm")!.value).toBe(
    "기존 국적",
  );
  expect(
    document.querySelector<HTMLInputElement>("[name=nationCd2]")!.value,
  ).toBe("original-code");
  expect(analyses).toBe(2);
});

it("confirms all university search codes before writing the same row dates", async () => {
  document.body.innerHTML = `
    <article id="academic" class="field-form-apply">
      <div class="field-content">
        <div class="field-group">
          <div class="field">
            <div class="select-wrap">
              <input type="hidden" name="schGb" class="js-field" value="5">
              <input type="button" id="schGb_1" value="학사">
              <div class="select-option education-option"><button type="button" data-code="5" class="selected">학사</button></div>
            </div>
          </div>
          <div class="field search"><input type="hidden" name="schCd"><input type="text" id="schNm_1" name="schNm" data-auto-type="school" data-auto-api="0200" data-auto-params="0047"><div class="field-search-view"><ul class="search-result-list"></ul></div></div>
          <div class="field search"><input type="hidden" name="major"><input type="text" id="majorNm_1" name="majorNm" data-auto-type="basic" data-auto-api="0200" data-auto-params="0015"><div class="field-search-view"><ul class="search-result-list"></ul></div></div>
          <div class="field search"><input type="hidden" name="dblMajor"><input type="text" id="dblMajorNm_1" name="dblMajorNm" data-auto-type="basic" data-auto-api="0200" data-auto-params="0015"><div class="field-search-view"><ul class="search-result-list"></ul></div></div>
          <div class="field search"><input type="hidden" name="minor"><input type="text" id="minorNm_1" name="minorNm" data-auto-type="basic" data-auto-api="0200" data-auto-params="0015"><div class="field-search-view"><ul class="search-result-list"></ul></div></div>
          <div class="field"><input type="text" id="whiStDt_1" name="whiStDt" maxlength="7"></div>
        </div>
      </div>
    </article>`;
  for (const [name, hiddenName, value, code] of [
    ["schNm", "schCd", "서울대학교", "0000561026"],
    ["majorNm", "major", "컴퓨터공학", "03677"],
    ["dblMajorNm", "dblMajor", "산업디자인", "04123"],
    ["minorNm", "minor", "경영학", "00316"],
  ]) {
    const input = document.querySelector<HTMLInputElement>(
      "[name=" + name + "]",
    )!;
    input.addEventListener("keyup", () =>
      setTimeout(() => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "auto_result";
        button.dataset.code = code;
        button.dataset.search = value;
        button.dataset.result = value;
        button.textContent = value;
        button.addEventListener("click", () => {
          input.value = value;
          input.dataset.searchResult = value;
          input
            .closest(".field")!
            .querySelector<HTMLInputElement>(
              "[name=" + hiddenName + "]",
            )!.value = code;
        });
        li.append(button);
        input
          .closest(".field")!
          .querySelector(".search-result-list")!
          .replaceChildren(li);
      }, 0),
    );
  }
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "uni",
      sectionId: "university",
      values: {
        degreeLevel: "학사",
        schoolName: "서울대학교",
        majorName: "컴퓨터공학",
        doubleMajorStatus: "있음",
        additionalMajorName: "산업디자인",
        minorStatus: "있음",
        minorName: "경영학",
        startDate: "2020-03",
      },
    },
  ];
  const keys: Record<string, string> = {
    schNm: "schoolName",
    majorNm: "majorName",
    dblMajorNm: "additionalMajorName",
    minorNm: "minorName",
    whiStDt: "startDate",
  };
  let analyses = 0;
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (req) => ({
      snapshotId: req.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (req) => {
      analyses++;
      return {
        snapshotId: req.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        fields: req.sections
          .flatMap((s) => s.items ?? [])
          .flatMap((i) => i.fields)
          .map((f) =>
            keys[f.domName ?? ""]
              ? {
                  candidateId: f.candidateId,
                  matchType: "MATCH",
                  valueBinding: {
                    type: "DIRECT",
                    profileFieldKey: "education.university." + keys[f.domName!],
                  },
                  autofillPolicy: "ALLOWED",
                  mappingStatus: "ADAPTER_VERIFIED",
                  interactionStatus: "READY",
                  writePlan: { command: "SET_TEXT" },
                }
              : {
                  candidateId: f.candidateId,
                  matchType: "NO_MATCH",
                  mappingStatus: "ADAPTER_VERIFIED",
                  interactionStatus: "BLOCKED",
                  reasonCodes: ["NO_MATCH"],
                },
          ),
      };
    },
  };
  render(
    createElement(AutofillWorkflow, {
      apiClient,
      repository: { load: async () => profile },
      pageDocument: document,
      onExit: () => undefined,
    }),
  );
  await waitFor(() =>
    expect(document.querySelector<HTMLInputElement>("#whiStDt_1")!.value).toBe(
      "2020-03",
    ),
  );
  expect(document.querySelector<HTMLInputElement>("[name=schCd]")!.value).toBe(
    "0000561026",
  );
  expect(document.querySelector<HTMLInputElement>("[name=major]")!.value).toBe(
    "03677",
  );
  expect(
    document.querySelector<HTMLInputElement>("[name=dblMajor]")!.value,
  ).toBe("04123");
  expect(document.querySelector<HTMLInputElement>("[name=minor]")!.value).toBe(
    "00316",
  );
  expect(document.querySelector<HTMLInputElement>("#schNm_1")!.value).toBe(
    "서울대학교",
  );
  expect(document.querySelector<HTMLInputElement>("#majorNm_1")!.value).toBe(
    "컴퓨터공학",
  );
  expect(document.querySelector<HTMLInputElement>("#dblMajorNm_1")!.value).toBe(
    "산업디자인",
  );
  expect(document.querySelector<HTMLInputElement>("#minorNm_1")!.value).toBe(
    "경영학",
  );
  for (const name of ["schNm", "majorNm", "dblMajorNm", "minorNm"]) {
    expect(
      document
        .querySelector<HTMLInputElement>(`[name='${name}']`)!
        .closest(".field")
        ?.classList.contains("exist"),
    ).toBe(true);
  }
  expect(analyses).toBe(5);
});
