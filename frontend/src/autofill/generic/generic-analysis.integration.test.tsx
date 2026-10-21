import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { fixturePolicy } from "../../test/fixtures/execution-policy";
import { createEmptyProfile, type Profile } from "../../profile/model";
import { resolveDocumentCompany } from "../adapters/company";
import { getWorkflowAdapter } from "../adapters/workflow";
import { RuntimeAnalysisApiClient } from "../api/runtime-client";
import type {
  AnalysisApiClient,
  FieldCandidate,
  FieldsAnalyzeRequest,
  GenericFieldsRequest,
  GenericFieldsResponse,
  SectionClassifyRequest,
} from "../api/types";
import type { InteractionDecisionRequest } from "../api/interaction-types";
import type { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowScreens } from "../workflow/WorkflowScreens";
import { genericItemReason, genericReasonText } from "./grade-reason-text";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { createWriteRevealedFields } from "../workflow/revealed-fields";
import { createAnalyzeFields } from "../workflow/workflow-analysis";
import type { PreparationItem } from "../workflow/workflow-model";
import type {
  GenericFieldGrade,
  GenericSectionResult,
} from "./generic-analysis";

afterEach(() => {
  installExecutionPolicy(document);
  document.head.replaceChildren();
  document.body.onmousedown = null;
  document.body.replaceChildren();
});

const LARGE_PAGE = join(
  process.cwd(),
  "../harness/fixtures/generic-autofill/pages/large-generic-form.html",
);

const PREFILLED = "PREFILLED-SYNTHETIC-MARKER";

/** Synthetic matcher keyed by the collected label; never by a site. */
const KEYS_BY_LABEL: Record<string, string> = {
  성: "personal.personal.koreanFamilyName",
  "성(한글)": "personal.personal.koreanFamilyName",
  이메일: "contact.contact.email",
  국적: "personal.personal.nationality",
  학교명: "education.university.schoolName",
  전공: "education.university.majorName",
};

const CATEGORY_BY_TITLE: Record<string, string> = {
  인적사항: "personal",
  연락처: "contact",
  학력: "education",
};

function fullProfile(): Profile {
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "합성성씨";
  profile.personal.nationality = "미국";
  profile.contact.email = "synthetic-person@example.test";
  profile.education.push({
    id: "entry-1",
    sectionId: "university",
    values: { schoolName: "합성대학교", majorName: "합성전공학과" },
  });
  return profile;
}

const PROFILE_VALUES = [
  "합성성씨",
  "synthetic-person@example.test",
  "합성대학교",
  "합성전공학과",
];

function mountSyntheticForm() {
  document.body.innerHTML = `
    <form>
      <h2>인적사항</h2>
      <label>성<input name="family" /></label>
      <label>국적<select name="nationality" aria-controls="regionA">
        <option value="">선택</option><option value="us">미국</option><option value="jp">일본</option>
      </select></label>
      <div id="regionA"><label>국문 이름<input name="given" /></label></div>
      <h2>연락처</h2>
      <label>이메일<input name="email" value="${PREFILLED}" /></label>
      <h2>학력</h2>
      <label>학교명<input name="school" /></label>
      <label>전공<input name="major" /></label>
      <label>입학 동기<input type="checkbox" name="agree" /></label>
    </form>`;
}

function mountLargePage() {
  const page = new DOMParser().parseFromString(
    readFileSync(LARGE_PAGE, "utf8"),
    "text/html",
  );
  page.querySelectorAll("script").forEach((script) => script.remove());
  document.head.innerHTML = page.head.innerHTML;
  document.body.innerHTML = page.body.innerHTML;
}

function controlValues() {
  return Array.from(
    document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea"),
  ).map((control) => [
    control.name,
    control.value,
    control instanceof HTMLInputElement ? control.checked : undefined,
  ]);
}

interface ClientOptions {
  generic?: boolean;
  field?: (
    candidate: FieldCandidate,
    category: string | undefined,
  ) => Partial<GenericFieldsResponse["fields"][number]>;
}

function createClient(options: ClientOptions = {}) {
  const calls: string[] = [];
  const classifyRequests: SectionClassifyRequest[] = [];
  const genericRequests: GenericFieldsRequest[] = [];
  const sharedRequests: FieldsAnalyzeRequest[] = [];
  const decisionRequests: InteractionDecisionRequest[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const track = async <T,>(name: string, work: () => T): Promise<T> => {
    calls.push(name);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await Promise.resolve();
      return work();
    } finally {
      inFlight -= 1;
    }
  };
  const keyOf = (candidate: FieldCandidate) =>
    KEYS_BY_LABEL[candidate.displayName ?? ""] ?? null;
  const client: AnalysisApiClient = {
    analyzePreparation: async () => {
      throw new Error("Preparation is not part of this test");
    },
    decideInteractions: async (request) => {
      decisionRequests.push(structuredClone(request));
      throw new Error("No interaction decision is expected before approval");
    },
    analyzeFields: (request) =>
      track("analyzeFields", () => {
        sharedRequests.push(structuredClone(request));
        return {
          snapshotId: request.snapshotId,
          mode: "GENERIC" as const,
          analysisStatus: "COMPLETE" as const,
          fields: request.sections
            .flatMap((section) => [
              ...section.fields,
              ...(section.items ?? []).flatMap((item) => item.fields),
            ])
            .map((field) => {
              const key = keyOf(field);
              return key
                ? {
                    candidateId: field.candidateId,
                    matchType: "MATCH" as const,
                    valueBinding: {
                      type: "DIRECT" as const,
                      profileFieldKey: key,
                    },
                    autofillPolicy: "ALLOWED" as const,
                    mappingStatus: "LLM_SUGGESTED" as const,
                    interactionStatus: "READY" as const,
                    writePlan: {
                      command:
                        field.control === "select"
                          ? ("SELECT_OPTION" as const)
                          : ("SET_TEXT" as const),
                    },
                  }
                : {
                    candidateId: field.candidateId,
                    matchType: "NO_MATCH" as const,
                    mappingStatus: "LLM_SUGGESTED" as const,
                    interactionStatus: "BLOCKED" as const,
                    reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
                  };
            }),
        };
      }),
  };
  if (options.generic !== false) {
    client.classifySections = (request) =>
      track("classifySections", () => {
        classifyRequests.push(structuredClone(request));
        return {
          schemaVersion: 1 as const,
          snapshotId: request.snapshotId,
          status: "COMPLETE" as const,
          sections: request.sections.map((section) => ({
            sectionId: section.sectionId,
            category: CATEGORY_BY_TITLE[section.title ?? ""] ?? "NONE",
            confidence: 0.9,
          })),
        };
      });
    client.analyzeGenericFields = (request) =>
      track("analyzeGenericFields", () => {
        genericRequests.push(structuredClone(request));
        return {
          schemaVersion: 3 as const,
          snapshotId: request.snapshotId,
          status: "COMPLETE" as const,
          fields: request.sections.flatMap((section) =>
            section.fields.map((candidate) => {
              const key = keyOf(candidate);
              // A category-scoped matcher only returns keys of its category.
              const scoped =
                key &&
                (section.category === "NONE" ||
                  key.startsWith(`${section.category}.`))
                  ? key
                  : null;
              const base: GenericFieldsResponse["fields"][number] = scoped
                ? {
                    candidateId: candidate.candidateId,
                    profileFieldKey: scoped,
                    confidence: 0.92,
                    categoryConfirmed: true,
                    autofillPolicy: "ALLOWED",
                    interactionStatus: "READY",
                    writePlan: {
                      command:
                        candidate.control === "select"
                          ? "SELECT_OPTION"
                          : "SET_TEXT",
                    },
                  }
                : {
                    candidateId: candidate.candidateId,
                    profileFieldKey: null,
                    confidence: 0,
                    categoryConfirmed: true,
                    interactionStatus: "BLOCKED",
                  };
              return {
                ...base,
                ...options.field?.(candidate, section.category),
              };
            }),
          ),
          diagnostics: { jevCalls: 1, elapsedMs: 1 },
        };
      });
  }
  return {
    client,
    calls,
    classifyRequests,
    genericRequests,
    sharedRequests,
    decisionRequests,
    maxInFlight: () => maxInFlight,
  };
}

type Snapshot = ReturnType<typeof collectFieldsSnapshot>;

function workflow(
  client: AnalysisApiClient,
  profile: Profile = fullProfile(),
  addressRun = { current: { controller: new AbortController() } },
) {
  const stages: string[] = [];
  const state: {
    reviewItems: ReviewPlanItem[];
    snapshot?: Snapshot;
    grades?: ReadonlyMap<string, GenericFieldGrade>;
    sections?: readonly GenericSectionResult[];
    results: unknown[];
  } = { reviewItems: [], results: [] };
  const context = {
    adapter: getWorkflowAdapter(document),
    completedGenericStateDrivers: { current: new Map() },
    addressRun,
    addressSearch: async () => false,
    apiClient: client,
    pageDocument: document,
    repository: { load: async () => profile },
    approvedSensitiveValues: { current: new Map() },
    consideredSensitiveValues: { current: new Map() },
    freshDefaultControls: { current: new WeakSet<Element>() },
    completedDriverKeys: { current: new Set<string>() },
    deferredDriverGroups: { current: new Set<Element>() },
    setAddressResult: () => undefined,
    setExceptionTitle: () => undefined,
    setStage: (stage: unknown) => {
      if (typeof stage === "string") stages.push(stage);
    },
    setFieldsSnapshot: (next: unknown) => {
      state.snapshot = next as Snapshot;
    },
    setReviewItems: (next: unknown) => {
      state.reviewItems =
        typeof next === "function" ? next(state.reviewItems) : next;
    },
    setPartial: () => undefined,
    setWarnings: () => undefined,
    setResults: (next: unknown) => {
      state.results = typeof next === "function" ? next(state.results) : next;
    },
    onGenericGrades: (
      grades: ReadonlyMap<string, GenericFieldGrade>,
      sections: readonly GenericSectionResult[],
    ) => {
      state.grades = grades;
      state.sections = sections;
    },
  } as unknown as Parameters<typeof createAnalyzeFields>[0];
  // A new closure per call, as the workflow component does.
  const analyze = () => createAnalyzeFields(context)(profile);
  const item = (name: string) => {
    const found = state.reviewItems.find((entry) => {
      const lookup = state.snapshot!.registry.lookupField(entry.candidateId);
      return "handle" in lookup && lookup.handle.candidate.domName === name;
    });
    if (!found) throw new Error(`missing review item ${name}`);
    return found;
  };
  return { analyze, stages, state, item, addressRun };
}

const WRITE_PLAN_REASON = {
  BLOCKED: "WRITE_PLAN_BLOCKED",
  MANUAL_REVEAL_REQUIRED: "WRITE_PLAN_MANUAL_REVEAL",
  SYSTEM_CONTROL: "WRITE_PLAN_SYSTEM_CONTROL",
  UNVERIFIED: "WRITE_PLAN_UNVERIFIED",
} as const;

describe("generic section flow", () => {
  it.each([
    "BLOCKED",
    "MANUAL_REVEAL_REQUIRED",
    "SYSTEM_CONTROL",
    "UNVERIFIED",
  ] as const)(
    "displays the execution block for %s without claiming the saved school is missing",
    async (interactionStatus) => {
      document.body.innerHTML =
        '<h2>학력</h2><label>학교명<input name="school"></label>';
      const api = createClient({
        field: () => ({ interactionStatus, writePlan: undefined }),
      });
      const run = workflow(api.client);
      await run.analyze();
      const item = run.item("school");
      expect(item).toMatchObject({
        genericGrade: "BLOCKED",
        genericReasonCode: WRITE_PLAN_REASON[interactionStatus],
        selected: false,
        disabled: true,
      });
      expect(item.analysis).not.toHaveProperty("writePlan");
      render(
        <WorkflowScreens
          stage="review"
          preparationItems={[]}
          warnings={[]}
          revealedPreparationKeys={new Set()}
          selectedPreparationKeys={new Set()}
          setRevealedPreparationKeys={() => undefined}
          setSelectedPreparationKeys={() => undefined}
          executePreparation={async () => undefined}
          reviewItems={run.state.reviewItems}
          partial={false}
          toggleReviewItem={() => undefined}
          executeWrites={async () => undefined}
          results={[]}
          adapter={getWorkflowAdapter(document)}
          workflowDiagnostics={[]}
          exceptionTitle=""
          onExit={() => undefined}
        />,
      );
      fireEvent.click(screen.getByRole("tab", { name: "입력 불가 1" }));
      const row = screen
        .getByRole("button", { name: /학교명.*필드로 이동/ })
        .closest("article")!;
      expect(within(row).getByText(genericItemReason(item))).toBeVisible();
      expect(
        within(row).queryByText(genericReasonText("NO_PROFILE_VALUE")),
      ).toBeNull();
      expect(
        within(row).queryByRole("button", { name: /포함하기/ }),
      ).toBeNull();
    },
  );

  it("splits, classifies, matches by category and grades before review", async () => {
    mountSyntheticForm();
    const api = createClient();
    const run = workflow(api.client);

    await run.analyze();

    expect(api.calls).toEqual(["classifySections", "analyzeGenericFields"]);
    expect(run.stages.at(-1)).toBe("review");
    expect(run.stages).not.toContain("writing");
    const education = api.genericRequests[0]!.sections.find(
      (section) => section.category === "education",
    )!;
    expect(education.fields.map((field) => field.domName)).toEqual([
      "school",
      "major",
      "agree",
    ]);
    const educationIds = new Set(
      education.fields.map((field) => field.candidateId),
    );
    const educationKeys = run.state.reviewItems
      .filter((entry) => educationIds.has(entry.candidateId))
      .flatMap((entry) =>
        entry.analysis?.valueBinding?.type === "DIRECT"
          ? [entry.analysis.valueBinding.profileFieldKey]
          : [],
      );
    expect(educationKeys.length).toBeGreaterThan(0);
    expect(educationKeys.every((key) => key.startsWith("education."))).toBe(
      true,
    );
    expect(run.state.sections?.map((section) => section.category)).toEqual([
      "personal",
      "contact",
      "education",
    ]);
  });

  it("changes no field value before approval and writes only the approved item", async () => {
    mountSyntheticForm();
    const before = controlValues();
    const api = createClient();
    const run = workflow(api.client);

    await run.analyze();

    expect(run.stages.at(-1)).toBe("review");
    expect(controlValues()).toEqual(before);
    expect(api.decisionRequests).toHaveLength(0);
    const family = run.item("family");
    expect(family.selected).toBe(true);
    await executeApprovedWritesAfterPageSettles({
      items: run.state.reviewItems,
      approvedCandidateIds: new Set([family.candidateId]),
      registry: run.state.snapshot!.registry,
      document,
    });
    expect(controlValues()).toEqual(
      before.map((entry) =>
        entry[0] === "family" ? ["family", "합성성씨", false] : entry,
      ),
    );
  });

  it("leaves REVIEW unselected and BLOCKED unselected and disabled with a reason", async () => {
    mountSyntheticForm();
    const api = createClient({
      field: (candidate) =>
        candidate.domName === "major"
          ? { profileFieldKey: "personal.personal.englishGivenName", confidence: 0.9 }
          : candidate.domName === "email"
            ? {
                profileFieldKey: null,
                confidence: 0,
                reason: "LLM_UNAVAILABLE",
                autofillPolicy: undefined,
                writePlan: undefined,
                interactionStatus: "BLOCKED",
              }
            : {},
    });
    const profile = fullProfile();
    profile.education[0]!.values.schoolName = "";
    profile.personal.englishGivenName = "Synthetic";
    const run = workflow(api.client, profile);

    await run.analyze();

    expect(run.stages.at(-1)).toBe("review");
    expect(run.item("major")).toMatchObject({ selected: false });
    expect(run.state.grades?.get(run.item("major").candidateId)).toEqual({
      grade: "REVIEW",
      reason: "UNPAIRED_NAME_PART",
    });
    for (const [name, reason] of [
      ["school", "NO_PROFILE_VALUE"],
      ["email", "LLM_UNAVAILABLE"],
    ] as const) {
      expect(run.item(name)).toMatchObject({ selected: false, disabled: true });
      expect(run.item(name).reason).not.toBe("");
      expect(run.state.grades?.get(run.item(name).candidateId)).toEqual({
        grade: "BLOCKED",
        reason,
      });
    }
    expect(run.item("family")).toMatchObject({ selected: true });
  });

  it("keeps the review stage with zero writes when classification fails", async () => {
    mountSyntheticForm();
    const before = controlValues();
    const api = createClient();
    api.client.classifySections = async () => {
      throw new Error("classification unavailable");
    };
    const run = workflow(api.client);

    await run.analyze();

    expect(run.stages).not.toContain("exception");
    expect(run.stages.at(-1)).toBe("review");
    expect(controlValues()).toEqual(before);
    expect(
      [...run.state.grades!.values()].every(
        (grade) =>
          grade.grade === "BLOCKED" && grade.reason === "CLASSIFY_UNAVAILABLE",
      ),
    ).toBe(true);
  });

  it("sends no profile value, current input value or profile count, and the same bodies for empty and full profiles", async () => {
    const bodies = async (profile: Profile) => {
      mountSyntheticForm();
      const api = createClient();
      await workflow(api.client, profile).analyze();
      const snapshotIds = [...api.classifyRequests, ...api.genericRequests].map(
        (request) => request.snapshotId,
      );
      return snapshotIds.reduce(
        (body, id) => body.replaceAll(id, "SNAPSHOT"),
        JSON.stringify([
          api.classifyRequests,
          api.genericRequests,
          api.decisionRequests,
        ]),
      );
    };

    const full = await bodies(fullProfile());
    const empty = await bodies(createEmptyProfile());

    for (const value of [...PROFILE_VALUES, PREFILLED])
      expect(full).not.toContain(value);
    expect(full).not.toMatch(/"(?:count|itemCount|entryCount)"/i);
    expect(full).toBe(empty);
  });

  it("opens no forbidden form menu trigger during the full analysis", async () => {
    document.body.innerHTML = `<form id="application">${[
      "학력 구분",
      "삭제",
      "업로드",
      "제출",
    ]
      .map(
        (text, index) => `
        <div id="question-${index}">
          <span>항목 ${index}</span>
          <button type="button" aria-haspopup="menu" aria-controls="menu-${index}">${text}</button>
        </div>
        <ul id="menu-${index}" role="menu" hidden>
          <li role="menuitem">가 항목</li><li role="menuitem">나 항목</li>
        </ul>`,
      )
      .join("")}</form>`;
    const clicks = new Map<string, number>();
    document
      .querySelectorAll<HTMLButtonElement>("button[aria-controls]")
      .forEach((trigger) => {
        const menu = document.getElementById(
          trigger.getAttribute("aria-controls")!,
        )!;
        trigger.addEventListener("click", () => {
          clicks.set(
            trigger.textContent!,
            (clicks.get(trigger.textContent!) ?? 0) + 1,
          );
          menu.hidden = !menu.hidden;
        });
      });
    const api = createClient();

    await workflow(api.client).analyze();

    expect(clicks.get("삭제") ?? 0).toBe(0);
    expect(clicks.get("업로드") ?? 0).toBe(0);
    expect(clicks.get("제출") ?? 0).toBe(0);
    const menus = api.genericRequests[0]!.sections.flatMap(
      (section) => section.fields,
    ).filter((field) => field.control === "select");
    expect(
      menus.map((field) => field.options?.map((o) => o.displayName)),
    ).toEqual([["가 항목", "나 항목"]]);
  });
});

describe("large generic page API calls", () => {
  const candidateIdsOf = (requests: GenericFieldsRequest[]) =>
    requests.flatMap((request) =>
      request.sections.flatMap((section) =>
        section.fields.map((field) => field.candidateId),
      ),
    );

  const LARGE_PAGE_TIMEOUT = 120_000;

  it(
    "analyzes once with one call in flight and reuses every section on re-entry",
    async () => {
      mountLargePage();
      const api = createClient();
      const run = workflow(api.client);

      await run.analyze();
      expect(api.calls).toEqual(["classifySections", "analyzeGenericFields"]);
      expect(api.maxInFlight()).toBe(1);
      expect(api.sharedRequests).toHaveLength(0);
      expect(run.stages.at(-1)).toBe("review");

      await run.analyze();
      expect(api.calls).toHaveLength(2);
    },
    LARGE_PAGE_TIMEOUT,
  );

  it(
    "sends only a hidden section that became visible",
    async () => {
      mountLargePage();
      document.querySelector("form")!.insertAdjacentHTML(
        "beforeend",
        `<div id="later" hidden><div class="section-title">자격 사항</div>
          <div class="field"><label for="x001">자격증 명칭</label><input id="x001" name="cert-name" type="text"></div>
          <div class="field"><label for="x002">취득 기관</label><input id="x002" name="cert-issuer" type="text"></div></div>`,
      );
      const api = createClient();
      const run = workflow(api.client);
      await run.analyze();

      document.getElementById("later")!.removeAttribute("hidden");
      await run.analyze();

      const laterIds = new Set(
        run.state.snapshot!.request.sections.flatMap((section) =>
          section.fields
            .filter((field) => field.domName?.startsWith("cert-"))
            .map((field) => field.candidateId),
        ),
      );
      expect(api.calls).toHaveLength(4);
      const sent = candidateIdsOf(api.genericRequests.slice(1));
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.every((id) => laterIds.has(id))).toBe(true);
    },
    LARGE_PAGE_TIMEOUT,
  );

  it(
    "sends only a newly added section with a new structure",
    async () => {
      mountLargePage();
      const api = createClient();
      const run = workflow(api.client);
      await run.analyze();

      document.querySelector("form")!.insertAdjacentHTML(
        "beforeend",
        `<div class="section-title">어학 시험</div>
          <div class="field"><label for="x003">시험 종류</label><input id="x003" name="lang-test" type="text"></div>
          <div class="field"><label for="x004">시험 점수</label><input id="x004" name="lang-score" type="text"></div>`,
      );
      await run.analyze();

      const newIds = new Set(
        run.state.snapshot!.request.sections.flatMap((section) =>
          section.fields
            .filter((field) => field.domName?.startsWith("lang-"))
            .map((field) => field.candidateId),
        ),
      );
      expect(api.calls).toHaveLength(4);
      const added = candidateIdsOf(api.genericRequests.slice(1));
      expect(added.length).toBeGreaterThan(0);
      expect(added.every((id) => newIds.has(id))).toBe(true);
    },
    LARGE_PAGE_TIMEOUT,
  );

  it(
    "links a same-structure repeat row to cached results without a matching call",
    async () => {
      mountLargePage();
      const api = createClient();
      const run = workflow(api.client);
      await run.analyze();
      expect(api.calls).toEqual(["classifySections", "analyzeGenericFields"]);

      const rows = document.querySelectorAll(
        '.repeat-row[data-row="education"]',
      );
      const row = rows[0]!.cloneNode(true) as Element;
      row
        .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")
        .forEach((control, index) => {
          const id = `c${132 + index}`;
          row
            .querySelector(`label[for="${control.id}"]`)
            ?.setAttribute("for", id);
          control.id = id;
          control.name = control.name.replace(/-\d+$/, "-5");
        });
      rows[rows.length - 1]!.after(row);
      await run.analyze();

      expect(api.calls).toEqual(["classifySections", "analyzeGenericFields"]);
      const school = run.state
        .snapshot!.request.sections.flatMap((section) => [
          ...section.fields,
          ...(section.items ?? []).flatMap((item) => item.fields),
        ])
        .find((field) => field.domName === "edu-school-5")!;
      expect(run.state.grades?.get(school.candidateId)).toBeDefined();
    },
    LARGE_PAGE_TIMEOUT,
  );

  it(
    "records the call count of the previous shared path on the same page",
    async () => {
      mountLargePage();
      const api = createClient({ generic: false });

      await workflow(api.client).analyze();

      // Comparison evidence for the pull request: the shared path sends the
      // whole page per analysis pass, including each state-driver re-analysis.
      console.info(
        `LEGACY_SHARED_ANALYZE_CALLS=${api.sharedRequests.length} FIELDS=${api.sharedRequests
          .map((request) =>
            request.sections.reduce(
              (count, section) =>
                count +
                section.fields.length +
                (section.items ?? []).reduce(
                  (total, item) => total + item.fields.length,
                  0,
                ),
              0,
            ),
          )
          .join(",")}`,
      );
      expect(api.sharedRequests.length).toBeGreaterThanOrEqual(1);
      expect(api.classifyRequests).toHaveLength(0);
    },
    LARGE_PAGE_TIMEOUT,
  );
});

describe("gate", () => {
  const sites = ["sk", "hyundai", "greeting"] as const;
  const siteFor = (company: "policy" | "components") =>
    sites.find((site) => {
      installExecutionPolicy(document, fixturePolicy(site));
      const matches = resolveDocumentCompany(document) === company;
      installExecutionPolicy(document);
      return matches;
    });

  it.each(["policy", "components"] as const)(
    "never calls the generic APIs on a %s document and keeps the shared request",
    async (company) => {
      const site = siteFor(company);
      expect(site).toBeDefined();
      const sharedBodies = async (generic: boolean) => {
        mountSyntheticForm();
        installExecutionPolicy(document, fixturePolicy(site!));
        const api = createClient({ generic });
        await workflow(api.client).analyze();
        installExecutionPolicy(document);
        return {
          api,
          bodies: api.sharedRequests.map((request) =>
            JSON.stringify(request).replaceAll(request.snapshotId, "SNAPSHOT"),
          ),
        };
      };

      const withCapability = await sharedBodies(true);
      const without = await sharedBodies(false);

      expect(withCapability.api.classifyRequests).toHaveLength(0);
      expect(withCapability.api.genericRequests).toHaveLength(0);
      expect(withCapability.api.sharedRequests.length).toBeGreaterThan(0);
      expect(withCapability.bodies).toEqual(without.bodies);
    },
  );

  it("keeps the shared path for a generic document when the client lacks either generic method", async () => {
    for (const missing of [
      "classifySections",
      "analyzeGenericFields",
    ] as const) {
      mountSyntheticForm();
      const api = createClient();
      delete api.client[missing];
      await workflow(api.client).analyze();
      expect(api.calls.length).toBeGreaterThan(0);
      expect(api.calls.every((call) => call === "analyzeFields")).toBe(true);
    }
  });

  it("uses the generic flow through the runtime client that has both methods", async () => {
    mountSyntheticForm();
    const types: string[] = [];
    const client = new RuntimeAnalysisApiClient(async (message) => {
      const { type, payload } = message as {
        type: string;
        payload: unknown;
      };
      const classify = payload as SectionClassifyRequest;
      const generic = payload as GenericFieldsRequest;
      types.push(type);
      if (type === "AUTOFILL_GENERIC_CLASSIFY_SECTIONS")
        return {
          ok: true,
          data: {
            schemaVersion: 1,
            snapshotId: classify.snapshotId,
            status: "COMPLETE",
            sections: classify.sections.map((section) => ({
              sectionId: section.sectionId,
              category: "NONE",
              confidence: 0.5,
            })),
          },
        };
      if (type === "AUTOFILL_GENERIC_ANALYZE_FIELDS")
        return {
          ok: true,
          data: {
            schemaVersion: 3,
            snapshotId: generic.snapshotId,
            status: "COMPLETE",
            fields: generic.sections.flatMap((section) =>
              section.fields.map((field) => ({
                candidateId: field.candidateId,
                profileFieldKey: null,
                confidence: 0,
                categoryConfirmed: false,
                interactionStatus: "BLOCKED",
              })),
            ),
            diagnostics: { jevCalls: 0, elapsedMs: 0 },
          },
        };
      return { ok: false, code: "BAD_REQUEST" };
    });

    await workflow(client).analyze();

    expect(types).toEqual([
      "AUTOFILL_GENERIC_CLASSIFY_SECTIONS",
      "AUTOFILL_GENERIC_ANALYZE_FIELDS",
    ]);
  });

  it("does not reach any analysis API from revealed fields on a generic document", async () => {
    mountSyntheticForm();
    const api = createClient();
    const writeRevealedFields = createWriteRevealedFields({
      adapter: getWorkflowAdapter(document),
      apiClient: api.client,
      pageDocument: document,
      setWorkflowDiagnostics: () => undefined,
    });

    await writeRevealedFields(fullProfile(), [
      {
        plan: {
          actionCandidateId: "a1",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          profileFieldKey: "personal.personal.nationality",
          targetSectionId: "s1",
          revealedFieldBindings: {
            given: "personal.personal.koreanGivenName",
          },
        },
      } as unknown as PreparationItem,
    ]);

    expect(api.calls).toEqual([]);
  });
});

describe("generic synthetic name binding flow", () => {
  const nameField = (
    candidate: FieldCandidate,
  ): Partial<GenericFieldsResponse["fields"][number]> =>
    candidate.displayName === "이름"
      ? {
          profileFieldKey: null,
          binding: { type: "DERIVED", recipe: "KOREAN_FULL_NAME" },
          confidence: 0.92,
          categoryConfirmed: true,
          autofillPolicy: "ALLOWED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        }
      : {};

  function nameProfile(): Profile {
    const profile = createEmptyProfile();
    profile.personal.koreanFamilyName = "합성성씨";
    profile.personal.koreanGivenName = "합성이름";
    return profile;
  }

  it("proposes the combined name, leaves the page untouched and writes it only after approval", async () => {
    document.body.innerHTML = `
      <form>
        <h2>인적사항</h2>
        <label>이름<input name="fullName" /></label>
      </form>`;
    const before = controlValues();
    const api = createClient({ field: nameField });
    const run = workflow(api.client, nameProfile());

    await run.analyze();

    expect(run.stages.at(-1)).toBe("review");
    expect(controlValues()).toEqual(before);
    const item = run.item("fullName");
    expect(item).toMatchObject({
      status: "available",
      selected: true,
      previewValue: "합성성씨합성이름",
    });
    await executeApprovedWritesAfterPageSettles({
      items: run.state.reviewItems,
      approvedCandidateIds: new Set([item.candidateId]),
      registry: run.state.snapshot!.registry,
      document,
    });
    expect(document.querySelector<HTMLInputElement>("[name=fullName]")!.value).toBe(
      "합성성씨합성이름",
    );
    const bodies = JSON.stringify([api.classifyRequests, api.genericRequests]);
    expect(bodies).not.toContain("합성성씨");
    expect(bodies).not.toContain("합성이름");
  });

  it("blocks the recipe field and writes nothing when a name key is empty", async () => {
    document.body.innerHTML = `
      <form>
        <h2>인적사항</h2>
        <label>이름<input name="fullName" /></label>
      </form>`;
    const profile = nameProfile();
    profile.personal.koreanGivenName = "";
    const api = createClient({ field: nameField });
    const run = workflow(api.client, profile);

    await run.analyze();

    const grade = run.state.grades?.get(run.state.reviewItems[0]!.candidateId);
    expect(grade).toEqual({ grade: "BLOCKED", reason: "NO_PROFILE_VALUE" });
    expect(
      run.state.reviewItems.every((entry) => !entry.selected),
    ).toBe(true);
  });
});

describe("generic synthetic date part flow", () => {
  type Override = Partial<GenericFieldsResponse["fields"][number]>;
  const matched: Override = {
    categoryConfirmed: true,
    confidence: 0.92,
    autofillPolicy: "ALLOWED",
    interactionStatus: "READY",
  };
  const derived = (
    recipe:
      | "KOREAN_FULL_NAME"
      | "ENGLISH_FULL_NAME_GIVEN_FIRST"
      | "ENGLISH_FULL_NAME_FAMILY_FIRST",
  ): Override => ({
    ...matched,
    profileFieldKey: null,
    binding: { type: "DERIVED", recipe },
    writePlan: { command: "SET_TEXT" },
  });
  const datePart = (part: "YEAR" | "MONTH" | "DAY"): Override => ({
    ...matched,
    profileFieldKey: "personal.personal.birthDate",
    binding: { type: "DATE_PART", part },
    writePlan: { command: "SELECT_OPTION" },
  });

  function profile(): Profile {
    const synthetic = createEmptyProfile();
    synthetic.personal.koreanFamilyName = "합성성씨";
    synthetic.personal.koreanGivenName = "합성이름";
    synthetic.personal.englishFamilyName = "Synthfamily";
    synthetic.personal.englishGivenName = "Synthgiven";
    synthetic.personal.birthDate = "2000-01-01";
    return synthetic;
  }

  const byLabel = (
    run: ReturnType<typeof workflow>,
    label: string,
  ): ReviewPlanItem => {
    const found = run.state.reviewItems.find(
      (entry) => entry.fieldLabel === label,
    );
    if (!found) throw new Error(`missing review item ${label}`);
    return found;
  };

  const approve = (run: ReturnType<typeof workflow>, labels: string[]) =>
    executeApprovedWritesAfterPageSettles({
      items: run.state.reviewItems,
      approvedCandidateIds: new Set(
        labels.map((label) => byLabel(run, label).candidateId),
      ),
      registry: run.state.snapshot!.registry,
      document,
    });

  const selectedText = (name: string) => {
    const select = document.querySelector<HTMLSelectElement>(`[name=${name}]`)!;
    return select.selectedOptions[0]?.textContent ?? "";
  };

  it("proposes and writes the name and every birth date select on the LG structure", async () => {
    document.body.innerHTML = readFileSync(
      join(
        process.cwd(),
        "fixtures/dom-snapshots/lg-ai-research-birth-split-email/sanitized.html",
      ),
      "utf8",
    );
    const label = Array.from(document.querySelectorAll("label")).find(
      (candidate) => candidate.textContent?.includes("생년월일"),
    )!;
    const selects = document.querySelectorAll<HTMLSelectElement>(
      ".birth-date-selects select",
    );
    selects[0]!.id = label.htmlFor;
    selects.forEach((select, index) => {
      select.name = ["by", "bm", "bd"][index]!;
    });
    document.querySelector("#name")!.setAttribute("name", "fullName");
    const before = controlValues();
    const api = createClient({
      field: (candidate) =>
        candidate.domName === "fullName"
          ? derived("KOREAN_FULL_NAME")
          : candidate.domName === "by"
            ? datePart("YEAR")
            : candidate.domName === "bm"
              ? datePart("MONTH")
              : candidate.domName === "bd"
                ? datePart("DAY")
                : {},
    });
    const run = workflow(api.client, profile());

    await run.analyze();

    expect(run.stages.at(-1)).toBe("review");
    expect(controlValues()).toEqual(before);
    expect(run.item("fullName")).toMatchObject({
      previewValue: "합성성씨합성이름",
      status: "available",
      selected: true,
    });
    expect(run.item("by")).toMatchObject({ previewValue: "2000", status: "available" });
    expect(run.item("bm")).toMatchObject({ previewValue: "1", status: "available" });
    expect(run.item("bd")).toMatchObject({ previewValue: "1", status: "available" });
    await executeApprovedWritesAfterPageSettles({
      items: run.state.reviewItems,
      approvedCandidateIds: new Set(
        ["fullName", "by", "bm", "bd"].map((name) => run.item(name).candidateId),
      ),
      registry: run.state.snapshot!.registry,
      document,
    });
    expect(document.querySelector<HTMLInputElement>("#name")!.value).toBe(
      "합성성씨합성이름",
    );
    expect(selectedText("by")).toBe("2000");
    expect(selectedText("bm")).toBe("1");
    expect(selectedText("bd")).toBe("1");
    const bodies = JSON.stringify([
      api.classifyRequests,
      api.genericRequests,
      api.decisionRequests,
    ]);
    for (const secret of ["합성성씨", "합성이름", "2000-01-01"])
      expect(bodies).not.toContain(secret);
    expect(bodies).not.toMatch(/"(?:count|itemCount|entryCount)"/i);
  });

  const numbered = (from: number, to: number, suffix = "", pad = false) =>
    Array.from({ length: to - from + 1 }, (_, index) => {
      const value = String(from + index);
      return `<option>${pad ? value.padStart(2, "0") : value}${suffix}</option>`;
    }).join("");

  const mountSuffixForm = (month = numbered(1, 12, "월", true)) => {
    document.body.innerHTML = `
      <form>
        <h2>인적사항</h2>
        <label>영문 이름<input name="englishName" /></label>
        <label>학점<select name="gpa"><option value="">선택</option><option>4.5</option><option>4.0</option><option>3.5</option></select></label>
        <select name="by"><option value="">년</option>${numbered(1990, 2010, "년")}</select>
        <select name="bm"><option value="">월</option>${month}</select>
        <select name="bd"><option value="">일</option>${numbered(1, 31, "일", true)}</select>
      </form>`;
  };

  const suffixClient = (
    recipe: "ENGLISH_FULL_NAME_GIVEN_FIRST" | "ENGLISH_FULL_NAME_FAMILY_FIRST",
  ) =>
    createClient({
      field: (candidate) =>
        candidate.domName === "englishName"
          ? derived(recipe)
          : candidate.domName === "by"
            ? datePart("YEAR")
            : candidate.domName === "bm"
              ? datePart("MONTH")
              : candidate.domName === "bd"
                ? datePart("DAY")
                : candidate.domName === "gpa"
                  ? datePart("MONTH")
                  : {},
    });

  it.each([
    ["ENGLISH_FULL_NAME_GIVEN_FIRST", "Synthgiven Synthfamily"],
    ["ENGLISH_FULL_NAME_FAMILY_FIRST", "Synthfamily Synthgiven"],
  ] as const)(
    "writes the %s name and suffixed zero-padded date part options on another document",
    async (recipe, expected) => {
      mountSuffixForm();
      const before = controlValues();
      const run = workflow(suffixClient(recipe).client, profile());

      await run.analyze();

      expect(controlValues()).toEqual(before);
      expect(byLabel(run, "영문 이름")).toMatchObject({ previewValue: expected });
      await approve(run, ["영문 이름", "년", "월", "일"]);
      expect(
        document.querySelector<HTMLInputElement>("[name=englishName]")!.value,
      ).toBe(expected);
      expect(selectedText("by")).toBe("2000년");
      expect(selectedText("bm")).toBe("01월");
      expect(selectedText("bd")).toBe("01일");
    },
  );

  it("blocks and never writes a numeric select that receives a date part", async () => {
    mountSuffixForm();
    const run = workflow(suffixClient("ENGLISH_FULL_NAME_GIVEN_FIRST").client, profile());

    await run.analyze();

    const gpa = run.state.reviewItems.find((entry) => entry.fieldLabel === "학점");
    expect(gpa?.selected ?? false).toBe(false);
    const grade = [...run.state.grades!.entries()].find(
      ([candidateId]) => candidateId === gpa?.candidateId,
    );
    expect(grade?.[1] ?? { grade: "BLOCKED" }).toMatchObject({ grade: "BLOCKED" });
    await executeApprovedWritesAfterPageSettles({
      items: run.state.reviewItems,
      approvedCandidateIds: new Set(
        run.state.reviewItems.map((entry) => entry.candidateId),
      ),
      registry: run.state.snapshot!.registry,
      document,
    });
    expect(selectedText("gpa")).not.toBe("4.5");
    expect(document.querySelector<HTMLSelectElement>("[name=gpa]")!.value).toBe("");
  });

  it("blocks a month select without the local month and leaves it unwritten", async () => {
    mountSuffixForm(numbered(2, 12, "월", true));
    const run = workflow(suffixClient("ENGLISH_FULL_NAME_GIVEN_FIRST").client, profile());

    await run.analyze();

    const month = document.querySelector<HTMLSelectElement>("[name=bm]")!;
    const monthItem = run.state.reviewItems.find((entry) => {
      const lookup = run.state.snapshot!.registry.lookupField(entry.candidateId);
      return "handle" in lookup && lookup.handle.candidate.domName === "bm";
    });
    expect(monthItem?.selected ?? false).toBe(false);
    await executeApprovedWritesAfterPageSettles({
      items: run.state.reviewItems,
      approvedCandidateIds: new Set(
        run.state.reviewItems.map((entry) => entry.candidateId),
      ),
      registry: run.state.snapshot!.registry,
      document,
    });
    expect(month.value).toBe("");
    expect(selectedText("by")).toBe("2000년");
  });
});
