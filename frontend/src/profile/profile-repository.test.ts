import { describe, expect, it } from "vitest";

import { createEmptyProfile } from "./model";
import {
  countCompletedCategories,
  sanitizeProfile,
} from "./profile-repository";

describe("sanitizeProfile", () => {
  it("trims string edges and omits empty values without changing their meaning", () => {
    const profile = createEmptyProfile();
    profile.personal = {
      koreanFamilyName: "  김  ",
      englishGivenName: "  Min Jun  ",
      nationality: "   ",
    };

    expect(sanitizeProfile(profile).personal).toEqual({
      koreanFamilyName: "김",
      englishGivenName: "Min Jun",
    });
  });

  it("omits repeated entries whose values are all empty and preserves stable ids", () => {
    const profile = createEmptyProfile();
    profile.certifications = [
      { id: "certificate-1", sectionId: "certificate", values: { name: "  " } },
      {
        id: "certificate-2",
        sectionId: "certificate",
        values: { name: "  정보처리기사  ", grade: "" },
      },
    ];

    expect(sanitizeProfile(profile).certifications).toEqual([
      {
        id: "certificate-2",
        sectionId: "certificate",
        values: { name: "정보처리기사" },
      },
    ]);
  });
});

describe("countCompletedCategories", () => {
  it("counts categories that contain at least one saved value", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "applicant@example.com";
    profile.projects.push({
      id: "project-1",
      sectionId: "project",
      values: { projectName: "비식별 프로젝트" },
    });

    expect(countCompletedCategories(profile)).toBe(2);
  });
});
