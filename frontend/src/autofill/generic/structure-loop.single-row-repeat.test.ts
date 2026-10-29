import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
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
import { collectGenericStructureSnapshot } from "./structure-context";
import { runGenericStructureLoop } from "./structure-loop";

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

const MINUS =
  '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="12"></rect><path d="M5 12H19"></path></svg>';
const PLUS =
  '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="12"></rect><path d="M5 12H19"></path><path d="M12 5V19"></path></svg>';

/**
 * One certificate row: icon-only remove/add buttons and placeholder-labelled
 * inputs, with no marker, item class or "add" text the page could be read by.
 */
function row(withButtons = true): string {
  return `<div class="cert"><div class="grid">
    ${withButtons ? `<div class="controls"><button class="icon">${MINUS}</button><button class="icon">${PLUS}</button></div>` : ""}
    <div><input placeholder="자격증명" readonly></div>
    <div><input placeholder="등급"></div>
    <div><input placeholder="취득일"></div>
    <div><input placeholder="발행처"></div>
  </div></div>`;
}

function install(options: { addWorks?: boolean; withButtons?: boolean } = {}) {
  const { addWorks = true, withButtons = true } = options;
  document.body.innerHTML = `<main><div class="area"><h2>자격증</h2>
    <div id="list">${row(withButtons)}</div>
  </div><div class="area"><h2>자기소개</h2><textarea placeholder="자기소개"></textarea></div></main>`;
  const list = document.querySelector("#list")!;
  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest("button");
    if (!button || !addWorks) return;
    if (button.querySelectorAll("path").length === 2)
      list.insertAdjacentHTML("beforeend", row(withButtons));
    else button.closest(".cert")?.remove();
  });
}

function api(options: { abstainAdd?: boolean } = {}) {
  const decisions: InteractionDecisionRequest[] = [];
  const classified: SectionClassifyRequest[] = [];
  const client = {
    analyzePreparation: vi.fn(),
    analyzeFields: vi.fn(),
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
            const plus = options.abstainAdd
              ? undefined
              : decision.candidates.find((candidate) =>
                  candidate.semanticContext?.labels?.some(
                    (label) => label.text === "+",
                  ),
                );
            return {
              decisionId: decision.decisionId,
              role: decision.role,
              selection: plus ? ("SELECTED" as const) : ("ABSTAINED" as const),
              candidateId: plus?.candidateId ?? null,
            };
          }),
        };
      },
    ),
    classifySections: vi.fn(async (request: SectionClassifyRequest) => {
      classified.push(request);
      return {
        schemaVersion: 1 as const,
        snapshotId: request.snapshotId,
        status: "COMPLETE" as const,
        sections: request.sections.map((section) => ({
          sectionId: section.sectionId,
          category: /자격/.test(section.title ?? "") ? "certifications" : "NONE",
          confidence: 1,
        })),
      };
    }),
    analyzeGenericFields: vi.fn(
      async (request: GenericFieldsRequest): Promise<GenericFieldsResponse> => ({
        schemaVersion: 3,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        diagnostics: { jevCalls: 0, elapsedMs: 0 },
        fields: [],
      }),
    ),
  };
  return { client: client as unknown as AnalysisApiClient, decisions, classified };
}

function profile(count: number): Profile {
  return {
    ...createEmptyProfile(),
    certifications: Array.from({ length: count }, (_, index) => ({
      id: `cert-${index}`,
      sectionId: "certificate",
      values: {},
    })),
  };
}

const addQuestions = (decisions: InteractionDecisionRequest[]) =>
  decisions.flatMap((request) =>
    request.decisions.filter((decision) => decision.role === "REPEAT_ADD"),
  );

describe("a repeatable area the page shows as one row with an icon-only add control", () => {
  it("adds rows up to the profile entries and binds each row to its entry", async () => {
    install();
    const { client, decisions } = api();
    const result = await runGenericStructureLoop({
      document,
      profile: profile(2),
      apiClient: client,
    });
    expect(result.actions).toContainEqual(
      expect.objectContaining({ kind: "ADD_ROW", result: "done" }),
    );
    expect(document.querySelectorAll(".cert")).toHaveLength(2);
    // The remove control is never offered as an add candidate.
    for (const question of addQuestions(decisions))
      expect(
        question.candidates.flatMap(
          (candidate) => candidate.semanticContext?.labels?.map(({ text }) => text) ?? [],
        ),
      ).not.toContain("-");
    expect(
      [...result.context.repeatRows.values()].map(({ category, index }) => [
        category,
        index,
      ]),
    ).toEqual([
      ["certifications", 0],
      ["certifications", 1],
    ]);

    const snapshot = await collectGenericStructureSnapshot(
      document,
      undefined,
      result.context,
    );
    const names = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[placeholder='자격증명']"),
    );
    const handles = names.map((input) => {
      const id = snapshot.request.sections
        .flatMap((section) => section.fields)
        .find(({ candidateId }) => {
          const lookup = snapshot.registry.lookupField(candidateId);
          return "handle" in lookup && lookup.handle.elements[0] === input;
        })?.candidateId;
      const lookup = id ? snapshot.registry.lookupField(id) : undefined;
      return {
        itemIndex: lookup && "handle" in lookup ? lookup.handle.itemIndex : undefined,
        count: id ? snapshot.registry.fieldItemCount(id) : undefined,
      };
    });
    expect(handles).toEqual([
      { itemIndex: 0, count: 2 },
      { itemIndex: 1, count: 2 },
    ]);
  });

  it("asks nothing and clicks nothing for a single profile entry", async () => {
    install();
    const { client, decisions } = api();
    const result = await runGenericStructureLoop({
      document,
      profile: profile(1),
      apiClient: client,
    });
    expect(document.querySelectorAll(".cert")).toHaveLength(1);
    expect(addQuestions(decisions)).toEqual([]);
    expect(result.context.repeatRows.size).toBe(0);
  });

  it("clicks nothing when the server declines the add control", async () => {
    install();
    const clicks: string[] = [];
    document.addEventListener(
      "click",
      (event) => clicks.push((event.target as Element).tagName),
      true,
    );
    const { client } = api({ abstainAdd: true });
    const result = await runGenericStructureLoop({
      document,
      profile: profile(2),
      apiClient: client,
    });
    expect(document.querySelectorAll(".cert")).toHaveLength(1);
    expect(result.actions).toContainEqual(
      expect.objectContaining({ kind: "ADD_ROW", result: "blocked" }),
    );
    expect(result.context.repeatRows.size).toBe(0);
    expect(clicks).toEqual([]);
  });

  it("stops after one click when the page adds no row", async () => {
    install({ addWorks: false });
    const clicks: string[] = [];
    document.addEventListener(
      "click",
      (event) => clicks.push((event.target as Element).tagName),
      true,
    );
    const { client } = api();
    const result = await runGenericStructureLoop({
      document,
      profile: profile(3),
      apiClient: client,
    });
    expect(clicks).toHaveLength(1);
    expect(result.actions).toContainEqual(
      expect.objectContaining({ kind: "ADD_ROW", result: "blocked", reason: "ADD_FAILED" }),
    );
    expect(result.context.repeatRows.size).toBe(0);
  });

  it("does not classify a one-row area without any control to press", async () => {
    install({ withButtons: false });
    const { client, classified } = api();
    await runGenericStructureLoop({
      document,
      profile: profile(2),
      apiClient: client,
    });
    expect(
      classified.flatMap((request) => request.sections.map(({ title }) => title)),
    ).not.toContain("자격증");
  });
});
