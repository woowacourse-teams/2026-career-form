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
        categoryLabel: "기본 인적사항",
        fieldLabel: "국문 성",
        value: "비식별 성",
        sensitive: false,
      }),
      expect.objectContaining({
        categoryLabel: "병역",
        fieldLabel: "병역 상태",
        value: "비식별 상태",
        sensitive: true,
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
});
