import { describe, expect, it } from "vitest";
import { PROFILE_CATEGORIES } from "./field-definitions";

describe("university profile fields", () => {
  it("includes transfer, major status, GPA scale, and latest education fields", () => {
    const university = PROFILE_CATEGORIES.find(
      (c) => c.id === "education",
    )?.sections.find((s) => s.id === "university");
    expect(university?.fields.map((field) => field.id)).toEqual(
      expect.arrayContaining([
        "transferStatus",
        "doubleMajorStatus",
        "minorStatus",
        "gpaScale",
        "gpaScore",
      ]),
    );
    expect(
      PROFILE_CATEGORIES.find((c) => c.id === "education")?.topLevelFields?.map(
        (field) => field.id,
      ),
    ).toContain("latestEducationType");
    expect(
      university?.fields.find((field) => field.id === "transferStatus")
        ?.inputType,
    ).toBe("select");
  });

  it("collects academic process, enrolment status, school region, and total credits", () => {
    const education = PROFILE_CATEGORIES.find(
      (category) => category.id === "education",
    );
    const highSchool = education?.sections.find(
      (section) => section.id === "highSchool",
    );
    const university = education?.sections.find(
      (section) => section.id === "university",
    );
    const graduate = education?.sections.find(
      (section) => section.id === "graduateSchool",
    );

    expect(highSchool?.fields.map((field) => field.id)).toEqual(
      expect.arrayContaining([
        "academicProcess",
        "completionStatus",
        "schoolRegion",
      ]),
    );
    expect(
      highSchool?.fields.find((field) => field.id === "academicProcess")
        ?.options,
    ).toEqual(["고등학교", "대입 검정고시"]);
    expect(
      highSchool?.fields.find((field) => field.id === "attendanceType"),
    ).toMatchObject({
      label: "주·야간",
      inputType: "select",
      options: [
        { value: "attendance:day", label: "주간" },
        { value: "attendance:night", label: "야간" },
      ],
    });
    const qualificationPassDate = highSchool?.fields.find(
      (field) => field.id === "qualificationPassDate",
    );
    expect(qualificationPassDate).toMatchObject({
      label: "합격일자",
      inputType: "date",
    });
    expect(
      qualificationPassDate?.visibleWhen?.({
        academicProcess: "대입 검정고시",
      }),
    ).toBe(true);
    expect(
      qualificationPassDate?.visibleWhen?.({ academicProcess: "고등학교" }),
    ).toBe(false);
    expect(university?.fields.map((field) => field.id)).toEqual(
      expect.arrayContaining([
        "completionStatus",
        "schoolRegion",
        "totalCredits",
      ]),
    );
    expect(
      university?.fields.find((field) => field.id === "degreeLevel"),
    ).toMatchObject({
      label: "학위구분",
      inputType: "select",
      options: ["전문학사", "학사"],
    });
    expect(
      university?.fields.find((field) => field.id === "attendanceType"),
    ).toMatchObject({
      label: "주·야간",
      inputType: "select",
      options: expect.arrayContaining([
        { value: "attendance:day", label: "주간" },
        { value: "attendance:night", label: "야간" },
      ]),
    });
    expect(
      graduate?.fields.find((field) => field.id === "attendanceType"),
    ).toMatchObject({
      label: "주·야간",
      inputType: "select",
      options: expect.arrayContaining([
        { value: "attendance:day", label: "주간" },
        { value: "attendance:night", label: "야간" },
      ]),
    });
    [highSchool, university, graduate].forEach((section) => {
      expect(
        section?.fields.find((field) => field.id === "schoolRegion"),
      ).toMatchObject({
        inputType: "select",
        options: expect.arrayContaining([
          { value: "region:seoul", label: "서울" },
          { value: "region:overseas", label: "해외" },
        ]),
      });
    });
  });
});

describe("language profile fields", () => {
  it("leaves language test details as free text", () => {
    const languageTest = PROFILE_CATEGORIES.find(
      (category) => category.id === "languages",
    )?.sections.find((section) => section.id === "languageTest");
    const languageSkill = PROFILE_CATEGORIES.find(
      (category) => category.id === "languages",
    )?.sections.find((section) => section.id === "languageSkill");

    expect(
      languageTest?.fields.find((field) => field.id === "language"),
    ).toMatchObject({
      inputType: "text",
    });
    expect(
      languageTest?.fields.find((field) => field.id === "testName"),
    ).toMatchObject({
      inputType: "text",
    });
    expect(
      languageTest?.fields.find((field) => field.id === "grade"),
    ).toMatchObject({
      inputType: "text",
    });
    expect(
      languageSkill?.fields.find((field) => field.id === "language"),
    ).toMatchObject({
      inputType: "text",
    });
  });
});

describe("contact and disability profile fields", () => {
  it("exposes supplementary contact and disability registration fields for profile entry", () => {
    const contact = PROFILE_CATEGORIES.find(
      (category) => category.id === "contact",
    )?.sections.find((section) => section.id === "contact");
    const disability = PROFILE_CATEGORIES.find(
      (category) => category.id === "disability",
    )?.sections.find((section) => section.id === "disability");

    expect(contact?.fields).toEqual(
      expect.arrayContaining([
        { id: "secondaryEmail", label: "보조 이메일", inputType: "email" },
        { id: "residenceCountry", label: "거주 국가", inputType: "text" },
      ]),
    );
    expect(
      contact?.fields.find((field) => field.id === "phoneNumber"),
    ).toMatchObject({
      inputType: "tel",
      placeholder: "숫자만 입력해주세요",
    });
    expect(
      contact?.fields.find((field) => field.id === "emergencyPhoneNumber"),
    ).toMatchObject({
      inputType: "tel",
      placeholder: "숫자만 입력해주세요",
    });
    expect(disability?.fields).toEqual(
      expect.arrayContaining([
        {
          id: "disabilityRegistrationNumber",
          label: "장애등록번호",
          inputType: "text",
        },
      ]),
    );
  });
});

describe("Hyundai profile additions", () => {
  it("exposes graduate research, compensation, and publication fields", () => {
    const education = PROFILE_CATEGORIES.find(
      (category) => category.id === "education",
    );
    const graduate = education?.sections.find(
      (section) => section.id === "graduateSchool",
    );
    const compensation = PROFILE_CATEGORIES.find(
      (category) => category.id === "compensation",
    );
    const publications = PROFILE_CATEGORIES.find(
      (category) => category.id === "publications",
    );

    expect(graduate?.fields.map((field) => field.id)).toEqual(
      expect.arrayContaining([
        "labName",
        "labProfessorName",
        "thesisTitle",
        "thesisSummary",
      ]),
    );
    expect(compensation?.sections[0]?.fields.map((field) => field.id)).toEqual([
      "desiredPosition",
      "desiredSalary",
      "previousSalary",
    ]);
    expect(publications?.sections[0]?.fields.map((field) => field.id)).toEqual([
      "type",
      "title",
      "details",
    ]);
  });
});
