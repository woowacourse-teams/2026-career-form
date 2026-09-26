import { beforeEach, describe, expect, it } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { FieldCandidate, FieldsAnalyzeResponse } from "../api/types";
import {
  AnalysisContractError,
  validateFieldsResponse,
} from "../api/validate-response";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import { executeApprovedWrites } from "../write/executor";
import { buildReviewPlan } from "./review-plan";

function setup(
  section: "university" | "highSchool" | "graduateSchool",
  field: string,
  label: string,
) {
  document.body.innerHTML = `<fieldset><legend>학력</legend><dl><dt>${label}</dt><dd>
    <input type="text" readonly aria-label="${label}">
    <button type="button">${label} 검색</button>
  </dd></dl></fieldset>`;
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections.flatMap((entry) => [
    ...entry.fields,
    ...(entry.items?.flatMap((item) => item.fields) ?? []),
  ])[0]!;
  const key = `education.${section}.${field}`;
  const response: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: candidate.candidateId,
        matchType: "MATCH",
        valueBinding: { type: "DIRECT", profileFieldKey: key },
        mappingStatus: "LLM_SUGGESTED",
        interactionStatus: "READY",
        autofillPolicy: "CONDITIONAL",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    ],
  };
  const profileValue = field === "schoolRegion" ? "region:seoul" : "가상값";
  const profile: Profile = {
    ...createEmptyProfile(),
    education: [
      {
        id: "synthetic-entry",
        sectionId: section,
        values: { [field]: profileValue },
      },
    ],
  };
  return { snapshot, candidate, response, profile };
}

describe("readonly search collection, response and review contract", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it.each([
    ["university", "schoolName", "학교명"],
    ["university", "schoolRegion", "학교소재지"],
    ["university", "majorName", "전공"],
    ["highSchool", "schoolName", "학교명"],
    ["graduateSchool", "schoolName", "학교명"],
  ] as const)(
    "plans %s %s without permitting a direct target write",
    (section, field, label) => {
      const { snapshot, candidate, response, profile } = setup(
        section,
        field,
        label,
      );
      expect(candidate.semanticContext?.inputType).toBe("text");
      const validated = validateFieldsResponse(snapshot.request, response);
      const { items } = buildReviewPlan({
        analysis: validated,
        registry: snapshot.registry,
        profile,
      });
      expect(items[0]?.disabled).toBe(false);
      expect(items[0]?.profileValue).toBe(
        field === "schoolRegion" ? "서울" : "가상값",
      );
      executeApprovedWrites({
        items: items.map((item) => ({ ...item, selected: true })),
        approvedCandidateIds: new Set([candidate.candidateId]),
        registry: snapshot.registry,
      });
      expect(document.querySelector("input")?.value).toBe("");
      expect(document.querySelector("input")?.readOnly).toBe(true);
    },
  );

  it.each([
    ["missing type", { semanticContext: undefined }],
    ["email", { semanticContext: { inputType: "email" } }],
    ["search target", { semanticContext: { inputType: "search" } }],
    ["hidden", { visibility: "hidden" }],
    ["disabled", { disabled: true }],
    ["inert", { inert: true }],
    ["editable", { readonly: undefined }],
    ["textarea", { element: "textarea", control: "textarea" }],
  ] satisfies [string, Partial<FieldCandidate>][])(
    "rejects %s search evidence",
    (_name, changes) => {
      const { snapshot, candidate, response } = setup(
        "university",
        "schoolName",
        "학교명",
      );
      Object.assign(candidate, changes);
      expect(() => validateFieldsResponse(snapshot.request, response)).toThrow(
        AnalysisContractError,
      );
    },
  );

  it("rejects a readonly generic SET_TEXT escape when type evidence is missing", () => {
    const { snapshot, candidate, response } = setup(
      "university",
      "schoolName",
      "학교명",
    );
    candidate.semanticContext = undefined;
    const field = response.fields[0]!;
    if (field.matchType === "MATCH") field.writePlan = { command: "SET_TEXT" };
    expect(() => validateFieldsResponse(snapshot.request, response)).toThrow(
      AnalysisContractError,
    );
  });

  it("rejects static mode and non-DIRECT or unknown search bindings", () => {
    const { snapshot, response } = setup("university", "schoolName", "학교명");
    expect(() =>
      validateFieldsResponse(snapshot.request, {
        ...response,
        mode: "ADAPTER",
      }),
    ).toThrow(AnalysisContractError);
    for (const valueBinding of [
      {
        type: "DIRECT",
        profileFieldKey: "education.university.schoolLocation",
      },
      { type: "DERIVED", recipe: "KOREAN_FULL_NAME" },
      {
        type: "LOOKUP",
        profileFieldKey: "education.university.schoolName",
        optionMap: { a: "b" },
      },
    ]) {
      expect(() =>
        validateFieldsResponse(snapshot.request, {
          ...response,
          fields: [{ ...response.fields[0], valueBinding }],
        }),
      ).toThrow(AnalysisContractError);
    }
  });

  it.each([
    "학교소재지 검색",
    "전공 검색",
    "전공 찾기",
    "Search region",
    "Find major",
  ])(
    "excludes %s from generic preparation even when multiple openers exist",
    (label) => {
      document.body.innerHTML = `<fieldset><legend>학력</legend><dl><dt>전공</dt><dd>
        <input readonly type="text"><button type="button">${label}</button>
        <button type="button">${label}</button></dd></dl><button type="button">항목 추가</button></fieldset>`;
      const preparation = collectPreparationSnapshot(document);
      const actions = preparation.request.sections.flatMap((section) => [
        ...section.actionCandidates,
        ...(section.items?.flatMap((item) => item.actionCandidates) ?? []),
      ]);
      expect(actions.map((action) => action.displayName)).toEqual([
        "항목 추가",
      ]);
    },
  );

  it("rejects local opener ambiguity at review despite a valid API plan", () => {
    const { snapshot, response, profile } = setup(
      "university",
      "majorName",
      "전공",
    );
    document
      .querySelector("dd")!
      .append(document.querySelector("button")!.cloneNode(true));
    const { items } = buildReviewPlan({
      analysis: response,
      registry: snapshot.registry,
      profile,
    });
    expect(items[0]?.disabled).toBe(true);
    expect(items[0]?.status).toBe("unavailable");
  });

  it("keeps static search plans unavailable at review", () => {
    const { snapshot, response, profile } = setup(
      "university",
      "majorName",
      "전공",
    );
    const { items } = buildReviewPlan({
      analysis: { ...response, mode: "ADAPTER" },
      registry: snapshot.registry,
      profile,
    });
    expect(items[0]?.disabled).toBe(true);
  });

  it("does not approve search after the target becomes editable", () => {
    const { snapshot, response, profile } = setup(
      "university",
      "majorName",
      "전공",
    );
    document.querySelector("input")!.readOnly = false;
    const { items } = buildReviewPlan({
      analysis: response,
      registry: snapshot.registry,
      profile,
    });
    expect(items[0]?.disabled).toBe(true);
  });

  it("keeps prefilled high-school region matched while leaving the empty university region selectable", () => {
    document.body.innerHTML = `<fieldset><legend>고등학교</legend><dl><dt>학교소재지</dt><dd>
      <input id="high-region" name="zz_state_nm" type="text" readonly placeholder="지역">
      <button type="button" title="학교소재지 검색">검색</button>
    </dd></dl></fieldset><fieldset><legend>대학교</legend><dl><dt>학교소재지</dt><dd>
      <input id="university-region" name="zz_state_nm" type="text" readonly placeholder="지역">
      <button type="button" title="학교소재지 검색">검색</button>
    </dd></dl></fieldset>`;
    document.querySelector<HTMLInputElement>("#high-region")!.value =
      "서울특별시";
    const snapshot = collectFieldsSnapshot(document);
    const candidates = snapshot.request.sections.flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ]);
    const byId = (id: string) =>
      candidates.find((candidate) => {
        const lookup = snapshot.registry.lookupField(candidate.candidateId);
        return (
          lookup.status === "blocked" && lookup.handle.elements[0]?.id === id
        );
      })!;
    const high = byId("high-region");
    const university = byId("university-region");
    expect(high.candidateId).not.toBe(university.candidateId);
    const analysis = validateFieldsResponse(snapshot.request, {
      snapshotId: snapshot.request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        [high, "highSchool"],
        [university, "university"],
      ].map(([candidate, section]) => ({
        candidateId: (candidate as FieldCandidate).candidateId,
        matchType: "MATCH" as const,
        valueBinding: {
          type: "DIRECT" as const,
          profileFieldKey: `education.${section}.schoolRegion`,
        },
        mappingStatus: "LLM_SUGGESTED" as const,
        interactionStatus: "READY" as const,
        autofillPolicy: "CONDITIONAL" as const,
        writePlan: { command: "SEARCH_SELECTION" as const },
      })),
    });
    const profile: Profile = {
      ...createEmptyProfile(),
      education: ["highSchool", "university"].map((sectionId) => ({
        id: `entry-${sectionId}`,
        sectionId,
        values: {
          schoolRegion:
            sectionId === "highSchool" ? "region:seoul" : "region:gyeonggi",
        },
      })),
    };
    const { items } = buildReviewPlan({
      analysis,
      registry: snapshot.registry,
      profile,
    });
    expect(
      items.find((item) => item.candidateId === high.candidateId),
    ).toMatchObject({
      currentValue: "서울특별시",
      profileValue: "서울",
      status: "needs-review",
    });
    expect(
      items.find((item) => item.candidateId === university.candidateId),
    ).toMatchObject({
      currentValue: "",
      profileValue: "경기",
      status: "needs-review",
    });
    document.querySelector<HTMLInputElement>("#high-region")!.value = "경기도";
    const changed = buildReviewPlan({
      analysis,
      registry: snapshot.registry,
      profile,
    });
    expect(
      changed.items.find((item) => item.candidateId === high.candidateId),
    ).toMatchObject({
      currentValue: "경기도",
      status: "conflict",
      selected: false,
    });
  });

  it("uses the same conservative exact comparison for an existing search value", () => {
    const { snapshot, response, profile } = setup(
      "university",
      "majorName",
      "전공",
    );
    document.querySelector("input")!.value = "Ａ  B";
    profile.education[0]!.values.majorName = "A B";
    const { items } = buildReviewPlan({
      analysis: response,
      registry: snapshot.registry,
      profile,
    });
    expect(items[0]?.status).not.toBe("conflict");
    expect(items[0]?.disabled).toBe(false);
  });

  it("attaches immutable local name and grade provenance to a certificate search review", () => {
    document.body.innerHTML = `<fieldset><legend>자격증·면허증</legend><dl><dt>자격증명</dt><dd>
      <input type="text" readonly aria-label="자격증명">
      <button type="button">자격증명 검색</button>
    </dd></dl></fieldset>`;
    const snapshot = collectFieldsSnapshot(document);
    const candidate = snapshot.request.sections.flatMap((entry) => [
      ...entry.fields,
      ...(entry.items?.flatMap((item) => item.fields) ?? []),
    ])[0]!;
    const profile: Profile = {
      ...createEmptyProfile(),
      certifications: [
        {
          id: "certificate-1",
          sectionId: "certificate",
          values: {
            name: "synthetic certificate level 2",
            grade: "level 2",
          },
        },
      ],
    };
    const { items } = buildReviewPlan({
      analysis: {
        snapshotId: snapshot.request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [
          {
            candidateId: candidate.candidateId,
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "certifications.certificate.name",
            },
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            autofillPolicy: "CONDITIONAL",
            writePlan: { command: "SEARCH_SELECTION" },
          },
        ],
      },
      registry: snapshot.registry,
      profile,
    });

    expect(items[0]).toMatchObject({
      profileEntryId: "certificate-1",
      searchValuePlan: {
        originalName: "synthetic certificate level 2",
        grade: "level 2",
        forms: [
          { kind: "original-exact", name: "synthetic certificate level 2" },
          {
            kind: "name-and-grade",
            name: "synthetic certificate",
            grade: "level 2",
          },
        ],
      },
    });
  });
});
