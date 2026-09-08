import { describe, expect, it } from "vitest";

import profileExportExample from "../../fixtures/profile-export.example.json";
import { PROFILE_CATEGORIES } from "./field-definitions";
import { createEmptyProfile, PROFILE_SCHEMA_VERSION } from "./model";
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

    expect(JSON.parse(serializeProfileExport(profile))).toEqual({
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profile: {
        ...createEmptyProfile(),
        personal: { koreanGivenName: "가상 이름" },
      },
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
        veteranNumber: "VET-DEMO-001",
      },
      disability: {},
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
