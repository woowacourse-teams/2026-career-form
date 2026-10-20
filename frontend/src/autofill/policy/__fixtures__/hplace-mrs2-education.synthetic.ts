/** Synthetic: public T:1211–1693 / W:1406–1588, live-dom/repeat-rows.md.
 * Real wrapSubject / row.loop containment; invented values, no applicant data.
 *
 * Opt-in live-shaped options (CF-177 C0). Defaults keep the original DOM byte
 * for byte (asserted by hplace-mrs2-education.synthetic.test.ts).
 * Sources: template T=gs-writeResumeTemplate.js (140 T:1066–1190, 141/142
 * T:1199–1440, major T:1503–1575), W=gs-writeResume.js:1505 (addCollege reads
 * the wrapCollege data-dateinputformat), live-dom/step2-education-career.md and
 * live-eval snapshots-2026-10-19T07-37-11.917Z (names, types, disabled,
 * data-rel-*, data-dates and option counts only). Values are absent; codes are
 * the platform-wide public code tables, never tenant Sn values.
 * - `dateInputFormat`: section date precision token (`:YM` | `:YMD`).
 * - `highschool`: renders section 140 gated by `data-rel-id=highschool`.
 * - `liveGating`: renders 141/142 rows with the degree wrapper, disabled
 *   `data-rel-target` controls and the major focus-poll relation.
 * - `collegeCategory` / `graduateEntranceType` / `majorScore`: tenant
 *   variations of the live rows seen in the C12 sanitized fixtures
 *   (fixtures/dom-snapshots/hplace-mrs2-step2-*). Only with `liveGating`.
 * Either live option installs the linkedForm emulator on `#frm`; call
 * `disposeLinkedForms()` in `afterEach`. */
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
import { installLinkedForm } from "./hplace-mrs2-linked-form";
export type EducationDateFormat = "YM" | "YMD";
export interface HighschoolFixtureOptions {
  /** Template `!data.isRequired` branch: a leading value="" 작성안함 radio. */
  emptyRadio?: boolean;
  /** Tenant-optional day/night radios (absent on some tenants). */
  dayOrNight?: boolean;
}
type PerKind = { college?: boolean; graduateSchool?: boolean };
export interface EducationFixtureOptions {
  dateInputFormat?: EducationDateFormat;
  liveGating?: boolean;
  highschool?: false | HighschoolFixtureOptions;
  /** Live rows: the 계열 select per kind (default: both rendered). */
  collegeCategory?: PerKind;
  /** Live graduateSchool rows: 입학/편입 radios (default: rendered). */
  graduateEntranceType?: boolean;
  /** Live rows: 전공 이수학점/평점/만점 per kind (default: absent). */
  majorScore?: PerKind;
}
/** Per-row live variations derived from EducationFixtureOptions. */
export interface LiveRowShape {
  collegeCategory?: boolean;
  entranceType?: boolean;
  majorScore?: boolean;
}
const liveRowShape = (
  kind: string,
  {
    collegeCategory = {},
    graduateEntranceType = true,
    majorScore = {},
  }: EducationFixtureOptions,
): LiveRowShape => {
  const key = kind as keyof PerKind;
  return {
    collegeCategory: collegeCategory[key] ?? true,
    entranceType: kind === "graduateSchool" ? graduateEntranceType : true,
    majorScore: majorScore[key] ?? false,
  };
};
export const widget = (prefix: string, kind: string, property: string) =>
  `<div class="span"><div class="search"><label><input type="search" data-type="${kind}"></label><div class="searchResult"></div></div><input type="hidden" name="${prefix}.${property}Name"><span class="searchResultName"></span><input class="hidden" name="${prefix}.${property}Code"></div>`;
export const majorRow = (parent: string, index: number) =>
  `<div class="row loop" data-loop="collegeMajor"><input type="hidden" name="${parent}.collegeMajor[${index}].collegeMajorSn">${widget(`${parent}.collegeMajor[${index}]`, "major", "major")}${["주전공", "복수전공", "부전공"].map((label, i) => `<label><input type="radio" name="${parent}.collegeMajor[${index}].majorTypeCode" data-rel-target="${parent}" value="0${i + 1}">${label}</label>`).join("")}<select name="${parent}.collegeMajor[${index}].majorCategoryCode" data-rel-target="${parent}"><option value=""></option><option value="118">공학계열(컴퓨터·통신)</option><option value="135">기타</option></select>${["주간", "야간"].map((label, i) => `<label><input type="radio" name="${parent}.collegeMajor[${index}].dayOrNight" data-rel-target="${parent}" value="0${i + 1}">${label}</label>`).join("")}<button type="button" data-button="add" data-rel-target="${parent}"></button><button type="button" data-button="remove"></button></div>`;
export const collegeRow = (
  kind: string,
  index: number,
  majors = 1,
  format: EducationDateFormat = "YM",
) => {
  const parent = `${kind}[${index}]`;
  return `<div class="wrapSubject" data-loop="${kind}" data-index="${index}">${widget(parent, "college", "academy")}<label><input type="radio" name="${parent}.degreeTypeCode" value="${kind === "college" ? "50" : "62"}">${kind === "college" ? "학사" : "석사"}</label><input name="${parent}.entranceDate" data-dates="${parent}.date:${format} college graduationCriteriaDate"><input name="${parent}.graduationDate" data-dates="${parent}.date:END"><div class="subject"><div class="subject" data-wrap="major">${Array.from({ length: majors }, (_, j) => majorRow(parent, j)).join("")}</div></div><input type="number" name="${parent}.score" step="0.001" min="0" data-rel-id="${parent}.perfectScore" data-rel-target="${parent}"><select name="${parent}.perfectScore" data-rel-target="${parent}.perfectScore" disabled><option value="">만점기준</option>${["3.0", "3.5", "4.0", "4.3", "4.5", "5.0", "7.0", "20", "100"].map((v) => `<option value="${v}">${v}</option>`).join("")}</select><input type="number" name="${parent}.majorCredits"><input type="number" name="${parent}.majorAverageScore"><select name="${parent}.majorPerfectScore"><option value=""></option><option value="4.5">4.5</option></select></div>`;
};
export function mountEducation(
  count = 2,
  majors = 1,
  majorEnabled = false,
  options: EducationFixtureOptions = {},
) {
  const {
    dateInputFormat = "YM",
    liveGating = false,
    highschool = false,
  } = options;
  const row = (
    kind: string,
    index: number,
    majors: number,
    format: EducationDateFormat,
  ) =>
    liveGating
      ? liveCollegeRow(kind, index, majors, format, liveRowShape(kind, options))
      : collegeRow(kind, index, majors, format);
  window.history.replaceState({}, "", "/mrs2/applicant/resume/writeResume");
  const policy = structuredClone(
    seed.executionPolicy,
  ) as unknown as ExecutionPolicy;
  document.body.innerHTML =
    seed.executionPolicy.browserPolicy.nativeForm.assetPaths
      .map((src) => `<script src="${src}"></script>`)
      .join("") +
    `<form id="frm"><div id="wrapResume">${highschool ? highschoolSection(dateInputFormat, highschool) : ""}${["college", "graduateSchool"].map((kind, i) => `<section class="writeResume" data-code="${141 + i}"><div class="wrapCollege" data-wrap="collegeLoop" data-type="${kind}" data-required="true" data-dateinputformat="${dateInputFormat}">${Array.from({ length: i ? 1 : count }, (_, j) => row(kind, j, majors, dateInputFormat)).join("")}</div><div class="collegeBtnSet"><button type="button" data-button="addCollege" data-loopname="${kind}"></button></div></section>`).join("")}</div></form>`;
  const wireParent = (parent: Element) => {
    const root = parent.querySelector("[data-wrap=major]")!;
    if (liveGating) {
      wireMajorAdd(root, (p, j) => liveMajorRow(p, j, false));
      return;
    }
    wireMajorAdd(root);
    for (const input of root.querySelectorAll<
      HTMLInputElement | HTMLButtonElement
    >("input[type=search],button[data-button=add]"))
      input.disabled = !majorEnabled;
  };
  for (const parent of document.querySelectorAll(
    "[data-loop=college],[data-loop=graduateSchool]",
  ))
    wireParent(parent);
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-button=addCollege]",
  )) {
    button.onclick = () => {
      const kind = button.getAttribute("data-loopname")!;
      const root = button
        .closest("section")!
        .querySelector("[data-wrap=collegeLoop]")!;
      root.insertAdjacentHTML(
        "beforeend",
        row(
          kind,
          root.children.length,
          1,
          (root.getAttribute("data-dateinputformat") ??
            "YM") as EducationDateFormat,
        ),
      );
      wireParent(root.lastElementChild!);
    };
  }
  if (liveGating || highschool)
    installLinkedForm(document.querySelector("#frm")!);
  if (!liveGating)
    document.querySelector("#frm")!.addEventListener(
      "blur",
      (event) => {
        const input = event.target;
        if (
          !(input instanceof HTMLInputElement) ||
          !input.name.endsWith(".score")
        )
          return;
        setTimeout(() => {
          const scale = input.parentElement!.querySelector<HTMLSelectElement>(
            '[name$=".perfectScore"]',
          )!;
          scale.disabled = false;
        }, 50);
      },
      true,
    );
  installExecutionPolicy(document, policy);
  return policy;
}
export function wireMajorAdd(
  root: Element,
  newRow: (parent: string, index: number) => string = majorRow,
) {
  const children = Array.from(root.children);
  children.forEach((row, i) => {
    const button = row.querySelector<HTMLButtonElement>("[data-button=add]")!;
    button.hidden = i !== children.length - 1;
    button.onclick = () => {
      const parent = button.dataset.relTarget!;
      root.insertAdjacentHTML("beforeend", newRow(parent, children.length));
      wireMajorAdd(root, newRow);
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

type CodeLabel = readonly [code: string, label: string];
const policyOptions = (name: string): CodeLabel[] => {
  const field = seed.executionPolicy.browserPolicy.nativeForm.sections
    .flatMap((s) => s.fields as readonly { name: string; options?: object }[])
    .find((f) => f.name === name);
  if (!field?.options) throw new Error(`missing options ${name}`);
  return Object.entries(field.options as Record<string, string>).map(
    ([label, code]) => [code, label] as const,
  );
};
// Platform-wide public code tables (live-dom/step2-education-career.md).
const LOCATION = () => policyOptions("hplace.mrs2.highschool.locationCode");
const MAJOR_CATEGORY = () =>
  policyOptions("hplace.mrs2.college.major0.majorCategoryCode");
const HIGHSCHOOL_CATEGORY: readonly CodeLabel[] = [
  ["01", "인문"],
  ["02", "상업"],
  ["03", "공업"],
  ["04", "전산정보"],
  ["05", "예술"],
  ["06", "농업"],
  ["07", "과학"],
  ["08", "외국어"],
  ["09", "체육"],
  ["10", "마이스터"],
  ["11", "특성화"],
  ["12", "자율형 사립"],
  ["13", "자율형 공립"],
  ["99", "기타"],
];
const COLLEGE_CATEGORY: readonly CodeLabel[] = [
  ["01", "가정"],
  ["02", "간호"],
  ["03", "건축"],
  ["04", "공학"],
  ["05", "농림"],
  ["06", "사범"],
  ["07", "법정"],
  ["08", "사회"],
  ["09", "상경"],
  ["10", "신학"],
  ["11", "어문"],
  ["12", "예체"],
  ["13", "의학"],
  ["14", "인문"],
  ["15", "자연"],
  ["16", "부동산"],
  ["17", "축수산"],
  ["18", "보건"],
  ["99", "기타"],
];
const GRADUATION: readonly CodeLabel[] = [
  ["01", "졸업"],
  ["02", "졸업예정"],
  ["03", "수료"],
  ["04", "중퇴"],
  ["05", "휴학"],
  ["07", "재학"],
  ["08", "검정고시"],
];
const DAY_OR_NIGHT: readonly CodeLabel[] = [
  ["01", "주간"],
  ["02", "야간"],
];
const MAJOR_TYPE: readonly CodeLabel[] = [
  ["01", "주전공"],
  ["02", "복수전공"],
  ["03", "부전공"],
  ["04", "연계전공"],
  ["05", "융합전공"],
];
const radios = (name: string, codes: readonly CodeLabel[], attrs = "") =>
  `<div class="span radio">${codes.map(([code, label]) => `<label><input type="radio" name="${name}" value="${code}"${attrs}><span class="label">${label}</span></label>`).join("")}</div>`;
const select = (name: string, codes: readonly CodeLabel[], attrs = "") =>
  `<label class="span select"><select name="${name}"${attrs}><option value=""></option>${codes.map(([code, label]) => `<option value="${code}">${label}</option>`).join("")}</select></label>`;
const searchWidget = (
  prefix: string,
  kind: string,
  property: string,
  queryAttrs: string,
  hiddenAttrs: string,
  codeAttrs: string,
) =>
  `<div class="span"><div class="search"><label><input type="search" class="text" data-type="${kind}"${queryAttrs}></label><div class="searchResult"></div></div><input type="hidden" name="${prefix}.${property}ActivitySn"${hiddenAttrs}><input type="hidden" name="${prefix}.${property}Name"${hiddenAttrs}><span class="searchResultName"></span><input type="text" name="${prefix}.${property}Code" class="hidden"${codeAttrs}></div>`;

/** Section 140 (T:1066–1190): every control waits for a graduation click. */
export function highschoolSection(
  format: EducationDateFormat = "YM",
  { emptyRadio = false, dayOrNight = false }: HighschoolFixtureOptions = {},
) {
  const gate = ` data-rel-target="highschool" disabled`;
  return `<section class="writeResume" data-code="140"><div class="subject"><div class="span per100 radio" data-rel-id="highschool">${emptyRadio ? `<label><input type="radio" name="highschool.graduationTypeCode" value=""><span class="label">작성안함</span></label>` : ""}${GRADUATION.filter(
    ([code]) => code !== "03",
  )
    .map(
      ([code, label]) =>
        `<label><input type="radio" name="highschool.graduationTypeCode" value="${code}" required><span class="label">${label}</span></label>`,
    )
    .join(
      "",
    )}</div>${searchWidget("highschool", "highschool", "academy", gate, gate, `${gate} required`)}${select("highschool.locationCode", LOCATION(), gate)}${select("highschool.highschoolCategoryCode", HIGHSCHOOL_CATEGORY, gate)}${dayOrNight ? radios("highschool.dayOrNight", DAY_OR_NIGHT, gate) : ""}<label class="span date"><input type="text" name="highschool.entranceDate" data-dates="highschoolDate:${format}  highschool graduationCriteriaDate" class="text date start"${gate} required><input type="text" name="highschool.graduationDate" data-dates="highschoolDate:END" class="text date end"${gate} required></label></div></section>`;
}

/** Live-shaped major row (T:1503–1575). New rows render their details disabled. */
export const liveMajorRow = (parent: string, index: number, gated = true) => {
  const row = `${parent}.collegeMajor[${index}]`;
  const outer = ` data-rel-target="${parent}"${gated ? " disabled" : ""}`;
  const detail = ` data-rel-target="${row}" disabled`;
  return `<div class="row loop" data-loop="collegeMajor"><div class="wrapBtn"><button type="button" data-button="add"${outer}></button><button type="button" data-button="remove"${outer}></button></div><div class="span"><div class="search"><label><input type="search" class="text" data-type="major"${outer}></label><div class="searchResult"></div></div><input type="hidden" name="${row}.collegeMajorSn"><input type="hidden" name="${row}.majorName"><span class="searchResultName"></span><input type="text" name="${row}.majorCode" class="hidden"${outer} data-rel-id="${row}"></div>${radios(`${row}.majorTypeCode`, MAJOR_TYPE, detail)}${select(`${row}.majorCategoryCode`, MAJOR_CATEGORY(), `${detail} required data-rel-id="${row}.majorCategoryCode" data-rel-type="with" data-rel-value="125,126,127,128"`)}${radios(`${row}.dayOrNight`, DAY_OR_NIGHT, detail)}</div>`;
};

/** Live-shaped 141/142 row (T:1211–1440): a degree click opens the row. */
export const liveCollegeRow = (
  kind: string,
  index: number,
  majors = 1,
  format: EducationDateFormat = "YM",
  {
    collegeCategory = true,
    entranceType = true,
    majorScore = false,
  }: LiveRowShape = {},
) => {
  const parent = `${kind}[${index}]`;
  const gate = ` data-rel-target="${parent}" disabled`;
  const degrees: readonly CodeLabel[] =
    kind === "college"
      ? [
          ["40", "전문학사"],
          ["50", "학사"],
        ]
      : [
          ["62", "석사"],
          ["72", "박사"],
        ];
  return `<div class="wrapSubject" data-loop="${kind}" data-index="${index}"><input type="hidden" name="${parent}.academyActivitySn"><div class="span per100 radio" data-rel-id="${parent}">${degrees.map(([code, label]) => `<label><input type="radio" name="${parent}.degreeTypeCode" value="${code}" required><span class="label">${label}</span></label>`).join("")}</div><div class="span"><div class="search"><label><input type="search" class="text" data-type="college"${gate}></label><div class="searchResult"></div></div><input type="hidden" name="${parent}.academyName"><span class="searchResultName"></span><input type="text" name="${parent}.academyCode" class="hidden"${gate} required></div>${select(`${parent}.locationCode`, LOCATION(), gate)}${radios(
    `${parent}.headOrBranch`,
    [
      ["01", "본교"],
      ["02", "분교"],
    ],
    gate,
  )}<label class="span date"><input type="text" name="${parent}.entranceDate" data-dates="${parent}.date:${format} college graduationCriteriaDate" class="text date start"${gate} required><input type="text" name="${parent}.graduationDate" data-dates="${parent}.date:END" class="text date end"${gate} required></label>${
    entranceType
      ? radios(
          `${parent}.entranceTypeCode`,
          [
            ["01", "입학"],
            ["02", "편입"],
          ],
          gate,
        )
      : ""
  }${radios(`${parent}.graduationTypeCode`, GRADUATION, gate)}${collegeCategory ? select(`${parent}.collegeCategoryCode`, COLLEGE_CATEGORY, gate) : ""}<div class="subject"><div class="subject" data-wrap="major">${Array.from({ length: majors }, (_, j) => liveMajorRow(parent, j)).join("")}</div></div><div class="subject"><input type="number" name="${parent}.score" step="0.001" min="0" data-rel-id="${parent}.perfectScore"${gate}><select name="${parent}.perfectScore" data-rel-target="${parent}.perfectScore" disabled><option value="">만점기준</option>${["3.0", "3.5", "4.0", "4.3", "4.5", "5.0", "7.0", "20", "100"].map((v) => `<option value="${v}">${v}</option>`).join("")}</select></div>${majorScore ? liveMajorScore(parent, gate) : ""}</div>`;
};

/** Live 전공 평점 subject (abl college rows): credits, average and its scale. */
const liveMajorScore = (parent: string, gate: string) =>
  `<div class="subject"><input type="number" data-validlength="5" min="0" max="1000" data-limit="decimal(5,1)" name="${parent}.majorCredits"${gate} required><input type="number" min="0" max="1000" name="${parent}.majorAverageScore" data-rel-id="${parent}.majorPerfectScore" data-limit="decimal(6,3)" step="0.001"${gate} required><select name="${parent}.majorPerfectScore" data-rel-target="${parent}.majorPerfectScore" disabled required><option value="">만점기준</option>${["3.0", "3.5", "4.0", "4.3", "4.5", "5.0", "7.0", "20", "100"].map((v) => `<option value="${v}">${v}</option>`).join("")}</select></div>`;

/** Synthetic high-school entry for section 140 (not part of educationProfile). */
export function highschoolEntry(): Profile["education"][number] {
  return {
    id: "highschool-a",
    sectionId: "highSchool",
    values: {
      academicProcess: "고등학교",
      schoolName: "합성고등학교",
      attendanceType: "주간",
      completionStatus: "졸업",
      schoolRegion: "서울",
      startDate: "2016-03-01",
      endDate: "2019-02-01",
    },
  };
}
