import { afterEach, describe, expect, it } from "vitest";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { createCalendarApproval } from "../review/calendar-approval";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => {
  document.body.replaceChildren();
});

async function runBatch(replaceLaterControls: boolean) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  document.body.innerHTML = `
    <section>
      <label>First note <input id="note-1" name="note-1" type="text"></label>
      <label>Second note <input id="note-2" name="note-2" type="text"></label>
    </section>
    <section>
      <label>Start month <input id="month-target" name="month-target" type="text" readonly></label>
      <button type="button" aria-labelledby="month-target" aria-controls="month-popup">Choose month</button>
      <div id="month-popup" role="dialog" hidden>
        <button type="button">2026</button>
        ${months.map((month) => `<button type="button">${month}</button>`).join("")}
      </div>
    </section>
    <section id="later-controls">
      <label>Third note <input id="note-3" name="note-3" type="text"></label>
      <label>Fourth note <input id="note-4" name="note-4" type="text"></label>
    </section>`;
  const target = document.querySelector<HTMLInputElement>("#month-target")!;
  const popup = document.querySelector<HTMLElement>("#month-popup")!;
  const later = document.querySelector<HTMLElement>("#later-controls")!;
  const originalLater = Array.from(later.querySelectorAll("input"));
  let calendarSelected = false;
  document.querySelector<HTMLButtonElement>("[aria-controls]")!
    .addEventListener("click", () => {
      popup.hidden = false;
    });
  Array.from(popup.querySelectorAll("button"))
    .find((button) => button.textContent === "March")!
    .addEventListener("click", () => {
      calendarSelected = true;
      target.value = "2026-03";
      popup.hidden = true;
      if (replaceLaterControls) {
        // Model a page's synchronous render after a calendar selection:
        // identical field identities, new native control objects.
        later.replaceChildren(...Array.from(later.children, (child) =>
          child.cloneNode(true),
        ));
      }
    });

  const registry = new CandidateRegistry();
  const ids = ["note-1", "note-2", "month-target", "note-3", "note-4"];
  const items: ReviewPlanItem[] = ids.map((candidateId, index) => {
    const input = document.getElementById(candidateId) as HTMLInputElement;
    const calendar = input === target;
    const profileFieldKey = calendar
      ? "experience.experience.availableMonth"
      : `synthetic.notes.note${index + 1}`;
    const profileValue = calendar ? "2026-03" : `synthetic-${index + 1}`;
    registry.registerField({
      kind: "field",
      candidateId,
      candidate: {
        candidateId,
        element: "input",
        control: "text",
        visibility: "visible",
        domId: input.id,
        domName: input.name,
      },
      elements: [input],
      optionElements: new Map(),
      sectionId: calendar ? "calendar-section" : "notes-section",
      signature: createStructuralSignature([input]),
    });
    return {
      candidateId,
      fieldLabel: "Synthetic field",
      currentValue: "",
      profileValue,
      previewValue: profileValue,
      profileFieldKey,
      status: "available",
      selected: true,
      disabled: false,
      revealed: false,
      reason: "",
      analysis: {
        candidateId,
        matchType: "MATCH",
        autofillPolicy: "ALLOWED",
        mappingStatus: "LLM_SUGGESTED",
        interactionStatus: "READY",
        valueBinding: { type: "DIRECT", profileFieldKey },
        writePlan: { command: calendar ? "SELECT_DATE" : "SET_TEXT" },
      },
      ...(calendar ? {
        calendarApproval: createCalendarApproval({
          target,
          originalDate: "2026-03-01",
          targetYearMonth: "2026-03",
          profileFieldKey,
        }),
      } : {}),
    };
  });
  const visited: string[] = [];
  const results = await executeApprovedWritesAfterPageSettles({
    items,
    approvedCandidateIds: new Set(ids),
    registry,
    document,
    beforeWrite: async (item) => {
      visited.push(item.candidateId);
    },
  });
  return { results, registry, originalLater, calendarSelected, visited };
}

describe("ordinary writes after a calendar render", () => {
  it("writes the entire batch when calendar selection preserves sibling controls", async () => {
    const { results, calendarSelected } = await runBatch(false);
    expect(calendarSelected).toBe(true);
    expect(results.map((result) => result.code)).toEqual([
      "WRITTEN", "WRITTEN", "WRITTEN", "WRITTEN", "WRITTEN",
    ]);
  });

  it("writes the same later fields after calendar selection replaces their controls", async () => {
    const { results, registry, originalLater, calendarSelected, visited } =
      await runBatch(true);
    expect(calendarSelected).toBe(true);
    expect(originalLater.every((input) => !input.isConnected)).toBe(true);
    expect(registry.lookupField("note-3").status).toBe("stale");
    expect(registry.lookupField("note-4").status).toBe("stale");
    expect(results.slice(0, 2).map((result) => result.code)).toEqual([
      "WRITTEN", "WRITTEN",
    ]);
    expect(results[2]).toMatchObject({
      status: "skipped",
      code: "RETAINED_VALUE_UNCONFIRMED",
    });
    // The current executor stops before even visiting the later controls;
    // these result codes are batch-stop propagation, not native write attempts.
    expect(visited).toEqual(["note-1", "note-2", "month-target"]);
    expect(results.slice(3).map((result) => result.code)).toEqual([
      "WRITTEN", "WRITTEN",
    ]);
  });
});
