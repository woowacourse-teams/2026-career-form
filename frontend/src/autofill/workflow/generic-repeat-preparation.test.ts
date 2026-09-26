import { beforeEach, describe, expect, it } from "vitest";

import type { PreparationPlan } from "../api/types";
import { collectPreparationSnapshot } from "../dom/collect";
import { executeApprovedPreparationPlans } from "../preparation/executor";
import { createEmptyProfile } from "../../profile/model";
import { getWorkflowAdapter } from "../adapters/workflow";
import { preparationItem } from "./workflow-model";

function row(index: number, name = "", date = ""): string {
  return `<div ismultirow="true">
    <label>자격명<input name="credential${index}" value="${name}" /></label>
    <label>취득일<input name="date${index}" value="${date}" /></label>
  </div>`;
}

function fixture(
  options: {
    count?: number;
    maximum?: number;
    outcome?: "one" | "none" | "two";
  } = {},
) {
  const { count = 1, maximum = 3, outcome = "one" } = options;
  document.body.innerHTML = `
    <section data-max-items="${maximum}">
      <h3>자격증</h3>
      <div id="rows">${Array.from({ length: count }, (_, index) =>
        row(index, `보존값${index}`, `2020-01-0${index + 1}`),
      ).join("")}</div>
      <button type="button">자격증 추가</button>
    </section>
  `;
  const rows = document.querySelector<HTMLDivElement>("#rows")!;
  const action = document.querySelector<HTMLButtonElement>("button")!;
  let clicks = 0;
  action.addEventListener("click", () => {
    clicks += 1;
    const additions = outcome === "none" ? 0 : outcome === "two" ? 2 : 1;
    for (let index = 0; index < additions; index += 1) {
      const nextIndex = rows.querySelectorAll("[ismultirow]").length;
      rows.insertAdjacentHTML("beforeend", row(nextIndex));
    }
  });

  const snapshot = () => collectPreparationSnapshot(document);
  const planForSnapshot = (): PreparationPlan => {
    const collected = snapshot();
    const candidate = collected.request.sections
      .flatMap((section) => section.actionCandidates)
      .find((item) => item.displayName === "자격증 추가");
    if (!candidate) throw new Error("generic add action was not collected");
    return {
      actionCandidateId: candidate.candidateId,
      command: "ADD_REPEATABLE_GROUP",
      expectedEffect: "GROUP_COUNT_INCREMENT",
    };
  };
  const executionSnapshot = () => {
    const collected = snapshot();
    return {
      registry: collected.registry,
      isTargetSectionVisible: () => true,
      countRepeatableGroups: (
        plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
      ) => collected.countRepeatableGroups(plan.actionCandidateId),
      repeatableGroupState: (
        plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
      ) => collected.repeatableGroupState(plan.actionCandidateId),
    };
  };

  return {
    action,
    clicks: () => clicks,
    planForSnapshot,
    snapshot,
    executionSnapshot,
  };
}

async function execute(
  setup: ReturnType<typeof fixture>,
  localItemCount: number,
) {
  const plan = setup.planForSnapshot();
  return executeApprovedPreparationPlans({
    approvedPlans: [{ plan, approved: true, localItemCount }],
    initialSnapshot: setup.executionSnapshot(),
    refreshSnapshot: async () => setup.executionSnapshot(),
    countRepeatableGroups: (snapshot, currentPlan) =>
      snapshot.countRepeatableGroups?.(currentPlan) ?? Number.NaN,
  });
}

describe("generic repeat preparation", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("grows one marked generic row to three and preserves every existing value", async () => {
    const setup = fixture();

    const result = await execute(setup, 3);

    expect(setup.clicks()).toBe(2);
    const completed = setup.snapshot();
    expect(
      completed.countRepeatableGroups(
        setup.planForSnapshot().actionCandidateId,
      ),
    ).toBe(3);
    expect(
      Array.from(document.querySelectorAll<HTMLInputElement>("#rows input"))
        .slice(0, 2)
        .map((input) => input.value),
    ).toEqual(["보존값0", "2020-01-01"]);
    expect(result).toMatchObject({ status: "completed", executedPlanCount: 2 });
  });

  it("does not click when three generic rows already satisfy the profile", async () => {
    const setup = fixture({ count: 3 });

    const result = await execute(setup, 3);

    expect(setup.clicks()).toBe(0);
    const completed = setup.snapshot();
    expect(
      completed.countRepeatableGroups(
        setup.planForSnapshot().actionCandidateId,
      ),
    ).toBe(3);
    expect(result).toMatchObject({ status: "completed", executedPlanCount: 0 });
  });

  it("rechecks a changed explicit maximum before making the preparation runnable", () => {
    const setup = fixture({ count: 1, maximum: 3 });
    const plan = setup.planForSnapshot();
    const profile = createEmptyProfile();
    profile.certifications.push(
      { id: "one", sectionId: "certification", values: {} },
      { id: "two", sectionId: "certification", values: {} },
      { id: "three", sectionId: "certification", values: {} },
    );
    const adapter = getWorkflowAdapter("example.test");

    expect(
      preparationItem(plan, setup.snapshot(), profile, adapter).runnable,
    ).toBe(true);

    document.querySelector("section")!.setAttribute("data-max-items", "2");
    const refreshed = collectPreparationSnapshot(document);
    const reviewed = preparationItem(plan, refreshed, profile, adapter);

    expect(refreshed.repeatableGroupLimit(plan.actionCandidateId)).toBe(2);
    expect(reviewed.runnable).toBe(false);
    expect(reviewed.unavailableReason).toBe(
      "현재 화면은 최대 2개까지만 추가할 수 있습니다.",
    );
  });

  it.each([
    ["zero", "none"],
    ["two", "two"],
  ] as const)(
    "blocks collection when one click adds %s rows",
    async (_label, outcome) => {
      const setup = fixture({ outcome });

      const result = await execute(setup, 2);

      expect(setup.clicks()).toBe(1);
      expect(result).toMatchObject({
        status: "failed",
        reason: "group-count-not-incremented",
        executedPlanCount: 1,
        mayCollectFieldsSnapshot: false,
      });
    },
  );
});
