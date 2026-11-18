import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { resolveChoiceOption } from "./choice-option";
import { resolveValueBinding } from "./value-binding";

const options = (...names: string[]) =>
  names.map((displayName, index) => ({ optionId: `o${index}`, displayName }));

function profileWith(grade: string, relation: string) {
  const profile = createEmptyProfile();
  profile.disability.disabilityGrade = grade;
  profile.veteran.veteranRelation = relation;
  return profile;
}

const direct = (key: string) => ({ type: "DIRECT" as const, profileFieldKey: key });
const GRADE = "disability.disability.disabilityGrade";
const RELATION = "veteran.veteran.veteranRelation";

describe("disability grade and veteran relation as profile choices", () => {
  it("reads a stored choice as the label adapters already map", () => {
    const profile = profileWith("disability-grade:severe", "veteran-relation:son");
    expect(resolveValueBinding(profile, direct(GRADE))).toMatchObject({ value: "중증" });
    expect(resolveValueBinding(profile, direct(RELATION))).toMatchObject({ value: "아들" });
  });

  it("keeps understanding free text saved before the fields became choices", () => {
    const profile = profileWith("심한장애", "자녀");
    expect(resolveValueBinding(profile, direct(GRADE))).toMatchObject({ value: "중증" });
    expect(resolveValueBinding(profile, direct(RELATION))).toMatchObject({ value: "자녀" });
  });

  it("lets a son reach an adapter that only knows 자녀", () => {
    const profile = profileWith("", "veteran-relation:son");
    expect(
      resolveValueBinding(profile, {
        type: "LOOKUP",
        profileFieldKey: RELATION,
        optionMap: { 자녀: "자녀", 배우자: "배우자" },
      }),
    ).toMatchObject({ value: "자녀" });
  });

  it("picks 아들 on a site that splits children, but never guesses for legacy 자녀", () => {
    const relations = options("부", "모", "아들", "딸", "본인", "기타");
    expect(resolveChoiceOption(RELATION, "veteran-relation:son", relations)).toMatchObject({
      status: "unique",
      option: { displayName: "아들" },
    });
    expect(resolveChoiceOption(RELATION, "자녀", relations).status).not.toBe("unique");
  });

  it("picks 아들 when the stored choice arrives as its label", () => {
    const relations = options("부", "모", "아들", "딸", "본인", "기타");
    expect(resolveChoiceOption(RELATION, "아들", relations)).toMatchObject({
      status: "unique",
      option: { displayName: "아들" },
    });
  });
});
