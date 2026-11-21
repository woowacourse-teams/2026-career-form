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
    "resolves %s for an enabled row or a legacy name without a flag",
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
      expect(resolveValueBinding(profile, binding, 2)).toMatchObject({
        status: "resolved",
        value: "남아있는전공",
        profileEntryId: "missing-flag",
      });
      for (const index of [1, 3]) {
        expect(resolveValueBinding(profile, binding, index)).toMatchObject({
          status: "missing",
        });
      }
      expect(resolveValueBinding(profile, binding)).toMatchObject({
        status: "ambiguous",
      });
    },
  );

  it.each([
    ["highSchool", "region:seoul", "서울"],
    ["university", "서울특별시", "서울"],
    ["university", "광주광역시", "광주"],
  ])(
    "normalizes %s school region %s to %s for autofill",
    (sectionId, storedValue, expectedValue) => {
      const profile = createEmptyProfile();
      profile.education.push({
        id: `education-${sectionId}`,
        sectionId,
        values: { schoolRegion: storedValue },
      });

      expect(
        resolveValueBinding(
          profile,
          {
            type: "DIRECT",
            profileFieldKey: `education.${sectionId}.schoolRegion`,
          },
          0,
        ),
      ).toMatchObject({ status: "resolved", value: expectedValue });
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

  it.each([
    ["퇴직", { 재직중: "WORK", 퇴사: "LEAVE" }],
    ["퇴사", { 재직중: "WORK", 퇴직: "LEAVE" }],
  ])(
    "finds a site code for the employment status %s under its other name",
    (stored, optionMap) => {
      const profile = createEmptyProfile();
      profile.careers.push({
        id: "career-1",
        sectionId: "career",
        values: { employmentStatus: stored },
      });
      expect(
        resolveValueBinding(
          profile,
          {
            type: "LOOKUP",
            profileFieldKey: "careers.career.employmentStatus",
            optionMap,
          },
          0,
        ),
      ).toMatchObject({ status: "resolved", value: "LEAVE" });
    },
  );

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

describe("HANJA_FULL_NAME", () => {
  it("joins both Hanja components without using Korean or English names", () => {
    const profile = createEmptyProfile();
    profile.personal.hanjaFamilyName = " 金 ";
    profile.personal.hanjaGivenName = " 試驗 ";
    profile.personal.englishFamilyName = "Fixture";
    profile.personal.englishGivenName = "Only";
    expect(
      resolveValueBinding(profile, {
        type: "DERIVED",
        recipe: "HANJA_FULL_NAME",
      }),
    ).toMatchObject({ status: "resolved", value: "金試驗" });
  });
  it.each(["hanjaFamilyName", "hanjaGivenName"] as const)(
    "requires %s",
    (missing) => {
      const profile = createEmptyProfile();
      profile.personal.hanjaFamilyName = "金";
      profile.personal.hanjaGivenName = "試驗";
      profile.personal[missing] = " ";
      profile.personal.englishFamilyName = "Fixture";
      profile.personal.englishGivenName = "Only";
      expect(
        resolveValueBinding(profile, {
          type: "DERIVED",
          recipe: "HANJA_FULL_NAME",
        }),
      ).toMatchObject({ status: "missing" });
    },
  );
});

describe("status-locked fields", () => {
  const direct = (profileFieldKey: string) => ({
    type: "DIRECT" as const,
    profileFieldKey,
  });

  it("treats a leftover disability detail as missing for a non-eligible status", () => {
    const profile = createEmptyProfile();
    profile.disability = {
      disabilityStatus: "disability-status:not-eligible",
      disabilityType: "남아있는 값",
    };

    expect(
      resolveValueBinding(
        profile,
        direct("disability.disability.disabilityType"),
      ),
    ).toMatchObject({ status: "missing" });
    expect(
      resolveValueBinding(
        profile,
        direct("disability.disability.disabilityStatus"),
      ),
    ).toMatchObject({
      status: "resolved",
      standardValueId: "disability-status:not-eligible",
    });
  });

  it("resolves the disability detail for an eligible status", () => {
    const profile = createEmptyProfile();
    profile.disability = {
      disabilityStatus: "disability-status:eligible",
      disabilityType: "가상 유형",
    };

    expect(
      resolveValueBinding(
        profile,
        direct("disability.disability.disabilityType"),
      ),
    ).toMatchObject({ status: "resolved", value: "가상 유형" });
  });

  it("separates the military service fields from the exemption reason", () => {
    const profile = createEmptyProfile();
    profile.military = {
      militaryStatus: "military-status:exempt",
      militaryRank: "military-rank:byeongjang",
      exemptionReason: "가상 사유",
    };

    expect(
      resolveValueBinding(profile, direct("military.military.militaryRank")),
    ).toMatchObject({ status: "missing" });
    expect(
      resolveValueBinding(profile, direct("military.military.exemptionReason")),
    ).toMatchObject({ status: "resolved", value: "가상 사유" });
  });

  it("treats a leftover exemption reason as missing for a served status", () => {
    const profile = createEmptyProfile();
    profile.military = {
      militaryStatus: "military-status:served",
      exemptionReason: "남아있는 사유",
    };

    expect(
      resolveValueBinding(profile, direct("military.military.exemptionReason")),
    ).toMatchObject({ status: "missing" });
  });
});
