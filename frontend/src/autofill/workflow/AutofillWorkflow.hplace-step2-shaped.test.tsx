/**
 * CF-177 C7: step 2 (sections 140/141/142/16) live-shaped integration
 * regression. Locks in the 2026-10-20 live result on build 1759db5
 * (abl / careerhyundai / gsenc all pass step 2 with 0 mismatched, missing,
 * ambiguous or needs-review) on the C0 fixtures: the live start layout
 * (one college, one graduate school, one major each and one career row),
 * linkedForm gating, an exact-title site catalog that only reacts to a
 * page-world Enter, and the unmodified v4 seed policy.
 *
 * Tenants (live-eval snapshots-2026-10-19T07-37-11.917Z, structure only):
 * - YM (gsenc-type): education dates `:YM`, no high school day/night, no
 *   graduate admission type, nine employment labels.
 * - YMD (careerhyundai-type): education dates `:YMD`, high school day/night,
 *   graduate admission type, seven employment labels.
 * The profile mirrors the live synthetic profile's shape with synthetic
 * names: a bachelor and a graduate school with three majors each, an
 * associate degree with one major and a 3.650 GPA, standard attendance and
 * region values, one 퇴사 career with a termination reason and one 재직중
 * career without one. Assertions are on observable outcomes only (page values, result
 * panel, request and click counts), never on emulator internals.
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  mountEducation,
  type EducationDateFormat,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import {
  appendCareerSection,
  step2Profile,
} from "../policy/__fixtures__/hplace-mrs2-career.synthetic";
import { siteSeesEnter } from "../policy/__fixtures__/hplace-mrs2-search.synthetic";
import { disposeLinkedForms } from "../policy/__fixtures__/hplace-mrs2-linked-form";
import { installExecutionPolicy } from "./execution-policy";
import {
  catalogResponder,
  exactTitleCatalog,
  renderNativeWorkflow,
} from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";
import type { Profile } from "../../profile/model";

afterEach(() => {
  cleanup();
  disposeLinkedForms();
  resetHplacePage();
  installExecutionPolicy(document);
});

interface Tenant {
  name: string;
  format: EducationDateFormat;
  highschoolDayOrNight: boolean;
  graduateAdmission: boolean;
  labels: "nine" | "seven";
}
const TENANTS: readonly Tenant[] = [
  {
    name: "YM (gsenc-type)",
    format: "YM",
    highschoolDayOrNight: false,
    graduateAdmission: false,
    labels: "nine",
  },
  {
    name: "YMD (careerhyundai-type)",
    format: "YMD",
    highschoolDayOrNight: true,
    graduateAdmission: true,
    labels: "seven",
  },
];

/** step2Profile() reshaped like the live synthetic profile (values synthetic). */
function liveShapedProfile(): Profile {
  const profile = step2Profile();
  const [highschool, , , graduate] = profile.education;
  Object.assign(highschool.values, {
    attendanceType: "attendance:day",
    schoolRegion: "region:seoul",
    startDate: "2007-03-01",
    endDate: "2010-02-10",
  });
  const majors = (prefix: string) => ({
    majorField: "기타",
    doubleMajorStatus: "있음",
    additionalMajorName: `가상복수전공${prefix}`,
    additionalMajorField: "기타",
    minorStatus: "있음",
    minorName: `가상부전공${prefix}`,
    minorField: "기타",
  });
  profile.education[1] = {
    id: "college-a",
    sectionId: "university",
    values: {
      schoolType: "대학교",
      degreeLevel: "학사",
      schoolName: "합성대학 A",
      attendanceType: "attendance:day",
      startDate: "2014-03-01",
      endDate: "2018-02-20",
      completionStatus: "졸업",
      schoolRegion: "region:seoul",
      gpaScore: "3.875",
      gpaScale: "4.50",
      majorName: "가상주전공 A",
      transferStatus: "비해당",
      ...majors(" A"),
    },
  };
  profile.education[2] = {
    id: "college-b",
    sectionId: "university",
    values: {
      schoolType: "전문대학",
      degreeLevel: "전문학사",
      schoolName: "합성전문대학",
      attendanceType: "attendance:day",
      startDate: "2012-03-01",
      endDate: "2014-02-14",
      completionStatus: "졸업",
      schoolRegion: "region:incheon",
      gpaScore: "3.650",
      gpaScale: "4.50",
      majorField: "기타",
      majorName: "가상주전공 B",
      transferStatus: "비해당",
      doubleMajorStatus: "없음",
      minorStatus: "없음",
    },
  };
  graduate.values = {
    degreeLevel: "석사",
    schoolName: "합성대학원",
    attendanceType: "attendance:day",
    schoolRegion: "region:seoul",
    startDate: "2018-03-01",
    endDate: "2020-02-21",
    admissionType: "입학",
    completionStatus: "졸업",
    gpaScore: "4.125",
    gpaScale: "4.50",
    majorName: "가상연구전공",
    ...majors(" C"),
  };
  return profile;
}

function mountTenant(tenant: Tenant) {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountEducation(1, 1, false, {
    liveGating: true,
    dateInputFormat: tenant.format,
    highschool: { dayOrNight: tenant.highschoolDayOrNight },
  });
  if (!tenant.graduateAdmission)
    document
      .querySelector('[name="graduateSchool[0].entranceTypeCode"]')!
      .closest(".span")!
      .remove();
  appendCareerSection(1, { labels: tenant.labels });
  // The site keeps a GPA like 3.650 as 3.65 (live 2026-10-20).
  document.querySelector("#frm")!.addEventListener(
    "change",
    (event) => {
      const input = event.target;
      if (
        input instanceof HTMLInputElement &&
        input.type === "number" &&
        input.name.endsWith(".score") &&
        input.value !== ""
      )
        input.value = String(Number(input.value));
    },
    true,
  );
  return policy;
}

const control = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${name}"]`,
  );
/** What the applicant sees: option text, checked radio label or raw value. */
function shown(name: string): string {
  const radios = document.querySelectorAll<HTMLInputElement>(
    `input[type=radio][name="${name}"]`,
  );
  if (radios.length) {
    const checked = Array.from(radios).find((r) => r.checked);
    return checked?.closest("label")?.textContent?.trim() ?? "";
  }
  const element = control(name);
  if (!element) return "<absent>";
  if (element instanceof HTMLSelectElement)
    return element.value ? (element.selectedOptions[0]?.text ?? "") : "";
  return element.value;
}

function date(format: EducationDateFormat, iso: string) {
  const [y, m, d] = iso.split("-");
  return format === "YM" ? `${y}.${m}` : `${y}.${m}.${d}`;
}

function expectedValues(tenant: Tenant): Record<string, string> {
  const ed = (iso: string) => date(tenant.format, iso);
  const majors = (parent: string, rows: readonly string[][]) =>
    Object.fromEntries(
      rows.flatMap(([name, type, dayOrNight], j) => [
        [`${parent}.collegeMajor[${j}].majorName`, name],
        [`${parent}.collegeMajor[${j}].majorTypeCode`, type],
        [`${parent}.collegeMajor[${j}].majorCategoryCode`, "기타"],
        // Day/night is the main major's only (live: blocked main-major-only).
        [`${parent}.collegeMajor[${j}].dayOrNight`, dayOrNight],
      ]),
    );
  return {
    "highschool.graduationTypeCode": "졸업",
    "highschool.academyName": "합성고등학교",
    "highschool.locationCode": "서울",
    ...(tenant.highschoolDayOrNight ? { "highschool.dayOrNight": "주간" } : {}),
    "highschool.entranceDate": ed("2007-03-01"),
    "highschool.graduationDate": ed("2010-02-10"),

    "college[0].degreeTypeCode": "학사",
    "college[0].academyName": "합성대학 A",
    "college[0].locationCode": "서울",
    "college[0].entranceDate": ed("2014-03-01"),
    "college[0].graduationDate": ed("2018-02-20"),
    "college[0].entranceTypeCode": "입학",
    "college[0].graduationTypeCode": "졸업",
    "college[0].score": "3.875",
    "college[0].perfectScore": "4.5",
    ...majors("college[0]", [
      ["가상주전공 A", "주전공", "주간"],
      ["가상복수전공 A", "복수전공", ""],
      ["가상부전공 A", "부전공", ""],
    ]),

    "college[1].degreeTypeCode": "전문학사",
    "college[1].academyName": "합성전문대학",
    "college[1].locationCode": "인천",
    "college[1].entranceDate": ed("2012-03-01"),
    "college[1].graduationDate": ed("2014-02-14"),
    "college[1].entranceTypeCode": "입학",
    "college[1].graduationTypeCode": "졸업",
    "college[1].score": "3.65",
    "college[1].perfectScore": "4.5",
    ...majors("college[1]", [["가상주전공 B", "주전공", "주간"]]),

    "graduateSchool[0].degreeTypeCode": "석사",
    "graduateSchool[0].academyName": "합성대학원",
    "graduateSchool[0].locationCode": "서울",
    "graduateSchool[0].entranceDate": ed("2018-03-01"),
    "graduateSchool[0].graduationDate": ed("2020-02-21"),
    ...(tenant.graduateAdmission
      ? { "graduateSchool[0].entranceTypeCode": "입학" }
      : {}),
    "graduateSchool[0].graduationTypeCode": "졸업",
    "graduateSchool[0].score": "4.125",
    "graduateSchool[0].perfectScore": "4.5",
    ...majors("graduateSchool[0]", [
      ["가상연구전공", "주전공", "주간"],
      ["가상복수전공 C", "복수전공", ""],
      ["가상부전공 C", "부전공", ""],
    ]),

    "career[0].careerCriteriaCodeSn": "정규직",
    "career[0].company": "합성회사 A",
    "career[0].workingStatusCode": "퇴사",
    "career[0].entranceDate": "2019.03.01",
    "career[0].leavingDate": "2021.02.28",
    "career[0].department": "가상개발팀",
    "career[0].position": "가상직급 A",
    "career[0].assignedTask": "가상 담당업무 A",
    "career[0].retirementReason": "가상 퇴직사유",

    "career[1].careerCriteriaCodeSn": "계약직",
    "career[1].company": "합성회사 B",
    "career[1].workingStatusCode": "재직중",
    "career[1].entranceDate": "2021.04.01",
    // 재직중: the site keeps the leaving date closed and the profile has no
    // termination reason; both are skipped, not reported.
    "career[1].leavingDate": "",
    "career[1].department": "가상기획팀",
    "career[1].position": "가상직급 B",
    "career[1].assignedTask": "가상 담당업무 B",
    "career[1].retirementReason": "",
  };
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
  "fills step 2 like the live $name tenant with nothing left to review",
  async (tenant) => {
    const policy = mountTenant(tenant);
    const { counters } = renderNativeWorkflow({
      policy,
      profile: liveShapedProfile(),
      searchResponder: catalogResponder(exactTitleCatalog(), {
        accept: siteSeesEnter,
      }),
    });

    await screen.findByText("자동 기입을 마쳤어요", {}, { timeout: 150000 });

    expect.soft(pendingRows()).toEqual([]);

    const expected = expectedValues(tenant);
    expect
      .soft(Object.fromEntries(Object.keys(expected).map((n) => [n, shown(n)])))
      .toEqual(expected);
    // Committed searches leave a site code next to every name.
    for (const name of Object.keys(expected).filter((n) =>
      /(academy|major)Name$/.test(n),
    ))
      expect(
        control(name.replace(/Name$/, "Code"))?.value,
        `${name} code`,
      ).toMatch(/^9\d{5}$/);
    expect(control("career[1].leavingDate")?.disabled).toBe(true);

    // Rows like the live page: added once each, never duplicated.
    const rows = (selector: string) =>
      document.querySelectorAll(selector).length;
    expect
      .soft({
        college: rows('[data-loop="college"]'),
        graduateSchool: rows('[data-loop="graduateSchool"]'),
        college0Majors: rows(
          '[data-loop="college"][data-index="0"] [data-loop="collegeMajor"]',
        ),
        college1Majors: rows(
          '[data-loop="college"][data-index="1"] [data-loop="collegeMajor"]',
        ),
        graduateMajors: rows(
          '[data-loop="graduateSchool"] [data-loop="collegeMajor"]',
        ),
        career: rows('[data-loop="career"]'),
      })
      .toEqual({
        college: 2,
        graduateSchool: 1,
        college0Majors: 3,
        college1Majors: 1,
        graduateMajors: 3,
        career: 2,
      });

    expect(counters.forbidden).toBe(0);
    // Each site search runs once (1 high school + 3 schools + 7 majors).
    expect(counters.keypresses).toBe(11);
    // Native analysis budget (K17); live 2026-10-20 used 5 fields requests.
    expect(counters.requests).toBeLessThanOrEqual(8);
  },
  180000,
);

/** Every named control on the page as applicants see it (radios by value). */
function pageValues(): Record<string, string> {
  return Object.fromEntries(
    Array.from(
      document.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("#frm input[name],#frm select[name],#frm textarea[name]"),
      (e) =>
        e instanceof HTMLInputElement && e.type === "radio"
          ? [`${e.name}=${e.value}`, String(e.checked)]
          : [e.name, e.value],
    ),
  );
}
const loopCounts = () =>
  Object.fromEntries(
    ["college", "graduateSchool", "collegeMajor", "career"].map((loop) => [
      loop,
      document.querySelectorAll(`[data-loop="${loop}"]`).length,
    ]),
  );
const completedCount = () =>
  screen.getByRole("tab", { name: /^입력 완료 \d+개$/ }).textContent;

/** Counts value writes (input/change on named controls) from now on. */
function countWrites() {
  const seen: string[] = [];
  const record = (event: Event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    )
      if (target.name) seen.push(`${event.type}:${target.name}`);
  };
  const form = document.querySelector("#frm")!;
  for (const type of ["input", "change"])
    form.addEventListener(type, record, true);
  return seen;
}

/**
 * Runs step 2 to completion, lets the site rewrite the page (`siteEdits`),
 * unmounts the panel and runs the same profile again on the same page.
 */
async function runTwice(tenant: Tenant, siteEdits: () => void = () => {}) {
  const policy = mountTenant(tenant);
  const responder = catalogResponder(exactTitleCatalog(), {
    accept: siteSeesEnter,
  });
  const profile = liveShapedProfile();
  const first = renderNativeWorkflow({
    policy,
    profile,
    searchResponder: responder,
  });
  await screen.findByText("자동 기입을 마쳤어요", {}, { timeout: 150000 });
  cleanup();
  siteEdits();
  const rowsAfterFirst = loopCounts();
  const valuesAfterFirst = pageValues();
  const firstSnapshot = { ...first.counters };
  const writes = countWrites();
  const second = renderNativeWorkflow({
    policy,
    profile,
    searchResponder: responder,
  });
  await screen.findByText("자동 기입을 마쳤어요", {}, { timeout: 150000 });
  return {
    first,
    firstSnapshot,
    second,
    writes,
    rowsAfterFirst,
    valuesAfterFirst,
  };
}

it("does not add rows or write anything when step 2 runs again on the filled page", async () => {
  const run = await runTwice(TENANTS[1]);

  expect(loopCounts()).toEqual(run.rowsAfterFirst);
  expect(run.second.counters.adds).toBe(0);
  expect(run.second.counters.parentAdds).toBe(0);
  // The first run's listeners are still on #frm: they must not move either.
  expect(run.first.counters.adds).toBe(run.firstSnapshot.adds);
  expect(run.first.counters.parentAdds).toBe(run.firstSnapshot.parentAdds);
  expect(run.second.counters.keypresses).toBe(0);
  expect(run.writes).toEqual([]);
  expect(pageValues()).toEqual(run.valuesAfterFirst);
  // Everything is retained, nothing is reported as newly written, and a
  // retained date compares in the site's dotted format, never as "값이 달라요".
  expect(completedCount()).toContain("0");
  expect(pendingRows()).toEqual([]);
  expect(run.first.counters.forbidden).toBe(0);
  expect(run.second.counters.forbidden).toBe(0);
}, 330000);

const NORMALIZATIONS: ReadonlyArray<{
  name: string;
  edit: () => void;
  changed: Record<string, string>;
}> = [
  {
    name: "a career date the site reformats from 2019.03.01 to 2019-03-01",
    edit: () => {
      control("career[0].entranceDate")!.value = "2019-03-01";
    },
    changed: { "career[0].entranceDate": "2019-03-01" },
  },
  {
    name: "a school name the site suffixes after the committed search",
    edit: () => {
      const name = control("college[0].academyName")!;
      name.value = "합성대학 A (본교)";
      name
        .closest("div.span")!
        .querySelector("span.searchResultName > span")!.textContent =
        "합성대학 A (본교)";
    },
    changed: { "college[0].academyName": "합성대학 A (본교)" },
  },
];

it.each(NORMALIZATIONS)(
  "adds no duplicate row and keeps the site's value for $name",
  async ({ edit, changed }) => {
    const run = await runTwice(TENANTS[1], edit);

    expect(loopCounts()).toEqual(run.rowsAfterFirst);
    expect(run.second.counters.adds).toBe(0);
    expect(run.second.counters.parentAdds).toBe(0);
    expect(run.first.counters.adds).toBe(run.firstSnapshot.adds);
    expect(run.first.counters.parentAdds).toBe(run.firstSnapshot.parentAdds);
    expect(run.writes).toEqual([]);
    // The site's (or user's) value survives; every other value is unchanged.
    expect(pageValues()).toEqual(run.valuesAfterFirst);
    for (const [name, value] of Object.entries(changed))
      expect(control(name)!.value, name).toBe(value);
    expect(run.second.counters.forbidden).toBe(0);
  },
  330000,
);

/**
 * The site reloading the saved page: every value survives as markup while
 * each element (and the extension's per-element memory) is new, like a
 * second visit after 임시저장. Search inputs come back empty as on the live
 * page; the committed name stays in the hidden control and its label.
 */
function reloadPage() {
  const form = document.querySelector("#frm")!;
  for (const el of form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input,select,textarea")) {
    if (el instanceof HTMLSelectElement)
      for (const option of el.options)
        option.toggleAttribute("selected", option.selected);
    else if (el instanceof HTMLTextAreaElement) el.textContent = el.value;
    else if (el.type === "radio" || el.type === "checkbox")
      el.toggleAttribute("checked", el.checked);
    else el.setAttribute("value", el.type === "search" ? "" : el.value);
  }
  const host = form.parentElement!;
  host.innerHTML = host.innerHTML;
}

it("reports every value as kept when the saved page is reloaded and step 2 runs again", async () => {
  const run = await runTwice(TENANTS[1], reloadPage);

  expect(loopCounts()).toEqual(run.rowsAfterFirst);
  expect(run.second.counters.adds).toBe(0);
  expect(run.second.counters.parentAdds).toBe(0);
  expect(run.second.counters.keypresses).toBe(0);
  expect(run.writes).toEqual([]);
  expect(pageValues()).toEqual(run.valuesAfterFirst);
  expect(pendingRows()).toEqual([]);
  expect(completedCount()).toContain("0");
  expect(run.second.counters.forbidden).toBe(0);
}, 330000);

it("leaves only the section with a user-edited row to the user after a reload", async () => {
  const run = await runTwice(TENANTS[1], () => {
    reloadPage();
    control("career[0].retirementReason")!.value = "직접 고친 사유";
  });

  expect(loopCounts()).toEqual(run.rowsAfterFirst);
  expect(run.second.counters.adds).toBe(0);
  expect(run.writes).toEqual([]);
  expect(control("career[0].retirementReason")!.value).toBe("직접 고친 사유");
  const pending = pendingRows();
  expect(pending.length).toBeGreaterThan(0);
  expect(pending.filter((row) => !row.startsWith("직장경력:"))).toEqual([]);
  expect(run.second.counters.forbidden).toBe(0);
}, 330000);
