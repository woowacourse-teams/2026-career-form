import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { resolveValueBinding } from "./value-binding";
import type { ValueBinding } from "../api/types";

function profileWith(key: string, value: string) {
  const profile = createEmptyProfile();
  const [category, , field] = key.split(".") as [
    "military" | "veteran" | "disability",
    string,
    string,
  ];
  profile[category][field] = value;
  return profile;
}

const militaryKey = "military.military.militaryStatus";
const veteranKey = "veteran.veteran.veteranStatus";
const disabilityKey = "disability.disability.disabilityStatus";

describe("field-scoped profile selection bindings", () => {
  it.each([
    [militaryKey, "military-status:served", "군필"],
    [militaryKey, "military-status:serving", "복무중"],
    [militaryKey, "military-status:not-served", "미필"],
    [militaryKey, "military-status:exempt", "면제"],
    [militaryKey, "military-status:not-applicable", "비대상"],
    ["military.military.militaryBranch", "military-branch:army", "육군"],
    ["military.military.militaryRank", "military-rank:byeongjang", "병장"],
    [veteranKey, "veteran-status:eligible", "대상"],
    [veteranKey, "veteran-status:not-eligible", "비대상"],
    [disabilityKey, "disability-status:eligible", "대상"],
    [disabilityKey, "disability-status:not-eligible", "비대상"],
  ])(
    "resolves DIRECT %s / %s to its label without changing storage",
    (key, id, label) => {
      const profile = profileWith(key, id);
      const before = structuredClone(profile);
      expect(
        resolveValueBinding(profile, { type: "DIRECT", profileFieldKey: key }),
      ).toMatchObject({
        status: "resolved",
        value: label,
        standardValueId: id,
      });
      expect(profile).toEqual(before);
    },
  );

  it.each([
    [militaryKey, "만기전역", "군필"],
    [veteranKey, "예", "대상"],
    [veteranKey, "비해당", "비대상"],
    [disabilityKey, "장애", "대상"],
    [disabilityKey, "아니오", "비대상"],
  ])(
    "resolves the explicit legacy alias %s / %s locally",
    (key, raw, label) => {
      const profile = profileWith(key, raw);
      expect(
        resolveValueBinding(profile, { type: "DIRECT", profileFieldKey: key }),
      ).toMatchObject({
        status: "resolved",
        value: label,
      });
      expect(profile).toEqual(profileWith(key, raw));
    },
  );

  it.each([
    [veteranKey, "veteran-status:eligible", "대상"],
    [veteranKey, "veteran-status:not-eligible", "비대상"],
    [disabilityKey, "disability-status:eligible", "대상"],
    [disabilityKey, "disability-status:not-eligible", "비대상"],
    [disabilityKey, "장애", "대상"],
    [disabilityKey, "비장애", "비대상"],
    [veteranKey, " YES ", "대상"],
    [veteranKey, "false", "비대상"],
  ])("resolves BOOLEAN_YN %s / %s without defaulting", (key, raw, label) => {
    expect(
      resolveValueBinding(profileWith(key, raw), {
        type: "DERIVED",
        recipe: "BOOLEAN_YN",
        profileFieldKey: key,
        trueLabel: "대상",
        falseLabel: "비대상",
      }),
    ).toMatchObject({ status: "resolved", value: label });
  });

  it("preserves canonical ID metadata in BOOLEAN_YN", () => {
    expect(
      resolveValueBinding(
        profileWith(disabilityKey, "disability-status:eligible"),
        {
          type: "DERIVED",
          recipe: "BOOLEAN_YN",
          profileFieldKey: disabilityKey,
          trueLabel: "대상",
          falseLabel: "비대상",
        },
      ),
    ).toMatchObject({
      status: "resolved",
      value: "대상",
      standardValueId: "disability-status:eligible",
      sensitive: true,
    });
  });

  it.each(["LOOKUP", "BUTTON_OPTION"] as const)(
    "keeps verified company maps for %s",
    (type) => {
      for (const source of ["military-status:served", "군필", "만기전역"]) {
        const optionMap = {
          군필: "필",
          미필: "미필",
          면제: "면제",
          비대상: "비대상(여성/해외국적)",
        };
        const binding: ValueBinding =
          type === "BUTTON_OPTION"
            ? {
                type,
                profileFieldKey: militaryKey,
                optionMap,
                optionCodeMap: {
                  필: "1",
                  미필: "2",
                  면제: "5",
                  "비대상(여성/해외국적)": "7",
                },
              }
            : { type, profileFieldKey: militaryKey, optionMap };
        expect(
          resolveValueBinding(profileWith(militaryKey, source), binding),
        ).toMatchObject({ status: "resolved", value: "필" });
      }
    },
  );

  it.each([
    [militaryKey, ""],
    [militaryKey, "   "],
    [militaryKey, "의병전역"],
    [militaryKey, "military-status:unknown"],
    [militaryKey, "veteran-status:eligible"],
    [veteranKey, "disability-status:eligible"],
    [veteranKey, "region:seoul"],
    [disabilityKey, "veteran-status:not-eligible"],
    [disabilityKey, "미확인"],
  ])("refuses blank, unknown or foreign-field values %s / %s", (key, raw) => {
    const profile = profileWith(key, raw);
    for (const binding of [
      { type: "DIRECT" as const, profileFieldKey: key },
      {
        type: "DERIVED" as const,
        recipe: "BOOLEAN_YN" as const,
        profileFieldKey: key,
      },
      {
        type: "LOOKUP" as const,
        profileFieldKey: key,
        optionMap: {
          대상: "Y",
          비대상: "N",
          서울: "unsafe",
          의병전역: "unsafe",
        },
      },
    ]) {
      expect(resolveValueBinding(profile, binding)).toMatchObject({
        status: "missing",
      });
    }
    expect(profile).toEqual(profileWith(key, raw));
  });

  it("does not reinterpret unrelated free text", () => {
    const profile = createEmptyProfile();
    profile.veteran.veteranRelation = "예";
    expect(
      resolveValueBinding(profile, {
        type: "DIRECT",
        profileFieldKey: "veteran.veteran.veteranRelation",
      }),
    ).toMatchObject({ status: "resolved", value: "예" });
  });
});
