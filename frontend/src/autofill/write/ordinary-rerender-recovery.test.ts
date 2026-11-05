import { afterEach, describe, expect, it } from "vitest";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWrites } from "./native-executor";
import { executeApprovedSearchWrites } from "./search-executor";
import type { ApprovedWriteResult } from "./write-result";

afterEach(() => document.body.replaceChildren());

type Mutation = "replace" | "value" | "ambiguous" | "open" | "none" | "binding";

async function run(
  mutation: Mutation,
  laterCommand: "SET_TEXT" | "SELECT_DATE" | "SEARCH_SELECTION" = "SET_TEXT",
) {
  document.body.innerHTML = `<section>
    <label>Trigger<input id="trigger" name="trigger" type="text"></label>
    <label>Later<input id="later" name="later" type="text"></label>
  </section>`;
  const registry = new CandidateRegistry();
  const items: ReviewPlanItem[] = ["trigger", "later"].map((candidateId, index) => {
    const input = document.getElementById(candidateId) as HTMLInputElement;
    const profileFieldKey = `synthetic.notes.${candidateId}`;
    registry.registerField({
      kind: "field",
      candidateId,
      sectionId: "notes",
      elements: [input],
      optionElements: new Map(),
      signature: createStructuralSignature([input]),
      candidate: {
        candidateId,
        element: "input",
        control: "text",
        visibility: "visible",
      },
    });
    return {
      candidateId,
      fieldLabel: "Synthetic note",
      currentValue: "",
      profileValue: `synthetic-${index}`,
      previewValue: `synthetic-${index}`,
      profileFieldKey,
      status: "available",
      selected: true,
      disabled: false,
      revealed: false,
      reason: "",
      analysis: {
        candidateId,
        matchType: "MATCH",
        mappingStatus: "LLM_SUGGESTED",
        autofillPolicy: "ALLOWED",
        interactionStatus: "READY",
        valueBinding: { type: "DIRECT", profileFieldKey },
        writePlan: { command: index === 0 ? "SET_TEXT" : laterCommand },
      },
    };
  });
  const approvedCandidateIds = new Set(["trigger", "later"]);
  const results: ApprovedWriteResult[] = [];
  const visited: string[] = [];
  const written: string[] = [];
  const halted = await executeApprovedSearchWrites({
    registry,
    items,
    approvedCandidateIds,
    results,
    beforeWrite: async (item) => {
      visited.push(item.candidateId);
      if (mutation === "binding" && item.candidateId === "later") {
        item.profileValue = "different-approved-value";
        item.analysis!.valueBinding = {
          type: "DIRECT",
          profileFieldKey: "synthetic.differentField",
        };
      }
    },
    writeOrdinary: async (item) => {
      written.push(item.candidateId);
      if (item.candidateId === "trigger") {
        const old = document.querySelector<HTMLInputElement>("#later")!;
        if (mutation !== "none") {
          const replacement = old.cloneNode(true) as HTMLInputElement;
          old.replaceWith(replacement);
          if (mutation === "value") replacement.value = "foreign";
          if (mutation === "ambiguous") replacement.after(replacement.cloneNode(true));
        }
        if (mutation === "open") {
          const popup = document.createElement("div");
          popup.setAttribute("role", "dialog");
          document.body.append(popup);
        }
        return {
          result: {
            candidateId: item.candidateId,
            status: "skipped",
            code: "STALE_TARGET",
            outcome: "needs-verification",
            reason: "Synthetic interrupted write",
          },
          effect: "stop",
        };
      }
      return executeApprovedWrites({ registry, items: [item], approvedCandidateIds })[0]!;
    },
  });
  return { results, visited, written, halted };
}

describe("closed ordinary stop recovery", () => {
  it("visits and revalidates later items after a state-preserving render", async () => {
    const { results, visited, written, halted } = await run("replace");
    expect(halted).toBe(false);
    expect(results.map((result) => result.code)).toEqual(["STALE_TARGET", "WRITTEN"]);
    expect(visited).toEqual(["trigger", "later"]);
    expect(written).toEqual(["trigger", "later"]);
    expect(document.querySelector<HTMLInputElement>("#later")!.value).toBe("synthetic-1");
  });

  it.each(["value", "ambiguous", "open", "none"] as const)(
    "preserves the stop for %s instead of guessing",
    async (mutation) => {
      const { results, visited, written, halted } = await run(mutation);
      expect(halted).toBe(true);
      expect(visited).toEqual(["trigger"]);
      expect(written).toEqual(["trigger"]);
      expect(results[1]).toMatchObject({ code: "STALE_TARGET", failureCode: "FIELD_CHANGED" });
      expect(document.querySelector<HTMLInputElement>("#later")!.value)
        .toBe(mutation === "value" ? "foreign" : "");
    },
  );

  it("rejects a changed profile binding immediately before the later write", async () => {
    const { results, visited, written } = await run("binding");
    expect(visited).toEqual(["trigger", "later"]);
    expect(written).toEqual(["trigger"]);
    expect(results[1]).toMatchObject({
      code: "STALE_TARGET",
      failureCode: "STRUCTURE_UNVERIFIED",
    });
    expect(document.querySelector<HTMLInputElement>("#later")!.value).toBe("");
  });

  it.each(["SELECT_DATE", "SEARCH_SELECTION"] as const)(
    "does not transfer %s approval to a replacement target",
    async (command) => {
      const { results, written } = await run("replace", command);
      expect(written).toEqual(["trigger"]);
      expect(results[1]).toMatchObject({
        code: "STALE_TARGET",
        failureCode: "STRUCTURE_UNVERIFIED",
      });
    },
  );
});
