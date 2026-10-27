import { describe, expect, it } from "vitest";
import { matchCompositeMilitaryOption } from "./standard-option-match";
import { createEmptyProfile } from "../../profile/model";
import { resolveValueBinding } from "./value-binding";
import { resolveChoiceOption } from "./choice-option";

const options = (...names: string[]) =>
  names.map((displayName, index) => ({ optionId: `o${index}`, displayName }));

describe("composite military evidence", () => {
  const choices = options(
    "병역필_현역(병)", "병역필_현역(장교)", "병역필_현역(부사관)",
    "병역필_사회복무", "병역필_전문연구", "병역필_산업기능", "면제", "미필", "해당없음",
  );
  it("uses service type before applying an enlisted rank", () => {
    expect(matchCompositeMilitaryOption("military-status:served", "military-rank:byeongjang", choices, "공익근무요원"))
      .toMatchObject({ status: "unique", option: { displayName: "병역필_사회복무" } });
  });
  it("rejects a sole option contradicted by the service type", () => {
    expect(matchCompositeMilitaryOption("military-status:served", undefined, options("병역필_전문연구"), "산업기능요원").status)
      .toBe("none");
  });
  it("uses officer and NCO ranks to resolve active service", () => {
    expect(matchCompositeMilitaryOption("military-status:served", "중위", choices, "현역"))
      .toMatchObject({ status: "unique", option: { displayName: "병역필_현역(장교)" } });
    expect(matchCompositeMilitaryOption("military-status:served", "중사", choices, "현역"))
      .toMatchObject({ status: "unique", option: { displayName: "병역필_현역(부사관)" } });
  });
  it("leaves insufficient or duplicate evidence ambiguous", () => {
    expect(matchCompositeMilitaryOption("military-status:served", undefined, choices).status).toBe("ambiguous");
    expect(matchCompositeMilitaryOption("military-status:served", "병장", options("병역필_현역(병)", "병역필_현역(병)")).status).toBe("ambiguous");
  });
  it("binds a locally resolved option under the generic stored and normalized keys", () => {
    const profile = createEmptyProfile();
    profile.veteran.veteranStatus = "veteran-status:eligible";
    const selected = resolveChoiceOption(
      "veteran.veteran.veteranStatus",
      profile.veteran.veteranStatus,
      options("해당", "비해당"),
    );
    expect(selected.status).toBe("unique");
    if (selected.status !== "unique") throw Error("missing choice");
    // Generic analysis keys the option under the stored value and the value the
    // binding normalizes it to (generic-analysis boundChoiceKey).
    const bound = resolveValueBinding(profile, {
      type: "DIRECT",
      profileFieldKey: "veteran.veteran.veteranStatus",
    });
    if (bound.status !== "resolved") throw Error("missing value");
    expect(resolveValueBinding(profile, {
      type: "LOOKUP",
      profileFieldKey: "veteran.veteran.veteranStatus",
      optionMap: {
        [profile.veteran.veteranStatus]: selected.option.displayName,
        [bound.value]: selected.option.displayName,
      },
    })).toMatchObject({ status: "resolved", value: "해당" });
  });
});

describe("employment type aliases", () => {
  const key = "careers.career.employmentType";
  const choices = options("근무형태", "정규직", "기간제(계약직)", "인턴", "프리랜서", "파견직", "병역특례", "개인사업");
  it.each([
    ["정규", "정규직"],
    ["계약", "기간제(계약직)"],
    ["파견", "파견직"],
    ["인턴", "인턴"],
  ])("maps %s to %s", (value, displayName) => {
    expect(resolveChoiceOption(key, value, choices)).toMatchObject({ status: "unique", option: { displayName } });
  });
  it("stays ambiguous when two contract labels are offered", () => {
    expect(resolveChoiceOption(key, "계약", options("계약직", "기간제")).status).toBe("ambiguous");
  });
  it("does not apply employment status synonyms to the employment type", () => {
    expect(resolveChoiceOption(key, "재직중", options("재직", "퇴직")).status).toBe("none");
  });
  it("does not apply employment aliases to other keys", () => {
    expect(resolveChoiceOption("careers.career.position", "정규", options("정규직")).status).toBe("none");
  });
});

describe("employment status synonyms", () => {
  const key = "careers.career.employmentStatus";
  it.each([
    ["재직중", ["재직", "퇴직"], "재직"],
    ["퇴사", ["재직", "퇴직"], "퇴직"],
    ["재직중", ["재직 중", "퇴사함"], "재직 중"],
    ["퇴사", ["근무중", "퇴사함"], "퇴사함"],
    ["재직중", ["선택", "현직", "퇴직"], "현직"],
  ])("maps %s among %j to %s", (value, names, displayName) => {
    expect(resolveChoiceOption(key, value, options(...names))).toMatchObject({ status: "unique", option: { displayName } });
  });
  it("stays ambiguous when one meaning has two labels", () => {
    expect(resolveChoiceOption(key, "퇴사", options("퇴사", "퇴직")).status).toBe("ambiguous");
  });
  it("does not match an unrelated label", () => {
    expect(resolveChoiceOption(key, "재직중", options("휴직", "퇴직")).status).toBe("none");
  });
});

describe("national technical grade fallback", () => {
  it.each(["기능장", "기사"])("selects 기타 for %s when the grade is not offered", (grade) => {
    expect(resolveChoiceOption("certifications.certificate.grade", grade, options("1급", "2급", "기타")))
      .toMatchObject({ status: "unique", option: { displayName: "기타" }, reason: "GRADE_OTHER_OPTION" });
  });
});

describe("gender aliases", () => {
  const genders = options("선택하세요.", "논바이너리", "여성", "남성");
  it.each([["논바이너리", "논바이너리"], ["Non-binary", "논바이너리"], ["nonbinary", "논바이너리"], ["남자", "남성"], ["Female", "여성"]])(
    "maps %s to %s",
    (value, expected) => {
      expect(resolveChoiceOption("personal.personal.gender", value, genders)).toMatchObject({
        status: "unique",
        option: { displayName: expected },
      });
    },
  );
  it("does not guess an unrelated value", () => {
    expect(resolveChoiceOption("personal.personal.gender", "가나다", genders).status).not.toBe("unique");
  });
});
