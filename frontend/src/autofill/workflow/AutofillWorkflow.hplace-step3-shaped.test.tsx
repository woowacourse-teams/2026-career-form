/**
 * CF-177 C7: step 3 (section 18) live-shaped integration regression. Locks in
 * the 2026-10-20 live result on build 1759db5 (abl / careerhyundai / gsenc
 * pass step 3 with 22/22/18 matched and 0 needs-review) with the unmodified
 * v4 seed policy, the linkedForm emulator and an exact-title catalog that only
 * reacts to a page-world Enter.
 *
 * The section-18 rows below are rebuilt from the public template
 * (T=gs-writeResumeTemplate.js foreignExam/foreignExamDetail T:3639–3773,
 * foreignAbility T:3789–3862, license T:3969–4041), the site's result click
 * (W=gs-writeResume.js addSearchResult W:1880–1972: a chosen exam re-renders
 * the row detail in "change" mode) and live-eval
 * snapshots-2026-10-19T07-37-11.917Z (names, types, disabled, data-rel-*,
 * data-dates and option counts only). No values are copied; tenant Sn codes
 * and exam/grade codes are virtual (900001~).
 *
 * Tenants: with foreign-language ability rows (abl/careerhyundai-type, 22
 * fields plus an unsupported award subject) and without (gsenc-type, 18).
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import { siteSeesEnter } from "../policy/__fixtures__/hplace-mrs2-search.synthetic";
import {
  disposeLinkedForms,
  installLinkedForm,
} from "../policy/__fixtures__/hplace-mrs2-linked-form";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import {
  catalogResponder,
  exactTitleCatalog,
  renderNativeWorkflow,
  type SearchCatalog,
  type SearchResponder,
} from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";
import { createEmptyProfile, type Profile } from "../../profile/model";

afterEach(() => {
  cleanup();
  disposeLinkedForms();
  resetHplacePage();
  installExecutionPolicy(document);
});

const BUTTONS =
  '<div class="wrapBtn"><button type="button" class="btn btn-icon btn-add" data-button="add"></button><button type="button" class="btn btn-icon btn-remove" data-button="remove"></button><button type="button" class="btn btn-icon btn-reset" data-button="reset"></button></div>';

/** Exam row as first rendered ("add" mode: no grade/score yet, T:3700–3725). */
const examRow = (i: number) => {
  const row = `languageExam[${i}]`;
  return `<div class="row in-span loop" data-loop="languageExam" data-index="${i}"><div class="span per20 btn"><label class="title">시험</label>${BUTTONS}</div><div class="span per80 middle-set"><div class="search"><label><input type="search" class="text" data-type="foreignExam" maxlength="20000"><span class="label">시험검색</span></label><div class="searchResult"></div></div><input type="hidden" name="${row}.languageExamName" maxlength="20000"><span class="searchResultName"></span><input type="text" name="${row}.languageExamCode" class="hidden" data-rel-id="${row}" data-rel-value="00030" data-rel-target="without" required><span class="devider ybmValidateDone hide"></span><span class="ybmScoreNotice hide"></span><div class="row in-span half-margin" data-template="detail"><input type="hidden" name="${row}.languageExamSn"></div></div></div>`;
};

/** Grade-type exam detail in "change" mode (T:3745–3773, no score). */
const gradeDetail = (i: number, grades: readonly string[]) => {
  const row = `languageExam[${i}]`;
  return `<label class="span per40"><input type="text" maxlength="64" class="text" name="${row}.registNumber" data-rel-target="${row}" required></label><label class="span per25"><input type="text" class="text date" data-dates="${row}.foreignExamDate:YMD foreignExamCriteriaDate" name="${row}.examDate" data-rel-target="${row}" required></label><label class="span per35 select"><select name="${row}.gradeCode" data-rel-target="${row}" required><option value="">등급선택</option>${grades.map((label, g) => `<option value="${910001 + g}">${label}</option>`).join("")}</select></label><input type="hidden" name="${row}.languageExamSn" value="">`;
};

const LANGUAGES = Object.entries(
  seed.executionPolicy.browserPolicy.nativeForm.sections
    .flatMap((s) => s.fields as readonly { name: string; options?: object }[])
    .find((f) => f.name === "hplace.mrs2.foreignAbility.languageCode")!
    .options as Record<string, string>,
);
const LEVELS = ["Authentic", "Advanced", "Intermediate", "Basic", "Beginner"];
const levelSelect = (row: string, name: string, placeholder: string) =>
  `<label class="span per20 select"><select name="${row}.${name}" data-rel-target="${row}" required disabled><option value="">${placeholder}</option>${LEVELS.map((label, l) => `<option value="${900101 + l}">${label}</option>`).join("")}</select></label>`;

/** Foreign-language ability row (T:3812–3858). */
const skillRow = (i: number) => {
  const row = `languageSkill[${i}]`;
  return `<div class="row in-span loop" data-loop="languageSkill"><div class="span per20 btn"><input type="hidden" name="${row}.languageSkillSn"><lable class="title">외국어</lable>${BUTTONS}</div><div class="span per80 middle-set"><div class="row in-span no-margin"><label class="span per40 select"><select name="${row}.languageCode" data-rel-id="${row}"><option value="">활용가능한 외국어를 선택하세요.</option>${LANGUAGES.map(([label, code]) => `<option value="${code}">${label}</option>`).join("")}</select></label>${levelSelect(row, "speakingLevelCodeSn", "회화수준")}${levelSelect(row, "writingLevelCodeSn", "작문수준")}${levelSelect(row, "readingLevelCodeSn", "독해수준")}</div></div></div>`;
};

/** License row (T:3995–4038); registration shown (privateinfo true). */
const licenseRow = (i: number) => {
  const row = `license[${i}]`;
  const gate = ` data-rel-target="${row}" disabled required`;
  return `<div class="row loop" data-loop="license"><div class="row in-span no-margin"><div class="span per20 btn"><input type="hidden" name="${row}.licenseActivitySn"><label class="title">자격증명</label>${BUTTONS}</div><div class="span per80 middle-set"><div class="search"><label><input type="search" class="text" data-type="license" maxlength="60"><span class="label">자격증검색</span></label><div class="searchResult"></div></div><input type="hidden" name="${row}.licenseName" maxlength="60"><span class="searchResultName"></span><input type="text" name="${row}.licenseCode" class="hidden" data-rel-id="${row}" required></div></div><div class="row in-span half-margin"><label class="span per20 title">발급기관</label><div class="span per35"><input type="text" maxlength="64" class="text" name="${row}.organization"${gate}></div><label data-privaterestore="${i}" data-privateremove="${i}.registNumber" class="span per20 title devider" style="display:block">등록번호</label><div data-privaterestore="${i}" data-privateremove="${i}.registNumber" class="span per25" style="display:block"><input type="text" maxlength="64" class="text" name="${row}.registNumber"${gate}></div></div><div class="row in-span half-margin"><label class="span per20 title">취득일</label><div class="span per20"><input type="text" data-dates="${row}.licenseDate:YMD" class="text date" name="${row}.acquireDate"${gate}></div></div></div>`;
};

/** An unsupported subject (no profile key), present on abl/careerhyundai. */
const AWARD =
  '<div class="subject" data-wrap="award" data-code="170" data-type="award"><div class="row loop" data-loop="award"><input type="text" maxlength="64" class="text" name="award[0].awardName"><input type="text" maxlength="64" class="text" name="award[0].organization"><input type="text" class="text date" data-dates="award[0].awardDate:YMD" name="award[0].awardDate"><button type="button" class="btn btn-icon btn-add" data-button="add"></button></div></div>';

const subject = (code: string, wrap: string, type: string, row: string) =>
  `<div class="subject" data-wrap="${wrap}" data-code="${code}" data-type="${type}">${row}</div>`;

interface Tenant {
  name: string;
  foreignAbility: boolean;
}
const TENANTS: readonly Tenant[] = [
  { name: "with ability rows (careerhyundai/abl-type)", foreignAbility: true },
  { name: "without ability rows (gsenc-type)", foreignAbility: false },
];

const BUILDERS: Record<string, (i: number) => string> = {
  languageExam: examRow,
  languageSkill: skillRow,
  license: licenseRow,
};

function mountStep3(tenant: Tenant): ExecutionPolicy {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  window.history.replaceState({}, "", "/mrs2/applicant/resume/writeResume");
  // Site stylesheet: an empty row's YBM marker is rendered with `.hide`.
  document.head.innerHTML = "<style>.hide{display:none}</style>";
  document.body.innerHTML =
    seed.executionPolicy.browserPolicy.nativeForm.assetPaths
      .map((src) => `<script src="${src}"></script>`)
      .join("") +
    `<form id="frm"><div id="wrapResume"><section class="writeResume" data-code="18">${subject("165", "foreignExam", "languageExam", examRow(0))}${tenant.foreignAbility ? subject("166", "foreignAbility", "languageSkill", skillRow(0)) : ""}${subject("168", "license", "license", licenseRow(0))}${tenant.foreignAbility ? AWARD : ""}</section><button type="submit">다음</button><button type="submit">임시저장</button></div></form>`;
  // The site appends a fresh row of the clicked row's kind (W:609 fn.add).
  for (const wrap of document.querySelectorAll<HTMLElement>(
    "section[data-code='18'] > .subject",
  ))
    wrap.addEventListener("click", (event) => {
      const button = (event.target as Element).closest("[data-button=add]");
      const build = BUILDERS[wrap.dataset.type ?? ""];
      if (!button || !build) return;
      const count = wrap.querySelectorAll(":scope > .loop").length;
      wrap.insertAdjacentHTML("beforeend", build(count));
    });
  installLinkedForm(document.querySelector("#frm")!);
  const policy = structuredClone(
    seed.executionPolicy,
  ) as unknown as ExecutionPolicy;
  installExecutionPolicy(document, policy);
  return policy;
}

const GRADES: Record<string, readonly string[]> = {
  "OPIc(영어)": [
    "Novice Low",
    "Novice Mid",
    "Novice High",
    "Intermediate Low",
    "Intermediate Mid 1",
    "Intermediate Mid 2",
    "Intermediate Mid 3",
    "Intermediate High",
    "Advanced Low",
  ],
  HSK: ["1급", "2급", "3급", "4급", "5급", "6급"],
};

/** Exact titles; exams are grade-type and non-YBM, licenses show registration. */
const RESULT_DATA: Readonly<Record<string, Readonly<Record<string, string>>>> =
  {
    foreignExam: {
      gradeflag: "true",
      scoreflag: "false",
      setupcode: "",
      setupvalue: "",
      perfactgrade: "",
    },
    license: { usescore: "false", privateinfo: "true" },
  };
function step3Catalog(): SearchCatalog {
  const exact = exactTitleCatalog();
  return (query, kind) =>
    exact(query, kind)?.map((result) => ({
      ...result,
      data: RESULT_DATA[kind],
    }));
}

/** Site search plus the exam detail re-render on a chosen exam (W:1955–1968). */
function step3Responder(): SearchResponder {
  const respond = catalogResponder(step3Catalog(), { accept: siteSeesEnter });
  return (query, event) => {
    respond(query, event);
    if (query.dataset.type !== "foreignExam") return;
    const row = query.closest<HTMLElement>("[data-loop=languageExam]")!;
    for (const button of row.querySelectorAll<HTMLButtonElement>(
      ".searchResultList button[data-code]",
    ))
      button.addEventListener("click", () => {
        row.querySelector("[data-template=detail]")!.innerHTML = gradeDetail(
          Number(row.dataset.index),
          GRADES[button.title] ?? [],
        );
      });
  };
}

function step3Profile(): Profile {
  const profile = createEmptyProfile();
  profile.languages = [
    {
      id: "exam-opic",
      sectionId: "languageTest",
      values: {
        language: "영어",
        testName: "OPIc(영어)",
        registrationNo: "SYN-EXAM-0001",
        acquisitionDate: "2025-11-15",
        grade: "IH",
      },
    },
    {
      id: "exam-hsk",
      sectionId: "languageTest",
      values: {
        language: "중국어",
        testName: "HSK",
        registrationNo: "SYN-EXAM-0002",
        acquisitionDate: "2025-12-07",
        grade: "5급",
      },
    },
    {
      id: "skill-english",
      sectionId: "languageSkill",
      values: { language: "영어", conversationalLevel: "Advanced" },
    },
    {
      id: "skill-japanese",
      sectionId: "languageSkill",
      values: { language: "일본어", conversationalLevel: "Intermediate" },
    },
  ];
  profile.certifications = ["A", "B", "C"].map((suffix, i) => ({
    id: `license-${suffix}`,
    sectionId: "certificate",
    values: {
      name: `가상자격증 ${suffix}`,
      issuer: `가상발급기관 ${suffix}`,
      registrationNo: `SYN-LIC-000${i + 1}`,
      acquisitionDate: ["2020-06-26", "2021-05-21", "2022-08-19"][i],
    },
  }));
  return profile;
}

function expectedValues(tenant: Tenant): Record<string, string> {
  return {
    "languageExam[0].languageExamName": "OPIc(영어)",
    "languageExam[0].registNumber": "SYN-EXAM-0001",
    // The profile records "IH"; this tenant lists only the full ACTFL label.
    "languageExam[0].gradeCode": "Intermediate High",
    "languageExam[0].examDate": "",
    "languageExam[1].languageExamName": "HSK",
    "languageExam[1].registNumber": "SYN-EXAM-0002",
    "languageExam[1].gradeCode": "5급",
    "languageExam[1].examDate": "",
    ...(tenant.foreignAbility
      ? {
          "languageSkill[0].languageCode": "영어",
          "languageSkill[0].speakingLevelCodeSn": "Advanced",
          "languageSkill[0].writingLevelCodeSn": "",
          "languageSkill[0].readingLevelCodeSn": "",
          "languageSkill[1].languageCode": "일본어",
          "languageSkill[1].speakingLevelCodeSn": "Intermediate",
          "languageSkill[1].writingLevelCodeSn": "",
          "languageSkill[1].readingLevelCodeSn": "",
          "award[0].awardName": "",
        }
      : {}),
    ...Object.fromEntries(
      ["A", "B", "C"].flatMap((suffix, i) => [
        [`license[${i}].licenseName`, `가상자격증 ${suffix}`],
        [`license[${i}].organization`, `가상발급기관 ${suffix}`],
        [`license[${i}].registNumber`, `SYN-LIC-000${i + 1}`],
        [
          `license[${i}].acquireDate`,
          ["2020.06.26", "2021.05.21", "2022.08.19"][i],
        ],
      ]),
    ),
  };
}

/** What the applicant sees: option text or raw value. */
function shown(name: string): string {
  const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${name}"]`,
  );
  if (!element) return "<absent>";
  if (element instanceof HTMLSelectElement)
    return element.value ? (element.selectedOptions[0]?.text ?? "") : "";
  return element.value;
}

/** Needs-review rows as text (category: row), for a readable failure. */
function pendingRows(): string[] {
  const tab = screen.getByRole("tab", { name: /^확인 필요 \d+개$/ });
  if (tab.getAttribute("aria-label") === "확인 필요 0개") return [];
  fireEvent.click(tab);
  const list = within(screen.getByRole("tabpanel")).getByRole("region", {
    name: "확인 필요한 항목",
  });
  return Array.from(list.querySelectorAll("section[aria-label]")).flatMap(
    (group) =>
      Array.from(
        group.querySelectorAll("article"),
        (row) =>
          `${group.getAttribute("aria-label")}: ${row.textContent!.replace(/\s+/g, " ").trim()}`,
      ),
  );
}

it.each(TENANTS)(
  "fills step 3 like the live tenant $name with nothing left to review",
  async (tenant) => {
    const policy = mountStep3(tenant);
    const { counters } = renderNativeWorkflow({
      policy,
      profile: step3Profile(),
      searchResponder: step3Responder(),
    });

    await screen.findByText("자동 기입을 마쳤어요", {}, { timeout: 150000 });

    expect.soft(pendingRows()).toEqual([]);
    const expected = expectedValues(tenant);
    expect
      .soft(Object.fromEntries(Object.keys(expected).map((n) => [n, shown(n)])))
      .toEqual(expected);
    for (const name of Object.keys(expected).filter((n) =>
      /(licenseName|languageExamName)$/.test(n),
    ))
      expect(shown(name.replace(/Name$/, "Code")), `${name} code`).toMatch(
        /^9\d{5}$/,
      );

    const rows = (loop: string) =>
      document.querySelectorAll(`[data-loop="${loop}"]`).length;
    expect
      .soft({
        languageExam: rows("languageExam"),
        languageSkill: rows("languageSkill"),
        license: rows("license"),
      })
      .toEqual({
        languageExam: 2,
        languageSkill: tenant.foreignAbility ? 2 : 0,
        license: 3,
      });

    expect(counters.forbidden).toBe(0);
    // Each site search runs once (2 exams + 3 licenses).
    expect(counters.keypresses).toBe(5);
    // Native analysis budget (K17); live 2026-10-20 used 2 fields requests.
    expect(counters.requests).toBeLessThanOrEqual(8);
  },
  180000,
);
