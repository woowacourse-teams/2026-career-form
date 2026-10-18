/** Synthetic: public T:1211–1693 / W:1406–1588, live-dom/repeat-rows.md.
 * Real wrapSubject / row.loop containment; invented values, no applicant data. */
import seed from "../../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../../workflow/execution-policy";
import { collectFieldsSnapshot } from "../../dom/collect";
import { nativeOwnership } from "../native-form-collection";
import { buildReviewPlan } from "../../review/review-plan";
import { createEmptyProfile, type Profile } from "../../../profile/model";
import type { FieldsAnalyzeResponse } from "../../api/types";
export const widget = (prefix: string, kind: string, property: string) =>
  `<div class="span"><div class="search"><label><input type="search" data-type="${kind}"></label><div class="searchResult"></div></div><input type="hidden" name="${prefix}.${property}Name"><span class="searchResultName"></span><input class="hidden" name="${prefix}.${property}Code"></div>`;
export const majorRow = (parent: string, index: number) =>
  `<div class="row loop" data-loop="collegeMajor"><input type="hidden" name="${parent}.collegeMajor[${index}].collegeMajorSn">${widget(`${parent}.collegeMajor[${index}]`, "major", "major")}${["주전공", "복수전공", "부전공"].map((label, i) => `<label><input type="radio" name="${parent}.collegeMajor[${index}].majorTypeCode" data-rel-target="${parent}" value="0${i + 1}">${label}</label>`).join("")}<select name="${parent}.collegeMajor[${index}].majorCategoryCode" data-rel-target="${parent}"><option value=""></option><option value="118">공학계열(컴퓨터·통신)</option><option value="135">기타</option></select>${["주간", "야간"].map((label, i) => `<label><input type="radio" name="${parent}.collegeMajor[${index}].dayOrNight" data-rel-target="${parent}" value="0${i + 1}">${label}</label>`).join("")}<button type="button" data-button="add" data-rel-target="${parent}"></button><button type="button" data-button="remove"></button></div>`;
export const collegeRow = (kind: string, index: number, majors = 1) => {
  const parent = `${kind}[${index}]`;
  return `<div class="wrapSubject" data-loop="${kind}" data-index="${index}">${widget(parent, "college", "academy")}<label><input type="radio" name="${parent}.degreeTypeCode" value="${kind === "college" ? "50" : "62"}">${kind === "college" ? "학사" : "석사"}</label><input name="${parent}.entranceDate" data-dates="${parent}.date:YM college graduationCriteriaDate"><input name="${parent}.graduationDate" data-dates="${parent}.date:END"><div class="subject"><div class="subject" data-wrap="major">${Array.from({ length: majors }, (_, j) => majorRow(parent, j)).join("")}</div></div><input type="number" name="${parent}.score" step="0.001" min="0" data-rel-id="${parent}.perfectScore" data-rel-target="${parent}"><select name="${parent}.perfectScore" data-rel-target="${parent}.perfectScore" disabled><option value="">만점기준</option>${["3.0", "3.5", "4.0", "4.3", "4.5", "5.0", "7.0", "20", "100"].map((v) => `<option value="${v}">${v}</option>`).join("")}</select><input type="number" name="${parent}.majorCredits"><input type="number" name="${parent}.majorAverageScore"><select name="${parent}.majorPerfectScore"><option value=""></option><option value="4.5">4.5</option></select></div>`;
};
export function mountEducation(count = 2, majors = 1) {
  window.history.replaceState({}, "", "/mrs2/applicant/resume/writeResume");
  const policy = structuredClone(
    seed.executionPolicy,
  ) as unknown as ExecutionPolicy;
  document.body.innerHTML =
    seed.executionPolicy.browserPolicy.nativeForm.assetPaths
      .map((src) => `<script src="${src}"></script>`)
      .join("") +
    `<form id="frm"><div id="wrapResume">${["college", "graduateSchool"].map((kind, i) => `<section class="writeResume" data-code="${141 + i}"><div class="wrapCollege" data-wrap="collegeLoop" data-type="${kind}" data-required="true" data-dateinputformat="YM">${Array.from({ length: i ? 1 : count }, (_, j) => collegeRow(kind, j, majors)).join("")}</div><div class="collegeBtnSet"><button type="button" data-button="addCollege" data-loopname="${kind}"></button></div></section>`).join("")}</div></form>`;
  for (const root of document.querySelectorAll("[data-wrap=major]"))
    wireMajorAdd(root);
  for (const input of document.querySelectorAll<HTMLInputElement>(
    '[name$=".score"]',
  ))
    input.addEventListener("blur", () => {
      setTimeout(() => {
        const scale = input.parentElement!.querySelector<HTMLSelectElement>(
          '[name$=".perfectScore"]',
        )!;
        scale.disabled = false;
      }, 50);
    });
  installExecutionPolicy(document, policy);
  return policy;
}
export function wireMajorAdd(root: Element) {
  const children = Array.from(root.children);
  children.forEach((row, i) => {
    const button = row.querySelector<HTMLButtonElement>("[data-button=add]")!;
    button.hidden = i !== children.length - 1;
    button.onclick = () => {
      const parent = button.dataset.relTarget!;
      root.insertAdjacentHTML("beforeend", majorRow(parent, children.length));
      wireMajorAdd(root);
    };
  });
}
export function educationProfile(): Profile {
  const p = createEmptyProfile();
  p.education = [
    {
      id: "college-a",
      sectionId: "university",
      values: {
        schoolName: "합성대학 A",
        degreeLevel: "학사",
        startDate: "2020-03-01",
        majorName: "소프트웨어융합",
        majorField: "공학계열(컴퓨터·통신)",
        attendanceType: "주간",
        doubleMajorStatus: "있음",
        additionalMajorName: "가상복수전공",
        minorStatus: "있음",
        minorName: "가상부전공",
        gpaScore: "3.75",
        gpaScale: "4.50",
      },
    },
    {
      id: "college-b",
      sectionId: "university",
      values: {
        schoolName: "합성대학 B",
        degreeLevel: "학사",
        startDate: "2021-03-01",
        majorName: "가상주전공 B",
        gpaScore: "0",
        gpaScale: "4.00",
      },
    },
    {
      id: "graduate-a",
      sectionId: "graduateSchool",
      values: {
        schoolName: "합성대학원",
        degreeLevel: "석사",
        startDate: "2023-03-01",
        majorName: "가상연구전공",
        gpaScore: "3.7",
        gpaScale: "4.3",
      },
    },
  ];
  return p;
}
export function educationReview(profile = educationProfile()) {
  const snapshot = collectFieldsSnapshot(document);
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: snapshot.request.sections
      .flatMap((s) => s.items?.flatMap((i) => i.fields) ?? [])
      .map((f) => {
        const l = snapshot.registry.lookupField(f.candidateId);
        if (!("handle" in l)) throw new Error();
        return {
          candidateId: f.candidateId,
          matchType: "MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          valueBinding: nativeOwnership(l.handle)!.field.binding,
          writePlan: {
            command:
              f.control === "select"
                ? "SELECT_OPTION"
                : f.control === "radio"
                  ? "CHECK_RADIO"
                  : "SET_TEXT",
          },
        };
      }),
  };
  return {
    snapshot,
    analysis,
    review: buildReviewPlan({ registry: snapshot.registry, profile, analysis }),
  };
}
export function educationItem(
  suffix: string,
  parent = 0,
  profile = educationProfile(),
) {
  const state = educationReview(profile);
  const field = state.snapshot.request.sections
    .find((s) => s.sectionId === "hplace-mrs2-college")
    ?.items?.[parent].fields.find((f) => f.domName?.endsWith(suffix));
  if (!field) throw new Error(`missing ${suffix}`);
  const l = state.snapshot.registry.lookupField(field.candidateId);
  if (!("handle" in l)) throw new Error();
  return {
    ...state,
    handle: l.handle,
    item: state.review.items.find((i) => i.candidateId === field.candidateId)!,
  };
}
