import { describe, expect, it } from "vitest";
import { gradeGenericField, type GradeFieldInput } from "./field-grading";

const base: GradeFieldInput = {
  profileFieldKey: "personal.personal.koreanFamilyName",
  confidence: 0.85,
  categoryConfirmed: true,
  hasProfileValue: true,
  control: "text",
  displayName: "성",
};
const input = (override: Partial<GradeFieldInput>): GradeFieldInput => ({
  ...base,
  ...override,
});

describe("gradeGenericField other-person composite name recipes", () => {
  const blocked = { grade: "BLOCKED", reason: "OTHER_PERSON_CONTEXT" };
  const recipeInput = (
    recipe:
      | "KOREAN_FULL_NAME"
      | "ENGLISH_FULL_NAME_GIVEN_FIRST"
      | "ENGLISH_FULL_NAME_FAMILY_FIRST",
    override: Partial<GradeFieldInput> = {},
  ): GradeFieldInput => ({
    confidence: 0.95,
    categoryConfirmed: true,
    hasProfileValue: true,
    control: "text",
    displayName: "이름",
    composite: { type: "DERIVED", recipe },
    ...override,
  });

  it.each([
    ["KOREAN_FULL_NAME", "추천인 성명"],
    ["KOREAN_FULL_NAME", "보증인 성명"],
    ["ENGLISH_FULL_NAME_GIVEN_FIRST", "Guardian name"],
    ["ENGLISH_FULL_NAME_FAMILY_FIRST", "보호자 영문 성명"],
    ["ENGLISH_FULL_NAME_GIVEN_FIRST", "Emergency contact name"],
  ] as const)(
    "blocks %s labelled %s even at full confidence",
    (recipe, name) => {
      expect(
        gradeGenericField(
          recipeInput(recipe, { displayName: name, confidence: 1 }),
        ),
      ).toEqual(blocked);
    },
  );

  it.each(["displayName", "label", "title", "placeholder"] as const)(
    "reads the role vocabulary of a recipe field from %s",
    (source) => {
      const text = "추천인 성명";
      const override: Partial<GradeFieldInput> = {
        displayName: "성명",
        ...(source === "displayName" ? { displayName: text } : {}),
        ...(source === "label" ? { labels: [{ source: "label", text }] } : {}),
        ...(source === "title" ? { title: text } : {}),
        ...(source === "placeholder" ? { placeholder: text } : {}),
      };
      expect(
        gradeGenericField(recipeInput("KOREAN_FULL_NAME", override)),
      ).toEqual(blocked);
    },
  );

  it.each([
    ["KOREAN_FULL_NAME", "성명"],
    ["KOREAN_FULL_NAME", "지원자 성명"],
    ["ENGLISH_FULL_NAME_GIVEN_FIRST", "영문 이름"],
    ["ENGLISH_FULL_NAME_FAMILY_FIRST", "Full name"],
  ] as const)(
    "keeps the applicant's own %s field labelled %s unchanged",
    (recipe, name) => {
      expect(
        gradeGenericField(recipeInput(recipe, { displayName: name })),
      ).toEqual({
        grade: "AUTO",
      });
    },
  );

  it("keeps the safety order: a missing profile value is reported first", () => {
    expect(
      gradeGenericField(
        recipeInput("KOREAN_FULL_NAME", {
          displayName: "추천인 성명",
          hasProfileValue: false,
        }),
      ),
    ).toEqual({ grade: "BLOCKED", reason: "NO_PROFILE_VALUE" });
  });
});

describe("gradeGenericField unpaired English name part", () => {
  const given = "personal.personal.englishGivenName";
  const family = "personal.personal.englishFamilyName";
  const review = { grade: "REVIEW", reason: "UNPAIRED_NAME_PART" };
  const single = (override: Partial<GradeFieldInput> = {}) =>
    input({
      profileFieldKey: given,
      displayName: "영문 이름",
      sectionSiblingKeys: [],
      ...override,
    });

  it.each([given, family])(
    "downgrades %s matched without its pair to REVIEW",
    (key) => {
      expect(gradeGenericField(single({ profileFieldKey: key }))).toEqual(
        review,
      );
      expect(
        gradeGenericField(
          single({
            profileFieldKey: key,
            sectionSiblingKeys: [
              "personal.personal.koreanFamilyName",
              "contact.contact.email",
            ],
          }),
        ),
      ).toEqual(review);
    },
  );

  it("treats a missing sibling list as no pair", () => {
    expect(
      gradeGenericField(single({ sectionSiblingKeys: undefined })),
    ).toEqual(review);
  });

  it("reports the partial-name risk before an unconfirmed category", () => {
    expect(gradeGenericField(single({ categoryConfirmed: false }))).toEqual(
      review,
    );
  });

  it.each([
    [given, family],
    [family, given],
  ])(
    "keeps %s AUTO when its pair %s is matched in the same section",
    (key, pair) => {
      expect(
        gradeGenericField(
          single({ profileFieldKey: key, sectionSiblingKeys: [pair] }),
        ),
      ).toEqual({ grade: "AUTO" });
    },
  );

  it("keeps non-name keys and name recipes unaffected", () => {
    expect(gradeGenericField(input({ sectionSiblingKeys: [] }))).toEqual({
      grade: "AUTO",
    });
    expect(
      gradeGenericField(
        single({
          profileFieldKey: undefined,
          composite: {
            type: "DERIVED",
            recipe: "ENGLISH_FULL_NAME_GIVEN_FIRST",
          },
        }),
      ),
    ).toEqual({ grade: "AUTO" });
  });

  it("never lifts a lower grade: low confidence stays BLOCKED, moderate stays REVIEW", () => {
    expect(gradeGenericField(single({ confidence: 0.4 }))).toEqual({
      grade: "BLOCKED",
      reason: "LOW_CONFIDENCE",
    });
    expect(gradeGenericField(single({ confidence: 0.6 }))).toEqual({
      grade: "REVIEW",
      reason: "MODERATE_CONFIDENCE",
    });
  });

  it("keeps other-person blocking ahead of the pair check", () => {
    expect(
      gradeGenericField(single({ displayName: "추천인 영문 이름" })),
    ).toEqual({
      grade: "BLOCKED",
      reason: "OTHER_PERSON_CONTEXT",
    });
  });
});
