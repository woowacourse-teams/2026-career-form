import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "./model";
import { parseProfileImport, serializeProfileExport } from "./profile-transfer";

describe("profile identity import boundary", () => {
  it.each([
    { status: "selected", catalogId: 123 },
    {
      status: "selected",
      catalogId: "certificate:sqld",
      displayName: "SQL 개발자",
    },
    { status: "manual", originalText: 123 },
    { status: "unrecognized", originalText: "SQL" },
  ])(
    "rejects malformed identity metadata instead of trusting it: %j",
    (identity) => {
      const profile = createEmptyProfile();
      const envelope = {
        schemaVersion: 1,
        profile: {
          ...profile,
          certifications: [
            {
              id: "certificate-1",
              sectionId: "certificate",
              values: { name: "SQL" },
              identity,
            },
          ],
        },
      };

      expect(() => parseProfileImport(JSON.stringify(envelope))).toThrow();
    },
  );

  it("preserves selected identity and original text through schema 1 export", () => {
    const profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: {
            name: "SQL 개발자",
            issuer: "사용자 발급기관",
            registrationNo: "DEMO-1",
          },
          identity: {
            status: "selected" as const,
            catalogId: "certificate:sqld",
            displayName: "SQL 개발자",
            originalText: " SQLD ",
            catalogVersion: "2026-10-07",
          },
        },
      ],
    };

    expect(parseProfileImport(serializeProfileExport(profile))).toEqual(
      profile,
    );
  });

  it("keeps legacy and manual names distinct without inferring an identity", () => {
    const profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "legacy-1",
          sectionId: "certificate",
          values: { name: "SQL" },
        },
        {
          id: "manual-1",
          sectionId: "certificate",
          values: { name: "목록 밖 자격" },
          identity: { status: "manual" as const, originalText: "목록 밖 자격" },
        },
      ],
    };

    expect(parseProfileImport(serializeProfileExport(profile))).toEqual(
      profile,
    );
  });
});
