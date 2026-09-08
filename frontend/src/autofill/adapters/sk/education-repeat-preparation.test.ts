import { beforeEach, describe, expect, it } from "vitest";

import type { PreparationPlan } from "../../api/types";
import { collectPreparationSnapshot } from "../../dom/collect";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../../preparation/executor";

const EDUCATION_ACTIONS = [
  {
    id: "btnAddEducationHigh",
    label: "고등학교 학력 정보 추가",
    rowClass: "educationhigh-item",
    schoolName: "eduhgEducationName",
  },
  {
    id: "btnAddEducationUniv",
    label: "대학 학력 정보 추가",
    rowClass: "educationUniv-item",
    schoolName: "eduEducationName",
  },
] as const;

type EducationAction = (typeof EDUCATION_ACTIONS)[number];
type EducationOutcome = "one" | "none" | "two";

function educationRow(
  action: EducationAction,
  firstRow: boolean,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `form-item-group ${action.rowClass}${
    firstRow ? " no-space" : ""
  }`;
  row.innerHTML = `
    <div class="form-item-asset">
      <input name="${action.schoolName}" type="text" />
      <div class="form-item-column btn-control">
        <div class="form-add-control column">
          <button class="btn medium btn-dashed ${action.id}" type="button">${action.label}</button>
        </div>
      </div>
    </div>`;
  return row;
}

function setupEducationForm(outcome: EducationOutcome = "one") {
  document.body.innerHTML = `
    <div id="applyContentAcademic" class="apply-form-box education-root">
      <div class="form-body">
        ${EDUCATION_ACTIONS.map(
          ({ id, label }) =>
            `<div class="form-add-control"><button id="${id}" class="btn medium btn-dashed ${id}" type="button">${label}</button></div>`,
        ).join("")}
      </div>
    </div>`;
  const formBody = document.querySelector<HTMLDivElement>(
    ".education-root > .form-body",
  )!;
  const clicks: string[] = [];
  const rowCounts = new Map<string, number>();
  const attach = (action: EducationAction, button: HTMLButtonElement) => {
    button.addEventListener("click", () => {
      clicks.push(action.id);
      button.style.display = "none";
      const additions = outcome === "two" ? 2 : outcome === "none" ? 0 : 1;
      for (let index = 0; index < additions; index += 1) {
        const row = educationRow(action, (rowCounts.get(action.id) ?? 0) === 0);
        rowCounts.set(action.id, (rowCounts.get(action.id) ?? 0) + 1);
        formBody.append(row);
        const replacement = row.querySelector<HTMLButtonElement>("button")!;
        if (outcome === "two" && index === 0) replacement.remove();
        else attach(action, replacement);
      }
    });
  };
  EDUCATION_ACTIONS.forEach((action) =>
    attach(action, document.querySelector<HTMLButtonElement>(`#${action.id}`)!),
  );
  return { clicks, formBody };
}

function preparationSnapshot(): PreparationSnapshot {
  const collected = collectPreparationSnapshot(document);
  return {
    registry: collected.registry,
    isTargetSectionVisible: collected.isSectionVisible,
    countRepeatableGroups: (plan) =>
      collected.countRepeatableGroups(plan.actionCandidateId),
  };
}

async function runEducationPreparation(
  localItemCounts: Readonly<Record<EducationAction["id"], number>>,
) {
  const initial = collectPreparationSnapshot(document);
  const approvedPlans = EDUCATION_ACTIONS.map((action) => {
    const actionCandidateId = initial.request.sections
      .flatMap((section) => section.actionCandidates)
      .find((candidate) => candidate.domId === action.id)?.candidateId;
    if (!actionCandidateId)
      throw new Error(`missing verified SK education action: ${action.id}`);
    return {
      plan: {
        actionCandidateId,
        command: "ADD_REPEATABLE_GROUP" as const,
        expectedEffect: "GROUP_COUNT_INCREMENT" as const,
      } satisfies PreparationPlan,
      approved: true,
      localItemCount: localItemCounts[action.id],
    };
  });
  return executeApprovedPreparationPlans({
    approvedPlans,
    initialSnapshot: preparationSnapshot(),
    refreshSnapshot: async () => preparationSnapshot(),
    countRepeatableGroups: (snapshot, plan) =>
      snapshot.countRepeatableGroups?.(plan) ?? Number.NaN,
  });
}

describe("SK education repeat preparation", () => {
  beforeEach(() => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({ url: "https://www.skcareers.com/apply" });
    document.body.replaceChildren();
  });

  it("adds high school and university rows, re-identifies replacements, and skips an already prepared rerun", async () => {
    const { clicks, formBody } = setupEducationForm();

    const firstResult = await runEducationPreparation({
      btnAddEducationHigh: 1,
      btnAddEducationUniv: 1,
    });
    const secondResult = await runEducationPreparation({
      btnAddEducationHigh: 2,
      btnAddEducationUniv: 2,
    });
    const rerunResult = await runEducationPreparation({
      btnAddEducationHigh: 2,
      btnAddEducationUniv: 2,
    });

    expect(clicks).toEqual([
      "btnAddEducationHigh",
      "btnAddEducationUniv",
      "btnAddEducationHigh",
      "btnAddEducationUniv",
    ]);
    expect(formBody.querySelectorAll(".educationhigh-item")).toHaveLength(2);
    expect(formBody.querySelectorAll(".educationUniv-item")).toHaveLength(2);
    expect(firstResult).toMatchObject({
      status: "completed",
      mayCollectFieldsSnapshot: true,
    });
    expect(secondResult).toMatchObject({
      status: "completed",
      mayCollectFieldsSnapshot: true,
    });
    expect(rerunResult).toMatchObject({
      status: "completed",
      executedPlanCount: 0,
      mayCollectFieldsSnapshot: true,
    });
  });

  it("ignores a structurally similar action outside the verified education root", async () => {
    const { clicks, formBody } = setupEducationForm();
    const otherRoot = document.createElement("div");
    otherRoot.className = "apply-form-box other-root";
    otherRoot.append(educationRow(EDUCATION_ACTIONS[0], true));
    document.body.append(otherRoot);
    let otherClicks = 0;
    otherRoot.querySelector("button")!.addEventListener("click", () => {
      otherClicks += 1;
    });

    const result = await runEducationPreparation({
      btnAddEducationHigh: 2,
      btnAddEducationUniv: 1,
    });

    expect(result).toMatchObject({ status: "completed" });
    expect(clicks).toEqual([
      "btnAddEducationHigh",
      "btnAddEducationHigh",
      "btnAddEducationUniv",
    ]);
    expect(formBody.querySelectorAll(".educationhigh-item")).toHaveLength(2);
    expect(otherClicks).toBe(0);
  });

  it.each([
    ["none", "action-not-reidentified"],
    ["two", "group-count-not-incremented"],
  ] as const)(
    "blocks field collection when an education action adds %s rows",
    async (outcome, reason) => {
      const { clicks } = setupEducationForm(outcome);

      const result = await runEducationPreparation({
        btnAddEducationHigh: 1,
        btnAddEducationUniv: 0,
      });

      expect(clicks).toEqual(["btnAddEducationHigh"]);
      expect(result).toMatchObject({
        status: "failed",
        reason,
        mayCollectFieldsSnapshot: false,
      });
    },
  );
});
