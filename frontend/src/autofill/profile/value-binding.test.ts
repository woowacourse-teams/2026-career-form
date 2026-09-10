import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { resolveValueBinding } from "./value-binding";

describe("resolveValueBinding", () => {
  it("preserves the existing behavior of unrelated high-school bindings", () => {
    const profile = createEmptyProfile();
    profile.education.push({
      id: "high-school",
      sectionId: "highSchool",
      values: { qualificationPassDate: "2020-04-01" },
    });
    expect(
      resolveValueBinding(
        profile,
        {
          type: "DIRECT",
          profileFieldKey: "education.highSchool.qualificationPassDate",
        },
        0,
      ),
    ).toMatchObject({ status: "resolved", value: "2020-04-01" });
  });

  it.each([
    ["additionalMajorName", "doubleMajorStatus"],
    ["minorName", "minorStatus"],
  ])(
    "only resolves %s when its own university row enables it",
    (field, flag) => {
      const profile = createEmptyProfile();
      profile.education.push(
        {
          id: "enabled",
          sectionId: "university",
          values: { [flag]: "있음", [field]: "가상전공" },
        },
        {
          id: "disabled",
          sectionId: "university",
          values: { [flag]: "없음", [field]: "남아있는전공" },
        },
        {
          id: "missing-flag",
          sectionId: "university",
          values: { [field]: "남아있는전공" },
        },
        {
          id: "blank",
          sectionId: "university",
          values: { [flag]: "있음", [field]: "  " },
        },
      );
      const binding = {
        type: "DIRECT" as const,
        profileFieldKey: `education.university.${field}`,
      };
      expect(resolveValueBinding(profile, binding, 0)).toMatchObject({
        status: "resolved",
        value: "가상전공",
        profileEntryId: "enabled",
      });
      for (const index of [1, 2, 3]) {
        expect(resolveValueBinding(profile, binding, index)).toMatchObject({
          status: "missing",
        });
      }
      expect(resolveValueBinding(profile, binding)).toMatchObject({
        status: "ambiguous",
      });
    },
  );

  it("converts a backend-selected boolean profile field to Y", () => {
    const profile = createEmptyProfile();
    profile.disability.disabilityStatus = "대상";

    expect(
      resolveValueBinding(profile, {
        type: "DERIVED",
        recipe: "BOOLEAN_YN",
        profileFieldKey: "disability.disability.disabilityStatus",
      }),
    ).toMatchObject({ status: "resolved", value: "Y" });
  });

  it("formats a date profile field as year-month for a company recipe", () => {
    const profile = createEmptyProfile();
    profile.military.serviceStartDate = "2025-02-17";

    expect(
      resolveValueBinding(profile, {
        type: "DERIVED",
        recipe: "YEAR_MONTH",
        profileFieldKey: "military.military.serviceStartDate",
      }),
    ).toMatchObject({ status: "resolved", value: "2025-02" });
  });

  it("resolves an option from the policy lookup for its university row", () => {
    const profile = createEmptyProfile();
    profile.education.push(
      {
        id: "university-1",
        sectionId: "university",
        values: { degreeLevel: "전문학사" },
      },
      {
        id: "university-2",
        sectionId: "university",
        values: { degreeLevel: "학사" },
      },
    );

    expect(
      resolveValueBinding(
        profile,
        {
          type: "LOOKUP",
          profileFieldKey: "education.university.degreeLevel",
          optionMap: {
            전문학사: "전문대학(전문학사)",
            학사: "대학(학사)",
          },
        },
        1,
      ),
    ).toMatchObject({ status: "resolved", value: "대학(학사)" });
  });

  it("resolves latest education saved on a high-school entry", () => {
    const profile = createEmptyProfile();
    profile.education.push({
      id: "high-school-1",
      sectionId: "highSchool",
      values: { latestEducationType: "고등학교" },
    });

    expect(
      resolveValueBinding(profile, {
        type: "DIRECT",
        profileFieldKey: "education.university.latestEducationType",
      }),
    ).toMatchObject({ status: "resolved", value: "고등학교" });
  });
});
