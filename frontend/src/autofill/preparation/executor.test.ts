import { describe, expect, it } from "vitest";

import type { PreparationPlan } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ActionCandidateHandle } from "../dom/types";
import { executeApprovedPreparationPlans } from "./executor";

const revealPlan: PreparationPlan = {
  actionCandidateId: "action-reveal",
  command: "REVEAL_SECTION",
  expectedEffect: "TARGET_VISIBLE",
  targetSectionId: "section-optional",
};

const addPlan: PreparationPlan = {
  actionCandidateId: "action-add",
  command: "ADD_REPEATABLE_GROUP",
  expectedEffect: "GROUP_COUNT_INCREMENT",
};

function snapshotFor(
  action: HTMLButtonElement,
  options: { registerAction?: boolean; targetVisible?: boolean } = {},
) {
  const registry = new CandidateRegistry();
  if (options.registerAction ?? true) {
    const handle: ActionCandidateHandle = {
      kind: "action",
      candidateId: action.id,
      candidate: {
        candidateId: action.id,
        element: "button",
        control: "button",
        visibility: "visible",
        displayName: action.textContent ?? undefined,
      },
      element: action,
      sectionId: "section-repeatable",
      signature: createStructuralSignature([action]),
    };
    registry.registerAction(handle);
  }
  return {
    registry,
    isTargetSectionVisible: () => options.targetVisible ?? false,
  };
}

describe("approved preparation plan executor", () => {
  it("leaves the DOM unchanged before the user approves a preparation plan", async () => {
    document.body.innerHTML = `
      <button id="action-reveal" type="button">추가 정보 열기</button>
      <section id="optional" hidden>추가 정보</section>
    `;
    const action = document.querySelector("button")!;
    const target = document.querySelector("section")!;
    let clicks = 0;
    action.addEventListener("click", () => {
      clicks += 1;
      target.hidden = false;
    });

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [{ plan: revealPlan, approved: false }],
      initialSnapshot: snapshotFor(action),
      refreshSnapshot: async () => snapshotFor(action, { targetVisible: true }),
      countRepeatableGroups: () => 0,
    });

    expect(clicks).toBe(0);
    expect(target.hidden).toBe(true);
    expect(result).toMatchObject({
      status: "approval-required",
      mayCollectFieldsSnapshot: false,
    });
  });

  it("executes an approved reveal once and verifies its target becomes visible", async () => {
    document.body.innerHTML = `
      <button id="action-reveal" type="button">추가 정보 열기</button>
      <section id="optional" hidden>추가 정보</section>
    `;
    const action = document.querySelector("button")!;
    const target = document.querySelector("section")!;
    let clicks = 0;
    let refreshes = 0;
    action.addEventListener("click", () => {
      clicks += 1;
      target.hidden = false;
    });

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [{ plan: revealPlan, approved: true }],
      initialSnapshot: snapshotFor(action, { targetVisible: false }),
      refreshSnapshot: async () => {
        refreshes += 1;
        return snapshotFor(action, { targetVisible: !target.hidden });
      },
      countRepeatableGroups: () => 0,
    });

    expect(clicks).toBe(1);
    expect(refreshes).toBe(1);
    expect(target.hidden).toBe(false);
    expect(result).toMatchObject({
      status: "completed",
      mayCollectFieldsSnapshot: true,
    });
  });

  it("blocks Snapshot B when a reveal action does not make its target visible", async () => {
    document.body.innerHTML = `
      <button id="action-reveal" type="button">추가 정보 열기</button>
      <section hidden>추가 정보</section>
    `;
    const action = document.querySelector("button")!;

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [{ plan: revealPlan, approved: true }],
      initialSnapshot: snapshotFor(action, { targetVisible: false }),
      refreshSnapshot: async () =>
        snapshotFor(action, { targetVisible: false }),
      countRepeatableGroups: () => 0,
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "target-not-visible",
      mayCollectFieldsSnapshot: false,
    });
  });

  it("adds only the local profile shortfall and verifies each group increment", async () => {
    document.body.innerHTML = `
      <section id="certifications">
        <div data-repeatable-group></div>
        <button id="action-add" type="button">자격 항목 추가</button>
      </section>
    `;
    const action = document.querySelector("button")!;
    const section = document.querySelector("section")!;
    let clicks = 0;
    let refreshes = 0;
    action.addEventListener("click", () => {
      clicks += 1;
      const group = document.createElement("div");
      group.dataset.repeatableGroup = "";
      section.insertBefore(group, action);
    });

    const countGroups = () =>
      document.querySelectorAll("[data-repeatable-group]").length;
    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          plan: addPlan,
          approved: true,
          localItemCount: 3,
        },
      ],
      initialSnapshot: snapshotFor(action),
      refreshSnapshot: async () => {
        refreshes += 1;
        return snapshotFor(action);
      },
      countRepeatableGroups: () => countGroups(),
    });

    expect(clicks).toBe(2);
    expect(refreshes).toBe(2);
    expect(countGroups()).toBe(3);
    expect(result).toMatchObject({
      status: "completed",
      mayCollectFieldsSnapshot: true,
    });
  });

  it("does not add a repeatable group when the page already has enough rows", async () => {
    document.body.innerHTML = `
      <section>
        <div data-repeatable-group></div>
        <div data-repeatable-group></div>
        <button id="action-add" type="button">자격 항목 추가</button>
      </section>
    `;
    const action = document.querySelector("button")!;
    let clicks = 0;
    action.addEventListener("click", () => {
      clicks += 1;
    });

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [{ plan: addPlan, approved: true, localItemCount: 1 }],
      initialSnapshot: snapshotFor(action),
      refreshSnapshot: async () => snapshotFor(action),
      countRepeatableGroups: () =>
        document.querySelectorAll("[data-repeatable-group]").length,
    });

    expect(clicks).toBe(0);
    expect(result).toMatchObject({
      status: "completed",
      mayCollectFieldsSnapshot: true,
    });
  });

  it("allows Snapshot B when no addition is needed even if the stale action vanished", async () => {
    document.body.innerHTML = `
      <div data-repeatable-group></div>
      <div data-repeatable-group></div>
      <button id="action-add" type="button">자격 항목 추가</button>
    `;
    const action = document.querySelector("button")!;

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [{ plan: addPlan, approved: true, localItemCount: 2 }],
      initialSnapshot: snapshotFor(action, { registerAction: false }),
      refreshSnapshot: async () => snapshotFor(action),
      countRepeatableGroups: () =>
        document.querySelectorAll("[data-repeatable-group]").length,
    });

    expect(result).toMatchObject({
      status: "completed",
      mayCollectFieldsSnapshot: true,
    });
  });

  it("blocks Snapshot B when the repeatable group count cannot be inspected", async () => {
    document.body.innerHTML = `<button id="action-add" type="button">자격 항목 추가</button>`;
    const action = document.querySelector("button")!;

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [{ plan: addPlan, approved: true, localItemCount: 1 }],
      initialSnapshot: snapshotFor(action),
      refreshSnapshot: async () => snapshotFor(action),
      countRepeatableGroups: () => {
        throw new Error("row lookup failed");
      },
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "invalid-group-count",
      mayCollectFieldsSnapshot: false,
    });
  });

  it("stops immediately and blocks Snapshot B when an add action has no verified effect", async () => {
    document.body.innerHTML = `
      <button id="action-add" type="button">자격 항목 추가</button>
      <button id="action-reveal" type="button">추가 정보 열기</button>
    `;
    const addAction = document.querySelector<HTMLButtonElement>("#action-add")!;
    const revealAction =
      document.querySelector<HTMLButtonElement>("#action-reveal")!;
    let revealClicks = 0;
    revealAction.addEventListener("click", () => {
      revealClicks += 1;
    });

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        { plan: addPlan, approved: true, localItemCount: 2 },
        { plan: revealPlan, approved: true },
      ],
      initialSnapshot: snapshotFor(addAction),
      refreshSnapshot: async () => snapshotFor(addAction),
      countRepeatableGroups: () => 1,
    });

    expect(revealClicks).toBe(0);
    expect(result).toMatchObject({
      status: "failed",
      reason: "group-count-not-incremented",
      mayCollectFieldsSnapshot: false,
    });
  });

  it("blocks Snapshot B when an added group cannot safely re-identify the action", async () => {
    document.body.innerHTML = `
      <section>
        <div data-repeatable-group></div>
        <button id="action-add" type="button">자격 항목 추가</button>
      </section>
    `;
    const action = document.querySelector("button")!;
    const section = document.querySelector("section")!;
    action.addEventListener("click", () => {
      const group = document.createElement("div");
      group.dataset.repeatableGroup = "";
      section.insertBefore(group, action);
    });

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [{ plan: addPlan, approved: true, localItemCount: 2 }],
      initialSnapshot: snapshotFor(action),
      refreshSnapshot: async () =>
        snapshotFor(action, { registerAction: false }),
      countRepeatableGroups: () =>
        document.querySelectorAll("[data-repeatable-group]").length,
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "action-not-reidentified",
      mayCollectFieldsSnapshot: false,
    });
  });
});
