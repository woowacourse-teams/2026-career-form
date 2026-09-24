import { describe, expect, it } from "vitest";

import type { FieldsAnalyzeResponse } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { createEmptyProfile, type Profile } from "../../profile/model";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { ReviewPlanItem } from "./review-plan";
import {
  buildReviewPlan,
  revealSensitiveReviewItem,
  reviewItemsForDisplay,
} from "./review-plan";

function response(
  fields: FieldsAnalyzeResponse["fields"],
  analysisStatus: FieldsAnalyzeResponse["analysisStatus"] = "COMPLETE",
  mode: FieldsAnalyzeResponse["mode"] = "GENERIC",
): FieldsAnalyzeResponse {
  return {
    snapshotId: "snapshot-1",
    mode,
    analysisStatus,
    fields,
  };
}

function registryWithTextField(currentValue = "") {
  const element = document.createElement("input");
  element.type = "email";
  element.value = currentValue;
  document.body.append(element);

  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field-1",
    candidate: {
      candidateId: "field-1",
      element: "input",
      control: "text",
      visibility: "visible",
      displayName: "이메일주소",
    },
    elements: [element],
    optionElements: new Map(),
    sectionId: "section-1",
    signature: createStructuralSignature([element]),
  });

  return registry;
}

function registryWithDateInput({
  placeholder,
  type = "text",
  currentValue = "",
  candidateId = "date-field",
  label = "기록일",
  itemIndex,
}: {
  placeholder?: string;
  type?: string;
  currentValue?: string;
  candidateId?: string;
  label?: string;
  itemIndex?: number;
}) {
  const element = document.createElement("input");
  element.type = type;
  if (placeholder !== undefined) element.placeholder = placeholder;
  element.value = currentValue;
  document.body.append(element);
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId,
    candidate: {
      candidateId,
      element: "input",
      control: "text",
      visibility: "visible",
      displayName: label,
    },
    elements: [element],
    optionElements: new Map(),
    sectionId: "section-date",
    ...(itemIndex !== undefined
      ? { itemIndex, itemId: `date-row-${itemIndex}` }
      : {}),
    signature: createStructuralSignature([element]),
  });
  if (itemIndex !== undefined)
    registry.setFieldItemCount("section-date", itemIndex + 1);
  return { registry, element };
}

function directDateAnalysis(key: string, candidateId = "date-field") {
  return response([
    {
      candidateId,
      matchType: "MATCH",
      valueBinding: { type: "DIRECT", profileFieldKey: key },
      autofillPolicy: "ALLOWED",
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    },
  ]);
}

function registryWithLanguageGradeOptions(options: readonly string[]) {
  const select = document.createElement("select");
  const optionElements = new Map<string, HTMLOptionElement>();
  const placeholder = new Option("등급 선택", "");
  select.append(placeholder);
  const candidates = options.map((displayName, index) => {
    const optionId = `grade-${index + 1}`;
    const option = new Option(displayName, optionId);
    select.append(option);
    optionElements.set(optionId, option);
    return { optionId, displayName };
  });
  document.body.append(select);

  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "language-grade",
    candidate: {
      candidateId: "language-grade",
      element: "select",
      control: "select",
      visibility: "visible",
      displayName: "어학 등급",
      options: candidates,
    },
    elements: [select],
    optionElements,
    sectionId: "section-language",
    itemId: "language-item-1",
    itemIndex: 0,
    itemGroupId: "language",
    signature: createStructuralSignature([select]),
  });
  registry.setFieldItemCount("section-language", 1, "language");
  return registry;
}

function profileWithOpicGrade(grade = "opic:al"): Profile {
  return {
    ...createEmptyProfile(),
    languages: [
      {
        id: "language-1",
        sectionId: "languageTest",
        values: { grade },
      },
    ],
  };
}

const allowedLanguageGrade = {
  candidateId: "language-grade",
  matchType: "MATCH" as const,
  valueBinding: {
    type: "DIRECT" as const,
    profileFieldKey: "languages.languageTest.grade",
  },
  autofillPolicy: "ALLOWED" as const,
  mappingStatus: "ADAPTER_VERIFIED" as const,
  interactionStatus: "READY" as const,
  writePlan: { command: "SELECT_OPTION" as const },
};

const allowedEmail = {
  candidateId: "field-1",
  matchType: "MATCH" as const,
  profileFieldKey: "contact.contact.email",
  autofillPolicy: "ALLOWED" as const,
  mappingStatus: "LLM_SUGGESTED" as const,
  interactionStatus: "READY" as const,
  writePlan: { command: "SET_TEXT" as const },
};

describe("review plan", () => {
  it("preserves a DERIVED YEAR_MONTH value without date conversion", () => {
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "university-1",
        sectionId: "university",
        values: { startDate: "2019-03-15" },
      },
    ];
    const { registry } = registryWithDateInput({
      placeholder: "YYYY.MM",
      itemIndex: 0,
    });
    const [item] = buildReviewPlan({
      analysis: response([
        {
          candidateId: "date-field",
          matchType: "MATCH",
          valueBinding: {
            type: "DERIVED",
            recipe: "YEAR_MONTH",
            profileFieldKey: "education.university.startDate",
          },
          autofillPolicy: "ALLOWED",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ]),
      profile,
      registry,
    }).items;
    expect(item).toMatchObject({
      profileValue: "2019-03",
      previewValue: "2019-03",
    });
    expect(item.dateApproval).toBeUndefined();
  });

  it("uses one live native option matched by a standard profile ID", () => {
    const [item] = buildReviewPlan({
      analysis: response([allowedLanguageGrade]),
      profile: profileWithOpicGrade(),
      registry: registryWithLanguageGradeOptions(["Advanced Low"]),
    }).items;

    expect(item).toMatchObject({
      profileValue: "Advanced Low",
      previewValue: "Advanced Low",
      status: "available",
    });
  });

  it("does not review a standard profile ID when the live option is absent", () => {
    const [item] = buildReviewPlan({
      analysis: response([allowedLanguageGrade]),
      profile: profileWithOpicGrade(),
      registry: registryWithLanguageGradeOptions(["Intermediate High"]),
    }).items;

    expect(item).toMatchObject({ status: "unavailable", selected: false });
  });

  it("does not review a standard profile ID when live aliases are ambiguous", () => {
    const [item] = buildReviewPlan({
      analysis: response([allowedLanguageGrade]),
      profile: profileWithOpicGrade(),
      registry: registryWithLanguageGradeOptions(["AL", "Advanced Low"]),
    }).items;

    expect(item).toMatchObject({ status: "unavailable", selected: false });
  });

  it("previews a derived full name from the local profile", () => {
    const profile = createEmptyProfile();
    profile.personal.koreanFamilyName = "김";
    profile.personal.koreanGivenName = "민수";
    const registry = registryWithTextField();

    const plan = buildReviewPlan({
      analysis: response([
        {
          candidateId: "field-1",
          matchType: "MATCH",
          valueBinding: { type: "DERIVED", recipe: "KOREAN_FULL_NAME" },
          autofillPolicy: "ALLOWED",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ]),
      profile,
      registry,
    });

    expect(plan.items[0]).toMatchObject({
      profileValue: "김민수",
      previewValue: "김민수",
      status: "available",
    });
  });

  it("puts available items first and hides unavailable items for display", () => {
    const item = (
      candidateId: string,
      status: ReviewPlanItem["status"],
    ): ReviewPlanItem => ({
      candidateId,
      fieldLabel: candidateId,
      currentValue: "",
      previewValue: "value",
      status,
      selected: status === "available",
      disabled: status === "unavailable",
      revealed: true,
      reason: "reason",
    });

    expect(
      reviewItemsForDisplay([
        item("unavailable", "unavailable"),
        item("needs-review", "needs-review"),
        item("available-1", "available"),
        item("sensitive", "sensitive"),
        item("available-2", "available"),
        item("conflict", "conflict"),
      ]).map(({ candidateId }) => candidateId),
    ).toEqual([
      "available-1",
      "available-2",
      "needs-review",
      "sensitive",
      "conflict",
    ]);
  });

  it("selects a ready allowed value when the page field is empty", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";

    const plan = buildReviewPlan({
      analysis: response([allowedEmail]),
      profile,
      registry: registryWithTextField(),
    });

    expect(plan).toMatchObject({
      status: "ready",
      items: [
        {
          candidateId: "field-1",
          fieldLabel: "이메일주소",
          currentValue: "",
          previewValue: "me@example.test",
          status: "available",
          selected: true,
          disabled: false,
        },
      ],
    });
  });

  it("treats an auto-created field's site default as blank", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";

    const plan = buildReviewPlan({
      analysis: response([allowedEmail]),
      profile,
      registry: registryWithTextField("site-default@example.test"),
      ignoreCurrentValueCandidateIds: new Set(["field-1"]),
    });

    expect(plan.items[0]).toMatchObject({
      currentValue: "site-default@example.test",
      profileValue: "me@example.test",
      status: "available",
      selected: true,
    });
  });

  it("maps an ungrouped university conditional field to its sole university entry", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      education: [
        {
          id: "university-1",
          sectionId: "university",
          values: { minorStatus: "있음", minorName: "경영학과" },
        },
      ],
    };
    const registry = registryWithTextField();
    const lookup = registry.lookupField("field-1");
    if (lookup.status === "ready") {
      registry.registerField({
        ...lookup.handle,
        itemId: "dynamic-major-item",
        itemIndex: 1,
        itemGroupId: "dynamic-major",
      });
      registry.setFieldItemCount("section-1", 1, "dynamic-major");
    }

    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          profileFieldKey: "education.university.minorName",
          autofillPolicy: "CONDITIONAL" as const,
        },
      ]),
      profile,
      registry,
    }).items;

    expect(item).toMatchObject({
      profileValue: "경영학과",
      profileEntryId: "university-1",
      itemIndex: 0,
      status: "needs-review",
      selected: false,
    });
  });

  it.each(["ALLOWED", "CONDITIONAL"] as const)(
    "preserves repeated row identity and selection policy for %s fields",
    (autofillPolicy) => {
      const first = document.createElement("input");
      const second = document.createElement("input");
      document.body.append(first, second);
      const registry = new CandidateRegistry();
      for (const [index, element] of [first, second].entries()) {
        const candidateId = `field-${index + 1}`;
        registry.registerField({
          kind: "field",
          candidateId,
          candidate: {
            candidateId,
            element: "input",
            control: "text",
            visibility: "visible",
            displayName: "자격증명",
          },
          elements: [element],
          optionElements: new Map(),
          sectionId: "section-certificate",
          itemId: `certificate-item-${index + 1}`,
          itemIndex: index,
          signature: createStructuralSignature([element]),
        });
      }

      const profile: Profile = {
        ...createEmptyProfile(),
        certifications: [
          {
            id: "certificate-1",
            sectionId: "certificate",
            values: { name: "자격증 A" },
          },
          {
            id: "certificate-2",
            sectionId: "certificate",
            values: { name: "자격증 B" },
          },
        ],
      };
      const fields = [0, 1].map((index) => ({
        ...allowedEmail,
        candidateId: `field-${index + 1}`,
        profileFieldKey: "certifications.certificate.name",
        autofillPolicy,
      }));

      expect(
        buildReviewPlan({ analysis: response(fields), profile, registry })
          .items,
      ).toMatchObject([
        {
          profileValue: "자격증 A",
          profileEntryId: "certificate-1",
          itemIndex: 0,
          status: autofillPolicy === "ALLOWED" ? "available" : "needs-review",
          selected: autofillPolicy === "ALLOWED",
          disabled: false,
        },
        {
          profileValue: "자격증 B",
          profileEntryId: "certificate-2",
          itemIndex: 1,
          status: autofillPolicy === "ALLOWED" ? "available" : "needs-review",
          selected: autofillPolicy === "ALLOWED",
          disabled: false,
        },
      ]);
    },
  );

  it("blocks repeated autofill when form and profile row counts differ", () => {
    const registry = registryWithTextField();
    const profile: Profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: { name: "A" },
        },
        {
          id: "certificate-2",
          sectionId: "certificate",
          values: { name: "B" },
        },
      ],
    };

    const [item] = buildReviewPlan({
      analysis: response([
        { ...allowedEmail, profileFieldKey: "certifications.certificate.name" },
      ]),
      profile,
      registry,
    }).items;

    expect(item).toMatchObject({
      status: "unavailable",
      selected: false,
      disabled: true,
    });
  });

  it("blocks a lookup binding when university form and profile row counts differ", () => {
    const select = document.createElement("select");
    const professionalCollege = new Option("전문대학(전문학사)", "associate");
    const university = new Option("대학(학사)", "bachelor");
    select.append(professionalCollege, university);
    document.body.append(select);
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "education-type",
      candidate: {
        candidateId: "education-type",
        element: "select",
        control: "select",
        visibility: "visible",
        displayName: "학업과정",
        options: [
          { optionId: "associate", displayName: "전문대학(전문학사)" },
          { optionId: "bachelor", displayName: "대학(학사)" },
        ],
      },
      elements: [select],
      optionElements: new Map([
        ["associate", professionalCollege],
        ["bachelor", university],
      ]),
      sectionId: "section-education",
      itemId: "university-item-1",
      itemIndex: 0,
      itemGroupId: "university",
      signature: createStructuralSignature([select]),
    });
    registry.setFieldItemCount("section-education", 1, "university");
    const profile: Profile = {
      ...createEmptyProfile(),
      education: [
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
      ],
    };

    const [item] = buildReviewPlan({
      analysis: response([
        {
          candidateId: "education-type",
          matchType: "MATCH",
          valueBinding: {
            type: "LOOKUP",
            profileFieldKey: "education.university.degreeLevel",
            optionMap: {
              전문학사: "전문대학(전문학사)",
              학사: "대학(학사)",
            },
          },
          autofillPolicy: "CONDITIONAL",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SELECT_OPTION" },
        },
      ]),
      profile,
      registry,
    }).items;

    expect(item).toMatchObject({
      status: "unavailable",
      selected: false,
      disabled: true,
    });
  });

  it("counts different repeated education groups independently", () => {
    const highSchool = document.createElement("input");
    const university = document.createElement("input");
    document.body.append(highSchool, university);
    const registry = new CandidateRegistry();
    for (const [candidateId, element, itemGroupId] of [
      ["field-high", highSchool, "educationhigh"],
      ["field-university", university, "educationuniv"],
    ] as const) {
      registry.registerField({
        kind: "field",
        candidateId,
        candidate: {
          candidateId,
          element: "input",
          control: "text",
          visibility: "visible",
          displayName: "학교명",
        },
        elements: [element],
        optionElements: new Map(),
        sectionId: "section-education",
        itemId: `${itemGroupId}-item-1`,
        itemIndex: 0,
        itemGroupId,
        signature: createStructuralSignature([element]),
      });
      registry.setFieldItemCount("section-education", 1, itemGroupId);
    }

    const profile: Profile = {
      ...createEmptyProfile(),
      education: [
        {
          id: "high-school-1",
          sectionId: "highSchool",
          values: { schoolName: "고등학교" },
        },
        {
          id: "university-1",
          sectionId: "university",
          values: { schoolName: "대학교" },
        },
      ],
    };

    const items = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          candidateId: "field-high",
          profileFieldKey: "education.highSchool.schoolName",
        },
        {
          ...allowedEmail,
          candidateId: "field-university",
          profileFieldKey: "education.university.schoolName",
        },
      ]),
      profile,
      registry,
    }).items;

    expect(items).toMatchObject([
      { status: "available", profileValue: "고등학교" },
      { status: "available", profileValue: "대학교" },
    ]);
  });

  it.each([
    [
      "conditional policy",
      { ...allowedEmail, autofillPolicy: "CONDITIONAL" as const },
      "needs-review",
    ],
    ["a current page value", allowedEmail, "conflict"],
  ])("leaves %s unselected", (_name, field, expectedStatus) => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";
    const registry = registryWithTextField(
      expectedStatus === "conflict" ? "already@page.test" : "",
    );

    const [item] = buildReviewPlan({
      analysis: response([field]),
      profile,
      registry,
    }).items;

    expect(item).toMatchObject({
      status: expectedStatus,
      selected: false,
      disabled: false,
    });
  });

  it("masks and disables a sensitive value before the user reveals it", () => {
    const profile = createEmptyProfile();
    profile.compensation.desiredPosition = "군필";
    const registry = registryWithTextField();

    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          profileFieldKey: "compensation.compensation.desiredPosition",
          autofillPolicy: "SENSITIVE_CONFIRMATION",
        },
      ]),
      profile,
      registry,
    }).items;

    expect(item).toMatchObject({
      status: "sensitive",
      previewValue: "••••••••",
      selected: false,
      disabled: true,
      revealed: false,
    });
  });

  it("normalizes a direct value while automatically including it and preserving the stored alias", () => {
    const profile = createEmptyProfile();
    profile.military.militaryStatus = "만기전역";

    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          profileFieldKey: "military.military.militaryStatus",
        },
      ]),
      profile,
      registry: registryWithTextField("군필"),
      normalizeDirectValue: (key, value) =>
        key === "military.military.militaryStatus" && value === "만기전역"
          ? "군필"
          : value,
    }).items;

    expect(item).toMatchObject({
      status: "available",
      profileValue: "군필",
      previewValue: "군필",
      selected: true,
      disabled: false,
    });
    expect(profile.military.militaryStatus).toBe("만기전역");
  });

  it("includes normalized military values even with a legacy sensitive policy", () => {
    const profile = createEmptyProfile();
    profile.military.militaryStatus = "만기전역";

    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          profileFieldKey: "military.military.militaryStatus",
          autofillPolicy: "SENSITIVE_CONFIRMATION",
        },
      ]),
      profile,
      registry: registryWithTextField(),
      normalizeDirectValue: (_key, _value) => "군필",
    }).items;

    expect(item).toMatchObject({
      status: "available",
      profileValue: "군필",
      previewValue: "군필",
      selected: true,
      disabled: false,
      revealed: true,
    });
  });

  it("does not pass derived values through a direct-value normalizer", () => {
    const profile = createEmptyProfile();
    profile.personal.koreanFamilyName = "김";
    profile.personal.koreanGivenName = "민수";

    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          valueBinding: { type: "DERIVED", recipe: "KOREAN_FULL_NAME" },
        },
      ]),
      profile,
      registry: registryWithTextField(),
      normalizeDirectValue: () => {
        throw new Error("derived values must bypass direct normalization");
      },
    }).items;

    expect(item.profileValue).toBe("김민수");
  });

  it("makes unmatched, non-ready, or missing-value fields unavailable", () => {
    const profile = createEmptyProfile();
    const registry = registryWithTextField();

    const plan = buildReviewPlan({
      analysis: response([
        {
          candidateId: "field-1",
          matchType: "NO_MATCH",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "BLOCKED",
          reasonCodes: ["NO_MATCH"],
        },
      ]),
      profile,
      registry,
    });

    expect(plan).toMatchObject({
      status: "ready",
      items: [{ status: "unavailable", selected: false, disabled: true }],
    });
  });

  it("does not make a manual-reveal field selectable even with a saved value", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";

    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          interactionStatus: "MANUAL_REVEAL_REQUIRED",
          writePlan: undefined,
        },
      ]),
      profile,
      registry: registryWithTextField(),
    }).items;

    expect(item).toMatchObject({
      status: "unavailable",
      selected: false,
      disabled: true,
      reason: "현재 상태에서는 안전하게 입력할 수 없습니다.",
    });
  });

  it("reveals a sensitive value only after the explicit reveal action", () => {
    const profile = createEmptyProfile();
    profile.compensation.desiredPosition = "군필";
    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          profileFieldKey: "compensation.compensation.desiredPosition",
          autofillPolicy: "SENSITIVE_CONFIRMATION",
        },
      ]),
      profile,
      registry: registryWithTextField(),
    }).items;

    expect(revealSensitiveReviewItem(item)).toMatchObject({
      previewValue: "군필",
      selected: false,
      disabled: false,
      revealed: true,
    });
  });

  it("leaves a non-date DIRECT field unchanged even when its value looks like a date", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "2001-02-03";
    const registry = registryWithTextField();
    const item = buildReviewPlan({
      analysis: directDateAnalysis("contact.contact.email", "field-1"),
      profile,
      registry,
    }).items[0];
    expect(item).toMatchObject({
      profileValue: "2001-02-03",
      previewValue: "2001-02-03",
    });
    expect(item.dateApproval).toBeUndefined();
  });

  it("does not infer date semantics from a date-like label when the definition is non-date", () => {
    const personal = PROFILE_CATEGORIES.find(
      (category) => category.id === "personal",
    )!;
    const field = personal.sections
      .find((section) => section.id === "personal")!
      .fields.find((item) => item.id === "birthDate")!;
    const originalType = field.inputType;
    Object.assign(field, { inputType: "text" });
    try {
      const profile = createEmptyProfile();
      profile.personal.birthDate = "2001-02-03";
      const { registry } = registryWithDateInput({
        placeholder: "YYYY.MM.DD",
        label: "Date of birth",
      });
      const item = buildReviewPlan({
        analysis: directDateAnalysis("personal.personal.birthDate"),
        profile,
        registry,
      }).items[0];
      expect(item).toMatchObject({
        profileValue: "2001-02-03",
        previewValue: "2001-02-03",
      });
      expect(item.dateApproval).toBeUndefined();
    } finally {
      Object.assign(field, { inputType: originalType });
    }
  });

  it("converts a military date and preserves its existing auto-fill policy", () => {
    const profile = createEmptyProfile();
    profile.military.serviceStartDate = "2018-03-04";
    const { registry } = registryWithDateInput({ placeholder: "YYYY.MM.DD" });
    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...(directDateAnalysis("military.military.serviceStartDate")
            .fields[0] as Extract<
            FieldsAnalyzeResponse["fields"][number],
            { matchType: "MATCH" }
          >),
          autofillPolicy: "SENSITIVE_CONFIRMATION",
        },
      ]),
      profile,
      registry,
    }).items;
    expect(item).toMatchObject({
      status: "available",
      profileValue: "2018.03.04",
      previewValue: "2018.03.04",
      selected: true,
      disabled: false,
      dateApproval: { format: "YYYY.MM.DD" },
    });
  });

  it("masks an individually confirmed real date and retains approval through reveal", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      health: [
        {
          id: "health-1",
          sectionId: "health",
          values: { healthDate: "2020-04-05" },
        },
      ],
    };
    const { registry } = registryWithDateInput({
      placeholder: "YYYY.MM.DD",
      itemIndex: 0,
    });
    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...(directDateAnalysis("health.health.healthDate")
            .fields[0] as Extract<
            FieldsAnalyzeResponse["fields"][number],
            { matchType: "MATCH" }
          >),
          autofillPolicy: "SENSITIVE_CONFIRMATION",
        },
      ]),
      profile,
      registry,
    }).items;
    expect(item).toMatchObject({
      status: "sensitive",
      profileValue: "2020.04.05",
      previewValue: "••••••••",
      selected: false,
      disabled: true,
      revealed: false,
      profileEntryId: "health-1",
      itemIndex: 0,
      dateApproval: { format: "YYYY.MM.DD" },
    });
    const revealed = revealSensitiveReviewItem(item);
    expect(revealed).toMatchObject({
      status: "sensitive",
      previewValue: "2020.04.05",
      selected: false,
      disabled: false,
      revealed: true,
      dateApproval: item.dateApproval,
    });
    expect({ ...revealed, selected: true }).toMatchObject({
      selected: true,
      disabled: false,
      dateApproval: item.dateApproval,
    });
  });

  it("preserves adapter static DIRECT normalization when date-like clues are absent", () => {
    const profile = createEmptyProfile();
    profile.personal.birthDate = "2001-02-03";
    const { registry } = registryWithDateInput({ label: "Adapter date field" });
    const [item] = buildReviewPlan({
      analysis: response(
        [
          {
            candidateId: "date-field",
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "personal.personal.birthDate",
            },
            autofillPolicy: "ALLOWED",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          },
        ],
        "COMPLETE",
        "ADAPTER",
      ),
      profile,
      registry,
      normalizeDirectValue: (_key, value) => value.replaceAll("-", "."),
    }).items;
    expect(item).toMatchObject({
      profileValue: "2001.02.03",
      previewValue: "2001.02.03",
      status: "available",
    });
    expect(item.dateApproval).toBeUndefined();
  });

  it("keeps repeated date identity and index on the converted review item", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      education: [
        {
          id: "university-1",
          sectionId: "university",
          values: { startDate: "2019-03-15" },
        },
      ],
    };
    const { registry } = registryWithDateInput({
      placeholder: "YYYY.MM.DD",
      itemIndex: 0,
    });
    const [item] = buildReviewPlan({
      analysis: directDateAnalysis("education.university.startDate"),
      profile,
      registry,
    }).items;
    expect(item).toMatchObject({
      profileValue: "2019.03.15",
      profileEntryId: "university-1",
      itemIndex: 0,
      dateApproval: { format: "YYYY.MM.DD" },
    });
  });

  it.each([
    ["missing clue", undefined, undefined, undefined],
    ["ambiguous clue", "YYYY.MM or YYYY.MM.DD", undefined, undefined],
    ["length conflict", "YYYY.MM", undefined, { maxlength: "6" }],
    ["pattern conflict", "YYYY.MM", undefined, { pattern: "0000" }],
  ])(
    "blocks a date review when the target has %s",
    (_label, placeholder, _unused, attrs) => {
      const profile = createEmptyProfile();
      profile.personal.birthDate = "2001-02-03";
      const { registry, element } = registryWithDateInput({ placeholder });
      for (const [name, value] of Object.entries(attrs ?? {}))
        element.setAttribute(name, value!);
      const [item] = buildReviewPlan({
        analysis: directDateAnalysis("personal.personal.birthDate"),
        profile,
        registry,
      }).items;
      expect(item).toMatchObject({
        status: "unavailable",
        selected: false,
        disabled: true,
        previewValue: "입력 예정 값 없음",
      });
      expect(item.reason).not.toBe("");
      expect(item.profileValue).toBeUndefined();
      expect(item.reason).toMatch(/날짜 입력 형식|날짜 입력값/);
    },
  );

  it("converts only an actual date profile field in generic DIRECT review", () => {
    const element = document.createElement("input");
    element.type = "text";
    element.placeholder = "YYYY.MM.DD";
    document.body.append(element);
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "field-1",
      candidate: {
        candidateId: "field-1",
        element: "input",
        control: "text",
        visibility: "visible",
        displayName: "생년월일",
      },
      elements: [element],
      optionElements: new Map(),
      sectionId: "section-1",
      signature: createStructuralSignature([element]),
    });
    const profile = createEmptyProfile();
    profile.personal.birthDate = " 2001-02-03 ";

    const [item] = buildReviewPlan({
      analysis: response([
        {
          candidateId: "field-1",
          matchType: "MATCH",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "personal.personal.birthDate",
          },
          autofillPolicy: "ALLOWED",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ]),
      profile,
      registry,
    }).items;

    expect(item).toMatchObject({
      profileValue: "2001.02.03",
      previewValue: "2001.02.03",
      status: "available",
      selected: true,
      dateApproval: { format: "YYYY.MM.DD" },
    });

    element.value = "2001.02.03";
    expect(
      buildReviewPlan({
        analysis: response([
          {
            candidateId: "field-1",
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "personal.personal.birthDate",
            },
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          },
        ]),
        profile,
        registry,
      }).items[0],
    ).toMatchObject({ status: "available", selected: true });
    element.value = "1999.02.03";
    expect(
      buildReviewPlan({
        analysis: response([
          {
            candidateId: "field-1",
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "personal.personal.birthDate",
            },
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          },
        ]),
        profile,
        registry,
      }).items[0],
    ).toMatchObject({ status: "conflict", selected: false });

    profile.personal.birthDate = "2001-02-30";
    const invalid = buildReviewPlan({
      analysis: response([
        {
          candidateId: "field-1",
          matchType: "MATCH",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "personal.personal.birthDate",
          },
          autofillPolicy: "ALLOWED",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ]),
      profile,
      registry,
    }).items[0];
    expect(invalid).toMatchObject({
      status: "unavailable",
      selected: false,
      disabled: true,
      previewValue: "입력 예정 값 없음",
    });
    expect(invalid.reason).toContain("변환할 수 없습니다");
  });

  it("keeps a partial response distinguishable from a blocked response", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";
    const registry = registryWithTextField();

    expect(
      buildReviewPlan({
        analysis: response([allowedEmail], "PARTIAL"),
        profile,
        registry,
      }).status,
    ).toBe("partial");
    expect(
      buildReviewPlan({
        analysis: response([], "BLOCKED"),
        profile,
        registry,
      }),
    ).toEqual({ status: "blocked", items: [] });
  });
});
