import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { MatchedFieldAnalysis, ValueBinding } from "../api/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { buildReviewDiagnostics } from "./review-diagnostics";

function item(binding?: ValueBinding): ReviewPlanItem {
  const analysis: MatchedFieldAnalysis = {
    candidateId: "PRIVATE_CANDIDATE",
    matchType: "MATCH",
    autofillPolicy: "ALLOWED",
    mappingStatus: "LLM_SUGGESTED",
    interactionStatus: "READY",
    profileFieldKey: "education.university.endDate",
    ...(binding ? { valueBinding: binding } : {}),
  };
  return {
    candidateId: "PRIVATE_CANDIDATE",
    fieldLabel: "PRIVATE_LABEL",
    profileFieldKey: "education.highSchool.schoolName",
    profileEntryId: "PRIVATE_BOUND_ENTRY",
    itemIndex: 7,
    currentValue: "PRIVATE_CURRENT",
    previewValue: "PRIVATE_PREVIEW",
    profileValue: "PRIVATE_VALUE",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "PRIVATE_REASON",
    analysis,
  };
}

function profile() {
  const result = createEmptyProfile();
  result.education = [
    { id: "PRIVATE_HIGH_SCHOOL", sectionId: "highSchool", values: {} },
    { id: "PRIVATE_FIRST_ENTRY", sectionId: "university", values: {} },
    { id: "PRIVATE_BOUND_ENTRY", sectionId: "university", values: {} },
  ];
  // Diagnostics may inspect identity and section metadata, never profile values.
  for (const entry of result.education)
    Object.defineProperty(entry, "values", {
      get: () => {
        throw new Error("PROFILE_VALUES_MUST_NOT_BE_READ");
      },
    });
  return result;
}

const contexts = new Map([
  [
    "PRIVATE_CANDIDATE",
    {
      candidate: {
        candidateId: "PRIVATE_CANDIDATE",
        element: "input" as const,
        control: "text" as const,
        visibility: "visible" as const,
        domId: "PRIVATE_SELECTOR",
        displayName: "PRIVATE_LABEL",
      },
      sectionCategory: "EDUCATION",
      repeatRowIndex: 4,
      fieldOrdinal: 9,
      pageSectionOrdinal: 2,
    },
  ],
]);

describe("mapping diagnostic boundary", () => {
  it("uses execution binding precedence and the bound entry's section-local row, not page or item indices", () => {
    const result = buildReviewDiagnostics(
      [
        item({
          type: "DIRECT",
          profileFieldKey: "education.university.startDate",
        }),
      ],
      contexts,
      profile(),
    );
    expect(result.fields).toMatchObject([
      {
        fieldOrdinal: 9,
        pageSectionOrdinal: 2,
        repeatRowIndex: 4,
        profileFieldKey: "education.university.startDate",
        profileSectionId: "university",
        profileRowOrdinal: 1,
        mappedKeyCategory: "education",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|profileEntryId|candidateId|domId|https?:/,
    );
  });

  it("uses the legacy analysis key before the review fallback", () => {
    expect(
      buildReviewDiagnostics([item()], contexts, profile()).fields,
    ).toMatchObject([{ profileFieldKey: "education.university.endDate" }]);
  });

  it("resolves a top-level binding's actual section rather than its key's section", () => {
    const entry = item({
      type: "DIRECT",
      profileFieldKey: "education.university.latestEducationType",
    });
    entry.profileEntryId = "PRIVATE_HIGH_SCHOOL";
    expect(
      buildReviewDiagnostics([entry], contexts, profile()).fields,
    ).toMatchObject([{ profileSectionId: "highSchool", profileRowOrdinal: 0 }]);
  });

  it.each([
    "PRIVATE_UNKNOWN_KEY",
    "education.university.PRIVATE_FIELD",
    "languages.languageTest.evidenceDocumentPath",
  ])(
    "rejects a non-autofill key without falling back to a stale key: %s",
    (key) => {
      const result = buildReviewDiagnostics(
        [item({ type: "DIRECT", profileFieldKey: key })],
        contexts,
        profile(),
      );
      expect(result.fields).toMatchObject([
        {
          profileFieldKey: null,
          mappedKeyCategory: null,
          profileSectionId: null,
          profileRowOrdinal: null,
        },
      ]);
      expect(JSON.stringify(result)).not.toContain(key);
    },
  );

  it("does not invent a single source key for a multi-source derived binding", () => {
    const result = buildReviewDiagnostics(
      [
        item({
          type: "DERIVED",
          recipe: "KOREAN_FULL_NAME",
          profileFieldKey: "personal.personal.gender",
        }),
      ],
      contexts,
      profile(),
    );
    expect(result.fields).toMatchObject([
      {
        mapped: true,
        profileFieldKey: null,
        profileSectionId: null,
        profileRowOrdinal: null,
      },
    ]);
  });

  it.each([
    "missing-profile",
    "missing-id",
    "unknown-id",
    "duplicate-id",
    "unknown-section",
  ])("leaves unobservable profile binding null: %s", (mode) => {
    const entry = item({
      type: "DIRECT",
      profileFieldKey: "education.university.schoolName",
    });
    const source = profile();
    if (mode === "missing-id") entry.profileEntryId = undefined;
    if (mode === "unknown-id") entry.profileEntryId = "PRIVATE_ABSENT_ENTRY";
    if (mode === "duplicate-id")
      source.education.push({
        id: "PRIVATE_BOUND_ENTRY",
        sectionId: "university",
        values: {},
      });
    if (mode === "unknown-section")
      source.education[2]!.sectionId = "PRIVATE_SECTION";
    const result = buildReviewDiagnostics(
      [entry],
      contexts,
      mode === "missing-profile" ? undefined : source,
    );
    expect(result.fields).toMatchObject([
      {
        profileFieldKey: "education.university.schoolName",
        profileSectionId: null,
        profileRowOrdinal: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("preserves original join ordinals through display filtering and sorting", () => {
    const blocked = {
      ...item(),
      candidateId: "blocked",
      status: "unavailable" as const,
      genericGrade: "BLOCKED" as const,
    };
    const hidden = {
      ...item(),
      candidateId: "hidden",
      status: "unavailable" as const,
    };
    const available = { ...item(), candidateId: "available" };
    const base = contexts.get("PRIVATE_CANDIDATE")!;
    const metadata = new Map([
      ["blocked", { ...base, fieldOrdinal: 0 }],
      ["hidden", { ...base, fieldOrdinal: 1 }],
      ["available", { ...base, fieldOrdinal: 2 }],
    ]);
    expect(
      buildReviewDiagnostics([blocked, hidden, available], metadata).fields,
    ).toMatchObject([{ fieldOrdinal: 2 }, { fieldOrdinal: 0 }]);
  });
});
