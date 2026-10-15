import { describe, expect, it } from "vitest";
import { createEmptyProfile, type FieldValues } from "../model";
import { mergeImportSelection, type ImportSelection } from "./merge";
const career = {
  categoryId: "careers" as const,
  sectionId: "career",
  sourceRow: 0,
  values: {
    companyName: "합성 회사",
    startDate: "2020-03-01",
    employmentType: "정규",
  },
};
describe("expanded import merge", () => {
  it("stores selected singleton and repeated sections while retaining unselected data", () => {
    const original = createEmptyProfile();
    original.contact.addressLine1 = "보존";
    let id = 0;
    const result = mergeImportSelection(
      original,
      {
        single: {
          personal: { gender: "남성", birthDate: "1998-01-02" },
          military: { militaryStatus: "military-status:not-applicable" },
          contact: { email: "synthetic@example.invalid" },
        },
        entries: [
          career,
          {
            categoryId: "languages",
            sectionId: "languageTest",
            sourceRow: 0,
            values: {
              testName: "TOEIC",
              acquisitionDate: "2025-01-02",
              grade: "900",
            },
          },
          {
            categoryId: "certifications",
            sectionId: "certificate",
            sourceRow: 0,
            values: { name: "합성 자격", issuer: "합성 기관" },
          },
        ],
      },
      () => `new-${++id}`,
    );
    expect(result.contact).toEqual({
      addressLine1: "보존",
      email: "synthetic@example.invalid",
    });
    expect(result.personal.birthDate).toBe("1998-01-02");
    expect(result.military.militaryStatus).toBe(
      "military-status:not-applicable",
    );
    expect(result.careers[0].values).toEqual(career.values);
    expect(result.languages[0].identity).toEqual({
      status: "manual",
      originalText: "TOEIC",
    });
    expect(result.certifications[0].identity).toEqual({
      status: "manual",
      originalText: "합성 자격",
    });
    expect(original.careers).toEqual([]);
  });
  it("updates explicit same-section target and retains unselected values", () => {
    const current = createEmptyProfile();
    current.education = [
      {
        id: "grad",
        sectionId: "graduateSchool",
        values: { schoolName: "합성 대학원", thesisTitle: "보존 논문" },
      },
    ];
    expect(
      mergeImportSelection(current, {
        entries: [
          {
            categoryId: "education",
            sectionId: "graduateSchool",
            sourceRow: 0,
            targetId: "grad",
            values: { endDate: "2026-02-01" },
          },
        ],
      }).education[0].values,
    ).toEqual({
      schoolName: "합성 대학원",
      thesisTitle: "보존 논문",
      endDate: "2026-02-01",
    });
  });
  it("allows same name with different dates but rejects identical employment", () => {
    const current = createEmptyProfile();
    current.careers = [
      { id: "old", sectionId: "career", values: career.values },
    ];
    expect(() =>
      mergeImportSelection(current, { entries: [career] }),
    ).toThrow();
    expect(
      mergeImportSelection(
        current,
        {
          entries: [
            {
              ...career,
              values: { ...career.values, startDate: "2023-03-01" },
            },
          ],
        },
        () => "new",
      ).careers,
    ).toHaveLength(2);
  });
  it.each([
    { single: { personal: { birthDate: "2020-02-30" } } },
    { single: { military: { militaryStatus: "비대상" } } },
    { single: { contact: { secondaryEmail: "invalid" } } },
    { single: { contact: { emergencyPhoneNumber: "not-phone" } } },
    { single: { personal: { invented: "no" } } },
    { single: { education: { schoolName: "no" } } },
    {
      entries: [
        {
          ...career,
          values: { companyName: "회사", employmentType: "정규직" },
        },
      ],
    },
    {
      entries: [
        { ...career, values: { companyName: "회사", startDate: "2020-03" } },
      ],
    },
    { entries: [{ ...career, values: { department: "이름 누락" } }] },
    { entries: [{ ...career, sectionId: "university" }] },
    { entries: [career, career] },
    { entries: [{ ...career, targetId: "missing" }] },
    JSON.parse('{"single":{"__proto__":{"polluted":"yes"}}}'),
    JSON.parse('{"single":{"personal":{"__proto__":"no"}}}'),
  ])("rejects invalid selections without modifying input: %j", (selection) => {
    const current = createEmptyProfile();
    expect(() =>
      mergeImportSelection(current, selection as ImportSelection),
    ).toThrow();
    expect(current).toEqual(createEmptyProfile());
  });
  it("rejects targets in another section", () => {
    const current = createEmptyProfile();
    current.education = [
      {
        id: "school",
        sectionId: "highSchool",
        values: { schoolName: "고등학교" },
      },
    ];
    expect(() =>
      mergeImportSelection(current, {
        entries: [
          {
            categoryId: "education",
            sectionId: "graduateSchool",
            sourceRow: 0,
            targetId: "school",
            values: { schoolName: "대학원" },
          },
        ],
      }),
    ).toThrow();
  });
});

it("rejects a new entry duplicating a later explicitly updated existing entry", () => {
  const current = createEmptyProfile();
  current.careers = [
    { id: "old", sectionId: "career", values: { companyName: "이전 회사" } },
  ];
  expect(() =>
    mergeImportSelection(
      current,
      { entries: [career, { ...career, sourceRow: 1, targetId: "old" }] },
      () => "new",
    ),
  ).toThrow();
});

it("cannot target a newly generated ID as though it were an existing entry", () => {
  expect(() =>
    mergeImportSelection(
      createEmptyProfile(),
      {
        entries: [
          career,
          {
            ...career,
            sourceRow: 1,
            targetId: "new",
            values: { department: "부서" },
          },
        ],
      },
      () => "new",
    ),
  ).toThrow();
});

it("keeps same source indexes independent across education sections and other categories", () => {
  let id = 0;
  const result = mergeImportSelection(
    createEmptyProfile(),
    {
      entries: [
        {
          categoryId: "education",
          sectionId: "highSchool",
          sourceRow: 0,
          values: {
            schoolName: "합성 고등학교",
            completionStatus: "졸업",
            schoolRegion: "region:seoul",
          },
        },
        {
          categoryId: "education",
          sectionId: "graduateSchool",
          sourceRow: 0,
          values: { schoolName: "합성 대학원", thesisTitle: "합성 연구" },
        },
        {
          categoryId: "languages",
          sectionId: "languageSkill",
          sourceRow: 0,
          values: { language: "영어", conversationalLevel: "상" },
        },
        {
          categoryId: "projects",
          sectionId: "project",
          sourceRow: 0,
          values: {
            projectName: "합성 프로젝트",
            activityDetails: "검증 활동",
          },
        },
        {
          categoryId: "publications",
          sectionId: "publicationPatent",
          sourceRow: 0,
          values: { title: "합성 논문", type: "논문" },
        },
        {
          categoryId: "health",
          sectionId: "health",
          sourceRow: 0,
          values: { healthItemName: "합성 항목", healthDate: "2026-01-01" },
        },
      ],
    },
    () => `entry-${++id}`,
  );
  expect(result.education.map((entry) => entry.sectionId)).toEqual([
    "highSchool",
    "graduateSchool",
  ]);
  expect(result.languages[0].values).toEqual({
    language: "영어",
    conversationalLevel: "상",
  });
  expect(result.projects[0].values).toEqual({
    projectName: "합성 프로젝트",
    activityDetails: "검증 활동",
  });
  expect(result.publications[0].values).toEqual({
    title: "합성 논문",
    type: "논문",
  });
  expect(result.health[0].values).toEqual({
    healthItemName: "합성 항목",
    healthDate: "2026-01-01",
  });
});

it("invalidates selected catalog identity only when imported certificate name changes", () => {
  const current = createEmptyProfile();
  current.certifications = [
    {
      id: "cert",
      sectionId: "certificate",
      values: { name: "기존 자격", issuer: "보존 기관" },
      identity: {
        status: "selected",
        catalogId: "certificate:1",
        displayName: "기존 자격",
        originalText: "기존 자격",
        catalogVersion: "1",
      },
    },
  ];
  const unchanged = mergeImportSelection(current, {
    entries: [
      {
        categoryId: "certifications",
        sectionId: "certificate",
        sourceRow: 0,
        targetId: "cert",
        values: { acquisitionDate: "2025-01-01" },
      },
    ],
  });
  expect(unchanged.certifications[0].identity).toEqual(
    current.certifications[0].identity,
  );
  const changed = mergeImportSelection(current, {
    entries: [
      {
        categoryId: "certifications",
        sectionId: "certificate",
        sourceRow: 0,
        targetId: "cert",
        values: { name: "다른 자격" },
      },
    ],
  });
  expect(changed.certifications[0].identity).toEqual({
    status: "manual",
    originalText: "다른 자격",
  });
  expect(changed.certifications[0].values.issuer).toBe("보존 기관");
});

it.each<FieldValues>([
  { additionalMajorName: "복수전공" },
  { minorName: "부전공" },
])(
  "accepts an additional-major name without any status as develop's field definitions allow: %j",
  (values) => {
    const result = mergeImportSelection(
      createEmptyProfile(),
      {
        entries: [
          {
            categoryId: "education",
            sectionId: "university",
            sourceRow: 0,
            values: { schoolName: "합성 대학", ...values },
          },
        ],
      },
      () => "row",
    );
    expect(result.education[0].values).toEqual({
      schoolName: "합성 대학",
      ...values,
    });
  },
);

it.each<FieldValues>([
  { additionalMajorName: "복수전공", doubleMajorStatus: "없음" },
  { minorName: "부전공", minorStatus: "없음" },
])(
  "rejects a selected additional-major name without its enabled status: %j",
  (values) => {
    expect(() =>
      mergeImportSelection(createEmptyProfile(), {
        entries: [
          {
            categoryId: "education",
            sectionId: "university",
            sourceRow: 0,
            values: { schoolName: "합성 대학", ...values },
          },
        ],
      }),
    ).toThrow();
  },
);

it("accepts additional-major names with selected or retained enabled status", () => {
  const current = createEmptyProfile();
  current.education = [
    {
      id: "university",
      sectionId: "university",
      values: {
        schoolName: "합성 대학",
        doubleMajorStatus: "있음",
        minorStatus: "없음",
      },
    },
  ];
  const result = mergeImportSelection(current, {
    entries: [
      {
        categoryId: "education",
        sectionId: "university",
        sourceRow: 0,
        targetId: "university",
        values: {
          additionalMajorName: "복수전공",
          minorName: "부전공",
          minorStatus: "있음",
        },
      },
    ],
  });
  expect(result.education[0].values).toEqual({
    schoolName: "합성 대학",
    doubleMajorStatus: "있음",
    minorStatus: "있음",
    additionalMajorName: "복수전공",
    minorName: "부전공",
  });
});

it("preserves an unselected additional-major name when its status is explicitly disabled", () => {
  const current = createEmptyProfile();
  current.education = [
    {
      id: "university",
      sectionId: "university",
      values: {
        schoolName: "합성 대학",
        doubleMajorStatus: "있음",
        additionalMajorName: "보존 전공",
      },
    },
  ];
  expect(
    mergeImportSelection(current, {
      entries: [
        {
          categoryId: "education",
          sectionId: "university",
          sourceRow: 0,
          targetId: "university",
          values: { doubleMajorStatus: "없음" },
        },
      ],
    }).education[0].values,
  ).toEqual({
    schoolName: "합성 대학",
    doubleMajorStatus: "없음",
    additionalMajorName: "보존 전공",
  });
});
