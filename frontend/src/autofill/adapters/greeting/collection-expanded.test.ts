import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../../profile/model";
import {
  greetingCollectionAdapter,
  greetingFieldElements,
  greetingMajorRowsForAction,
} from "./collection";
import { graduateMajorProfileCount } from "./workflow-major-count";

afterEach(() => document.body.replaceChildren());
it("counts a university's complete major rows and rejects a missing classification", () => {
  const prefix = "educationalBackground.universities.0";
  document.body.innerHTML = `<div data-scope="accordion" data-part="item">
    <input name="${prefix}.schoolName">
    <div data-scope="field" data-part="root"><label>전공*</label>
      ${[0, 1, 2].map((index) => `<button name="${prefix}.majors.${index}.majorClassification">주전공</button><button name="${prefix}.majors.${index}.majorField">공학계열</button><input name="${prefix}.majors.${index}" role="combobox">`).join("")}
      <button data-scope="tooltip" data-part="trigger">전공 추가</button>
    </div>
  </div>`;
  const add = document.querySelector<HTMLButtonElement>(
    '[data-scope="tooltip"]',
  )!;
  expect(greetingCollectionAdapter.actionDomId(add)).toBe(
    "greeting:add:universities:0:majors",
  );
  expect(greetingMajorRowsForAction(add)).toHaveLength(3);
  document
    .querySelector(`[name="${prefix}.majors.1.majorClassification"]`)!
    .remove();
  expect(greetingCollectionAdapter.actionDomId(add)).toBeUndefined();
});
it.each([
  [{}, 1],
  [{ doubleMajorStatus: "있음", additionalMajorName: "컴퓨터공학" }, 2],
  [{ minorStatus: "있음", minorName: "수학" }, 2],
  [
    {
      doubleMajorStatus: "있음",
      additionalMajorName: "컴퓨터공학",
      minorStatus: "있음",
      minorName: "수학",
    },
    3,
  ],
  [{ doubleMajorStatus: "있음" }, null],
  [{ minorStatus: "있음", minorName: " " }, null],
  [
    {
      additionalMajorName: "미선택 값",
      minorStatus: "없음",
      minorName: "숨겨진 값",
    },
    null,
  ],
])(
  "prepares only explicitly enabled complete university majors: %j",
  (values, expected) => {
    const profile = createEmptyProfile();
    profile.education = [{ id: "u", sectionId: "university", values }];
    expect(
      graduateMajorProfileCount("greeting:add:universities:0:majors", profile),
    ).toBe(expected);
    expect(
      graduateMajorProfileCount("greeting:add:universities:1:majors", profile),
    ).toBeNull();
  },
);

it.each([
  [
    "직장경력",
    "workHistory.workExperiences",
    "companyName",
    "careerscareer",
    "workExperiences",
    "employmentType",
  ],
  [
    "공인외국어시험",
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests",
    "testName",
    "languageslanguagetest",
    "certifiedLanguageTests",
    "foreignLanguage",
  ],
  [
    "외국어활용능력",
    "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies",
    "foreignLanguage",
    "languageslanguageskill",
    "foreignLanguageProficiencies",
    "conversationalProficiency",
  ],
  [
    "자격증 / 면허증",
    "languagesCertificationsAndOtherActivity.certificatesLicenses",
    "credentials",
    "certificationscertificate",
    "certificatesLicenses",
    "acquisitionDate",
  ],
  [
    "프로젝트",
    "workHistory.projects",
    "projectName",
    "projectsproject",
    "projects",
    "projectPeriod.startDate",
  ],
])(
  "collects bounded %s rows, buttons and add counts; rejects duplicate identities",
  (label, prefix, anchor, group, action, button) => {
    const row = (index: number) =>
      `<div data-scope="accordion" data-part="item"><input name="${prefix}.${index}.${anchor}"><button name="${prefix}.${index}.${button}">선택</button></div>`;
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>${label}</label><div data-scope="accordion" data-part="root">${row(0)}${row(1)}</div><button data-scope="tooltip" data-part="trigger">항목 추가</button></div>`;
    const container = document.body.firstElementChild!;
    const add = container.lastElementChild as HTMLElement;
    const rows = greetingCollectionAdapter.repeatableItemCandidates(container);
    expect(
      rows?.map((element) => greetingCollectionAdapter.itemGroupId?.(element)),
    ).toEqual([group, group]);
    expect(greetingCollectionAdapter.actionDomId(add)).toBe(
      `greeting:add:${action}`,
    );
    expect(
      greetingFieldElements(document).map((element) =>
        element.getAttribute("name"),
      ),
    ).toEqual([`${prefix}.0.${button}`, `${prefix}.1.${button}`]);
    container
      .querySelector('[data-scope="accordion"]')!
      .insertAdjacentHTML("beforeend", row(1));
    expect(
      greetingCollectionAdapter.repeatableItemCandidates(container),
    ).toEqual([]);
  },
);

it("collects military and veteran detail selects only under their exact owned labels", () => {
  const prefix = "militaryServicePreferentialEmploymentStatus.";
  const fields = [
    ["militaryService.militaryServiceClassification", "병역구분"],
    ["militaryService.dischargeType", "제대구분"],
    ["veteranStatus.veteranRelationship", "보훈관계"],
  ];
  document.body.innerHTML = fields
    .map(
      ([name, label]) =>
        `<div data-scope="field" data-part="root"><label>${label}*</label><button name="${prefix}${name}">선택</button></div>`,
    )
    .join("");
  expect(
    greetingFieldElements(document).map((element) =>
      element.getAttribute("name"),
    ),
  ).toEqual(fields.map(([name]) => `${prefix}${name}`));
  document.querySelectorAll("label").forEach((label) => {
    label.textContent = "보훈비율";
  });
  expect(greetingFieldElements(document)).toEqual([]);
});
it.each(["universities", "graduateSchools"])(
  "collects the %s school location select inside its own row",
  (group) => {
    const prefix = `educationalBackground.${group}.0`;
    document.body.innerHTML = `<div data-scope="accordion" data-part="item"><input name="${prefix}.schoolName"><button name="${prefix}.schoolLocation">선택</button></div>`;
    expect(
      greetingFieldElements(document).map((element) =>
        element.getAttribute("name"),
      ),
    ).toEqual([`${prefix}.schoolLocation`]);
  },
);
it("collects gender only under a unique owned gender label", () => {
  document.body.innerHTML =
    '<div data-scope="field" data-part="root"><label>성별*</label><button name="basicInformation.gender">선택</button></div>';
  expect(greetingFieldElements(document)).toHaveLength(1);
  document.querySelector("label")!.textContent = "이름";
  expect(greetingFieldElements(document)).toHaveLength(0);
});

it("treats the unindexed high school as one bounded item and rejects duplicate singletons", () => {
  const row =
    '<div data-scope="accordion" data-part="item"><input name="educationalBackground.highSchool.schoolName"><button name="educationalBackground.highSchool.completionStatus">선택</button></div>';
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>고등학교*</label><div data-scope="accordion" data-part="root">${row}</div></div>`;
  const container = document.body.firstElementChild!;
  expect(
    greetingCollectionAdapter
      .repeatableItemCandidates(container)
      ?.map((element) => greetingCollectionAdapter.itemGroupId?.(element)),
  ).toEqual(["educationhighschool"]);
  expect(
    greetingFieldElements(document).map((element) =>
      element.getAttribute("name"),
    ),
  ).toEqual(["educationalBackground.highSchool.completionStatus"]);
  container
    .querySelector('[data-scope="accordion"]')!
    .insertAdjacentHTML("beforeend", row);
  expect(greetingCollectionAdapter.repeatableItemCandidates(container)).toEqual(
    [],
  );
});

it("does not expose an add action when existing rows have duplicate or gapped indices", () => {
  const row = (index: number) =>
    `<div data-scope="accordion" data-part="item"><input name="workHistory.workExperiences.${index}.companyName"></div>`;
  for (const indices of [
    [0, 0],
    [0, 2],
  ]) {
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>직장경력</label>${indices.map(row).join("")}<button data-scope="tooltip" data-part="trigger">항목 추가</button></div>`;
    expect(
      greetingCollectionAdapter.actionDomId(document.querySelector("button")!),
    ).toBeUndefined();
  }
});

it("does not assign education-only unlabeled radio names inside a career row", () => {
  document.body.innerHTML = `<div data-scope="accordion" data-part="item"><input name="workHistory.workExperiences.0.companyName"><div data-scope="field" data-part="root"><label>입학구분</label><div data-scope="toggle-group" data-part="root" role="radiogroup"><button data-scope="toggle-group" data-part="item" role="radio">입학</button><button data-scope="toggle-group" data-part="item" role="radio">편입</button></div></div></div>`;
  expect(greetingFieldElements(document)).toEqual([]);
});
