import { describe, expect, it } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import { resolveValueBinding } from "../profile/value-binding";
import { resolveProfileFieldValue } from "./review-plan";

describe("profile value resolution", () => {
  it("composes a Korean full name from local family and given names", () => {
    const profile = createEmptyProfile();
    profile.personal.koreanFamilyName = "김";
    profile.personal.koreanGivenName = "민수";

    expect(
      resolveValueBinding(profile, {
        type: "DERIVED",
        recipe: "KOREAN_FULL_NAME",
      }),
    ).toEqual({
      status: "resolved",
      value: "김민수",
      sensitive: false,
    });
  });

  it("resolves a declared single-value profile field", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";

    expect(resolveProfileFieldValue(profile, "contact.contact.email")).toEqual({
      status: "resolved",
      value: "me@example.test",
      sensitive: false,
    });
  });

  it("resolves the education top-level latest education value from its university entry", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      education: [
        {
          id: "university-1",
          sectionId: "university",
          values: { latestEducationType: "대학(학사)" },
        },
      ],
    };

    expect(
      resolveProfileFieldValue(
        profile,
        "education.university.latestEducationType",
        0,
      ),
    ).toEqual({
      status: "resolved",
      value: "대학(학사)",
      sensitive: false,
      profileEntryId: "university-1",
    });
  });

  it("does not choose between repeated profile entries", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: { name: "자격증 A" },
        },
        {
          id: "certificate-2",
          sectionId: "certificate",
          values: { name: "자격증 B" },
        },
      ],
    };

    expect(
      resolveProfileFieldValue(profile, "certifications.certificate.name"),
    ).toEqual({ status: "ambiguous", sensitive: false });
  });

  it("resolves a repeated profile value by the locally supplied row index", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: { name: "자격증 A" },
        },
        {
          id: "certificate-2",
          sectionId: "certificate",
          values: { name: "자격증 B" },
        },
      ],
    };

    expect(
      resolveProfileFieldValue(profile, "certifications.certificate.name", 1),
    ).toEqual({
      status: "resolved",
      value: "자격증 B",
      sensitive: false,
      profileEntryId: "certificate-2",
    });
  });

  it("keeps a repeated field unavailable when its only matching entry has no value", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: { name: "" },
        },
      ],
    };

    expect(
      resolveProfileFieldValue(profile, "certifications.certificate.name"),
    ).toEqual({ status: "missing", sensitive: false });
  });

  it("rejects an excluded evidence document path instead of resolving it", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: { evidenceDocumentPath: "/local/evidence.pdf" },
        },
      ],
    };

    expect(
      resolveProfileFieldValue(
        profile,
        "certifications.certificate.evidenceDocumentPath",
      ),
    ).toEqual({ status: "unknown", sensitive: false });
  });
});
