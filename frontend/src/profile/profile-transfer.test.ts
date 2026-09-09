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
      military: {},
      veteran: {},
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
  });
});
