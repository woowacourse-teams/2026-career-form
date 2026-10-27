import { afterEach, describe, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { createCalendarApproval } from "../review/calendar-approval";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => document.body.replaceChildren());

function collectItems(calendar?: HTMLInputElement) {
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const items = fields.map((field, index): ReviewPlanItem => {
    const lookup = snapshot.registry.lookupField(field.candidateId);
    if (!("handle" in lookup)) throw new Error("Missing collected field");
    const target = lookup.handle.elements[0];
    const isCalendar = target === calendar;
    const profileFieldKey = isCalendar
      ? "experience.experience.availableMonth"
      : `synthetic.notes.note${index}`;
    const profileValue = isCalendar ? "2026-03" : `synthetic-${index}`;
    return {
      candidateId: field.candidateId,
      fieldLabel: "Synthetic field",
      currentValue: "",
      profileValue,
      previewValue: profileValue,
      profileFieldKey,
      selected: true,
      disabled: false,
      status: "available",
      revealed: false,
      reason: "",
      analysis: {
        candidateId: field.candidateId,
        matchType: "MATCH",
        mappingStatus: "LLM_SUGGESTED",
        autofillPolicy: "ALLOWED",
        interactionStatus: "READY",
        valueBinding: { type: "DIRECT", profileFieldKey },
        writePlan: { command: isCalendar ? "SELECT_DATE" : "SET_TEXT" },
      },
      ...(isCalendar ? {
        calendarApproval: createCalendarApproval({
          target: calendar!,
          originalDate: "2026-03-01",
          targetYearMonth: "2026-03",
          profileFieldKey,
        }),
      } : {}),
    };
  });
  return {
    registry: snapshot.registry,
    items,
    approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
  };
}

function installCalendar(replace: boolean, modal: boolean) {
  document.body.innerHTML = `
    <section>
      <label>Start month<input id="start" name="start" type="text" readonly></label>
      <button type="button" aria-labelledby="start" aria-controls="picker">Choose month</button>
      <div id="picker" role="dialog" hidden>
        <button type="button">2026</button>
        ${Array.from({ length: 12 }, (_, index) =>
          `<button type="button">${index + 1}월</button>`).join("")}
      </div>
    </section>
    <section><label>Later note<input name="note" type="text"></label></section>`;
  const target = document.querySelector<HTMLInputElement>("#start")!;
  const later = document.querySelector<HTMLInputElement>("[name='note']")!;
  const popup = document.querySelector<HTMLElement>("#picker")!;
  document.querySelector("[aria-controls]")!.addEventListener("click", () => {
    popup.hidden = false;
  });
  Array.from(popup.querySelectorAll("button"))
    .find((button) => button.textContent === "3월")!
    .addEventListener("click", () => {
      target.value = "2026-03";
      popup.hidden = true;
      if (replace) later.replaceWith(later.cloneNode(true));
      if (modal) {
        const dialog = document.createElement("div");
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        document.body.append(dialog);
      }
    });
  return { target, later, popup };
}

describe("recovery owning boundaries", () => {
  it.each(["section", "fieldset", "group"] as const)(
    "never transfers singleton approvals across cloned and reordered %s owners",
    async (kind) => {
      const start = kind === "group" ? '<div role="group">' : `<${kind}>`;
      const end = kind === "group" ? "</div>" : `</${kind}>`;
      document.body.innerHTML = `
        <label>Trigger<input id="trigger" type="text"></label>
        ${start}<h2>First group</h2><label>Note<input name="note" type="text"></label>${end}
        ${start}<h2>Second group</h2><label>Note<input name="note" type="text"></label>${end}`;
      const fixture = collectItems();
      expect(fixture.items).toHaveLength(3);
      const owners = Array.from(document.querySelectorAll("section, fieldset, [role='group']"));
      const replacements = owners.map((owner) => owner.cloneNode(true) as HTMLElement);
      const visited: string[] = [];
      const results = await executeApprovedWritesAfterPageSettles({
        ...fixture,
        document,
        beforeWrite: async (item) => {
          visited.push(item.candidateId);
          if (item === fixture.items[0]) {
            owners[0].replaceWith(replacements[1]);
            owners[1].replaceWith(replacements[0]);
          }
        },
      });
      expect(owners.every((owner) => !owner.isConnected)).toBe(true);
      expect(document.querySelectorAll("h2")[0].textContent).toBe("Second group");
      expect(replacements.map((owner) => owner.querySelector("input")!.value))
        .toEqual(["", ""]);
      expect(results[0]).toMatchObject({ code: "WRITTEN" });
      expect(results.slice(1)).toEqual([
        expect.objectContaining({ code: "STALE_TARGET", failureCode: "STRUCTURE_UNVERIFIED" }),
        expect.objectContaining({ code: "STALE_TARGET", failureCode: "STRUCTURE_UNVERIFIED" }),
      ]);
      expect(visited).toEqual(fixture.items.map((item) => item.candidateId));
    },
  );

  it.each([true, false])(
    "blocks suffix mutations when calendar success opens a different modal (replacement: %s)",
    async (replace) => {
      const { target, popup } = installCalendar(replace, true);
      const fixture = collectItems(target);
      const visited: string[] = [];
      const results = await executeApprovedWritesAfterPageSettles({
        ...fixture,
        document,
        beforeWrite: async (item) => { visited.push(item.candidateId); },
      });
      expect(target.value).toBe("2026-03");
      expect(popup.hidden).toBe(true);
      expect(document.querySelector("[aria-modal='true']")).not.toBeNull();
      expect(document.querySelector<HTMLInputElement>("[name='note']")!.value).toBe("");
      expect(results[0]).toMatchObject({ code: "WRITTEN" });
      expect(results[1]).toMatchObject({ code: "STALE_TARGET", failureCode: "FIELD_CHANGED" });
      expect(visited).toEqual([fixture.items[0].candidateId]);
    },
  );

  it.each([
    { mapping: "ADAPTER_VERIFIED" as const, legacy: false },
    { mapping: "ADAPTER_VERIFIED" as const, legacy: true },
    { mapping: "LLM_SUGGESTED" as const, legacy: true },
  ])("preserves strict month-calendar verification for $mapping / legacy=$legacy", async ({ mapping, legacy }) => {
    const { target, later } = installCalendar(true, false);
    const fixture = collectItems(target);
    const item = fixture.items[0];
    item.analysis!.mappingStatus = mapping;
    if (legacy) {
      const lookup = fixture.registry.lookupField(item.candidateId);
      if (!("handle" in lookup)) throw new Error("Missing calendar field");
      fixture.registry.registerField({ ...lookup.handle, owner: "legacy" });
    }
    const results = await executeApprovedWritesAfterPageSettles({
      ...fixture,
      document,
    });
    expect(target.value).toBe("2026-03");
    expect(later.isConnected).toBe(false);
    expect(document.querySelector<HTMLInputElement>("[name='note']")!.value).toBe("");
    expect(results[0]).toMatchObject({ code: "RETAINED_VALUE_UNCONFIRMED" });
    expect(results[1]).toMatchObject({ code: "STALE_TARGET", failureCode: "FIELD_CHANGED" });
  });
});
