import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyProfile,
  type Profile,
  type ProfileEntry,
} from "../../profile/model";
import type {
  InteractionDecisionRequest,
  InteractionDecisionResponse,
} from "../api/interaction-types";
import type {
  AnalysisApiClient,
  GenericFieldsRequest,
  GenericFieldsResponse,
  SectionClassifyRequest,
} from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { detectMixedSectionGroup } from "../dom/mixed-section-rows";
import { assignMixedRows } from "../dom/mixed-section-rows";
import { prepareMixedSectionRows } from "../workflow/mixed-section-preparation";
import { runGenericStructureLoop } from "./structure-loop";
import {
  applyGenericStructureAnalysis,
  collectGenericStructureSnapshot,
} from "./structure-context";

vi.mock("../dom/mixed-section-rows", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../dom/mixed-section-rows")>();
  return {
    ...original,
    detectMixedSectionGroup: vi.fn(original.detectMixedSectionGroup),
    assignMixedRows: vi.fn(original.assignMixedRows),
  };
});
vi.mock("../workflow/mixed-section-preparation", () => ({
  prepareMixedSectionRows: vi.fn(),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

const CATEGORY_OF_TITLE: Array<[RegExp, string]> = [
  [/학력/, "education"],
  [/경력/, "careers"],
  [/자격/, "certifications"],
  [/어학/, "languages"],
];
const KIND_LABEL = {
  HIGH_SCHOOL: "고등학교",
  ASSOCIATE: "전문대학",
  BACHELOR: "대학(학사)",
  MASTER: "대학원(석사)",
  DOCTOR: "대학원(박사)",
} as const;
const KEY_OF_SCHOOL_LABEL: Record<string, string> = {
  "대학교 학교명": "education.university.schoolName",
  "대학원 학교명": "education.graduateSchool.schoolName",
};

interface MockOptions {
  category?: string;
  abstain?: Array<"REPEAT_ADD" | "SECTION_REVEAL" | "ROW_KIND_OPTION">;
  /** Key returned for graduate school rows instead of the right one. */
  graduateKey?: string;
}

function mockApi(options: MockOptions = {}) {
  const decisions: InteractionDecisionRequest[] = [];
  const classifications: SectionClassifyRequest[] = [];
  const generic: GenericFieldsRequest[] = [];
  const client = {
    analyzePreparation: vi.fn(async () => {
      throw new Error("analyzePreparation must not be called");
    }),
    analyzeFields: vi.fn(async () => {
      throw new Error("analyzeFields must not be called");
    }),
    decideInteractions: vi.fn(
      async (
        request: InteractionDecisionRequest,
      ): Promise<InteractionDecisionResponse> => {
        decisions.push(request);
        return {
          schemaVersion: 2,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          mode: "GENERIC",
          decisions: request.decisions.map((decision) => {
            if (options.abstain?.includes(decision.role as never))
              return {
                decisionId: decision.decisionId,
                role: decision.role,
                selection: "ABSTAINED" as const,
                candidateId: null,
              };
            if (decision.role === "ROW_KIND_OPTION") {
              const wanted = KIND_LABEL[decision.targetKind!];
              const match = decision.candidates.find(
                (candidate) =>
                  candidate.semanticContext?.labels?.[0]?.text === wanted,
              );
              return {
                decisionId: decision.decisionId,
                role: decision.role,
                selection: match
                  ? ("SELECTED" as const)
                  : ("ABSTAINED" as const),
                candidateId: match?.candidateId ?? null,
              };
            }
            return {
              decisionId: decision.decisionId,
              role: decision.role,
              selection: "SELECTED" as const,
              candidateId: decision.candidates[0]!.candidateId,
            };
          }),
        };
      },
    ),
    classifySections: vi.fn(async (request: SectionClassifyRequest) => {
      classifications.push(request);
      return {
        schemaVersion: 1 as const,
        snapshotId: request.snapshotId,
        status: "COMPLETE" as const,
        sections: request.sections.map((section) => ({
          sectionId: section.sectionId,
          category:
            options.category ??
            CATEGORY_OF_TITLE.find(([pattern]) =>
              pattern.test(section.title ?? ""),
            )?.[1] ?? "NONE",
          confidence: 1,
        })),
      };
    }),
    analyzeGenericFields: vi.fn(
      async (request: GenericFieldsRequest): Promise<GenericFieldsResponse> => {
        generic.push(request);
        return {
          schemaVersion: 3,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          diagnostics: { jevCalls: 0, elapsedMs: 0 },
          fields: request.sections.flatMap((section) =>
            section.fields.map((field) => {
              const key =
                field.displayName === "대학원 학교명" && options.graduateKey
                  ? options.graduateKey
                  : KEY_OF_SCHOOL_LABEL[field.displayName ?? ""];
              return {
                candidateId: field.candidateId,
                profileFieldKey: key ?? null,
                confidence: 0.95,
                categoryConfirmed: true,
                autofillPolicy: "ALLOWED" as const,
                interactionStatus: key
                  ? ("READY" as const)
                  : ("BLOCKED" as const),
              };
            }),
          ),
        };
      },
    ),
  };
  return {
    client: client as unknown as AnalysisApiClient,
    raw: client,
    decisions,
    classifications,
    generic,
  };
}

function entries(count: number, sectionId: string): ProfileEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${sectionId}-${index}`,
    sectionId,
    values: {},
  }));
}

function careerRow(index: number): string {
  return `<div ismultirow="true">
    <label>회사명<input name="company${index}" /></label>
    <label>직무<input name="role${index}" /></label>
  </div>`;
}

/** Clicks on anything, observed in the capture phase before any handler. */
function watchClicks(): string[] {
  const clicks: string[] = [];
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      clicks.push(target.id || target.textContent?.trim() || target.tagName);
    },
    true,
  );
  return clicks;
}

function recordQa(name: string, evidence: unknown) {
  const directory = process.env.CF_QA_EVIDENCE_DIRECTORY;
  if (directory)
    writeFileSync(join(directory, name), JSON.stringify(evidence, null, 2) + "\n");
}

describe("runGenericStructureLoop", () => {
  it.each(["careers", "CAREER"])("grows one career row to three without touching save or next (%s)", async (category) => {
    document.body.innerHTML = `<form action="/submit"><section>
      <h3>경력</h3>
      <div id="rows">${careerRow(0)}</div>
      <button type="button" id="add">경력 추가</button>
      <button id="save">저장</button>
      <button type="submit" id="submit">제출</button>
      <button type="button" id="save-explicit">Save</button>
      <a id="next" href="/next">다음</a>
      <a id="link" href="/elsewhere">항목 추가</a>
    </section></form>`;
    const rows = document.querySelector("#rows")!;
    document.querySelector("#add")!.addEventListener("click", () => {
      rows.insertAdjacentHTML(
        "beforeend",
        careerRow(rows.querySelectorAll("[ismultirow]").length),
      );
    });
    const clicks = watchClicks();
    const submits = vi.fn((event: Event) => event.preventDefault());
    document.querySelector("form")!.addEventListener("submit", submits);
    const url = document.URL;
    const profile: Profile = {
      ...createEmptyProfile(),
      careers: entries(3, "career"),
    };
    const api = mockApi({ category });
    const onAction = vi.fn();

    const result = await runGenericStructureLoop({
      document,
      profile,
      apiClient: api.client,
      onAction,
    });

    expect(rows.querySelectorAll("[ismultirow]")).toHaveLength(3);
    expect(clicks).toEqual(["add", "add"]);
    expect(submits).not.toHaveBeenCalled();
    expect(document.URL).toBe(url);
    expect(result.stopReason).toBe("NONE_REMAINING");
    expect(result.initialRemaining).toEqual([
      {
        kind: "ADD_ROW",
        sectionTitle: "경력",
        category: "careers",
        rows: 1,
        needed: 3,
      },
    ]);
    expect(result.actions).toEqual([
      {
        kind: "ADD_ROW",
        sectionTitle: "경력",
        result: "done",
        rowsBefore: 1,
        rowsAfter: 2,
      },
      {
        kind: "ADD_ROW",
        sectionTitle: "경력",
        result: "done",
        rowsBefore: 2,
        rowsAfter: 3,
      },
    ]);
    expect(onAction).toHaveBeenCalledTimes(2);
    // The add button is asked about once, not once per row.
    expect(result.questions).toEqual([
      { role: "REPEAT_ADD", candidates: ["경력 추가"] },
    ]);
    expect(api.raw.analyzePreparation).not.toHaveBeenCalled();
    recordQa("task-13-loop.txt", {
      fixture: "synthetic-career-form",
      rowsBefore: 1,
      rowsAfter: rows.querySelectorAll("[ismultirow]").length,
      clickLog: clicks,
      submitCalls: submits.mock.calls.length,
      urlUnchanged: document.URL === url,
      actions: result.actions,
      questions: result.questions,
    });
  });

  it("stops at two rows and records why when the add button disappears", async () => {
    document.body.innerHTML = `<section>
      <h3>경력</h3>
      <div id="rows">${careerRow(0)}</div>
      <button type="button" id="add">경력 추가</button>
    </section>`;
    const rows = document.querySelector("#rows")!;
    let presses = 0;
    document.querySelector("#add")!.addEventListener("click", (event) => {
      presses += 1;
      if (presses === 1) rows.insertAdjacentHTML("beforeend", careerRow(1));
      else (event.target as Element).remove();
    });
    const profile: Profile = {
      ...createEmptyProfile(),
      careers: entries(3, "career"),
    };

    const result = await runGenericStructureLoop({
      document,
      profile,
      apiClient: mockApi().client,
    });

    expect(rows.querySelectorAll("[ismultirow]")).toHaveLength(2);
    expect(presses).toBe(2);
    expect(result.sections).toEqual([
      {
        title: "경력",
        category: "careers",
        status: "BLOCKED",
        reason: "executor:action-not-reidentified",
        blockedRows: [],
      },
    ]);
    expect(result.actions.at(-1)).toMatchObject({
      kind: "ADD_ROW",
      result: "blocked",
      reason: "executor:action-not-reidentified",
    });
  });

  it("clicks nothing and keeps the reason when the add control is declined", async () => {
    document.body.innerHTML = `<section>
      <h3>경력</h3>
      <div id="rows">${careerRow(0)}</div>
      <button type="button" id="add">경력 추가</button>
    </section>`;
    const clicks = watchClicks();
    const profile: Profile = {
      ...createEmptyProfile(),
      careers: entries(3, "career"),
    };

    const result = await runGenericStructureLoop({
      document,
      profile,
      apiClient: mockApi({ abstain: ["REPEAT_ADD"] }).client,
    });

    expect(clicks).toEqual([]);
    expect(document.querySelectorAll("[ismultirow]")).toHaveLength(1);
    expect(result.sections).toEqual([
      {
        title: "경력",
        category: "careers",
        status: "BLOCKED",
        reason: "REPEAT_ADD_ABSTAINED",
        blockedRows: [],
      },
    ]);
    recordQa("task-13-abstain.txt", {
      fixture: "synthetic-career-form",
      rowsBefore: 1,
      rowsAfter: document.querySelectorAll("[ismultirow]").length,
      clickLog: clicks,
      sections: result.sections,
      questions: result.questions,
    });
  });

  it.each(["REPEAT_ADD", undefined])(
    "keeps the existing row mappable when no add click happened (%s)",
    async (abstained) => {
      document.body.innerHTML = `<section>
      <h3>경력</h3>
      <div id="rows">${careerRow(0)}</div>
      ${abstained ? '<button type="button" id="add">경력 추가</button>' : ""}
    </section>`;
      const result = await runGenericStructureLoop({
        document,
        profile: { ...createEmptyProfile(), careers: entries(3, "career") },
        apiClient: mockApi(abstained ? { abstain: ["REPEAT_ADD"] } : {})
          .client,
      });
      const row = document.querySelector("[ismultirow]")!;
      if (abstained) expect(result.sections[0]?.status).toBe("BLOCKED");
      expect(
        [...result.context.blockedScopes.keys()].some((scope) =>
          scope.contains(row),
        ),
      ).toBe(false);
    },
  );

  it("offers a repeat group only the add controls its own section holds", async () => {
    document.body.innerHTML = `<form><div><section>
      <h3>학력</h3>
      <div id="education-rows"><div ismultirow="true">
        <label>학교명<input name="school0" /></label>
        <label>전공<input name="major0" /></label>
      </div></div>
      <button type="button" id="add-education">학력 추가</button>
    </section><section>
      <h3>경력</h3>
      <div id="career-rows">${careerRow(0)}${careerRow(1)}</div>
    </section>
    <button type="button" id="add-career">경력 추가</button></div></form>`;
    const api = mockApi({ abstain: ["REPEAT_ADD"] });

    const result = await runGenericStructureLoop({
      document,
      profile: {
        ...createEmptyProfile(),
        education: entries(2, "university"),
        careers: entries(3, "career"),
      },
      apiClient: api.client,
    });

    const asked = api.decisions
      .flatMap(({ decisions }) => decisions)
      .filter(({ role }) => role === "REPEAT_ADD");
    expect(
      result.questions.flatMap(({ candidates }) => candidates),
    ).not.toContain("경력 추가");
    expect(asked).toHaveLength(1);
    expect(asked[0]!.candidates).toEqual([
      expect.objectContaining({
        relationToTarget: "SAME_CONTAINER",
        semanticContext: {
          labels: [
            { source: "label", text: "학력 추가" },
            { source: "section-heading", text: "학력" },
          ],
        },
      }),
    ]);
  });

  it("describes an in-row add control by what it observes", async () => {
    document.body.innerHTML = `<section>
      <h3>자격사항</h3>
      <div id="rows"><div ismultirow="true">
        <label>자격증명<input name="cert0" /></label>
        <label>발급기관<input name="issuer0" /></label>
        <button type="button" id="add" aria-label="자격 행 추가">+</button>
      </div></div>
    </section>`;
    const api = mockApi({ abstain: ["REPEAT_ADD"] });

    await runGenericStructureLoop({
      document,
      profile: {
        ...createEmptyProfile(),
        certifications: entries(2, "certificate"),
      },
      apiClient: api.client,
    });

    const asked = api.decisions
      .flatMap(({ decisions }) => decisions)
      .filter(({ role }) => role === "REPEAT_ADD");
    expect(asked).toHaveLength(1);
    expect(asked[0]!.candidates).toEqual([
      {
        candidateId: expect.any(String),
        element: "button",
        control: "button",
        visibility: "visible",
        relationToTarget: "SAME_REPEAT_ROW",
        semanticContext: {
          labels: [
            { source: "aria-label", text: "자격 행 추가" },
            { source: "section-heading", text: "자격사항" },
          ],
        },
      },
    ]);
  });

  it("never offers a forbidden control for a repeat group", async () => {
    document.body.innerHTML = `<form><section>
      <h3>경력</h3>
      <div id="rows">${careerRow(0)}${careerRow(1)}</div>
      <button type="button" id="close-add">경력 추가 닫기</button>
      <button type="button" id="del">삭제</button>
    </section></form>`;
    const clicks = watchClicks();
    const api = mockApi();
    const result = await runGenericStructureLoop({
      document,
      profile: { ...createEmptyProfile(), careers: entries(3, "career") },
      apiClient: api.client,
    });
    expect(clicks).toEqual([]);
    expect(api.decisions).toEqual([]);
    expect(result.sections[0]).toMatchObject({
      status: "BLOCKED",
      reason: "NO_ADD_CONTROL",
    });
  });

  describe("education row kinds", () => {
    const singleEducationDocument = (withSelect = true) => {
      document.body.innerHTML = `<form><section><h3>학력</h3>
        ${withSelect ? `<select aria-label="학교 구분">
          <option value="">선택</option><option value="G">검정고시</option>
          <option value="H">고등학교</option><option value="A">전문대학</option>
          <option value="B">대학(학사)</option><option value="M">대학원(석사)</option>
          <option value="D">대학원(박사)</option>
        </select>` : ""}
        <div id="details" ${withSelect ? "hidden" : ""}><label><span id="school-label">학교명</span><input name="school" /></label></div>
        <button type="button" id="save">저장</button>
      </section></form>`;
      document.querySelector("select")?.addEventListener("change", () => {
        document.querySelector("#details")!.removeAttribute("hidden");
        document.querySelector("#school-label")!.textContent =
          document.querySelector("select")!.value === "M"
            ? "대학원 학교명"
            : "대학교 학교명";
      });
    };

    it.each([
      { latest: undefined, graduate: false, value: "B", stage: "university" },
      { latest: undefined, graduate: true, value: "M", stage: "graduateSchool" },
      { latest: "대학(학사)", graduate: true, value: "B", stage: "university" },
    ])("prepares a single non-repeating education row ($value, latest=$latest)", async ({ latest, graduate, value, stage }) => {
      singleEducationDocument();
      const save = vi.fn();
      document.querySelector("#save")!.addEventListener("click", save);
      const singleProfile: Profile = {
        ...createEmptyProfile(),
        education: [
          { id: "high", sectionId: "highSchool", values: {} },
          { id: "university", sectionId: "university", values: {
            schoolType: "대학교",
            ...(latest ? { latestEducationType: latest } : {}),
          } },
          ...(graduate ? [{ id: "graduate", sectionId: "graduateSchool", values: { degreeLevel: "석사" } }] : []),
        ],
      };
      const api = mockApi({ category: "EDUCATION" });
      const result = await runGenericStructureLoop({
        document, profile: singleProfile, apiClient: api.client,
      });
      expect(result.initialRemaining.map(({ kind }) => kind)).toEqual(["SELECT_ROW_KIND"]);
      expect(result.actions).toEqual([{
        kind: "SELECT_ROW_KIND", sectionTitle: "학력", result: "done", rowIndex: 0,
      }]);
      expect(document.querySelector("select")!.value).toBe(value);
      expect(save).not.toHaveBeenCalled();
      expect([...result.context.educationRows.values()]).toMatchObject([
        { sectionId: stage, sectionIndex: 0, selectedValue: value },
      ]);
      const snapshot = await collectGenericStructureSnapshot(document, undefined, result.context);
      const school = snapshot.request.sections.flatMap((section) => [
        ...section.fields, ...(section.items ?? []).flatMap((item) => item.fields),
      ]).find((field) => field.displayName?.endsWith("학교명"))!;
      const mapped = (key: string) => applyGenericStructureAnalysis({
        snapshotId: snapshot.request.snapshotId, mode: "GENERIC", analysisStatus: "COMPLETE",
        fields: [{
          candidateId: school.candidateId, matchType: "MATCH", profileFieldKey: key,
          autofillPolicy: "ALLOWED", mappingStatus: "LLM_SUGGESTED", interactionStatus: "READY",
        }],
      }, snapshot, result.context);
      expect(mapped(`education.${stage}.schoolName`).fields[0].matchType).toBe("MATCH");
      expect(mapped("education.highSchool.schoolName").fields[0].matchType).toBe("NO_MATCH");
      const lookup = snapshot.registry.lookupField(school.candidateId);
      expect("handle" in lookup && lookup.handle.itemIndex).toBe(0);
      expect("handle" in lookup && lookup.handle.itemGroupId).toContain(`:stage:${stage}`);
      expect(api.generic.flatMap((request) => request.sections).flatMap((section) => section.fields))
        .toEqual(expect.arrayContaining([expect.objectContaining({ candidateId: expect.any(String), displayName: stage === "university" ? "대학교 학교명" : "대학원 학교명" })]));
    });

    it("leaves a single education row without a stage select unchanged", async () => {
      singleEducationDocument(false);
      const api = mockApi({ category: "EDUCATION" });
      const result = await runGenericStructureLoop({
        document, profile, apiClient: api.client,
      });
      expect(result.actions).toEqual([]);
      expect(api.decisions).toEqual([]);
    });

    it("does not select an unclassified single row", async () => {
      singleEducationDocument();
      const api = mockApi({ category: "NONE" });
      const result = await runGenericStructureLoop({
        document, profile, apiClient: api.client,
      });
      expect(result.actions).toEqual([]);
      expect(api.decisions).toEqual([]);
    });

    const educationDocument = (withSelect = true) => {
      document.body.innerHTML = `<section><h3>학력</h3><div id="list">${[0, 1]
        .map(
          (index) =>
            `<div class="r" ismultirow="true">${
              withSelect
                ? `<select name="kind${index}"><option value="">구분</option><option value="B">대학(학사)</option><option value="M">대학원(석사)</option></select>`
                : ""
            }<label><span class="t">학교명</span><input name="school${index}" /></label><label>전공<input name="major${index}" /></label></div>`,
        )
        .join("")}</div><button type="button">학력 추가</button></section>`;
      document.querySelectorAll("select").forEach((select) =>
        select.addEventListener("change", () => {
          const text = select.value === "M" ? "대학원 학교명" : "대학교 학교명";
          select.closest(".r")!.querySelector(".t")!.textContent =
            text.replace(" 학교명", "") + " 학교명";
        }),
      );
    };
    const profile: Profile = {
      ...createEmptyProfile(),
      education: [
        {
          id: "e0",
          sectionId: "university",
          values: { schoolType: "대학교", degreeLevel: "학사" },
        },
        {
          id: "e1",
          sectionId: "graduateSchool",
          values: { degreeLevel: "석사" },
        },
      ],
    };

    it.each(["education", "EDUCATION"])("links the bachelor and master entries by row kind option without the mixed-section rules (%s)", async (category) => {
      educationDocument();
      // The default collection does use the mixed rules on this document.
      collectFieldsSnapshot(document);
      expect(vi.mocked(detectMixedSectionGroup)).toHaveBeenCalled();
      vi.clearAllMocks();
      const api = mockApi({ category });

      const result = await runGenericStructureLoop({
        document,
        profile,
        apiClient: api.client,
      });

      expect(vi.mocked(detectMixedSectionGroup)).not.toHaveBeenCalled();
      expect(vi.mocked(assignMixedRows)).not.toHaveBeenCalled();
      expect(vi.mocked(prepareMixedSectionRows)).not.toHaveBeenCalled();
      const selects = Array.from(document.querySelectorAll("select"));
      expect(selects.map((select) => select.value)).toEqual(["B", "M"]);
      expect(result.actions).toEqual([
        {
          kind: "SELECT_ROW_KIND",
          sectionTitle: "학력",
          result: "done",
          rowIndex: 0,
        },
        {
          kind: "SELECT_ROW_KIND",
          sectionTitle: "학력",
          result: "done",
          rowIndex: 1,
        },
      ]);
      // One question covers all rows because the options are the same.
      expect(
        api.decisions.filter((request) =>
          request.decisions.some(({ role }) => role === "ROW_KIND_OPTION"),
        ),
      ).toHaveLength(1);
      expect(
        api.generic
          .flatMap((request) => request.sections)
          .flatMap((section) => section.fields)
          .map((field) => field.displayName),
      ).toContain("대학원 학교명");
    });

    it("selects row kinds when the initial prompt omits its value attribute", async () => {
      educationDocument();
      document.querySelectorAll("select").forEach((select) => {
        select.options[0].removeAttribute("value");
        select.options[0].textContent = "선택";
      });
      const result = await runGenericStructureLoop({
        document,
        profile,
        apiClient: mockApi({ category: "EDUCATION" }).client,
      });
      expect(
        Array.from(document.querySelectorAll("select"), (select) => select.value),
      ).toEqual(["B", "M"]);
      expect(result.actions.filter((action) => action.result === "done")).toHaveLength(2);
    });

    it("preserves a meaningful preselected row kind that conflicts with the profile", async () => {
      educationDocument();
      const first = document.querySelector("select")!;
      first.value = "M";
      const result = await runGenericStructureLoop({
        document,
        profile,
        apiClient: mockApi({ category: "EDUCATION" }).client,
      });
      expect(first.value).toBe("M");
      expect(result.actions).toContainEqual({
        kind: "SELECT_ROW_KIND",
        sectionTitle: "학력",
        result: "blocked",
        reason: "ROW_KIND_MISMATCH",
        rowIndex: 0,
      });
    });

    it("blocks only the row whose revealed fields belong to another stage", async () => {
      educationDocument();
      const result = await runGenericStructureLoop({
        document,
        profile,
        apiClient: mockApi({ graduateKey: "education.university.schoolName" })
          .client,
      });
      expect(result.actions.map(({ result: outcome }) => outcome)).toEqual([
        "done",
        "blocked",
      ]);
      expect(result.actions[1]).toMatchObject({
        reason: "STAGE_KEY_MISMATCH",
        rowIndex: 1,
      });
      expect(result.sections[0]).toMatchObject({
        status: "OPEN",
        blockedRows: [1],
      });
    });

    it("blocks the row when the server declines every option", async () => {
      educationDocument();
      const result = await runGenericStructureLoop({
        document,
        profile,
        apiClient: mockApi({ abstain: ["ROW_KIND_OPTION"] }).client,
      });
      expect(result.actions.map(({ reason }) => reason)).toEqual([
        "ROW_KIND_OPTION_UNDECIDED",
        "ROW_KIND_OPTION_UNDECIDED",
      ]);
      expect(
        Array.from(document.querySelectorAll("select")).map((s) => s.value),
      ).toEqual(["", ""]);
    });

    it("asks no row kind question when the rows have no kind select", async () => {
      educationDocument(false);
      const api = mockApi();
      const result = await runGenericStructureLoop({
        document,
        profile,
        apiClient: api.client,
      });
      expect(api.decisions).toEqual([]);
      expect(result.questions).toEqual([]);
      expect(result.actions).toEqual([]);
    });
  });

  it("opens a collapsed section only after the server selects its control", async () => {
    document.body.innerHTML = `<section><h3>경력</h3>
      <button type="button" id="open" aria-expanded="false">경력 펼치기</button>
      <div id="panel" hidden><input name="company" /><input name="role" /></div>
    </section>`;
    document.querySelector("#open")!.addEventListener("click", () => {
      document.querySelector("#panel")!.removeAttribute("hidden");
      document.querySelector("#open")!.setAttribute("aria-expanded", "true");
    });
    const clicks = watchClicks();

    const result = await runGenericStructureLoop({
      document,
      profile: { ...createEmptyProfile(), careers: entries(1, "career") },
      apiClient: mockApi().client,
    });

    expect(clicks).toEqual(["open"]);
    expect(document.querySelector("#panel")!.hasAttribute("hidden")).toBe(
      false,
    );
    expect(result.actions).toEqual([
      { kind: "REVEAL_SECTION", sectionTitle: "경력 펼치기", result: "done" },
    ]);
  });

  it("does not open a collapsed section the server declines", async () => {
    document.body.innerHTML = `<section><h3>경력</h3>
      <button type="button" id="open" aria-expanded="false">경력 펼치기</button>
      <div id="panel" hidden><input name="company" /></div>
    </section>`;
    const clicks = watchClicks();
    const result = await runGenericStructureLoop({
      document,
      profile: { ...createEmptyProfile(), careers: entries(1, "career") },
      apiClient: mockApi({ abstain: ["SECTION_REVEAL"] }).client,
    });
    expect(clicks).toEqual([]);
    expect(result.actions).toEqual([
      {
        kind: "REVEAL_SECTION",
        sectionTitle: "경력 펼치기",
        result: "blocked",
        reason: "SECTION_REVEAL_ABSTAINED",
      },
    ]);
  });

  it("stops without acting when already aborted", async () => {
    document.body.innerHTML = `<section><h3>경력</h3><div id="rows">${careerRow(0)}</div>
      <button type="button" id="add">경력 추가</button></section>`;
    const clicks = watchClicks();
    const controller = new AbortController();
    controller.abort();
    const result = await runGenericStructureLoop({
      document,
      profile: { ...createEmptyProfile(), careers: entries(2, "career") },
      apiClient: mockApi().client,
      signal: controller.signal,
    });
    expect(result.stopReason).toBe("ABORTED");
    expect(clicks).toEqual([]);
  });
});

describe("structural loop live safety and termination", () => {
  it("blocks the section if a structural handler changes the URL", async () => {
    const url = document.URL;
    document.body.innerHTML = `<section><h3>경력</h3>
      <div id="rows">${careerRow(0)}</div>
      <button type="button" id="add">경력 추가</button></section>`;
    const clicked = vi.fn(() => {
      document.getElementById("rows")!.insertAdjacentHTML("beforeend", careerRow(1));
      window.history.pushState(null, "", "#unexpected-navigation");
    });
    document.getElementById("add")!.addEventListener("click", clicked);
    try {
      const result = await runGenericStructureLoop({
        document,
        profile: { ...createEmptyProfile(), careers: entries(3, "career") },
        apiClient: mockApi().client,
      });
      expect(clicked).toHaveBeenCalledTimes(1);
      expect(result.sections[0]).toMatchObject({
        status: "BLOCKED", reason: "URL_CHANGED",
      });
      expect(result.stopReason).toBe("ABORTED");
    } finally {
      window.history.replaceState(null, "", url);
    }
  });

  it("blocks an unclassified section while another section still adds its row", async () => {
    document.body.innerHTML = `<section><h3>경력</h3>
      <div id="career-rows">${careerRow(0)}</div>
      <button type="button" id="career-add">경력 추가</button></section>
      <section><h3>자격증</h3><div id="certificate-rows">
      <div ismultirow="true"><label>자격명<input name="credential0"></label>
      <label>취득일<input name="date0"></label></div></div>
      <button type="button" id="certificate-add">자격증 추가</button></section>`;
    document
      .getElementById("career-add")!
      .addEventListener("click", () =>
        document
          .getElementById("career-rows")!
          .insertAdjacentHTML("beforeend", careerRow(1)),
      );
    const api = mockApi();
    const classify = api.raw.classifySections.getMockImplementation()!;
    api.raw.classifySections.mockImplementation(async (request) => {
      const response = await classify(request);
      return {
        ...response,
        sections: response.sections.filter(
          ({ category }) => category !== "certifications",
        ),
      };
    });
    const result = await runGenericStructureLoop({
      document,
      profile: {
        ...createEmptyProfile(),
        careers: entries(2, "career"),
        certifications: entries(2, "certificate"),
      },
      apiClient: api.client,
    });
    expect(document.querySelector("#career-rows")!.children).toHaveLength(2);
    expect(document.querySelector("#certificate-rows")!.children).toHaveLength(
      1,
    );
    expect(
      result.sections.find(({ category }) => category === "careers")?.status,
    ).toBe("OPEN");
    expect(
      result.sections.find(({ title }) => title === "자격증"),
    ).toMatchObject({
      status: "BLOCKED",
      reason: "CLASSIFY_UNAVAILABLE",
    });
  });

  it("rechecks a button that becomes a save submit while the decision is pending", async () => {
    document.body.innerHTML = `<form><section><h3>경력</h3>
      <div id="rows">${careerRow(0)}</div>
      <button type="button" id="add">경력 추가</button>
    </section></form>`;
    const button = document.querySelector<HTMLButtonElement>("#add")!;
    const clicks = vi.fn();
    button.addEventListener("click", clicks);
    document
      .querySelector("form")!
      .addEventListener("submit", (event) => event.preventDefault());
    const api = mockApi();
    const decide = api.raw.decideInteractions.getMockImplementation()!;
    api.raw.decideInteractions.mockImplementation(async (request) => {
      const response = await decide(request);
      button.removeAttribute("type");
      button.textContent = "저장";
      return response;
    });
    const result = await runGenericStructureLoop({
      document,
      profile: { ...createEmptyProfile(), careers: entries(2, "career") },
      apiClient: api.client,
    });
    expect(clicks).not.toHaveBeenCalled();
    expect(result.sections[0]?.status).toBe("BLOCKED");
  });

  it("opens each of two unrelated collapsed sections", async () => {
    document.body.innerHTML = `<section><h3>경력</h3>
      <button type="button" id="one" aria-expanded="false">첫 영역 펼치기</button>
      <div id="first" hidden><label>회사명<input></label></div>
    </section><section><h3>자격증</h3>
      <button type="button" id="two" aria-expanded="false">둘째 영역 펼치기</button>
      <div id="second" hidden><label>자격명<input></label></div>
    </section>`;
    for (const [button, panel] of [
      ["one", "first"],
      ["two", "second"],
    ]) {
      document.getElementById(button!)!.addEventListener("click", () => {
        document.getElementById(panel!)!.removeAttribute("hidden");
        document.getElementById(button!)!.setAttribute("aria-expanded", "true");
      });
    }
    const result = await runGenericStructureLoop({
      document,
      profile: createEmptyProfile(),
      apiClient: mockApi().client,
    });
    expect(document.querySelectorAll("[hidden]")).toHaveLength(0);
    expect(
      result.actions.filter(({ result: outcome }) => outcome === "done"),
    ).toHaveLength(2);
  });

  it("limits one section to ten verified row additions", async () => {
    document.body.innerHTML = `<section><h3>경력</h3>
      <div id="rows">${careerRow(0)}</div>
      <button type="button" id="add">경력 추가</button></section>`;
    const rows = document.getElementById("rows")!;
    const click = vi.fn(() =>
      rows.insertAdjacentHTML("beforeend", careerRow(rows.children.length)),
    );
    document.getElementById("add")!.addEventListener("click", click);
    const result = await runGenericStructureLoop({
      document,
      profile: { ...createEmptyProfile(), careers: entries(15, "career") },
      apiClient: mockApi().client,
    });
    expect(click).toHaveBeenCalledTimes(10);
    expect(rows.children).toHaveLength(11);
    expect(result.sections[0]).toMatchObject({
      status: "BLOCKED",
      reason: "SECTION_ACTION_LIMIT",
    });
  }, 120_000);

  it("limits one section to ten openings even with more eligible controls", async () => {
    document.body.innerHTML = `<section><h3>경력</h3>${Array.from(
      { length: 11 },
      (_, i) => `<button type="button" aria-expanded="false"
        aria-controls="panel${i}">영역 ${i} 펼치기</button>
        <div id="panel${i}" hidden><input name="text${i}"></div>`,
    ).join("")}</section>`;
    const clicked = vi.fn();
    document.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        clicked();
        document
          .getElementById(button.getAttribute("aria-controls")!)!
          .removeAttribute("hidden");
        button.setAttribute("aria-expanded", "true");
      });
    });
    const result = await runGenericStructureLoop({
      document,
      profile: createEmptyProfile(),
      apiClient: mockApi().client,
    });
    expect(clicked).toHaveBeenCalledTimes(10);
    expect(document.querySelectorAll("[hidden]")).toHaveLength(1);
    expect(result.actions.at(-1)?.reason).toBe("SECTION_ACTION_LIMIT");
  }, 120_000);
});

describe("runGenericStructureLoop on sanitized fixtures", () => {
  const fixtureHtml = (name: string) =>
    readFileSync(
      join(process.cwd(), "fixtures/dom-snapshots", name, "sanitized.html"),
      "utf8",
    );
  const profile: Profile = {
    ...createEmptyProfile(),
    education: [
      {
        id: "u0",
        sectionId: "university",
        values: { schoolType: "대학교", degreeLevel: "학사" },
      },
      {
        id: "u1",
        sectionId: "university",
        values: { schoolType: "전문대학", degreeLevel: "전문학사" },
      },
    ],
    careers: entries(2, "career"),
    certifications: entries(1, "certificate"),
    languages: entries(1, "languageTest"),
  };

  it.each([
    ["lg-ai-research-birth-split-email"],
    ["sk-careers-application-form"],
  ])(
    "computes the remaining points of %s and clicks nothing forbidden",
    async (name) => {
      document.body.innerHTML = fixtureHtml(name);
      const clicks = watchClicks();
      const api = mockApi({
        abstain: ["REPEAT_ADD", "SECTION_REVEAL", "ROW_KIND_OPTION"],
      });
      const result = await runGenericStructureLoop({
        document,
        profile,
        apiClient: api.client,
      });
      expect({
        remaining: result.initialRemaining,
        questions: result.questions,
        clicks,
        actions: result.actions,
      }).toEqual(EXPECTED[name]);
      expect(api.raw.analyzePreparation).not.toHaveBeenCalled();
    },
    300_000,
  );
});

const EXPECTED: Record<
  string,
  {
    remaining: unknown[];
    questions: unknown[];
    clicks: string[];
    actions: unknown[];
  }
> = {
  "lg-ai-research-birth-split-email": {
    remaining: [],
    questions: [],
    clicks: [],
    actions: [],
  },
  // One career row where the profile has two, and a second education row
  // whose kind select is still unset. Both controls are declined.
  "sk-careers-application-form": {
    remaining: [
      {
        kind: "ADD_ROW",
        sectionTitle: "경력",
        category: "careers",
        rows: 1,
        needed: 2,
      },
      {
        kind: "SELECT_ROW_KIND",
        sectionTitle: "학력",
        category: "education",
        rowIndex: 1,
      },
    ],
    questions: [
      { role: "REPEAT_ADD", candidates: ["경력 사항 추가"] },
      {
        role: "ROW_KIND_OPTION",
        candidates: ["전문대학(전문학사)", "대학(학사)"],
      },
    ],
    clicks: [],
    actions: [
      {
        kind: "ADD_ROW",
        sectionTitle: "경력",
        result: "blocked",
        reason: "REPEAT_ADD_ABSTAINED",
      },
      {
        kind: "SELECT_ROW_KIND",
        sectionTitle: "학력",
        result: "blocked",
        reason: "ROW_KIND_OPTION_UNDECIDED",
        rowIndex: 1,
      },
    ],
  },
};
