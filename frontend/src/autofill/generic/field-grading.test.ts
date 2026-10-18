import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FieldCandidate } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  AUTO_CONFIDENCE_MIN,
  REVIEW_CONFIDENCE_MIN,
  gradeGenericField,
  type GradeFieldInput,
} from "./field-grading";

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
const options = (...names: string[]) =>
  names.map((displayName, index) => ({ optionId: `o${index}`, displayName }));

describe("gradeGenericField boundaries", () => {
  it("defines the boundaries in one place", () => {
    expect(AUTO_CONFIDENCE_MIN).toBe(0.8);
    expect(REVIEW_CONFIDENCE_MIN).toBe(0.5);
  });

  it("returns AUTO for a confirmed, checked match above the AUTO boundary", () => {
    expect(gradeGenericField(base)).toEqual({ grade: "AUTO" });
    expect(
      gradeGenericField(input({ confidence: AUTO_CONFIDENCE_MIN })).grade,
    ).toBe("AUTO");
  });

  it("returns REVIEW just below the AUTO boundary down to the REVIEW boundary", () => {
    const below = AUTO_CONFIDENCE_MIN - 0.01;
    expect(gradeGenericField(input({ confidence: below })).grade).toBe("REVIEW");
    expect(
      gradeGenericField(input({ confidence: REVIEW_CONFIDENCE_MIN })).grade,
    ).toBe("REVIEW");
  });

  it("returns BLOCKED below the REVIEW boundary", () => {
    expect(
      gradeGenericField(input({ confidence: REVIEW_CONFIDENCE_MIN - 0.01 })),
    ).toEqual({ grade: "BLOCKED", reason: "LOW_CONFIDENCE" });
  });

  it("returns REVIEW when the category is not confirmed", () => {
    expect(
      gradeGenericField(input({ categoryConfirmed: false, confidence: 0.95 })),
    ).toEqual({ grade: "REVIEW", reason: "CATEGORY_UNCONFIRMED" });
  });

  it("follows the plan wording: low confidence with an unconfirmed category is REVIEW", () => {
    expect(
      gradeGenericField(input({ categoryConfirmed: false, confidence: 0.2 }))
        .grade,
    ).toBe("REVIEW");
  });
});

describe("gradeGenericField checks", () => {
  it.each(["personal.personal.nationality", "contact.contact.residenceCountry"])(
    "blocks %s on a select whose options are country calling codes",
    (profileFieldKey) => {
      expect(
        gradeGenericField(
          input({
            profileFieldKey,
            confidence: 0.95,
            control: "select",
            options: options("+82", "+1", "+81"),
          }),
        ),
      ).toEqual({ grade: "BLOCKED", reason: "COUNTRY_CODE_OPTIONS" });
    },
  );

  it("does not block a nationality select with ordinary options", () => {
    expect(
      gradeGenericField(
        input({
          profileFieldKey: "personal.personal.nationality",
          control: "select",
          options: options("대한민국", "미국", "+82"),
        }),
      ).grade,
    ).toBe("AUTO");
  });

  it("does not apply the country code check to other keys", () => {
    expect(
      gradeGenericField(
        input({
          profileFieldKey: "contact.contact.phoneNumber",
          control: "select",
          options: options("+82", "+1", "+81"),
        }),
      ).grade,
    ).toBe("AUTO");
  });

  it.each<[string, Partial<GradeFieldInput>]>([
    ["a select", { control: "select" }],
    ["a radio group", { control: "radio" }],
    ["a checkbox", { control: "checkbox" }],
    ["an email-typed input", { control: "text", inputType: "email" }],
  ])("blocks a date key matched to %s", (_name, override) => {
    expect(
      gradeGenericField(
        input({ profileFieldKey: "personal.personal.birthDate", ...override }),
      ),
    ).toEqual({ grade: "BLOCKED", reason: "NON_DATE_FIELD" });
  });

  it.each<[string, Partial<GradeFieldInput>]>([
    ["a plain text input", { control: "text" }],
    ["a date-typed input", { control: "text", inputType: "date" }],
    ["a textarea", { control: "textarea" }],
  ])("does not block a date key matched to %s", (_name, override) => {
    expect(
      gradeGenericField(
        input({ profileFieldKey: "personal.personal.birthDate", ...override }),
      ).grade,
    ).toBe("AUTO");
  });

  it("does not treat a non-date key on a select as a date mismatch", () => {
    expect(
      gradeGenericField(input({ control: "select" })).reason,
    ).toBeUndefined();
  });

  it("blocks mixed education record keys in the same repeat row", () => {
    expect(
      gradeGenericField(
        input({
          profileFieldKey: "education.university.schoolName",
          rowSiblings: [
            { profileFieldKey: "education.graduateSchool.major", confidence: 0.9 },
          ],
        }),
      ),
    ).toEqual({ grade: "BLOCKED", reason: "MIXED_EDUCATION_RECORD" });
  });

  it("keeps a row with one education record kind and unrelated keys", () => {
    expect(
      gradeGenericField(
        input({
          profileFieldKey: "education.university.schoolName",
          rowSiblings: [
            { profileFieldKey: "education.university.major", confidence: 0.9 },
            { profileFieldKey: "contact.contact.email", confidence: 0.9 },
          ],
        }),
      ).grade,
    ).toBe("AUTO");
  });

  it("demotes only the lower-confidence side of a duplicate key in a row", () => {
    const key = "contact.contact.email";
    expect(
      gradeGenericField(
        input({
          profileFieldKey: key,
          confidence: 0.9,
          rowSiblings: [{ profileFieldKey: key, confidence: 0.85 }],
        }),
      ),
    ).toEqual({ grade: "AUTO" });
    expect(
      gradeGenericField(
        input({
          profileFieldKey: key,
          confidence: 0.85,
          rowSiblings: [{ profileFieldKey: key, confidence: 0.9 }],
        }),
      ),
    ).toEqual({ grade: "REVIEW", reason: "DUPLICATE_KEY_IN_ROW" });
  });

  it("blocks a field with no profile value", () => {
    expect(gradeGenericField(input({ hasProfileValue: false }))).toEqual({
      grade: "BLOCKED",
      reason: "NO_PROFILE_VALUE",
    });
  });
});

type Mock = {
  key: string;
  confidence: number;
  confirmed?: boolean;
  hasValue?: boolean;
  grade: "AUTO" | "REVIEW" | "BLOCKED";
  row?: string;
};

function collectFields(name: string): FieldCandidate[] {
  document.body.innerHTML = readFileSync(
    join(process.cwd(), `fixtures/dom-snapshots/${name}/sanitized.html`),
    "utf8",
  );
  return collectFieldsSnapshot(document).request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

function gradeTable(name: string, table: Record<string, Mock>) {
  const fields = collectFields(name);
  const entries = Object.entries(table).map(([displayName, mock]) => {
    const field = fields.find((candidate) => candidate.displayName === displayName);
    if (!field) throw new Error(`fixture field missing: ${displayName}`);
    return { displayName, mock, field };
  });
  return Object.fromEntries(
    entries.map(({ displayName, mock, field }) => {
      const rowSiblings = entries
        .filter(
          (other) =>
            other.displayName !== displayName &&
            mock.row !== undefined &&
            other.mock.row === mock.row,
        )
        .map((other) => ({
          profileFieldKey: other.mock.key,
          confidence: other.mock.confidence,
        }));
      const result = gradeGenericField({
        profileFieldKey: mock.key,
        confidence: mock.confidence,
        categoryConfirmed: mock.confirmed ?? true,
        hasProfileValue: mock.hasValue ?? true,
        control: field.control,
        displayName: field.displayName,
        labels: field.semanticContext?.labels,
        inputType: field.semanticContext?.inputType,
        options: field.options,
        rowSiblings,
      });
      return [displayName, result.grade];
    }),
  );
}

afterEach(() => document.body.replaceChildren());

// Fixed mock match results over sanitized structure; synthetic, not live evidence.
describe("gradeGenericField on sanitized fixtures", () => {
  it("grades lg-ai-research-birth-split-email fields as listed", () => {
    const table: Record<string, Mock> = {
      "이름 *": { key: "personal.personal.koreanFamilyName", confidence: 0.9, grade: "AUTO" },
      "전화번호 *": { key: "contact.contact.phoneNumber", confidence: 0.8, grade: "AUTO" },
      "성별 *": { key: "personal.personal.gender", confidence: 0.65, grade: "REVIEW" },
      "년": { key: "personal.personal.birthDate", confidence: 0.9, grade: "BLOCKED" },
      "이메일 아이디": { key: "contact.contact.email", confidence: 0.7, confirmed: false, grade: "REVIEW" },
      "링크": { key: "contact.contact.addressLine2", confidence: 0.9, hasValue: false, grade: "BLOCKED" },
      "선택하세요.": { key: "personal.personal.nationality", confidence: 0.95, grade: "AUTO" },
    };
    expect(gradeTable("lg-ai-research-birth-split-email", table)).toEqual(
      Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.grade])),
    );
  }, 30_000);

  it("grades sk-careers-application-form fields as listed", () => {
    const table: Record<string, Mock> = {
      "성명 *": { key: "personal.personal.koreanFamilyName", confidence: 0.95, grade: "AUTO" },
      "생년월일 *": { key: "personal.personal.birthDate", confidence: 0.9, grade: "AUTO" },
      "휴대폰 번호 *": { key: "contact.contact.phoneNumber", confidence: 0.85, grade: "AUTO" },
      "이메일 *": { key: "contact.contact.email", confidence: 0.9, grade: "AUTO", row: "contact" },
      "보조 이메일": { key: "contact.contact.email", confidence: 0.8, grade: "REVIEW", row: "contact" },
      "병역구분 *": { key: "military.military.status", confidence: 0.4, grade: "BLOCKED" },
      "대학 학교명 1*": { key: "education.university.schoolName", confidence: 0.9, grade: "BLOCKED", row: "edu" },
      "대학원 학교명 1": { key: "education.graduateSchool.schoolName", confidence: 0.9, grade: "BLOCKED", row: "edu" },
      "대학 전공 1*": { key: "education.university.major", confidence: 0.9, grade: "AUTO" },
    };
    expect(gradeTable("sk-careers-application-form", table)).toEqual(
      Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.grade])),
    );
  }, 30_000);
});

describe("gradeGenericField other-person context", () => {
  const blocked = { grade: "BLOCKED", reason: "OTHER_PERSON_CONTEXT" };

  it.each([
    ["contact.contact.phoneNumber", "추천인 연락처"],
    ["contact.contact.email", "추천인 이메일"],
    ["personal.personal.koreanFamilyName", "보증인 성명"],
    ["contact.contact.addressLine1", "보호자 주소"],
    ["contact.contact.phoneNumber", "비상연락 전화번호"],
    ["contact.contact.phoneNumber", "법정대리인 휴대전화"],
    ["personal.personal.englishGivenName", "Referrer name"],
    ["contact.contact.email", "Guarantor email"],
    ["contact.contact.phoneNumber", "Guardian phone"],
    ["contact.contact.phoneNumber", "Emergency contact phone"],
  ])("blocks %s labelled %s even at full confidence", (profileFieldKey, name) => {
    expect(
      gradeGenericField(input({ profileFieldKey, displayName: name, confidence: 1 })),
    ).toEqual(blocked);
  });

  it.each(["displayName", "label", "title", "placeholder"] as const)(
    "reads the role vocabulary from %s",
    (source) => {
      const text = "추천인 연락처";
      const override: Partial<GradeFieldInput> = {
        profileFieldKey: "contact.contact.phoneNumber",
        displayName: "연락처",
        ...(source === "displayName" ? { displayName: text } : {}),
        ...(source === "label" ? { labels: [{ source: "label", text }] } : {}),
        ...(source === "title" ? { title: text } : {}),
        ...(source === "placeholder" ? { placeholder: text } : {}),
      };
      expect(gradeGenericField(input(override))).toEqual(blocked);
    },
  );

  it("keeps the safety order: missing profile value first, format mismatch after", () => {
    const own = {
      profileFieldKey: "contact.contact.phoneNumber",
      displayName: "추천인 연락처",
    };
    expect(gradeGenericField(input({ ...own, hasProfileValue: false }))).toEqual({
      grade: "BLOCKED",
      reason: "NO_PROFILE_VALUE",
    });
    expect(gradeGenericField(input({ ...own, inputType: "tel" }))).toEqual(blocked);
  });

  it("does not block keys that are not applicant personal or contact keys", () => {
    expect(
      gradeGenericField(
        input({
          profileFieldKey: "contact.contact.emergencyPhoneNumber",
          displayName: "비상연락처",
          inputType: "tel",
        }),
      ),
    ).toEqual({ grade: "AUTO" });
    expect(
      gradeGenericField(
        input({ profileFieldKey: "careers.career.companyName", displayName: "추천인 소속" }),
      ),
    ).toEqual({ grade: "AUTO" });
  });

  it.each([
    ["contact.contact.phoneNumber", "연락처"],
    ["contact.contact.phoneNumber", "휴대전화"],
    ["contact.contact.phoneNumber", "지원자 연락처"],
    ["contact.contact.email", "지원자 이메일"],
    ["personal.personal.koreanFamilyName", "지원자 성명"],
    ["personal.personal.koreanFamilyName", "이름"],
    ["contact.contact.addressLine1", "주소"],
    ["contact.contact.phoneNumber", "Applicant phone"],
  ])("leaves the applicant's own %s field labelled %s unchanged", (profileFieldKey, name) => {
    expect(gradeGenericField(input({ profileFieldKey, displayName: name }))).toEqual({
      grade: "AUTO",
    });
  });
});

// Role-vocabulary evidence from unrelated sanitized structures; keys are fixed
// mocks and the grading input mirrors what generic analysis passes.
describe("gradeGenericField other-person context on sanitized fixtures", () => {
  function gradeByName(name: string, pattern: RegExp, key: string) {
    const field = collectFields(name).find((candidate) =>
      pattern.test(candidate.displayName ?? ""),
    );
    if (!field) throw new Error(`fixture field missing: ${pattern}`);
    return gradeGenericField({
      profileFieldKey: key,
      confidence: 1,
      categoryConfirmed: true,
      hasProfileValue: true,
      control: field.control,
      displayName: field.displayName,
      labels: field.semanticContext?.labels,
      inputType: field.semanticContext?.inputType,
    });
  }
  const blocked = { grade: "BLOCKED", reason: "OTHER_PERSON_CONTEXT" };

  it("blocks referrer fields of kakao-greeting-email", () => {
    expect(gradeByName("kakao-greeting-email", /^추천인 이메일/, "contact.contact.email")).toEqual(blocked);
    expect(gradeByName("kakao-greeting-email", /^추천인 이름/, "personal.personal.koreanFamilyName")).toEqual(blocked);
  }, 30_000);

  it("keeps the applicant's own fields of lg-ai-research-birth-split-email unchanged", () => {
    expect(gradeByName("lg-ai-research-birth-split-email", /^전화번호/, "contact.contact.phoneNumber")).toEqual({ grade: "AUTO" });
    expect(gradeByName("lg-ai-research-birth-split-email", /^이름/, "personal.personal.koreanFamilyName")).toEqual({ grade: "AUTO" });
  }, 30_000);
});

describe("gradeGenericField composite name recipes", () => {
  const recipe = (
    override: Partial<GradeFieldInput> = {},
  ): GradeFieldInput => ({
    confidence: 0.9,
    categoryConfirmed: true,
    hasProfileValue: true,
    control: "text",
    displayName: "이름",
    composite: { type: "DERIVED", recipe: "KOREAN_FULL_NAME" },
    ...override,
  });

  it("grades a recipe field without a profile key by its confidence", () => {
    expect(gradeGenericField(recipe())).toEqual({ grade: "AUTO" });
    expect(gradeGenericField(recipe({ confidence: 0.6 }))).toEqual({
      grade: "REVIEW",
      reason: "MODERATE_CONFIDENCE",
    });
  });

  it("blocks a recipe whose profile values are not all present", () => {
    expect(gradeGenericField(recipe({ hasProfileValue: false }))).toEqual({
      grade: "BLOCKED",
      reason: "NO_PROFILE_VALUE",
    });
  });

  it("treats the same recipe twice in a row as a duplicate and a different recipe as none", () => {
    expect(
      gradeGenericField(
        recipe({
          rowSiblings: [
            {
              composite: { type: "DERIVED", recipe: "KOREAN_FULL_NAME" },
              confidence: 0.95,
            },
          ],
        }),
      ),
    ).toEqual({ grade: "REVIEW", reason: "DUPLICATE_KEY_IN_ROW" });
    expect(
      gradeGenericField(
        recipe({
          rowSiblings: [
            {
              composite: {
                type: "DERIVED",
                recipe: "ENGLISH_FULL_NAME_GIVEN_FIRST",
              },
              confidence: 0.95,
            },
          ],
        }),
      ),
    ).toEqual({ grade: "AUTO" });
  });
});

describe("gradeGenericField date part selects", () => {
  const numbered = (from: number, to: number, suffix = "", pad = false) =>
    Array.from({ length: to - from + 1 }, (_, index) => {
      const value = String(from + index);
      return `${pad ? value.padStart(2, "0") : value}${suffix}`;
    });
  const part = (
    datePart: "YEAR" | "MONTH" | "DAY",
    names: string[],
    override: Partial<GradeFieldInput> = {},
  ): GradeFieldInput => ({
    profileFieldKey: "personal.personal.birthDate",
    composite: { type: "DATE_PART", part: datePart, localDate: "2000-01-01" },
    confidence: 0.9,
    categoryConfirmed: true,
    hasProfileValue: true,
    control: "select",
    displayName: "생년월일",
    options: options("선택", ...names),
    ...override,
  });

  it("does not block a date part select as NON_DATE_FIELD but still blocks a plain DIRECT date select", () => {
    expect(
      gradeGenericField(part("YEAR", numbered(1990, 2010))),
    ).toEqual({ grade: "AUTO" });
    expect(
      gradeGenericField(
        input({
          profileFieldKey: "personal.personal.birthDate",
          control: "select",
          options: options("선택", ...numbered(1990, 2010)),
        }),
      ),
    ).toEqual({ grade: "BLOCKED", reason: "NON_DATE_FIELD" });
  });

  it.each([
    ["YEAR", numbered(1990, 2010)],
    ["YEAR", numbered(1990, 2010, "년")],
    ["MONTH", numbered(1, 12)],
    ["MONTH", numbered(1, 12, "월", true)],
    ["DAY", numbered(1, 31, "일")],
    ["DAY", numbered(1, 31, "", true)],
  ] as const)("passes a %s select whose options fit the part", (kind, names) => {
    expect(gradeGenericField(part(kind, names))).toEqual({ grade: "AUTO" });
  });

  it("blocks a text control and options that do not fit the part", () => {
    const mismatch = { grade: "BLOCKED", reason: "DATE_PART_OPTIONS_MISMATCH" };
    expect(
      gradeGenericField(part("YEAR", numbered(1990, 2010), { control: "text" })),
    ).toEqual(mismatch);
    expect(
      gradeGenericField(part("MONTH", ["4.5", "4.0", "3.5", "3.0", "2.5"])),
    ).toEqual(mismatch);
    expect(
      gradeGenericField(part("MONTH", numbered(1990, 2010))),
    ).toEqual(mismatch);
    expect(
      gradeGenericField(part("DAY", numbered(1, 12))),
    ).not.toEqual(mismatch);
    expect(
      gradeGenericField(part("DAY", ["가", "나", "다"])),
    ).toEqual(mismatch);
  });

  it("blocks when the local date part is missing from the options or ambiguous", () => {
    const mismatch = { grade: "BLOCKED", reason: "DATE_PART_OPTIONS_MISMATCH" };
    expect(
      gradeGenericField(part("YEAR", numbered(2005, 2020))),
    ).toEqual(mismatch);
    expect(
      gradeGenericField(part("MONTH", numbered(2, 12))),
    ).toEqual(mismatch);
    expect(
      gradeGenericField(part("MONTH", [...numbered(1, 12), "01월"])),
    ).toEqual(mismatch);
    expect(
      gradeGenericField(
        part("YEAR", numbered(1990, 2010), {
          composite: { type: "DATE_PART", part: "YEAR", localDate: "미입력" },
        }),
      ),
    ).toEqual(mismatch);
  });

  it("treats the same date part twice in a row as a duplicate and another part as none", () => {
    const sibling = (kind: "YEAR" | "MONTH") => ({
      profileFieldKey: "personal.personal.birthDate",
      composite: {
        type: "DATE_PART" as const,
        part: kind,
        localDate: "2000-01-01",
      },
      confidence: 0.95,
    });
    expect(
      gradeGenericField(
        part("YEAR", numbered(1990, 2010), { rowSiblings: [sibling("YEAR")] }),
      ),
    ).toEqual({ grade: "REVIEW", reason: "DUPLICATE_KEY_IN_ROW" });
    expect(
      gradeGenericField(
        part("YEAR", numbered(1990, 2010), { rowSiblings: [sibling("MONTH")] }),
      ),
    ).toEqual({ grade: "AUTO" });
  });
});

describe("gradeGenericField other-person composite name recipes", () => {
  const blocked = { grade: "BLOCKED", reason: "OTHER_PERSON_CONTEXT" };
  const recipeInput = (
    recipe: "KOREAN_FULL_NAME" | "ENGLISH_FULL_NAME_GIVEN_FIRST" | "ENGLISH_FULL_NAME_FAMILY_FIRST",
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
  ] as const)("blocks %s labelled %s even at full confidence", (recipe, name) => {
    expect(
      gradeGenericField(recipeInput(recipe, { displayName: name, confidence: 1 })),
    ).toEqual(blocked);
  });

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
      expect(gradeGenericField(recipeInput("KOREAN_FULL_NAME", override))).toEqual(blocked);
    },
  );

  it.each([
    ["KOREAN_FULL_NAME", "성명"],
    ["KOREAN_FULL_NAME", "지원자 성명"],
    ["ENGLISH_FULL_NAME_GIVEN_FIRST", "영문 이름"],
    ["ENGLISH_FULL_NAME_FAMILY_FIRST", "Full name"],
  ] as const)("keeps the applicant's own %s field labelled %s unchanged", (recipe, name) => {
    expect(gradeGenericField(recipeInput(recipe, { displayName: name }))).toEqual({
      grade: "AUTO",
    });
  });

  it("keeps the safety order: a missing profile value is reported first", () => {
    expect(
      gradeGenericField(recipeInput("KOREAN_FULL_NAME", { displayName: "추천인 성명", hasProfileValue: false })),
    ).toEqual({ grade: "BLOCKED", reason: "NO_PROFILE_VALUE" });
  });
});
