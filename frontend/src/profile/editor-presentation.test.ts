import { describe, expect, it } from "vitest";
import { PROFILE_CATEGORIES } from "./field-definitions";
import { createEmptyProfile } from "./model";
import { categoryStatus, editorFieldGroups } from "./editor-presentation";

describe("profile editor presentation", () => {
  it("keeps every existing field and its behavior exactly once when grouping", () => {
    for (const category of PROFILE_CATEGORIES) {
      for (const section of category.sections) {
        const displayed = editorFieldGroups(section).flatMap(
          (group) => group.fields,
        );
        expect(displayed).toHaveLength(section.fields.length);
        for (const field of section.fields) {
          expect(
            displayed.filter((candidate) => candidate === field),
          ).toHaveLength(1);
        }
      }
    }
  });

  it("keeps new fields visible even if they do not have an explicit display group", () => {
    const section = PROFILE_CATEGORIES[0].sections[0];
    const newField = {
      id: "newField",
      label: "새 입력",
      inputType: "text" as const,
    };
    const groups = editorFieldGroups({
      ...section,
      fields: [...section.fields, newField],
    });
    expect(groups.flatMap((group) => group.fields)).toContain(newField);
  });

  it("counts entered values and records without calling empty records completed", () => {
    const profile = createEmptyProfile();
    const personal = PROFILE_CATEGORIES.find(
      (category) => category.id === "personal",
    )!;
    const education = PROFILE_CATEGORIES.find(
      (category) => category.id === "education",
    )!;
    profile.personal = { koreanFamilyName: "홍", koreanGivenName: "  " };
    profile.education = [
      { id: "empty", sectionId: "highSchool", values: { schoolName: " " } },
      {
        id: "filled",
        sectionId: "university",
        values: { schoolName: "예시대학교" },
      },
    ];
    expect(categoryStatus(personal, profile)).toBe("1개 입력");
    expect(categoryStatus(education, profile)).toBe("1건 등록");
    profile.education.pop();
    expect(categoryStatus(education, profile)).toBe("미입력");
  });
});
