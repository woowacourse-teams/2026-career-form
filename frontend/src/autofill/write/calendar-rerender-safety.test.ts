import { afterEach, describe, expect, it } from "vitest";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { createCalendarApproval } from "../review/calendar-approval";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => document.body.replaceChildren());

type Render =
  | "same"
  | "value"
  | "checked"
  | "ambiguous"
  | "missing"
  | "open"
  | "insert"
  | "wrong-target";

async function runCalendar(render: Render) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  document.body.innerHTML = `
    <section id="entries">
      <div id="row-a">
        <label>Start month<input id="start" name="start" type="text" readonly></label>
        <button type="button" aria-labelledby="start" aria-controls="picker">Choose month</button>
        <div id="picker" role="dialog" hidden>
          <button type="button">2026</button>
          ${months.map((month) => `<button type="button">${month}</button>`).join("")}
        </div>
        <div id="replaceable">
          <label>Note<input id="note" name="note" type="text"></label>
          <label>Flag<input id="flag" name="flag" type="checkbox"></label>
        </div>
      </div>
      <div id="row-b">
        <label>Other note<input id="other" name="other" type="text"></label>
      </div>
    </section>`;
  const target = document.querySelector<HTMLInputElement>("#start")!;
  const popup = document.querySelector<HTMLElement>("#picker")!;
  const replaceable = document.querySelector<HTMLElement>("#replaceable")!;
  const rows = Array.from(document.querySelectorAll<HTMLElement>("#row-a, #row-b"));
  document.querySelector<HTMLButtonElement>("[aria-controls]")!
    .addEventListener("click", () => { popup.hidden = false; });
  Array.from(popup.querySelectorAll("button"))
    .find((button) => button.textContent === "March")!
    .addEventListener("click", () => {
      target.value = render === "wrong-target" ? "2026-04" : "2026-03";
      popup.hidden = render !== "open";
      replaceable.replaceChildren(
        ...Array.from(replaceable.children, (child) => child.cloneNode(true)),
      );
      if (render === "value")
        document.querySelector<HTMLInputElement>("#note")!.value = "foreign";
      if (render === "checked")
        document.querySelector<HTMLInputElement>("#flag")!.checked = true;
      if (render === "ambiguous") {
        const note = document.querySelector<HTMLInputElement>("#note")!;
        note.after(note.cloneNode(true));
      }
      if (render === "missing")
        document.querySelector("#note")!.remove();
      if (render === "insert") {
        const inserted = document.createElement("input");
        inserted.name = "new-field";
        document.querySelector("#row-b")!.append(inserted);
      }
    });

  const registry = new CandidateRegistry();
  const items = ["start", "note", "other"].map((candidateId, index): ReviewPlanItem => {
    const input = document.getElementById(candidateId) as HTMLInputElement;
    const itemIndex = index === 2 ? 1 : 0;
    const row = rows[itemIndex];
    const profileFieldKey = index === 0
      ? "experience.experience.availableMonth"
      : `synthetic.notes.note${index}`;
    const profileValue = index === 0 ? "2026-03" : `synthetic-${index}`;
    registry.registerField({
      kind: "field",
      candidateId,
      sectionId: "entries",
      itemId: `entry-${itemIndex}`,
      itemGroupId: "notes",
      itemIndex,
      isCurrentContext: () => row.isConnected && row.contains(input),
      elements: [input],
      optionElements: new Map(),
      signature: createStructuralSignature([input]),
      candidate: {
        candidateId,
        element: "input",
        control: "text",
        visibility: "visible",
        domId: input.id,
        domName: input.name,
      },
    });
    return {
      candidateId,
      fieldLabel: "Synthetic field",
      currentValue: "",
      profileValue,
      previewValue: profileValue,
      profileFieldKey,
      profileEntryId: `profile-${itemIndex}`,
      itemIndex,
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
        writePlan: { command: index === 0 ? "SELECT_DATE" : "SET_TEXT" },
      },
      ...(index === 0 ? {
        calendarApproval: createCalendarApproval({
          target,
          originalDate: "2026-03-01",
          targetYearMonth: "2026-03",
          profileFieldKey,
          profileEntryId: `profile-${itemIndex}`,
          itemIndex,
        }),
      } : {}),
    };
  });
  registry.setFieldItemCount("entries", rows.length, "notes");
  registry.setFieldItemElements("entries", rows, "notes");
  const visited: string[] = [];
  const results = await executeApprovedWritesAfterPageSettles({
    items,
    registry,
    approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
    document,
    beforeWrite: async (item) => { visited.push(item.candidateId); },
  });
  return { results, visited, popup, registry };
}

describe("calendar render safety", () => {
  it("recovers a replacement inside the same indexed repeat row", async () => {
    const { results, visited, registry } = await runCalendar("same");
    expect(results.map((result) => result.code)).toEqual(["WRITTEN", "WRITTEN", "WRITTEN"]);
    expect(visited).toEqual(["start", "note", "other"]);
    expect(document.querySelector<HTMLInputElement>("#note")!.value).toBe("synthetic-1");
    const lookup = registry.lookupField("note");
    expect(lookup.status).toBe("ready");
    expect("handle" in lookup && lookup.handle.elements[0])
      .toBe(document.querySelector("#note"));
  });

  it("allows an inserted distinct control without losing old state checks", async () => {
    const { results } = await runCalendar("insert");
    expect(results.map((result) => result.code)).toEqual(["WRITTEN", "WRITTEN", "WRITTEN"]);
    expect(document.querySelector<HTMLInputElement>("[name='new-field']")!.value).toBe("");
  });

  it.each(["value", "checked", "ambiguous", "missing", "open", "wrong-target"] as const)(
    "keeps later writes blocked for a %s mutation",
    async (render) => {
      const { results, visited, popup } = await runCalendar(render);
      expect(results[0]).toMatchObject({
        status: "skipped",
        code: "RETAINED_VALUE_UNCONFIRMED",
      });
      expect(results.slice(1)).toEqual([
        expect.objectContaining({ code: "STALE_TARGET", failureCode: "FIELD_CHANGED" }),
        expect.objectContaining({ code: "STALE_TARGET", failureCode: "FIELD_CHANGED" }),
      ]);
      expect(visited).toEqual(["start"]);
      expect(document.querySelector<HTMLInputElement>("#other")!.value).toBe("");
      if (render === "value")
        expect(document.querySelector<HTMLInputElement>("#note")!.value).toBe("foreign");
      if (render === "checked")
        expect(document.querySelector<HTMLInputElement>("#flag")!.checked).toBe(true);
      if (render === "open") expect(popup.hidden).toBe(false);
    },
  );
});
