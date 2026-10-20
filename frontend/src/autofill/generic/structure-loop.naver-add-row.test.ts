import { readFileSync } from "node:fs";
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
import type { AnalysisApiClient, SectionClassifyRequest } from "../api/types";
import { genericRowFor } from "../dom/repeatable-rows";
import { runGenericStructureLoop } from "./structure-loop";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const CATEGORY_OF_TITLE: Array<[RegExp, string]> = [
  [/학력/, "education"],
  [/경력/, "careers"],
  [/자격/, "certifications"],
  [/어학/, "languages"],
];

function entries(count: number, sectionId: string): ProfileEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${sectionId}-${index}`,
    sectionId,
    values: {},
  }));
}

const profile: Profile = {
  ...createEmptyProfile(),
  education: entries(2, "university"),
  certifications: entries(2, "certificate"),
  languages: entries(2, "languageTest"),
};

/**
 * The sanitized snapshot keeps no page script, so each add control copies its
 * own row the way the page does: the copy carries no add control of its own.
 * Rows are counted per row container in document order: education, career,
 * certificate, language.
 */
function mount(): Element[] {
  document.body.innerHTML = readFileSync(
    join(
      process.cwd(),
      "fixtures/dom-snapshots/naver-step2-form/sanitized.html",
    ),
    "utf8",
  );
  const buttons = [...document.querySelectorAll("button")].filter(
    (button) => button.textContent?.trim() === "내용추가",
  );
  const containers = buttons.map((button) => {
    const row = genericRowFor(button)!;
    const container = row.parentElement!;
    button.addEventListener("click", () => {
      const copy = row.cloneNode(true) as Element;
      copy.querySelectorAll("button").forEach((control) => {
        if (control.textContent?.trim() === "내용추가") control.remove();
      });
      container.append(copy);
    });
    return container;
  });
  return [...new Set(containers)];
}

const rowCounts = (containers: Element[]) =>
  containers.map((container) => container.children.length);

function api(selectAdd: boolean) {
  const decisions: InteractionDecisionRequest["decisions"] = [];
  const client = {
    classifySections: vi.fn(async (request: SectionClassifyRequest) => ({
      schemaVersion: 1 as const,
      snapshotId: request.snapshotId,
      status: "COMPLETE" as const,
      sections: request.sections.map((section) => ({
        sectionId: section.sectionId,
        category:
          CATEGORY_OF_TITLE.find(([pattern]) =>
            pattern.test(section.title ?? ""),
          )?.[1] ?? "NONE",
        confidence: 1,
      })),
    })),
    decideInteractions: vi.fn(
      async (
        request: InteractionDecisionRequest,
      ): Promise<InteractionDecisionResponse> => {
        decisions.push(...request.decisions);
        return {
          schemaVersion: 2,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          mode: "GENERIC",
          decisions: request.decisions.map((decision) =>
            selectAdd && decision.role === "REPEAT_ADD"
              ? {
                  decisionId: decision.decisionId,
                  role: decision.role,
                  selection: "SELECTED" as const,
                  candidateId: decision.candidates[0]!.candidateId,
                }
              : {
                  decisionId: decision.decisionId,
                  role: decision.role,
                  selection: "ABSTAINED" as const,
                  candidateId: null,
                },
          ),
        };
      },
    ),
  };
  return { client: client as unknown as AnalysisApiClient, decisions };
}

describe("generic structure loop on the NAVER step 2 snapshot", () => {
  it("asks each repeat section about its own add control only", async () => {
    mount();
    const { client, decisions } = api(false);

    await runGenericStructureLoop({ document, profile, apiClient: client });

    const asked = decisions.filter(({ role }) => role === "REPEAT_ADD");
    expect(asked.map(({ canonicalFieldKey }) => canonicalFieldKey)).toEqual([
      "education.university.schoolName",
      "certifications.certificate.name",
      "languages.languageTest.language",
    ]);
    const ids = asked.flatMap(({ candidates }) =>
      candidates.map(({ candidateId }) => candidateId),
    );
    expect(new Set(ids).size).toBe(ids.length);
    [/학력/, /자격/, /어학/].forEach((heading, index) => {
      const [candidate, ...others] = asked[index]!.candidates;
      expect(others).toEqual([]);
      expect(candidate!.relationToTarget).toBe("SAME_REPEAT_ROW");
      const labels = candidate!.semanticContext?.labels ?? [];
      expect(labels[0]).toEqual({ source: "label", text: "내용추가" });
      expect(labels[1]?.source).toBe("section-heading");
      expect(labels[1]?.text).toMatch(heading);
    });
  });

  it("adds one row to each section whose own add control was chosen", async () => {
    const containers = mount();
    expect(rowCounts(containers)).toEqual([1, 1, 1, 1]);

    const result = await runGenericStructureLoop({
      document,
      profile,
      apiClient: api(true).client,
    });

    expect(rowCounts(containers)).toEqual([2, 1, 2, 2]);
    expect(
      result.actions
        .filter(({ kind }) => kind === "ADD_ROW")
        .map(({ result: outcome, rowsBefore, rowsAfter }) => [
          outcome,
          rowsBefore,
          rowsAfter,
        ]),
    ).toEqual([
      ["done", 1, 2],
      ["done", 1, 2],
      ["done", 1, 2],
    ]);
  }, 120_000);

  it("keeps existing rows mappable when every add decision abstains", async () => {
    const containers = mount();
    const clicks: Element[] = [];
    document.addEventListener(
      "click",
      (event) => clicks.push(event.target as Element),
      true,
    );

    const result = await runGenericStructureLoop({
      document,
      profile,
      apiClient: api(false).client,
    });

    expect(clicks).toEqual([]);
    expect(rowCounts(containers)).toEqual([1, 1, 1, 1]);
    expect(
      result.actions
        .filter(({ kind }) => kind === "ADD_ROW")
        .map(({ result: outcome, reason }) => [outcome, reason]),
    ).toEqual([
      ["blocked", "REPEAT_ADD_ABSTAINED"],
      ["blocked", "REPEAT_ADD_ABSTAINED"],
      ["blocked", "REPEAT_ADD_ABSTAINED"],
    ]);
    const reasonsFor = (row: Element) =>
      [...result.context.blockedScopes].flatMap(([scope, reason]) =>
        scope.contains(row) ? [reason] : [],
      );
    const [education, , certificate, language] = containers.map(
      (container) => container.firstElementChild!,
    );
    // The education row's kind question is a separate role; its add decision
    // must not block the row.
    expect(reasonsFor(education!)).not.toContain("REPEAT_ADD_ABSTAINED");
    expect(reasonsFor(certificate!)).toEqual([]);
    expect(reasonsFor(language!)).toEqual([]);
  });
});
