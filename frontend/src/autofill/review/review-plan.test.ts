import { describe, expect, it } from "vitest";

import type { FieldsAnalyzeResponse } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { createEmptyProfile, type Profile } from "../../profile/model";
import type { ReviewPlanItem } from "./review-plan";
import {
  buildReviewPlan,
  resolveProfileFieldValue,
  revealSensitiveReviewItem,
  reviewItemsForDisplay,
} from "./review-plan";
import { resolveValueBinding } from "../profile/value-binding";

function response(
  fields: FieldsAnalyzeResponse["fields"],
  analysisStatus: FieldsAnalyzeResponse["analysisStatus"] = "COMPLETE",
): FieldsAnalyzeResponse {
  return {
    snapshotId: "snapshot-1",
    mode: "GENERIC",
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

describe("profile value resolution", () => {
  it("composes a Korean full name from local family and given names", () => {
    const profile = createEmptyProfile();
    profile.personal.koreanFamilyName = "김";
    profile.personal.koreanGivenName = "민수";

    expect(
      resolveValueBinding(profile, {
        type: "DERIVED",
        recipe: "KOREAN_FULL_NAME",
      }),
    ).toEqual({
      status: "resolved",
      value: "김민수",
      sensitive: false,
    });
  });

  it("resolves a declared single-value profile field", () => {
    const profile = createEmptyProfile();
    profile.contact.email = "me@example.test";

    expect(resolveProfileFieldValue(profile, "contact.contact.email")).toEqual({
      status: "resolved",
      value: "me@example.test",
      sensitive: false,
    });
  });

  it("resolves the education top-level latest education value from its university entry", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      education: [
        {
          id: "university-1",
          sectionId: "university",
          values: { latestEducationType: "대학(학사)" },
        },
      ],
    };

    expect(
      resolveProfileFieldValue(
        profile,
        "education.university.latestEducationType",
        0,
      ),
    ).toEqual({
      status: "resolved",
      value: "대학(학사)",
      sensitive: false,
      profileEntryId: "university-1",
    });
  });

  it("does not choose between repeated profile entries", () => {
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

    expect(
      resolveProfileFieldValue(profile, "certifications.certificate.name"),
    ).toEqual({ status: "ambiguous", sensitive: false });
  });

  it("resolves a repeated profile value by the locally supplied row index", () => {
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

    expect(
      resolveProfileFieldValue(profile, "certifications.certificate.name", 1),
    ).toEqual({
      status: "resolved",
      value: "자격증 B",
      sensitive: false,
      profileEntryId: "certificate-2",
    });
  });

  it("keeps a repeated field unavailable when its only matching entry has no value", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: { name: "" },
        },
      ],
    };

    expect(
      resolveProfileFieldValue(profile, "certifications.certificate.name"),
    ).toEqual({ status: "missing", sensitive: false });
  });

  it("rejects an excluded evidence document path instead of resolving it", () => {
    const profile: Profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: { evidenceDocumentPath: "/local/evidence.pdf" },
        },
      ],
    };

    expect(
      resolveProfileFieldValue(
        profile,
        "certifications.certificate.evidenceDocumentPath",
      ),
    ).toEqual({ status: "unknown", sensitive: false });
  });
});

describe("review plan", () => {
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
          values: { minorName: "경영학과" },
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
      status: "needs-review",
      selected: false,
    });
  });

  it("maps repeated form rows to the matching local profile entry", () => {
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
    }));

    expect(
      buildReviewPlan({ analysis: response(fields), profile, registry }).items,
    ).toMatchObject([
      {
        profileValue: "자격증 A",
        profileEntryId: "certificate-1",
        itemIndex: 0,
      },
      {
        profileValue: "자격증 B",
        profileEntryId: "certificate-2",
        itemIndex: 1,
      },
    ]);
  });

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
              "전문학사": "전문대학(전문학사)",
              "학사": "대학(학사)",
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
    profile.military.militaryStatus = "복무 완료";
    const registry = registryWithTextField();

    const [item] = buildReviewPlan({
      analysis: response([
        {
          ...allowedEmail,
          profileFieldKey: "military.military.militaryStatus",
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
    profile.military.militaryStatus = "복무 완료";
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
    }).items;

    expect(revealSensitiveReviewItem(item)).toMatchObject({
      previewValue: "복무 완료",
      selected: false,
      disabled: false,
      revealed: true,
    });
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
