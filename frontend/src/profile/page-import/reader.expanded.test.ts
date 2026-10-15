import { afterEach, beforeEach, expect, it } from "vitest";
import { readGreetingImport } from "./reader";
import {
  greetingImportFixture,
  universityRow,
} from "../../research/greeting-import-probe.test-fixtures";
import { usePolicyFixture } from "../../test/fixtures/execution-policy";

usePolicyFixture("greeting");
beforeEach(() => {
  document.body.innerHTML = greetingImportFixture();
});
afterEach(() => document.body.replaceChildren());
const field = (name: string, value: string) =>
  `<div data-scope="field" data-part="root"><label>검증</label><input name="${name}" value="${value}"></div>`;
it("reads careers and certifications independently with sparse source indices", () => {
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      `<div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item">${field("workHistory.workExperiences.7.companyName", "합성회사")}${field("workHistory.workExperiences.7.employmentType", "정규직")}${field("workHistory.workExperiences.7.department", "개발팀")}</div><div data-scope="accordion" data-part="item">${field("languagesCertificationsAndOtherActivity.certificatesLicenses.3.credentials", "합성자격")}${field("languagesCertificationsAndOtherActivity.certificatesLicenses.3.registrationNumber", "SYNTHETIC")}</div></div>`,
    );
  const result = readGreetingImport(document);
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "careers.career.employmentType",
      rowIndex: 7,
      value: "정규",
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "certifications.certificate.registrationNo",
      rowIndex: 3,
      value: "SYNTHETIC",
    }),
  );
});
it("isolates a duplicate school field and unknown custom controls without losing sibling dates or rows", () => {
  document
    .querySelector('[name="educationalBackground.universities.0.schoolName"]')!
    .insertAdjacentHTML(
      "afterend",
      field("educationalBackground.universities.0.schoolName", "중복"),
    );
  document
    .querySelector('[data-part="root"][data-scope="accordion"]')!
    .insertAdjacentHTML("beforeend", universityRow(9));
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      field("customQuestion.unknown", "PRIVATE UNKNOWN"),
    );
  const result = readGreetingImport(document);
  expect(result).toContainEqual(
    expect.objectContaining({
      source: "educationalBackground.universities.0.enrollmentPeriod.startDate",
      value: "2020-03",
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      source: "educationalBackground.universities.9.schoolName",
      value: "합성대학교B",
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      source: "customQuestion.unknown",
      status: "unsupported",
      reason: "no_profile_mapping",
    }),
  );
  expect(JSON.stringify(result)).not.toContain("PRIVATE UNKNOWN");
});
it("canonicalizes sensitive options and requests manual English name confirmation", () => {
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      field("basicInformation.englishName", "Synthetic Applicant") +
        field(
          "militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus",
          "비대상",
        ),
    );
  const result = readGreetingImport(document);
  expect(result).toContainEqual(
    expect.objectContaining({
      source: "basicInformation.englishName",
      status: "review",
      reviewKind: "englishName",
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "military.military.militaryStatus",
      value: "military-status:not-applicable",
      sensitive: true,
    }),
  );
});
it("continues after a live input getter fails without exposing its exception", () => {
  const input = document.querySelector<HTMLInputElement>(
    '[name="basicInformation.email"]',
  )!;
  Object.defineProperty(input, "value", {
    get() {
      throw new Error("PRIVATE ERROR");
    },
  });
  const result = readGreetingImport(document);
  expect(result).toContainEqual(
    expect.objectContaining({
      source: "basicInformation.email",
      status: "unsupported",
      reason: "read_failed",
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "contact.contact.phoneNumber",
      value: "01000000000",
    }),
  );
  expect(JSON.stringify(result)).not.toContain("PRIVATE ERROR");
});
it("maps additional graduate majors and their fields by classification", () => {
  const prefix = "educationalBackground.graduateSchools.0";
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      `<div data-scope="accordion" data-part="item">${field(prefix + ".schoolName", "합성대학원")}${field(prefix + ".majors.1", "합성복수전공")}<button name="${prefix}.majors.1.majorClassification">복수전공</button><button name="${prefix}.majors.1.majorField">공학계열</button>${field(prefix + ".majors.2", "합성부전공")}<button name="${prefix}.majors.2.majorClassification">부전공</button></div>`,
    );
  const result = readGreetingImport(document);
  for (const [key, value] of [
    ["additionalMajorName", "합성복수전공"],
    ["doubleMajorStatus", "있음"],
    ["additionalMajorField", "공학계열"],
    ["minorName", "합성부전공"],
    ["minorStatus", "있음"],
  ])
    expect(result).toContainEqual(
      expect.objectContaining({
        profileFieldKey: `education.graduateSchool.${key}`,
        value,
        rowIndex: 0,
      }),
    );
});
it("does not guess a graduate major without its classification", () => {
  const prefix = "educationalBackground.graduateSchools.0";
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      `<div data-scope="accordion" data-part="item">${field(prefix + ".schoolName", "합성대학원")}${field(prefix + ".majors.1", "합성추가전공")}</div>`,
    );
  expect(
    readGreetingImport(document).find(
      (candidate) => candidate.source === prefix + ".majors.1",
    ),
  ).toMatchObject({ status: "unsupported", reason: "no_profile_mapping" });
});
it("maps additional university majors by classification instead of their index", () => {
  const row = document
    .querySelector('[name="educationalBackground.universities.0.schoolName"]')!
    .closest('[data-part="item"]')!;
  row.insertAdjacentHTML(
    "beforeend",
    field("educationalBackground.universities.0.majors.3", "합성부전공") +
      '<button name="educationalBackground.universities.0.majors.3.majorClassification">부전공</button>',
  );
  const result = readGreetingImport(document);
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "education.university.minorName",
      value: "합성부전공",
      rowIndex: 0,
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "education.university.minorStatus",
      value: "있음",
      rowIndex: 0,
    }),
  );
});
it("reads named choice groups and dates while preserving the source DOM", () => {
  const form = document.querySelector("form")!;
  form.insertAdjacentHTML(
    "beforeend",
    '<div data-scope="field" data-part="root"><label>장애여부</label><div data-scope="toggle-group" data-part="root" role="radiogroup"><button data-scope="toggle-group" data-part="item" role="radio" aria-checked="true">비대상</button><button data-scope="toggle-group" data-part="item" role="radio" aria-checked="false">대상</button></div></div>',
  );
  const before = document.body.innerHTML;
  expect(readGreetingImport(document)).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "disability.disability.disabilityStatus",
      value: "disability-status:not-eligible",
    }),
  );
  expect(document.body.innerHTML).toBe(before);
});
it("keeps unnamed university choice groups readable when another control is duplicated", () => {
  const anchor = document.querySelector(
    '[name="educationalBackground.universities.0.schoolName"]',
  )!;
  const row = anchor.closest('[data-part="item"]')!;
  anchor.insertAdjacentHTML(
    "afterend",
    field("educationalBackground.universities.0.schoolName", "중복"),
  );
  row.insertAdjacentHTML(
    "beforeend",
    '<div data-scope="field" data-part="root"><label>주/야간 구분</label><div data-scope="toggle-group" data-part="root" role="radiogroup"><button role="radio" data-scope="toggle-group" data-part="item" aria-checked="true">주간</button><button role="radio" data-scope="toggle-group" data-part="item" aria-checked="false">야간</button></div></div>',
  );
  expect(readGreetingImport(document)).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "education.university.attendanceType",
      value: "attendance:day",
    }),
  );
});
it("reads observed LF salary paths without importing unrelated application details", () => {
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      field("applicationDetail.previousSalary", "4000") +
        field("applicationDetail.desiredSalary.salary", "4500") +
        field("applicationDetail.unknown", "PRIVATE"),
    );
  const results = readGreetingImport(document);
  expect(results).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "compensation.compensation.previousSalary",
      value: "4000",
      sensitive: false,
    }),
  );
  expect(results).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "compensation.compensation.desiredSalary",
      value: "4500",
      sensitive: false,
    }),
  );
  expect(JSON.stringify(results)).not.toContain("PRIVATE");
});
it("does not map unprefixed sensitive fields or empty select placeholders", () => {
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      field("militaryService.militaryServiceStatus", "군필") +
        '<select name="basicInformation.gender"><option value="">선택해 주세요</option></select>',
    );
  const result = readGreetingImport(document);
  expect(
    result.find(
      (item) => item.source === "militaryService.militaryServiceStatus",
    ),
  ).toMatchObject({ status: "unsupported", reason: "no_profile_mapping" });
  expect(
    result.find((item) => item.source === "basicInformation.gender"),
  ).toMatchObject({ status: "unsupported", reason: "empty" });
});
it("rejects conflicting grade and score destinations without losing the test name", () => {
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      '<div data-scope="accordion" data-part="item">' +
        field(
          "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.testName",
          "합성시험",
        ) +
        field(
          "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.grade",
          "A",
        ) +
        field(
          "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.score.score",
          "900",
        ) +
        "</div>",
    );
  const result = readGreetingImport(document);
  expect(
    result
      .filter((item) => item.profileFieldKey === "languages.languageTest.grade")
      .every(
        (item) =>
          item.status === "unsupported" &&
          item.reason === "ambiguous_destination" &&
          item.value === undefined,
      ),
  ).toBe(true);
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "languages.languageTest.testName",
      value: "합성시험",
    }),
  );
});
it("reports anonymous controls without reading their values", () => {
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      '<textarea>PRIVATE ANONYMOUS</textarea><input type="file">',
    );
  const result = readGreetingImport(document);
  expect(
    result.filter((item) => item.source.startsWith("unmapped-control:")),
  ).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain("PRIVATE ANONYMOUS");
});
it("treats inherited object property names as unknown fields", () => {
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      field("toString", "PRIVATE") + field("__proto__", "PRIVATE"),
    );
  const result = readGreetingImport(document);
  for (const source of ["toString", "__proto__"])
    expect(result.find((item) => item.source === source)).toMatchObject({
      status: "unsupported",
      reason: "no_profile_mapping",
    });
});
it.each([
  [
    "basicInformation.nationalityCode",
    "personal.personal.nationality",
    "대한민국",
    "대한민국",
    false,
  ],
  [
    "basicInformation.birthdate",
    "personal.personal.birthDate",
    "1998-01-02",
    "1998-01-02",
    false,
  ],
  [
    "personalInformation.currentAddress.postalCode",
    "contact.contact.postalCode",
    "12345",
    "12345",
    false,
  ],
  [
    "personalInformation.currentAddress.address",
    "contact.contact.addressLine1",
    "합성 기본주소",
    "합성 기본주소",
    false,
  ],
  [
    "personalInformation.currentAddress.detailedAddress",
    "contact.contact.addressLine2",
    "합성 상세주소",
    "합성 상세주소",
    false,
  ],
  [
    "educationalBackground.highSchool.schoolName",
    "education.highSchool.schoolName",
    "합성고교",
    "합성고교",
    true,
  ],
  [
    "educationalBackground.highSchool.schoolLocation",
    "education.highSchool.schoolRegion",
    "서울",
    "region:seoul",
    true,
  ],
  [
    "educationalBackground.highSchool.completionStatus",
    "education.highSchool.completionStatus",
    "졸업",
    "졸업",
    true,
  ],
  [
    "educationalBackground.highSchool.enrollmentPeriod.startDate",
    "education.highSchool.startDate",
    "2013-03-02",
    "2013-03-02",
    true,
  ],
  [
    "educationalBackground.universities.7.degreeLevel",
    "education.university.degreeLevel",
    "학사",
    "학사",
    true,
  ],
  [
    "educationalBackground.universities.7.gpa.scoreScale",
    "education.university.gpaScale",
    "4.5",
    "4.50",
    true,
  ],
  [
    "educationalBackground.universities.7.admissionType",
    "education.university.transferStatus",
    "편입",
    "해당",
    true,
  ],
  [
    "educationalBackground.universities.7.attendanceType",
    "education.university.attendanceType",
    "주간",
    "attendance:day",
    true,
  ],
  [
    "educationalBackground.universities.7.totalCreditsEarned",
    "education.university.totalCredits",
    "140",
    "140",
    true,
  ],
  [
    "educationalBackground.graduateSchools.7.schoolName",
    "education.graduateSchool.schoolName",
    "합성대학원",
    "합성대학원",
    true,
  ],
  [
    "educationalBackground.graduateSchools.7.degreeLevel",
    "education.graduateSchool.degreeLevel",
    "석사",
    "석사",
    true,
  ],
  [
    "educationalBackground.graduateSchools.7.majors.0.majorField",
    "education.graduateSchool.majorField",
    "공학계열",
    "공학계열",
    true,
  ],
  [
    "workHistory.workExperiences.7.positionRank",
    "careers.career.position",
    "연구원",
    "연구원",
    true,
  ],
  [
    "workHistory.workExperiences.7.reasonForResignation",
    "careers.career.terminationReason",
    "합성사유",
    "합성사유",
    true,
  ],
  [
    "workHistory.projects.7.projectName",
    "projects.project.projectName",
    "합성프로젝트",
    "합성프로젝트",
    true,
  ],
  [
    "workHistory.projects.7.roleParticipationRole",
    "projects.project.role",
    "개발자",
    "개발자",
    true,
  ],
  [
    "workHistory.projects.7.projectPeriod.endDate",
    "projects.project.endDate",
    "2025-01-02",
    "2025-01-02",
    true,
  ],
  [
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.7.foreignLanguage",
    "languages.languageTest.language",
    "영어",
    "영어",
    true,
  ],
  [
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.7.score.score",
    "languages.languageTest.grade",
    "900",
    "900",
    true,
  ],
  [
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.7.acquisitionDate",
    "languages.languageTest.acquisitionDate",
    "2025-02-03",
    "2025-02-03",
    true,
  ],
  [
    "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies.7.foreignLanguage",
    "languages.languageSkill.language",
    "영어",
    "영어",
    true,
  ],
  [
    "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies.7.conversationalProficiency",
    "languages.languageSkill.conversationalLevel",
    "일상 대화 가능",
    "일상 대화 가능",
    true,
  ],
  [
    "languagesCertificationsAndOtherActivity.certificatesLicenses.7.rating",
    "certifications.certificate.grade",
    "1급",
    "1급",
    true,
  ],
  [
    "languagesCertificationsAndOtherActivity.certificatesLicenses.7.issuingAgency",
    "certifications.certificate.issuer",
    "합성기관",
    "합성기관",
    true,
  ],
  [
    "militaryServicePreferentialEmploymentStatus.militaryService.branchOfService",
    "military.military.militaryBranch",
    "해병",
    "military-branch:marine-corps",
    false,
  ],
  [
    "militaryServicePreferentialEmploymentStatus.militaryService.rank",
    "military.military.militaryRank",
    "병장",
    "military-rank:byeongjang",
    false,
  ],
  [
    "militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceClassification",
    "military.military.militaryType",
    "현역병",
    "현역병",
    false,
  ],
  [
    "militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.startDate",
    "military.military.serviceStartDate",
    "2017-01-02",
    "2017-01-02",
    false,
  ],
  [
    "militaryServicePreferentialEmploymentStatus.veteran.veteranStatus",
    "veteran.veteran.veteranStatus",
    "비대상",
    "veteran-status:not-eligible",
    false,
  ],
  [
    "militaryServicePreferentialEmploymentStatus.veteranStatus.veteransRegistrationNumber",
    "veteran.veteran.veteranNumber",
    "SYNTHETIC",
    "SYNTHETIC",
    false,
  ],
  [
    "militaryServicePreferentialEmploymentStatus.disability.disabilityStatus",
    "disability.disability.disabilityStatus",
    "비대상",
    "disability-status:not-eligible",
    false,
  ],
  [
    "militaryServicePreferentialEmploymentStatus.disability.degreeOfDisability",
    "disability.disability.disabilityGrade",
    "경증(심하지 않은 장애)",
    "경증(심하지 않은 장애)",
    false,
  ],
] as const)(
  "imports the exact known source %s into %s",
  (source, key, value, want, repeated) => {
    const html = field(source, value);
    document
      .querySelector("form")!
      .insertAdjacentHTML(
        "beforeend",
        repeated
          ? `<div data-scope="accordion" data-part="item">${html}</div>`
          : html,
      );
    const candidate = readGreetingImport(document).find(
      (item) => item.source === source,
    );
    expect(candidate).toMatchObject({ profileFieldKey: key, value: want });
    expect(candidate?.status).not.toBe("unsupported");
  },
);
it("reads long text and unchecked employment state without triggering page events", () => {
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      '<div data-scope="accordion" data-part="item"><input type="checkbox" name="workHistory.workExperiences.7.employmentStatus"><textarea name="workHistory.workExperiences.7.dutiesResponsibility">합성 업무\n둘째 줄</textarea></div><div data-scope="accordion" data-part="item"><textarea name="workHistory.projects.7.projectDescription">합성 프로젝트 상세</textarea></div>',
    );
  const result = readGreetingImport(document);
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "careers.career.employmentStatus",
      value: "퇴사",
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "careers.career.responsibilities",
      value: "합성 업무\n둘째 줄",
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "projects.project.activityDetails",
      value: "합성 프로젝트 상세",
    }),
  );
});
it("does not turn prototype-valued text into executable option values", () => {
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      '<div data-scope="accordion" data-part="item">' +
        field(
          "educationalBackground.graduateSchools.7.gpa.scoreScale",
          "constructor",
        ) +
        "</div>",
    );
  expect(readGreetingImport(document)).toContainEqual(
    expect.objectContaining({
      source: "educationalBackground.graduateSchools.7.gpa.scoreScale",
      value: "constructor",
      status: "available",
    }),
  );
});
it("reports source identification failure without including exception text", () => {
  const input = document.createElement("textarea");
  document.querySelector("form")!.append(input);
  const original = input.getAttribute.bind(input);
  input.getAttribute = (name: string) => {
    if (name === "name") throw new Error("PRIVATE FAILURE");
    return original(name);
  };
  const result = readGreetingImport(document);
  expect(result).toContainEqual(
    expect.objectContaining({ status: "unsupported", reason: "read_failed" }),
  );
  expect(JSON.stringify(result)).not.toContain("PRIVATE FAILURE");
  expect(result).toContainEqual(
    expect.objectContaining({
      profileFieldKey: "contact.contact.email",
      value: "fixture@example.invalid",
    }),
  );
});

it.each([
  [
    "educationalBackground.graduateSchools.7.majors.0.majorClassification",
    '<button name="educationalBackground.graduateSchools.7.majors.0.majorClassification">주전공</button>',
  ],
  [
    "workHistory.workExperiences.7.employmentStatus",
    '<input type="checkbox" name="workHistory.workExperiences.7.employmentStatus">',
  ],
])(
  "excludes a default-only repeated row at %s without losing other rows",
  (source, control) => {
    document
      .querySelector("form")!
      .insertAdjacentHTML(
        "beforeend",
        `<div data-scope="accordion" data-part="item">${control}</div>`,
      );
    const result = readGreetingImport(document);
    expect(
      result.find((candidate) => candidate.source === source),
    ).toMatchObject({ status: "unsupported" });
    expect(
      result.find((candidate) => candidate.source === source),
    ).not.toHaveProperty("value");
    expect(result).toContainEqual(
      expect.objectContaining({
        source: "educationalBackground.universities.0.schoolName",
        status: "review",
      }),
    );
  },
);
it("keeps graduate dates when the school cannot be read and leaves the removed classification unmapped", () => {
  const prefix = "educationalBackground.graduateSchools.7";
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "beforeend",
      `<div data-scope="accordion" data-part="item">${field(prefix + ".schoolName", "합성학교")}<button name="${prefix}.majors.0.majorClassification">주전공</button>${field(prefix + ".enrollmentPeriod.startDate", "2020-03")}</div>`,
    );
  const school = document.querySelector(`[name="${prefix}.schoolName"]`)!;
  Object.defineProperty(school, "value", {
    get: () => {
      throw new Error("unreadable");
    },
  });
  const result = readGreetingImport(document);
  expect(result).toContainEqual(
    expect.objectContaining({
      source: prefix + ".schoolName",
      reason: "read_failed",
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      source: prefix + ".majors.0.majorClassification",
      status: "unsupported",
      reason: "no_profile_mapping",
    }),
  );
  expect(result).toContainEqual(
    expect.objectContaining({
      source: prefix + ".enrollmentPeriod.startDate",
      value: "2020-03",
      status: "review",
    }),
  );
});
