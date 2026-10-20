/** Synthetic MRS2 section 16 career rows for the v4 seed policy.
 * Sources: template T=gs-writeResumeTemplate.js career T:2634–2753,
 * live-dom/step2-education-career.md and live-eval
 * snapshots-2026-10-19T07-37-11.917Z (names, types, disabled, data-rel-*,
 * data-dates and option counts only). No values are copied; the
 * careerCriteriaCodeSn options are tenant Sn codes on the site, so this
 * fixture uses virtual codes from 900001.
 * - nine labels: gsenc·abl tenants; seven labels: careerhyundai tenant.
 * - Rows are gated like the site: the employment type select
 *   (`data-rel-id=career[i]`) opens the row, and the LEAVE radio
 *   (`data-rel-type=with data-rel-value=LEAVE`) opens the leaving date.
 * - `project` / `experienceBuilder`: the section-16 subjects after the career
 *   rows, as seen in the C12 sanitized fixtures
 *   (fixtures/dom-snapshots/hplace-mrs2-step2-*). A filled projectName
 *   (`data-rel-id=project[i]`) opens the rest of its row.
 * The linkedForm emulator is bound to `#frm`; call `disposeLinkedForms()` in
 * `afterEach`. */
import seed from "../../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../../workflow/execution-policy";
import type { Profile } from "../../../profile/model";
import { installLinkedForm } from "./hplace-mrs2-linked-form";
import {
  educationProfile,
  highschoolEntry,
} from "./hplace-mrs2-education.synthetic";

export const CAREER_LABELS_NINE = [
  "정규직",
  "계약직",
  "파견직",
  "프리랜서",
  "개인사업",
  "병역특례",
  "인턴",
  "아르바이트",
  "기타",
] as const;
export const CAREER_LABELS_SEVEN = [
  "정규직",
  "계약직",
  "파견직",
  "프리랜서",
  "개인사업",
  "병역특례",
  "인턴",
] as const;
export interface CareerFixtureOptions {
  /** "nine" (default, gsenc·abl), "seven" (careerhyundai) or explicit labels. */
  labels?: "nine" | "seven" | readonly string[];
  /** First virtual Sn code; labels get consecutive codes. */
  codeBase?: number;
  dateInputFormat?: "YM" | "YMD";
  /** abl-type salary column. */
  salary?: boolean;
  /** Project subject (data-code 154) with this many rows (default 1). */
  project?: { rows?: number; contributionRate?: boolean };
  /** abl-type 경험 기술 textarea subject. */
  experienceBuilder?: boolean;
}
const labelsOf = (labels: CareerFixtureOptions["labels"] = "nine") =>
  labels === "nine"
    ? CAREER_LABELS_NINE
    : labels === "seven"
      ? CAREER_LABELS_SEVEN
      : labels;
/** Label → virtual Sn code for the rendered select. */
export function careerOptionCodes({
  labels,
  codeBase = 900001,
}: CareerFixtureOptions = {}): Record<string, string> {
  return Object.fromEntries(
    labelsOf(labels).map((label, i) => [label, String(codeBase + i)]),
  );
}
export function careerRow(index: number, options: CareerFixtureOptions = {}) {
  const row = `career[${index}]`;
  const gate = ` data-rel-target="${row}" disabled`;
  const text = (name: string, max: number) =>
    `<div class="span"><input type="text" maxlength="${max}" name="${row}.${name}" class="text"${gate}></div>`;
  return `<div class="row loop" data-loop="career"><div class="row in-span no-margin"><div class="span per20 btn"><div class="wrapBtn"><button type="button" data-button="add"></button><button type="button" data-button="remove"></button><button type="button" data-button="reset"></button></div></div><label class="span per25 select"><select name="${row}.careerCriteriaCodeSn" data-rel-id="${row}" required><option value="">고용형태를 선택하세요.</option>${Object.entries(
    careerOptionCodes(options),
  )
    .map(([label, code]) => `<option value="${code}">${label}</option>`)
    .join(
      "",
    )}</select></label></div><div class="row in-span half-margin">${text("company", 128)}</div><div class="row in-span half-margin"><div class="span per20 radio" data-rel-id="${row}.workingStatusCode" data-rel-type="with" data-rel-value="LEAVE">${[
    ["WORK", "재직중"],
    ["LEAVE", "퇴사"],
  ]
    .map(
      ([code, label]) =>
        `<label><input type="radio" value="${code}" name="${row}.workingStatusCode"${gate}><span class="label">${label}</span></label>`,
    )
    .join(
      "",
    )}</div><label class="span per35 date"><input type="text" data-rel-target="${row}" data-dates="${row}.careerDate:${options.dateInputFormat ?? "YMD"} forbiddenAfterToday" name="${row}.entranceDate" class="text date start" disabled><input type="text" data-rel-target="${row}.workingStatusCode" data-dates="${row}.careerDate:END forbiddenAfterToday" name="${row}.leavingDate" class="text date end" disabled></label></div><div class="row in-span half-margin">${text("department", 128)}${text("position", 64)}</div><div class="row in-span half-margin">${text("assignedTask", 216)}</div>${options.salary ? `<div class="row in-span half-margin"><span class="span label money"><input type="number" max="2147483648" name="${row}.salary" class="text"${gate}></span></div>` : ""}<div class="row in-span half-margin">${text("retirementReason", 512)}</div></div>`;
}
/** Live project row (C12 fixtures): projectName drives the row. */
export function projectRow(
  index: number,
  {
    contributionRate = false,
  }: NonNullable<CareerFixtureOptions["project"]> = {},
) {
  const row = `project[${index}]`;
  const gate = ` data-rel-target="${row}" disabled`;
  const text = (name: string, attributes = gate) =>
    `<div class="span"><input type="text" maxlength="128" name="${row}.${name}" class="text"${attributes}></div>`;
  return `<div class="row loop" data-loop="project"><div class="row in-span no-margin"><div class="span per20 btn"><div class="wrapBtn"><button type="button" data-button="add"></button><button type="button" data-button="remove"></button><button type="button" data-button="reset"></button></div></div>${text("projectName", ` data-rel-id="${row}"`)}</div><div class="row in-span half-margin">${text("clientName", `${gate} required`)}${text("workplace", `${gate} required`)}</div><div class="row in-span half-margin"><label class="span per35 date"><input type="text" class="text date start" data-dates="${row}.projectDate:YMD" name="${row}.startDate"${gate} required><input type="text" class="text date end" data-dates="${row}.projectDate:END" name="${row}.endDate"${gate} required></label></div><div class="row in-span half-margin">${contributionRate ? `<span class="span label percent"><input type="number" data-input-type="positive" max="100" step="1" name="${row}.contributionRate" class="text"${gate}></span>` : ""}${text("role")}</div></div>`;
}
export function careerSection(rows = 2, options: CareerFixtureOptions = {}) {
  const project = options.project
    ? `<div class="subject" data-wrap="project" data-code="154" data-type="project">${Array.from({ length: options.project.rows ?? 1 }, (_, i) => projectRow(i, options.project)).join("")}</div>`
    : "";
  const experience = options.experienceBuilder
    ? `<div class="subject"><textarea data-maxlength="1000" data-minlength="" name="experienceBuilder.textInput" class="textarea" maxlength="1000"></textarea><input type="hidden" name="experienceBuilder.resumeBuilderSn"></div>`
    : "";
  return `<section class="writeResume" data-code="16"><div class="subject" data-code="153" data-wrap="career">${Array.from({ length: rows }, (_, i) => careerRow(i, options)).join("")}</div>${project}${experience}</section>`;
}
function wireCareerAdd(subject: Element, options: CareerFixtureOptions) {
  for (const button of subject.querySelectorAll<HTMLButtonElement>(
    ":scope > .loop [data-button=add]",
  ))
    button.onclick = () => {
      subject.insertAdjacentHTML(
        "beforeend",
        careerRow(subject.children.length, options),
      );
      wireCareerAdd(subject, options);
    };
}
/** Appends section 16 to an already mounted `#wrapResume` (e.g. mountEducation). */
export function appendCareerSection(
  rows = 2,
  options: CareerFixtureOptions = {},
) {
  const root = document.querySelector("#wrapResume")!;
  root.insertAdjacentHTML("beforeend", careerSection(rows, options));
  wireCareerAdd(root.lastElementChild!.firstElementChild!, options);
  installLinkedForm(document.querySelector("#frm")!);
}
/** Standalone section-16 page with the v4 seed policy installed. */
export function mountCareer(rows = 2, options: CareerFixtureOptions = {}) {
  window.history.replaceState({}, "", "/mrs2/applicant/resume/writeResume");
  const policy = structuredClone(
    seed.executionPolicy,
  ) as unknown as ExecutionPolicy;
  document.body.innerHTML =
    seed.executionPolicy.browserPolicy.nativeForm.assetPaths
      .map((src) => `<script src="${src}"></script>`)
      .join("") + `<form id="frm"><div id="wrapResume"></div></form>`;
  appendCareerSection(rows, options);
  installExecutionPolicy(document, policy);
  return policy;
}
export function careerEntries(): Profile["careers"] {
  return [
    {
      id: "career-a",
      sectionId: "career",
      values: {
        companyName: "합성회사 A",
        employmentType: "정규",
        startDate: "2019-03-01",
        endDate: "2021-02-28",
        employmentStatus: "퇴사",
        department: "가상개발팀",
        position: "가상직급 A",
        responsibilities: "가상 담당업무 A",
        terminationReason: "가상 퇴직사유",
      },
    },
    {
      id: "career-b",
      sectionId: "career",
      values: {
        companyName: "합성회사 B",
        employmentType: "계약",
        startDate: "2021-04-01",
        employmentStatus: "재직중",
        department: "가상기획팀",
        position: "가상직급 B",
        responsibilities: "가상 담당업무 B",
      },
    },
  ];
}
/** Synthetic step 2 profile: high school, two colleges, graduate school, two careers. */
export function step2Profile(): Profile {
  const profile = educationProfile();
  profile.education = [highschoolEntry(), ...profile.education];
  profile.careers = careerEntries();
  return profile;
}
