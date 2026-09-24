import { afterEach, expect, it } from "vitest";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { retainedDriverReviewResults } from "./retained-drivers";

afterEach(() => document.body.replaceChildren());

function entry(command: "SELECT_OPTION" | "CHECK_RADIO") {
  const item = {
    candidateId: "driver",
    analysis: { writePlan: { command } },
  } as ReviewPlanItem;
  const element = document.createElement(
    command === "SELECT_OPTION" ? "select" : "input",
  );
  if (element instanceof HTMLSelectElement) {
    element.innerHTML =
      '<option value="yes">대상</option><option value="no">비대상</option>';
  } else {
    element.type = "radio";
    element.checked = true;
  }
  document.body.append(element);
  const handle = {
    candidate: { options: [{ optionId: "yes", displayName: "대상" }] },
    elements: [element],
    optionElements: new Map([["yes", element]]),
  } as unknown as FieldCandidateHandle;
  return { item, handle };
}

const completed = new Map([["driver-key", { profileValue: "대상" }]]);

it("does not report success when a completed conditional driver disappears after reanalysis", () => {
  expect(retainedDriverReviewResults(new Map(), completed)).toEqual({
    results: [],
    unmatched: true,
  });
});

it("requires verification when reanalysis binds the same driver to two candidates", () => {
  const candidates = new Map([
    ["driver-key", [entry("SELECT_OPTION"), entry("SELECT_OPTION")]],
  ]);
  const result = retainedDriverReviewResults(candidates, completed);
  expect(result.results).toHaveLength(2);
  expect(
    result.results.every(
      (item) =>
        item.status === "skipped" && item.code === "RETAINED_VALUE_UNCONFIRMED",
    ),
  ).toBe(true);
});

it.each(["SELECT_OPTION", "CHECK_RADIO"] as const)(
  "rechecks %s against the live selection rather than the prior success",
  (command) => {
    const candidate = entry(command);
    const candidates = new Map([["driver-key", [candidate]]]);
    expect(
      retainedDriverReviewResults(candidates, completed).results[0],
    ).toMatchObject({ status: "written" });
    const element = candidate.handle.elements[0]!;
    if (element instanceof HTMLSelectElement) element.value = "no";
    else (element as HTMLInputElement).checked = false;
    expect(
      retainedDriverReviewResults(candidates, completed).results[0],
    ).toMatchObject({ status: "skipped", code: "RETAINED_VALUE_UNCONFIRMED" });
  },
);

it("does not accept ambiguous radio labels even if one option is checked", () => {
  const candidate = entry("CHECK_RADIO");
  const other = document.createElement("input");
  other.type = "radio";
  candidate.handle.candidate.options!.push({
    optionId: "other",
    displayName: "대상",
  });
  candidate.handle.optionElements = new Map([
    ...candidate.handle.optionElements,
    ["other", other],
  ]);
  expect(
    retainedDriverReviewResults(
      new Map([["driver-key", [candidate]]]),
      completed,
    ).results[0],
  ).toMatchObject({ status: "skipped" });
});
