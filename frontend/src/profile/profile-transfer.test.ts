import { describe, expect, it } from "vitest";

import profileExportExample from "../../fixtures/profile-export.example.json";
import { PROFILE_CATEGORIES } from "./field-definitions";
import {
  createEmptyProfile,
  PROFILE_SCHEMA_VERSION,
  type Profile,
  type ProfileEntry,
} from "./model";
import { sanitizeProfile } from "./profile-repository";
import { parseProfileImport, serializeProfileExport } from "./profile-transfer";

function expectFieldsToBeFilled(
  values: Record<string, string>,
  categoryId: string,
  sectionId: string,
) {
  const section = PROFILE_CATEGORIES.find(
    (category) => category.id === categoryId,
  )?.sections.find((candidate) => candidate.id === sectionId);
  expect(section).toBeDefined();
  expect(Object.keys(values)).toEqual(
    expect.arrayContaining(
      section!.fields
        .filter((field) => !field.visibleWhen || field.visibleWhen(values))
        .map((field) => field.id),
    ),
  );
  expect(Object.values(values).every((value) => value.length > 0)).toBe(true);
}

const militaryScenarios = [
  {
    name: "군필",
    values: {
      militaryStatus: "군필",
      militaryType: "현역병",
      militaryBranch: "육군",
      militarySpecialty: "보병",
      militaryRank: "병장",
      serviceStartDate: "2020-03-01",
      serviceEndDate: "2021-09-30",
      dischargeType: "만기전역",
    },
  },
  {
    name: "복무중",
    values: {
      militaryStatus: "복무중",
      militaryType: "현역병",
      militaryBranch: "육군",
      militarySpecialty: "보병",
      militaryRank: "일병",
      serviceStartDate: "2026-03-01",
      serviceEndDate: "2027-09-30",
      dischargeType: "전역예정",
    },
  },
  { name: "미필", values: { militaryStatus: "미필" } },
  {
    name: "면제",
    values: {
      militaryStatus: "면제",
      exemptionReason: "비식별 예시 면제 사유",
    },
  },
  {
    name: "비대상",
    values: {
      militaryStatus: "비대상",
      exemptionReason: "비식별 예시 비대상 사유",
    },
  },
] as const;

const veteranScenarios = [
  {
    name: "대상",
    values: {
      veteranStatus: "대상",
      veteranType: "독립유공자",
      veteranRelation: "본인",
      veteranNumber: "VET-DEMO-001",
    },
  },
  { name: "비대상", values: { veteranStatus: "비대상" } },
] as const;

function definedFieldIds(categoryId: string, sectionId: string): Set<string> {
  const section = PROFILE_CATEGORIES.find(
    (category) => category.id === categoryId,
  )?.sections.find((candidate) => candidate.id === sectionId);
  expect(section).toBeDefined();
  return new Set(section!.fields.map((field) => field.id));
}

describe("profile JSON transfer", () => {
  it("serializes a sanitized versioned profile envelope", () => {
    const profile = createEmptyProfile();
    profile.personal.koreanGivenName = "  가상 이름  ";

    expect(JSON.parse(serializeProfileExport(profile))).toMatchObject({
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profile: { personal: { koreanGivenName: "가상 이름" } },
    });
  });

  it("parses a valid profile envelope", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "example@example.test";

    expect(
      parseProfileImport(
        JSON.stringify({
          schemaVersion: PROFILE_SCHEMA_VERSION,
          profile,
        }),
      ),
    ).toEqual(profile);
  });

  it("preserves added education fields and nonstandard language tests through transfer", () => {
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "university-1",
        sectionId: "university",
        values: { attendanceType: "야간", schoolRegion: "해외" },
      },
    ];
    profile.languages = [
      {
        id: "language-test-1",
        sectionId: "languageTest",
        values: { language: "영어", testName: "사내 영어 인증" },
      },
    ];

    expect(parseProfileImport(serializeProfileExport(profile))).toEqual(
      profile,
    );
  });

  it("rejects malformed JSON", () => {
    expect(() => parseProfileImport("{")).toThrow(
      "가져오기 파일을 읽을 수 없습니다.",
    );
  });

  it("rejects an unsupported schema version", () => {
    expect(() =>
      parseProfileImport(
        JSON.stringify({
          schemaVersion: 999,
          profile: createEmptyProfile(),
        }),
      ),
    ).toThrow("지원하지 않는 프로필 버전입니다.");
  });

  it("rejects a malformed profile without coercing values", () => {
    expect(() =>
      parseProfileImport(
        JSON.stringify({
          schemaVersion: PROFILE_SCHEMA_VERSION,
          profile: { personal: { koreanGivenName: 123 } },
        }),
      ),
    ).toThrow("저장된 프로필 형식을 읽을 수 없습니다.");
  });

  it("parses the non-identifying export example", () => {
    expect(
      parseProfileImport(JSON.stringify(profileExportExample)),
    ).toMatchObject({
      contact: { email: "example@example.test" },
      education: [
        expect.objectContaining({ sectionId: "highSchool" }),
        expect.objectContaining({ sectionId: "university" }),
      ],
      languages: [
        expect.objectContaining({ sectionId: "languageTest" }),
        expect.objectContaining({ sectionId: "languageSkill" }),
      ],
      certifications: [
        expect.objectContaining({ sectionId: "certificate" }),
        expect.objectContaining({ sectionId: "certificate" }),
        expect.objectContaining({ sectionId: "certificate" }),
      ],
      projects: [expect.objectContaining({ sectionId: "project" })],
      military: {
        militaryStatus: "군필",
        militaryType: "현역병",
        militaryBranch: "육군",
        militarySpecialty: "보병",
        militaryRank: "병장",
        serviceStartDate: "2020-03-01",
        serviceEndDate: "2021-09-30",
        dischargeType: "만기전역",
      },
      veteran: {
        veteranStatus: "대상",
        veteranType: "독립유공자",
        veteranRelation: "본인",
        veteranNumber: "1234567890",
      },
      disability: {
        disabilityStatus: "대상",
        disabilityType: "지체장애",
        disabilityGrade: "중증",
        disabilityRegistrationNumber: "DIS-DEMO-001",
        disabilityRegistrationDate: "2020-01-01",
      },
      health: [],
    });
  });

  it("fills every non-sensitive field rendered by its demo entries", () => {
    const profile = parseProfileImport(JSON.stringify(profileExportExample));

    expect(profile.careers).toHaveLength(1);
    expect(profile.projects).toHaveLength(1);
    expect(profile.publications).toHaveLength(1);
    expectFieldsToBeFilled(profile.personal, "personal", "personal");
    expectFieldsToBeFilled(profile.contact, "contact", "contact");
    profile.education.forEach((entry) =>
      expectFieldsToBeFilled(entry.values, "education", entry.sectionId),
    );
    expectFieldsToBeFilled(
      profile.education[1].values,
      "education",
      "university",
    );
    expect(profile.education[1].values.latestEducationType).toBe("대학(학사)");
    profile.languages.forEach((entry) =>
      expectFieldsToBeFilled(entry.values, "languages", entry.sectionId),
    );
    profile.certifications.forEach((entry) =>
      expectFieldsToBeFilled(entry.values, "certifications", entry.sectionId),
    );
    profile.careers.forEach((entry) =>
      expectFieldsToBeFilled(entry.values, "careers", entry.sectionId),
    );
    profile.projects.forEach((entry) =>
      expectFieldsToBeFilled(entry.values, "projects", entry.sectionId),
    );
    profile.publications.forEach((entry) =>
      expectFieldsToBeFilled(entry.values, "publications", entry.sectionId),
    );
    expect(profile.military).toEqual({
      militaryStatus: "군필",
      militaryType: "현역병",
      militaryBranch: "육군",
      militarySpecialty: "보병",
      militaryRank: "병장",
      serviceStartDate: "2020-03-01",
      serviceEndDate: "2021-09-30",
      dischargeType: "만기전역",
    });
    expectFieldsToBeFilled(profile.veteran, "veteran", "veteran");
  });

  it.each(militaryScenarios)(
    "preserves a logically consistent $name military scenario",
    ({ values }) => {
      const profile = createEmptyProfile();
      profile.military = { ...values };

      expect(parseProfileImport(serializeProfileExport(profile))).toEqual(
        profile,
      );
    },
  );

  it.each(veteranScenarios)(
    "preserves only applicable fields for the $name veteran scenario",
    ({ values }) => {
      const profile = createEmptyProfile();
      profile.veteran = { ...values };

      expect(parseProfileImport(serializeProfileExport(profile))).toEqual(
        profile,
      );
      if (values.veteranStatus === "비대상") {
        expect(Object.keys(profile.veteran)).toEqual(["veteranStatus"]);
      }
    },
  );

  it("covers every defined military and veteran field across applicable scenarios", () => {
    expect(
      new Set(militaryScenarios.flatMap(({ values }) => Object.keys(values))),
    ).toEqual(definedFieldIds("military", "military"));
    expect(
      new Set(veteranScenarios.flatMap(({ values }) => Object.keys(values))),
    ).toEqual(definedFieldIds("veteran", "veteran"));
  });
});

it("roundtrips canonical, legacy, unknown, and blank values for the five profile selects", () => {
  const profile = createEmptyProfile();
  profile.military = {
    militaryStatus: "military-status:served",
    militaryBranch: "만기전역",
    militaryRank: "unknown-rank",
  };
  profile.veteran = {
    veteranStatus: "veteran-status:eligible",
  };
  profile.disability = {
    disabilityStatus: "  ",
  };

  const roundtripped = parseProfileImport(serializeProfileExport(profile));

  expect(roundtripped.military).toEqual({
    militaryStatus: "military-status:served",
    militaryBranch: "만기전역",
    militaryRank: "unknown-rank",
  });
  expect(roundtripped.veteran).toEqual({
    veteranStatus: "veteran-status:eligible",
  });
  expect(roundtripped.disability).toEqual({});
});

describe("structured address transfer", () => {
  it("round-trips the stored selection through export and import", () => {
    const profile = createEmptyProfile();
    profile.contact = {
      postalCode: "63309",
      addressLine1: "제주특별자치도 제주시 첨단로 242",
      jibunAddress: "제주특별자치도 제주시 영평동 2181",
      buildingManagementNumber: "5011010400121810000000001",
      addressVerified: "true",
    };

    expect(parseProfileImport(serializeProfileExport(profile)).contact).toEqual(
      profile.contact,
    );
  });

  it("imports a file exported before the selection fields existed", () => {
    const contact = { postalCode: "12345", addressLine1: "기존 주소" };
    const imported = parseProfileImport(
      JSON.stringify({
        schemaVersion: 1,
        profile: { ...createEmptyProfile(), contact },
      }),
    );

    expect(imported.contact).toEqual(contact);
  });
});

describe("blank template export and import", () => {
  const exportedProfile = (profile: Profile) =>
    JSON.parse(serializeProfileExport(profile)).profile as Profile;
  const sectionFieldIds = (categoryId: string, sectionId: string) =>
    PROFILE_CATEGORIES.find((category) => category.id === categoryId)
      ?.sections.find((section) => section.id === sectionId)
      ?.fields.map((field) => field.id) ?? [];
  const topLevelFieldIds = (categoryId: string) =>
    PROFILE_CATEGORIES.find(
      (category) => category.id === categoryId,
    )?.topLevelFields?.map((field) => field.id) ?? [];
  const singleCategories = PROFILE_CATEGORIES.filter(
    (category) => !category.repeatable,
  );
  const repeatedCategories = PROFILE_CATEGORIES.filter(
    (category) => category.repeatable,
  );

  it.each(singleCategories.map((category) => category.id))(
    "exports every %s field id with blank defaults",
    (categoryId) => {
      const fieldIds = singleCategories
        .find((category) => category.id === categoryId)!
        .sections.flatMap((section) => section.fields.map((f) => f.id));
      const values =
        exportedProfile(createEmptyProfile())[categoryId as "personal"];

      expect(Object.keys(values).sort()).toEqual([...fieldIds].sort());
      expect(Object.values(values).every((value) => value === "")).toBe(true);
    },
  );

  it("keeps existing and unknown single-category values on export", () => {
    const profile = createEmptyProfile();
    profile.personal = { koreanGivenName: "가상 이름", customKey: "보존" };

    expect(exportedProfile(profile).personal).toMatchObject({
      koreanGivenName: "가상 이름",
      customKey: "보존",
      koreanFamilyName: "",
    });
  });

  it.each(repeatedCategories.map((category) => category.id))(
    "exports one blank entry per section for an empty %s category",
    (categoryId) => {
      const category = repeatedCategories.find((c) => c.id === categoryId)!;
      const entries =
        exportedProfile(createEmptyProfile())[categoryId as "education"];

      expect(entries.map((entry) => entry.sectionId)).toEqual(
        category.sections.map((section) => section.id),
      );
      entries.forEach((entry) => {
        const expectedIds = [
          ...sectionFieldIds(categoryId, entry.sectionId),
          ...(entry.sectionId === "university"
            ? topLevelFieldIds(categoryId)
            : []),
        ];
        expect(entry.id.length).toBeGreaterThan(0);
        expect(entry.identity).toBeUndefined();
        expect(Object.keys(entry.values).sort()).toEqual(expectedIds.sort());
        expect(Object.values(entry.values).every((v) => v === "")).toBe(true);
      });
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(
        entries.length,
      );
    },
  );

  it("fills only missing fields of existing entries without adding blank entries", () => {
    const profile = createEmptyProfile();
    const identity = { status: "manual", originalText: "가상 학교" } as const;
    profile.education = [
      {
        id: "university-1",
        sectionId: "university",
        values: { attendanceType: "야간" },
        identity,
      },
    ];

    const education = exportedProfile(profile).education;

    expect(education).toHaveLength(1);
    expect(education[0]).toMatchObject({
      id: "university-1",
      sectionId: "university",
      identity,
    });
    expect(Object.keys(education[0].values).sort()).toEqual(
      [
        ...sectionFieldIds("education", "university"),
        ...topLevelFieldIds("education"),
      ].sort(),
    );
    expect(education[0].values.attendanceType).toBe("야간");
    expect(education[0].values.latestEducationType).toBe("");
    expect(exportedProfile(profile).languages.length).toBeGreaterThan(0);
  });

  it("imports the blank template as an empty profile", () => {
    expect(
      parseProfileImport(serializeProfileExport(createEmptyProfile())),
    ).toEqual(createEmptyProfile());
  });

  it("sanitizes blank values and blank entries on import", () => {
    const profile = createEmptyProfile();
    profile.personal = {
      koreanGivenName: "  가상 이름 ",
      koreanFamilyName: "",
    };
    profile.projects = [
      { id: "blank", sectionId: "project", values: { projectName: " " } },
    ];

    expect(
      parseProfileImport(
        JSON.stringify({ schemaVersion: PROFILE_SCHEMA_VERSION, profile }),
      ),
    ).toEqual({
      ...createEmptyProfile(),
      personal: { koreanGivenName: "가상 이름" },
    });
  });

  it("gives repeated entry ids a new id on import and keeps every entry", () => {
    const entry = (
      id: string,
      sectionId: string,
      key: string,
    ): ProfileEntry => ({
      id,
      sectionId,
      values: { [key]: "값" },
    });
    const profile = createEmptyProfile();
    profile.careers = [entry("dup", "career", "companyName")];
    profile.projects = [
      entry("dup", "project", "projectName"),
      entry("dup", "project", "projectRole"),
    ];

    const imported = parseProfileImport(
      JSON.stringify({ schemaVersion: PROFILE_SCHEMA_VERSION, profile }),
    );
    const ids = [...imported.careers, ...imported.projects].map((e) => e.id);

    expect(ids[0]).toBe("dup");
    expect(new Set(ids).size).toBe(3);
    expect(imported.projects.map((e) => e.values)).toEqual(
      profile.projects.map((e) => e.values),
    );
  });

  it("round-trips an exported profile to its sanitized form", () => {
    const profile = parseProfileImport(JSON.stringify(profileExportExample));

    expect(parseProfileImport(serializeProfileExport(profile))).toEqual(
      sanitizeProfile(profile),
    );
  });
});
