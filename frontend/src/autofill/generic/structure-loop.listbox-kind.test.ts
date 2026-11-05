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
import { runGenericStructureLoop } from "./structure-loop";

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

const KIND_TEXT = {
  HIGH_SCHOOL: "고등학교",
  ASSOCIATE: "대학교(전문학사)",
  BACHELOR: "대학교(학사)",
  MASTER: "대학원(석사)",
  DOCTOR: "대학원(박사)",
} as const;

/**
 * One education row of a grid: icon-only remove/add buttons (no type, no
 * form, so they default to submit without submitting anything), a listbox
 * button that chooses the row's stage, and placeholder-labelled inputs.
 */
function row(): string {
  return `<div class="edu"><div class="grid">
    <div class="controls">
      <button class="icon"><svg viewBox="0 0 24 24"><g><rect width="24" height="24" rx="12"></rect></g><path d="M5 12H19"></path></svg></button>
      <button class="icon"><svg viewBox="0 0 24 24"><rect width="24" height="24" rx="12"></rect><path d="M5 12H19"></path><path d="M12 5V19"></path></svg></button>
    </div>
    <div><button class="kind" type="button" aria-haspopup="listbox" aria-expanded="false"><input readonly placeholder="학력 구분" tabindex="-1"></button></div>
    <div><input placeholder="학교명" readonly></div>
    <div><input placeholder="입학일" readonly></div>
    <div><input placeholder="전공"></div>
  </div></div>`;
}

function install() {
  // The page groups its areas with plain boxes, not section elements.
  document.body.innerHTML = `<main><div class="area"><h2>학력</h2>
    <p>모든 학력을 최신순으로 작성해 주세요.</p>
    <div id="list">${row()}</div>
  </div><div class="area"><h2>자기소개</h2><textarea placeholder="자기소개"></textarea></div></main>`;
  const list = document.querySelector("#list")!;
  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest("button");
    if (!button) return;
    if (button.querySelectorAll("path").length === 2) {
      list.insertAdjacentHTML("beforeend", row());
      return;
    }
    if (button.classList.contains("kind")) {
      document.querySelector("[role='listbox']")?.remove();
      button.setAttribute("aria-expanded", "true");
      document.body.insertAdjacentHTML(
        "beforeend",
        `<ul role="listbox">${Object.values(KIND_TEXT)
          .map((text) => `<li role="option">${text}</li>`)
          .join("")}</ul>`,
      );
      document.querySelector("[role='listbox']")!.addEventListener("click", (choice) => {
        const option = (choice.target as Element).closest("[role='option']");
        if (!option) return;
        // The page renders a new button that shows the stage name without its
        // parenthesized detail.
        const next = button.cloneNode(true) as HTMLElement;
        next.querySelector("input")!.value = option.textContent!.replace(/\(.*\)$/, "");
        next.setAttribute("aria-expanded", "false");
        button.replaceWith(next);
        document.querySelector("[role='listbox']")?.remove();
      });
    }
  });
}

function api(options: { abstainAdd?: boolean } = {}) {
  const decisions: InteractionDecisionRequest[] = [];
  const client = {
    analyzePreparation: vi.fn(),
    analyzeFields: vi.fn(),
    decideInteractions: vi.fn(
      async (request: InteractionDecisionRequest): Promise<InteractionDecisionResponse> => {
        decisions.push(request);
        return {
          schemaVersion: 2,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          mode: "GENERIC",
          decisions: request.decisions.map((decision) => {
            if (decision.role === "ROW_KIND_OPTION") {
              const wanted = KIND_TEXT[decision.targetKind as keyof typeof KIND_TEXT];
              const match = decision.candidates.find(
                (candidate) => candidate.semanticContext?.labels?.[0]?.text === wanted,
              );
              return {
                decisionId: decision.decisionId,
                role: decision.role,
                selection: match ? ("SELECTED" as const) : ("ABSTAINED" as const),
                candidateId: match?.candidateId ?? null,
              };
            }
            // A REPEAT_ADD decision picks the control the page labels "+".
            const plus = options.abstainAdd ? undefined : decision.candidates.find((candidate) =>
              candidate.semanticContext?.labels?.some((label) => label.text === "+"),
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
    classifySections: vi.fn(async (request: SectionClassifyRequest) => ({
      schemaVersion: 1 as const,
      snapshotId: request.snapshotId,
      status: "COMPLETE" as const,
      sections: request.sections.map((section) => ({
        sectionId: section.sectionId,
        category: /학력/.test(section.title ?? "") ? "education" : "NONE",
        confidence: 1,
      })),
    })),
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
  return { client: client as unknown as AnalysisApiClient, decisions };
}

function profile(): Profile {
  return {
    ...createEmptyProfile(),
    education: [
      { id: "high", sectionId: "highSchool", values: {} },
      { id: "university", sectionId: "university", values: { schoolType: "대학교" } },
    ],
  };
}

describe("education rows chosen by a listbox button", () => {
  it("adds a second row through the icon-only add button for two profile entries", async () => {
    install();
    const { client } = api();
    const result = await runGenericStructureLoop({ document, profile: profile(), apiClient: client });
    expect(result.actions.find((action) => action.kind === "ADD_ROW")).toMatchObject({ result: "done" });
    expect(document.querySelectorAll(".edu")).toHaveLength(2);
    expect(Array.from(document.querySelectorAll<HTMLInputElement>(".kind input"), (input) => input.value)).toEqual([
      "대학교",
      KIND_TEXT.HIGH_SCHOOL,
    ]);
    expect([...result.context.educationRows.values()].map(({ sectionId, sectionIndex }) => [sectionId, sectionIndex])).toEqual([
      ["university", 0],
      ["highSchool", 0],
    ]);
    expect(document.querySelector("[role='listbox']")).toBeNull();
  });

  it("adds no row and picks no stage for a single education entry", async () => {
    install();
    const { client, decisions } = api();
    const single = { ...profile(), education: [profile().education[1]!] };
    const result = await runGenericStructureLoop({ document, profile: single, apiClient: client });
    expect(document.querySelectorAll(".edu")).toHaveLength(1);
    expect(result.context.educationRows.size).toBe(0);
    expect(decisions.filter((request) => request.decisions.some((decision) => decision.role === "REPEAT_ADD"))).toEqual([]);
  });

  it("clicks nothing when the server declines the add control", async () => {
    install();
    const clicks: string[] = [];
    document.addEventListener("click", (event) => clicks.push((event.target as Element).tagName), true);
    const { client } = api({ abstainAdd: true });
    const result = await runGenericStructureLoop({ document, profile: profile(), apiClient: client });
    expect(document.querySelectorAll(".edu")).toHaveLength(1);
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: "ADD_ROW", result: "blocked" }));
    expect(result.context.educationRows.size).toBe(0);
    expect(clicks).toEqual([]);
  });
});
