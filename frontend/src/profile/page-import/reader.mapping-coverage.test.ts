import { afterEach, expect, it } from "vitest";
import { readGreetingImport } from "./reader";
import {
  createEmptyProfile,
  type RepeatedProfileCategoryId,
  type SingleProfileCategoryId,
} from "../model";
import { mergeImportSelection } from "./merge";
import { usePolicyFixture } from "../../test/fixtures/execution-policy";

usePolicyFixture("greeting");

// Independent cases from GreetingCompanyFormPolicyFactory: source suffix,
// destination, source value, expected stored value. A removed/misdirected
// mapping or a normalized value rejected at merge must fail these cases.
const groups = [
  [
    "basicInformation",
    "",
    `phoneNumber.nationalNumber|contact.contact.phoneNumber|010-0000-0000|01000000000
email|contact.contact.email|mapping@example.invalid
nationalityCode|personal.personal.nationality|대한민국
birthdate|personal.personal.birthDate|1998-01-02
gender|personal.personal.gender|남성`,
  ],
  [
    "personalInformation.currentAddress",
    "",
    `postalCode|contact.contact.postalCode|12345
address|contact.contact.addressLine1|합성 기본주소
detailedAddress|contact.contact.addressLine2|합성 상세주소`,
  ],
  [
    "militaryServicePreferentialEmploymentStatus",
    "",
    `militaryService.militaryServiceStatus|military.military.militaryStatus|군필|military-status:served
militaryService.branchOfService|military.military.militaryBranch|해병|military-branch:marine-corps
militaryService.rank|military.military.militaryRank|병장|military-rank:byeongjang
militaryService.servicePeriod.startDate|military.military.serviceStartDate|2017-01-02
militaryService.servicePeriod.endDate|military.military.serviceEndDate|2019-01-02
militaryService.militaryOccupationalSpecialty|military.military.militarySpecialty|합성병과
militaryService.militaryServiceClassification|military.military.militaryType|현역병
militaryService.dischargeType|military.military.dischargeType|만기제대
disability.disabilityStatus|disability.disability.disabilityStatus|대상|disability-status:eligible
disability.degreeOfDisability|disability.disability.disabilityGrade|경증(심하지 않은 장애)
disability.descriptionOfDisability|disability.disability.disabilityType|지체장애
disability.disabilityRegistrationNumber|disability.disability.disabilityRegistrationNumber|SYNTHETIC-D
veteran.veteranStatus|veteran.veteran.veteranStatus|대상|veteran-status:eligible
veteranStatus.veteransRegistrationNumber|veteran.veteran.veteranNumber|SYNTHETIC-V
veteranStatus.veteranRelationship|veteran.veteran.veteranRelation|본인`,
  ],
  [
    "educationalBackground.highSchool",
    "education.highSchool",
    `schoolName|schoolName|합성고교
completionStatus|completionStatus|졸업
enrollmentPeriod.startDate|startDate|2013-03-02
enrollmentPeriod.endDate|endDate|2016-02-02`,
  ],
  [
    "workHistory.workExperiences.7",
    "careers.career",
    `employmentType|employmentType|정규직|정규
companyName|companyName|합성회사
employmentPeriod.startDate|startDate|2020-03-02
employmentPeriod.endDate|endDate|2025-02-02
employmentStatus|employmentStatus|퇴사
department|department|개발팀
positionRank|position|연구원
dutiesResponsibility|responsibilities|합성 업무
reasonForResignation|terminationReason|합성 사유`,
  ],
  [
    "workHistory.projects.7",
    "projects.project",
    `projectName|projectName|합성프로젝트
roleParticipationRole|role|개발자
projectPeriod.startDate|startDate|2020-03-02
projectPeriod.endDate|endDate|2025-02-02
projectDescription|activityDetails|합성 상세`,
  ],
  [
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.7",
    "languages.languageTest",
    `foreignLanguage|language|영어
testName|testName|합성시험
acquisitionDate|acquisitionDate|2025-02-02
grade|grade|A
score.score|grade|900
registrationNumber|registrationNo|SYNTHETIC-T`,
  ],
  [
    "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies.7",
    "languages.languageSkill",
    `foreignLanguage|language|영어
conversationalProficiency|conversationalLevel|일상 대화 가능`,
  ],
  [
    "languagesCertificationsAndOtherActivity.certificatesLicenses.7",
    "certifications.certificate",
    `credentials|name|합성자격
issuingAgency|issuer|합성기관
acquisitionDate|acquisitionDate|2025-02-02
rating|grade|1급
registrationNumber|registrationNo|SYNTHETIC-C`,
  ],
] as const;
const educationCommon = `schoolName|schoolName|합성학교
enrollmentPeriod.startDate|startDate|2020-03-02
enrollmentPeriod.endDate|endDate|2025-02-02
completionStatus|completionStatus|졸업
attendanceType|attendanceType|주간|attendance:day
gpa.score|gpaScore|4.1
schoolLocation|schoolRegion|서울|region:seoul
gpa.scoreScale|gpaScale|4.5|4.50
majors.0|majorName|합성전공`;
const educationGroups = [
  [
    "educationalBackground.universities.7",
    "education.university",
    educationCommon +
      `\ndegreeLevel|degreeLevel|학사
totalCreditsEarned|totalCredits|140
admissionType|transferStatus|편입|해당
majors.0.majorField|majorField|공학계열`,
  ],
  [
    "educationalBackground.graduateSchools.7",
    "education.graduateSchool",
    educationCommon +
      `\ndegreeLevel|degreeLevel|석사
admissionType|admissionType|입학
majors.0.majorField|majorField|공학계열
countryCode|country|대한민국
researchField|researchField|합성연구분야`,
  ],
] as const;
const cases = [...groups, ...educationGroups].flatMap(
  ([prefix, section, rows]) =>
    rows.split("\n").map((line) => {
      const [suffix, field, value, normalized = value] = line.split("|");
      return {
        source: `${prefix}.${suffix}`,
        key: section ? `${section}.${field}` : field,
        value,
        normalized,
        section,
        prefix,
      };
    }),
);
function control(source: string, value: string) {
  const input = document.createElement("input");
  input.name = source;
  input.setAttribute("value", value);
  return `<div data-scope="field" data-part="root"><label>검증</label>${input.outerHTML}</div>`;
}
function mount(html: string) {
  document.body.innerHTML = `<form>${control("basicInformation.name", "")}${control("basicInformation.phoneNumber.nationalNumber", "")}${html}</form>`;
}
afterEach(() => document.body.replaceChildren());
it.each(cases)(
  "reads and merges mapping $source into $key",
  ({ source, key, value, normalized, section, prefix }) => {
    mount(
      section
        ? `<div data-scope="accordion" data-part="item">${control(source, value)}${control(prefix + ".schoolName", "보존학교")}</div>`
        : control(source, value),
    );
    // The fingerprint and repeated identity anchors must not duplicate the field under test.
    if (
      [
        "basicInformation.phoneNumber.nationalNumber",
        prefix + ".schoolName",
      ].includes(source)
    )
      document
        .querySelectorAll(`[name="${source}"]`)
        [section ? 1 : 0]?.remove();
    const candidate = readGreetingImport(document).find(
      (item) => item.source === source,
    );
    expect(candidate).toMatchObject({
      profileFieldKey: key,
      value: normalized,
    });
    expect(candidate?.status).not.toBe("unsupported");
    const [category, sectionId, field] = key.split(".");
    const profile = createEmptyProfile();
    if (section) {
      const categoryId = category as RepeatedProfileCategoryId;
      profile[categoryId] = [
        {
          id: "existing",
          sectionId,
          values: {
            schoolName: "보존학교",
            companyName: "보존회사",
            majorName: "보존전공",
            doubleMajorStatus: "있음",
            minorStatus: "있음",
          },
        },
      ];
      const result = mergeImportSelection(profile, {
        entries: [
          {
            categoryId,
            sectionId,
            sourceRow: 7,
            targetId: "existing",
            values: { [field]: candidate!.value! },
          },
        ],
      });
      expect(result[categoryId][0].values[field]).toBe(normalized);
      expect(profile[categoryId][0].values[field]).not.toBe(normalized);
    } else {
      const categoryId = category as SingleProfileCategoryId;
      profile.military = { militaryStatus: "military-status:served" };
      profile.veteran = { veteranStatus: "veteran-status:eligible" };
      profile.disability = { disabilityStatus: "disability-status:eligible" };
      const result = mergeImportSelection(profile, {
        single: { [categoryId]: { [field]: candidate!.value! } },
      });
      expect(result[categoryId][field]).toBe(normalized);
    }
  },
);
it.each([
  ["basicInformation.name", "합성지원자", undefined],
  ["basicInformation.englishName", "Synthetic Applicant", "englishName"],
])(
  "requires explicit review for derived full name %s",
  (source, value, reviewKind) => {
    mount(control(source, value));
    if (source === "basicInformation.name")
      document.querySelector(`[name="${source}"]`)!.remove();
    expect(
      readGreetingImport(document).find((item) => item.source === source),
    ).toMatchObject({
      status: "review",
      value,
      ...(reviewKind ? { reviewKind } : {}),
    });
  },
);
it.each([
  [1, "복수전공", "additionalMajorName", "doubleMajorStatus"],
  [2, "복수전공", "additionalMajorName", "doubleMajorStatus"],
  [1, "부전공", "minorName", "minorStatus"],
  [2, "부전공", "minorName", "minorStatus"],
] as const)(
  "reads and saves derived university major slot %s by %s classification",
  (slot, classification, nameField, statusField) => {
    const prefix = "educationalBackground.universities.7";
    mount(
      `<div data-scope="accordion" data-part="item">${control(prefix + ".schoolName", "합성대학교")}${control(`${prefix}.majors.${slot}`, "합성추가전공")}<button name="${prefix}.majors.${slot}.majorClassification">${classification}</button></div>`,
    );
    const candidates = readGreetingImport(document);
    expect(candidates).toContainEqual(
      expect.objectContaining({
        source: `${prefix}.majors.${slot}`,
        profileFieldKey: `education.university.${nameField}`,
        value: "합성추가전공",
      }),
    );
    expect(candidates).toContainEqual(
      expect.objectContaining({
        source: `${prefix}.majors.${slot}.majorClassification`,
        profileFieldKey: `education.university.${statusField}`,
        value: "있음",
      }),
    );
    const values = Object.fromEntries(
      candidates
        .filter(
          (c) =>
            c.profileFieldKey?.startsWith("education.university.") && c.value,
        )
        .map((c) => [c.profileFieldKey!.split(".")[2], c.value!]),
    );
    expect(
      mergeImportSelection(
        createEmptyProfile(),
        {
          entries: [
            {
              categoryId: "education",
              sectionId: "university",
              sourceRow: 7,
              values,
            },
          ],
        },
        () => "new-major",
      ).education[0].values,
    ).toEqual({
      schoolName: "합성대학교",
      [nameField]: "합성추가전공",
      [statusField]: "있음",
    });
  },
);
