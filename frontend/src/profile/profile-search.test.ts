import { describe, expect, it } from "vitest";

import { createEmptyProfile } from "./model";
import {
  buildSearchItems,
  groupItemsByEntry,
  searchProfileItems,
} from "./profile-search";

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

function schoolsProfile() {
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "비식별 이름";
  profile.education = [
    {
      id: "h1",
      sectionId: "highSchool",
      values: { schoolName: "비식별고등학교", startDate: "2015-03-01" },
    },
    {
      id: "u1",
      sectionId: "university",
      values: { schoolName: "비식별 대학교", majorName: "비식별 전공" },
    },
  ];
  return profile;
}

describe("profile search entries", () => {
  it("tags repeated entries with entry label and section", () => {
    const items = buildSearchItems(schoolsProfile());
    const schoolNames = items.filter((item) => item.fieldLabel === "학교명");

    expect(schoolNames.map((item) => item.entry)).toEqual([
      {
        id: "h1",
        label: "고등학교 1",
        sectionLabel: "고등학교",
        name: "비식별고등학교",
      },
      {
        id: "u1",
        label: "대학교 2",
        sectionLabel: "대학교",
        name: "비식별 대학교",
      },
    ]);
    expect(
      items.find((item) => item.categoryId === "personal")?.entry,
    ).toBeUndefined();
  });

  it("numbers entries within the category like profile management", () => {
    const profile = createEmptyProfile();
    profile.education = [
      { id: "a", sectionId: "university", values: { majorName: "전공 A" } },
      { id: "b", sectionId: "university", values: { majorName: "전공 B" } },
    ];

    expect(buildSearchItems(profile).map((item) => item.entry)).toEqual([
      { id: "a", label: "대학교 1", sectionLabel: "대학교" },
      { id: "b", label: "대학교 2", sectionLabel: "대학교" },
    ]);
  });

  it("keeps entry identity in search results", () => {
    const results = searchProfileItems(
      buildSearchItems(schoolsProfile()),
      "학교명",
    );

    expect(results.map((item) => item.entry?.id)).toEqual(["h1", "u1"]);
  });

  it("does not match entry headings in search", () => {
    expect(
      searchProfileItems(buildSearchItems(schoolsProfile()), "고등학교 1"),
    ).toEqual([]);
  });

  it("groups consecutive items by entry", () => {
    const items = buildSearchItems(schoolsProfile());
    const blocks = groupItemsByEntry(items);

    expect(
      blocks.map((block) => [
        block.entry?.id,
        block.items.map((item) => item.fieldLabel),
      ]),
    ).toEqual([
      [undefined, ["국문 이름"]],
      ["h1", ["학교명", "입학일"]],
      ["u1", ["학교명", "주전공명"]],
    ]);
  });

  it("does not merge entries that share an id across categories", () => {
    const profile = createEmptyProfile();
    profile.languages = [
      { id: "same", sectionId: "languageTest", values: { testName: "TOEIC" } },
    ];
    profile.certifications = [
      { id: "same", sectionId: "certificate", values: { name: "자격 A" } },
    ];

    expect(
      groupItemsByEntry(buildSearchItems(profile)).map(
        (block) => block.entry?.label,
      ),
    ).toEqual(["공인외국어시험 1", "자격증·면허증 1"]);
  });
});
