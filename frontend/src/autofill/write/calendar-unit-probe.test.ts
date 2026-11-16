import { afterEach, describe, expect, it } from "vitest";
import type { FieldsAnalyzeResponse } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { createEmptyProfile } from "../../profile/model";
import { buildReviewPlan } from "../review/review-plan";
import {
  calendarValueSettled,
  executeApprovedCalendarWrite,
} from "./calendar-executor";

afterEach(() => document.body.replaceChildren());

/**
 * A readonly date field whose label names no unit ("복무기간"): the opener
 * mounts a day grid or a month list only after it is clicked.
 */
function mount(kind: "day" | "month" | "none") {
  document.body.innerHTML = `<form><div class="row">
    <div class="field"><label for="d">복무기간</label>
      <input id="d" type="text" readonly>
      <button type="button" aria-label="달력 열기"></button></div>
    <div class="field"><label for="memo">메모</label>
      <input id="memo" type="text" value="유지"></div></div></form>`;
  const target = document.querySelector<HTMLInputElement>("#d")!;
  const opener = document.querySelector<HTMLButtonElement>(".field button")!;
  const portals: HTMLElement[] = [];
  const close = () => portals.splice(0).forEach((portal) => portal.remove());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  opener.addEventListener("click", () => {
    if (portals.length) return close();
    if (kind === "none") return;
    const portal = document.createElement("div");
    if (kind === "day") {
      portal.innerHTML = `<select class="y">${[2017, 2018, 2019].map((y) => `<option value="${y}">${y}</option>`).join("")}</select><select class="m">${Array.from({ length: 12 }, (_, m) => `<option value="${m}">${m + 1}월</option>`).join("")}</select><table>${Array.from({ length: 30 }, (_, d) => `<td><button type="button" data-day="${d + 1}">${d + 1}</button></td>`).join("")}</table>`;
      portal.querySelectorAll<HTMLButtonElement>("[data-day]").forEach((day) =>
        day.addEventListener("click", () => {
          const year = portal.querySelector<HTMLSelectElement>(".y")!.value;
          const month = Number(portal.querySelector<HTMLSelectElement>(".m")!.value) + 1;
          target.value = `${year}.${String(month).padStart(2, "0")}.${day.dataset.day!.padStart(2, "0")}`;
          close();
        }),
      );
    } else {
      let year = 2026;
      portal.innerHTML = `${[2017, 2018, 2019].map((y) => `<button type="button" data-year="${y}">${y}</button>`).join("")}${Array.from({ length: 12 }, (_, m) => `<button type="button" data-month="${m + 1}">${m + 1}월</button>`).join("")}`;
      portal.querySelectorAll<HTMLButtonElement>("[data-year]").forEach((button) =>
        button.addEventListener("click", () => {
          year = Number(button.dataset.year);
        }),
      );
      portal.querySelectorAll<HTMLButtonElement>("[data-month]").forEach((button) =>
        button.addEventListener("click", () => {
          target.value = `${year}-${button.dataset.month!.padStart(2, "0")}`;
          close();
        }),
      );
    }
    document.body.append(portal);
    portals.push(portal);
  });
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "service-start",
    candidate: {
      candidateId: "service-start",
      element: "input",
      control: "text",
      readonly: true,
      visibility: "visible",
      displayName: "복무기간",
    },
    elements: [target],
    optionElements: new Map(),
    sectionId: "military",
    signature: createStructuralSignature([target]),
  });
  const profile = createEmptyProfile();
  profile.military.serviceStartDate = "2018-03-04";
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: "snapshot-1",
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: "service-start",
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "military.military.serviceStartDate",
        },
        autofillPolicy: "ALLOWED",
        mappingStatus: "LLM_SUGGESTED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_DATE" },
      },
    ],
  };
  const [item] = buildReviewPlan({ analysis, profile, registry }).items;
  return { target, portals, registry, item: item! };
}

describe("calendar whose date unit is only known after opening", () => {
  it("is approved at review with the stored full date and no unit guess", () => {
    const { item, target } = mount("day");
    expect(item).toMatchObject({
      status: "available",
      selected: true,
      profileValue: "2018-03-04",
      calendarUnitProbe: { target },
    });
    expect(item.calendarApproval).toBeUndefined();
    expect(item.dayCalendarApproval).toBeUndefined();
  });

  it("selects the full date when the opened calendar is a day grid", async () => {
    const { item, registry, target, portals } = mount("day");
    const result = await executeApprovedCalendarWrite({ item, registry });
    expect(result).toMatchObject({ status: "written", effect: "continue" });
    expect(target.value).toBe("2018.03.04");
    expect(portals).toHaveLength(0);
    expect(calendarValueSettled(item, registry)).toBe(true);
    expect(document.querySelector<HTMLInputElement>("#memo")!.value).toBe("유지");
  });

  it("selects the year-month when the opened calendar is a month list", async () => {
    const { item, registry, target, portals } = mount("month");
    const result = await executeApprovedCalendarWrite({ item, registry });
    expect(result).toMatchObject({ status: "written", effect: "continue" });
    expect(target.value).toBe("2018-03");
    expect(portals).toHaveLength(0);
    expect(calendarValueSettled(item, registry)).toBe(true);
  });

  it("selects nothing and stops when no calendar opens", async () => {
    const { item, registry, target } = mount("none");
    const result = await executeApprovedCalendarWrite({ item, registry });
    expect(result).toMatchObject({
      status: "skipped",
      code: "UNSUPPORTED_CONTROL",
      effect: "stop",
    });
    expect(target.value).toBe("");
    expect(calendarValueSettled(item, registry)).toBe(false);
  });
});
