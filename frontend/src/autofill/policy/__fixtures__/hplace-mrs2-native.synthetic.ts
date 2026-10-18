/** 공개 템플릿 기반 합성 fixture. T=gs-writeResumeTemplate.js (실지원서 값 없음).
 * basic T:29,184,188,1021; career T:2634–2753; project T:2774–2870;
 * foreignAbility T:3789–3862. TEST_* 옵션은 가상 코드이며 실관측 코드가 아니다.
 */
import type { ExecutionPolicy } from "../../workflow/execution-policy";
export const syntheticNativePolicy = () =>
  ({
    version: 1,
    searches: [],
    failureScopes: [],
    address: null,
    browserPolicy: {
      schemaVersion: 2,
      runtimeRules: {
        sectionSelector: "section",
        presentationSelector: "section",
        placeholderAttributes: [],
        placeholderValues: [],
      },
      fields: [],
      normalizations: [],
      reveals: [],
      collection: {
        actions: [],
        sectionSelectors: [],
        visiblePhases: [],
        collectsInputButtonFields: false,
      },
      repeatHints: {},
      educationHints: {},
      freshRowFields: [],
      freshDefaults: [],
      stateDrivers: [],
      searchStageBase: 0,
      searchRowStride: 1,
      refreshAfterPass: false,
      diagnosticsTitle: "합성 native 양식",
      addressAction: { domId: "unused", element: "button" },
      mainWorldBridge: "NONE",
      nativeForm: {
        capabilities: [
          "SCOPED_FIELDS",
          "SINGLE_DEPTH_ROWS",
          "NATIVE_DRIVERS",
          "NATIVE_DATES",
        ],
        path: "/mrs2/applicant/resume/writeResume",
        formSelector: "form#frm",
        rootSelector: "#wrapResume",
        assetPaths: [
          "/mrs2/js/writeResume.js",
          "/mrs2/js/writeResumeTemplate.js",
        ],
        maxFieldsRequests: 5,
        sections: [
          {
            id: "hplace-mrs2-basic-extra",
            title: "기본 추가",
            selector: "section.writeResume[data-code='11']",
            enabled: true,
            anchors: [],
            fields: [
              {
                name: "hplace.mrs2.basic.chineseName",
                rawName: "chineseName",
                type: "text",
                label: "한자명",
                maxLength: 32,
                binding: { type: "DERIVED", recipe: "HANJA_FULL_NAME" },
              },
              {
                name: "hplace.mrs2.basic.hopeSalary",
                rawName: "hopeSalary",
                type: "number",
                label: "희망연봉",
                min: 0,
                max: 210000000,
                step: 1,
                binding: {
                  type: "DIRECT",
                  profileFieldKey: "compensation.compensation.desiredSalary",
                },
              },
            ],
          },
          {
            id: "hplace-mrs2-career",
            title: "경력",
            selector:
              "section.writeResume[data-code='16'] > .subject[data-code='153'][data-wrap='career']",
            enabled: true,
            anchors: ["hplace.mrs2.career.careerCriteriaCodeSn"],
            rows: {
              selector: ":scope > .loop[data-loop='career']",
              namePrefix: "career",
              groupId: "hplace.mrs2.career",
              maxCount: 20,
            },
            action: {
              id: "hplace.mrs2.career.add",
              selector: "button[type='button'][data-button='add']",
              label: "경력 추가",
              categoryId: "careers",
              profileSectionId: "career",
            },
            fields: [
              {
                name: "hplace.mrs2.career.careerCriteriaCodeSn",
                rawName: "career[{index}].careerCriteriaCodeSn",
                type: "select",
                label: "고용형태",
                options: { 정규직: "TEST_REGULAR", 계약직: "TEST_CONTRACT" },
                binding: {
                  type: "DIRECT",
                  profileFieldKey: "careers.career.employmentType",
                },
                driver: {
                  stage: 1,
                  timeoutMs: 500,
                  dependencies: ["hplace.mrs2.career.company"],
                  settled: [
                    { field: "hplace.mrs2.career.company", state: "enabled" },
                  ],
                },
              },
              {
                name: "hplace.mrs2.career.company",
                rawName: "career[{index}].company",
                type: "text",
                label: "회사명",
                maxLength: 128,
                binding: {
                  type: "DIRECT",
                  profileFieldKey: "careers.career.companyName",
                },
              },
              {
                name: "hplace.mrs2.career.entranceDate",
                rawName: "career[{index}].entranceDate",
                type: "text",
                label: "입사일",
                binding: {
                  type: "DIRECT",
                  profileFieldKey: "careers.career.startDate",
                },
                date: {
                  group: "career[{index}].careerDate",
                  role: "START",
                  formats: ["YM", "YMD"],
                  peer: "hplace.mrs2.career.leavingDate",
                  forbiddenAfterToday: true,
                },
              },
              {
                name: "hplace.mrs2.career.leavingDate",
                rawName: "career[{index}].leavingDate",
                type: "text",
                label: "퇴사일",
                binding: {
                  type: "DIRECT",
                  profileFieldKey: "careers.career.endDate",
                },
                date: {
                  group: "career[{index}].careerDate",
                  role: "END",
                  formats: ["YM", "YMD"],
                  peer: "hplace.mrs2.career.entranceDate",
                  forbiddenAfterToday: true,
                },
              },
            ],
          },
        ],
        unsupportedSections: [
          {
            selector: ".subject[data-code='167']",
            reason: "프로필 키 없음",
            title: "해외경험",
          },
        ],
      },
    },
  }) as unknown as ExecutionPolicy;
export function mountSyntheticNative(rows = 1) {
  window.history.replaceState({}, "", "/mrs2/applicant/resume/writeResume");
  document.body.innerHTML = `<script src="/mrs2/js/writeResume.js"></script><script src="/mrs2/js/writeResumeTemplate.js"></script><form id="frm"><div id="wrapResume">
    <section class="writeResume" data-code="11"><input name="chineseName" maxlength="32"><input name="hopeSalary" type="number" min="0" max="210000000" step="1"></section>
    <section class="writeResume" data-code="16"><div class="subject" data-code="153" data-wrap="career">${Array.from({ length: rows }, (_, i) => nativeCareerRow(i)).join("")}${rows === 0 ? '<button type="button" data-button="add"></button>' : ""}</div></section>
    <button type="submit">다음</button><button type="submit">임시저장</button><input type="file"></div></form>`;
}
export function nativeCareerRow(i: number) {
  return `<div class="row loop" data-loop="career"><button type="button" data-button="add"></button><select name="career[${i}].careerCriteriaCodeSn"><option value=""></option><option value="TEST_REGULAR">정규직</option><option value="TEST_CONTRACT">계약직</option></select><input name="career[${i}].company" maxlength="128"><input name="career[${i}].entranceDate" data-dates="career[${i}].careerDate:YM forbiddenAfterToday"><input name="career[${i}].leavingDate" data-dates="career[${i}].careerDate:END forbiddenAfterToday"><input type="number" name="career[${i}].salary"><input type="hidden" name="career[${i}].careerSn"></div>`;
}
