import { describe, expect, it } from "vitest";

import profileExportExample from "../../fixtures/profile-export.example.json";
import { createEmptyProfile, PROFILE_SCHEMA_VERSION } from "./model";
import { parseProfileImport, serializeProfileExport } from "./profile-transfer";

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
      military: {},
      veteran: {},
      disability: {},
      health: [],
    });
  });
});
