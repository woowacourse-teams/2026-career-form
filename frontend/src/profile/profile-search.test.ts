import { describe, expect, it } from "vitest";

import { createEmptyProfile } from "./model";
import { buildSearchItems, searchProfileItems } from "./profile-search";

describe("profile search", () => {
  it("builds searchable items only from non-empty profile values", () => {
    const profile = createEmptyProfile();
    profile.personal.koreanFamilyName = "비식별 성";
    profile.personal.koreanGivenName = "";
    profile.military.militaryStatus = "비식별 상태";

    expect(buildSearchItems(profile)).toEqual([
      expect.objectContaining({
        categoryId: "personal",
        categoryLabel: "기본 인적사항",
        fieldLabel: "국문 성",
        value: "비식별 성",
        sensitive: false,
      }),
      expect.objectContaining({
        categoryId: "military",
        categoryLabel: "병역",
        fieldLabel: "병역 상태",
        value: "비식별 상태",
        sensitive: false,
      }),
    ]);
  });

  it("filters by category and field labels but not by stored values", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "private@example.com";
    profile.projects = [
      {
        id: "project-1",
        sectionId: "project",
        values: { projectName: "비식별 프로젝트" },
      },
    ];
    const items = buildSearchItems(profile);

    expect(searchProfileItems(items, "연락처")).toHaveLength(1);
    expect(searchProfileItems(items, "프로젝트 이름")).toHaveLength(1);
    expect(searchProfileItems(items, "private@example.com")).toHaveLength(0);
  });

  it("shows option labels for coded select values", () => {
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "u1",
        sectionId: "university",
        values: {
          schoolName: "비식별 대학교",
          attendanceType: "attendance:day",
          schoolRegion: "region:seoul",
        },
      },
    ];
    profile.military = {
      militaryStatus: "military-status:served",
      militaryBranch: "military-branch:army",
      militaryRank: "military-rank:byeongjang",
    };
    profile.veteran = { veteranStatus: "veteran-status:eligible" };
    profile.disability = { disabilityStatus: "disability-status:not-eligible" };
    const values = Object.fromEntries(
      buildSearchItems(profile).map((item) => [item.fieldLabel, item.value]),
    );

    expect(values).toEqual({
      학교명: "비식별 대학교",
      "주·야간": "주간",
      "학교 소재지": "서울",
      "병역 상태": "군필",
      군별: "육군",
      계급: "병장",
      "보훈 대상 여부": "대상",
      "장애 여부": "비대상",
    });
    expect(
      Object.values(values).filter((value) => /^[a-z-]+:/u.test(value)),
    ).toEqual([]);
  });

  it("keeps text fields and values outside the options unchanged", () => {
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "h1",
        sectionId: "highSchool",
        values: { schoolRegion: "서울", attendanceType: "주간" },
      },
    ];
    profile.military = { militarySpecialty: "비식별 병과" };
    const values = buildSearchItems(profile).map((item) => item.value);

    expect(values).toEqual(["주간", "서울", "비식별 병과"]);
  });

  it("does not match option labels in search", () => {
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "u1",
        sectionId: "university",
        values: { schoolRegion: "region:seoul" },
      },
    ];

    expect(searchProfileItems(buildSearchItems(profile), "서울")).toEqual([]);
  });
});
