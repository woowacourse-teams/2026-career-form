import { describe, expect, it } from "vitest";

import type { PreparationPlan } from "../api/types";
import { collectPreparationSnapshot } from "../dom/collect";
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
  it("re-identifies a radio by its name when multiple options share the same label", async () => {
    const veteran = document.createElement("input");
    veteran.type = "radio";
    veteran.name = "prsVeteranBenefitYN";
    const disabled = document.createElement("input");
    disabled.type = "radio";
    disabled.name = "prsDisabledYN";
    document.body.append(veteran, disabled);

    const snapshotWith = (
      candidateIds: readonly [string, string],
      sectionId: string,
    ) => {
      const registry = new CandidateRegistry();
      [veteran, disabled].forEach((element, index) => {
        registry.registerAction({
          kind: "action",
          candidateId: candidateIds[index],
          candidate: {
            candidateId: candidateIds[index],
            element: "input",
            control: "radio",
            visibility: "visible",
            displayName: "대상",
            domName: element.name,
          },
          element,
          sectionId,
          signature: createStructuralSignature([element]),
        });
      });
      return { registry, isTargetSectionVisible: () => true };
    };
    const veteranPlan: PreparationPlan = {
      actionCandidateId: "veteran-before-rerender",
      command: "SELECT_OPTION_TO_REVEAL",
      expectedEffect: "TARGET_FIELDS_VISIBLE",
      profileFieldKey: "veteran.veteran.veteranStatus",
      optionDisplayName: "대상",
      targetSectionId: "section-1",
    };
    const disabledPlan: PreparationPlan = {
      actionCandidateId: "disabled-before-rerender",
      command: "SELECT_OPTION_TO_REVEAL",
      expectedEffect: "TARGET_FIELDS_VISIBLE",
      profileFieldKey: "disability.disability.disabilityStatus",
      optionDisplayName: "대상",
      targetSectionId: "section-1",
    };
    const selectedCandidateIds: string[] = [];

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        { plan: veteranPlan, approved: true },
        { plan: disabledPlan, approved: true },
      ],
      initialSnapshot: snapshotWith(
        ["veteran-before-rerender", "disabled-before-rerender"],
        "section-before-conditionals",
      ),
      refreshSnapshot: async () =>
        snapshotWith(
          ["veteran-after-rerender", "disabled-after-rerender"],
          "section-after-conditionals",
        ),
      countRepeatableGroups: () => 0,
      selectProfileOption: (selectedPlan) => {
        selectedCandidateIds.push(selectedPlan.actionCandidateId);
        return "selected";
      },
    });

    expect(selectedCandidateIds).toEqual([
      "veteran-before-rerender",
      "disabled-after-rerender",
    ]);
    expect(result).toMatchObject({ status: "completed" });
  });

  it("waits for every policy field after selecting an option", async () => {
    const action = document.createElement("button");
    action.id = "action-radio";
    document.body.append(action);
    let waitedFor: string[] | undefined;
    const plan: PreparationPlan = {
      actionCandidateId: "action-radio",
      command: "SELECT_OPTION_TO_REVEAL",
      expectedEffect: "TARGET_FIELDS_VISIBLE",
      profileFieldKey: "veteran.veteran.veteranStatus",
      optionDisplayName: "대상",
      expectedFieldNames: ["dependent-one", "dependent-two"],
      targetSectionId: "section-repeatable",
    };

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [{ plan, approved: true }],
      initialSnapshot: snapshotFor(action),
      refreshSnapshot: async () => snapshotFor(action),
      countRepeatableGroups: () => 0,
      selectProfileOption: () => "selected",
      waitForExpectedFields: async (selectedPlan) => {
        waitedFor =
          "expectedFieldNames" in selectedPlan
            ? selectedPlan.expectedFieldNames
            : undefined;
        return true;
      },
    });

    expect(waitedFor).toEqual(["dependent-one", "dependent-two"]);
    expect(result).toMatchObject({ status: "completed" });
  });

  it("continues after a verified selection lacks an optional expected field", async () => {
    const action = document.createElement("button");
    action.id = "action-radio";
    document.body.append(action);
    const plan: PreparationPlan = {
      actionCandidateId: "action-radio",
      command: "SELECT_OPTION_TO_REVEAL",
      expectedEffect: "TARGET_FIELDS_VISIBLE",
      profileFieldKey: "veteran.veteran.veteranStatus",
      optionDisplayName: "대상",
      expectedFieldNames: ["role-specific-field"],
      targetSectionId: "section-repeatable",
    };

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [{ plan, approved: true }],
      initialSnapshot: snapshotFor(action),
      refreshSnapshot: async () => snapshotFor(action),
      countRepeatableGroups: () => 0,
      selectProfileOption: () => "selected",
      waitForExpectedFields: async () => false,
    });

    expect(result).toMatchObject({
      status: "completed",
      mayCollectFieldsSnapshot: true,
      unavailableActionCandidateIds: ["action-radio"],
    });
  });

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

  it("executes only approved plans when some preparation plans are skipped", async () => {
    document.body.innerHTML = `
      <button id="action-reveal" type="button">추가 정보 열기</button>
      <button id="action-add" type="button">자격 항목 추가</button>
      <section id="optional" hidden>추가 정보</section>
    `;
    const revealAction =
      document.querySelector<HTMLButtonElement>("#action-reveal")!;
    const addAction = document.querySelector<HTMLButtonElement>("#action-add")!;
    const target = document.querySelector("section")!;
    let revealClicks = 0;
    let addClicks = 0;
    revealAction.addEventListener("click", () => {
      revealClicks += 1;
      target.hidden = false;
    });
    addAction.addEventListener("click", () => {
      addClicks += 1;
    });

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        { plan: revealPlan, approved: true },
        { plan: addPlan, approved: false, localItemCount: 1 },
      ],
      initialSnapshot: snapshotFor(revealAction),
      refreshSnapshot: async () =>
        snapshotFor(revealAction, { targetVisible: !target.hidden }),
      countRepeatableGroups: () => 0,
    });

    expect(revealClicks).toBe(1);
    expect(addClicks).toBe(0);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 1,
      mayCollectFieldsSnapshot: true,
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

  it("re-identifies the visible add action when a site hides the old button after each click", async () => {
    document.body.innerHTML = `
      <div class="apply-form-box cert-root">
        <div class="form-body">
          <div class="form-item-group">
            <button type="button" class="btnAddCert">자격/면허 추가</button>
          </div>
        </div>
      </div>
    `;
    const formBody = document.querySelector(".form-body")!;
    const firstAction = document.querySelector<HTMLButtonElement>("button")!;
    let clicks = 0;
    const addRow = (action: HTMLButtonElement) => {
      action.style.display = "none";
      const row = document.createElement("div");
      row.className = "form-item-group cert-Item";
      formBody.append(row);
      const helperAction = document.createElement("button");
      helperAction.type = "button";
      helperAction.textContent = "보조 동작";
      formBody.append(helperAction);
      const nextAction = action.cloneNode(true) as HTMLButtonElement;
      nextAction.removeAttribute("id");
      nextAction.style.display = "";
      nextAction.addEventListener("click", () => {
        clicks += 1;
        addRow(nextAction);
      });
      formBody.append(nextAction);
    };
    firstAction.addEventListener("click", () => {
      clicks += 1;
      addRow(firstAction);
    });

    const initialCollected = collectPreparationSnapshot(document);
    const actionCandidateId =
      initialCollected.request.sections
        .flatMap(({ actionCandidates }) => actionCandidates)
        .find(({ displayName }) => displayName === "자격/면허 추가")
        ?.candidateId ?? "action-1";
    const toExecutionSnapshot = () => {
      const collected = collectPreparationSnapshot(document);
      return {
        registry: collected.registry,
        isTargetSectionVisible: () => true,
        countRepeatableGroups: (
          plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
        ) => collected.countRepeatableGroups(plan.actionCandidateId),
      };
    };

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          plan: {
            actionCandidateId,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
          approved: true,
          localItemCount: 2,
        },
      ],
      initialSnapshot: toExecutionSnapshot(),
      refreshSnapshot: async () => toExecutionSnapshot(),
      countRepeatableGroups: (snapshot, plan) =>
        snapshot.countRepeatableGroups?.(plan) ?? -1,
    });

    expect(clicks).toBe(2);
    expect(document.querySelectorAll(".cert-Item")).toHaveLength(2);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 2,
    });
  });

  it("counts and executes sibling add actions by their refreshed identities", async () => {
    document.body.innerHTML = `
      <div class="apply-form-box education-root">
        <div class="form-body">
          <button id="btnAddEducationHigh" type="button">고등학교 학력 정보 추가</button>
          <button id="btnAddEducationUniv" type="button">대학 학력 정보 추가</button>
        </div>
      </div>
    `;
    const formBody = document.querySelector<HTMLDivElement>(".form-body")!;
    const highAction = document.querySelector<HTMLButtonElement>(
      "#btnAddEducationHigh",
    )!;
    const universityAction = document.querySelector<HTMLButtonElement>(
      "#btnAddEducationUniv",
    )!;
    const clicks: string[] = [];
    highAction.addEventListener("click", () => {
      clicks.push("highSchool");
      const row = document.createElement("div");
      row.className = "form-item-group educationhigh-item";
      formBody.insertBefore(row, highAction);
    });
    universityAction.addEventListener("click", () => {
      clicks.push("university");
      const row = document.createElement("div");
      row.className = "form-item-group educationUniv-item";
      formBody.insertBefore(row, universityAction);
    });

    const initialCollected = collectPreparationSnapshot(document);
    const actionCandidates = initialCollected.request.sections.flatMap(
      ({ actionCandidates }) => actionCandidates,
    );
    const highCandidateId = actionCandidates.find(
      ({ domId }) => domId === "btnAddEducationHigh",
    )!.candidateId;
    const universityCandidateId = actionCandidates.find(
      ({ domId }) => domId === "btnAddEducationUniv",
    )!.candidateId;
    const toExecutionSnapshot = () => {
      const collected = collectPreparationSnapshot(document);
      return {
        registry: collected.registry,
        isTargetSectionVisible: () => true,
        countRepeatableGroups: (
          plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
        ) => collected.countRepeatableGroups(plan.actionCandidateId),
      };
    };

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          plan: {
            actionCandidateId: highCandidateId,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
          approved: true,
          localItemCount: 1,
        },
        {
          plan: {
            actionCandidateId: universityCandidateId,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
          approved: true,
          localItemCount: 1,
        },
      ],
      initialSnapshot: toExecutionSnapshot(),
      refreshSnapshot: async () => toExecutionSnapshot(),
      countRepeatableGroups: (snapshot, plan) =>
        snapshot.countRepeatableGroups?.(plan) ?? -1,
    });

    expect(clicks).toEqual(["highSchool", "university"]);
    expect(document.querySelectorAll(".educationhigh-item")).toHaveLength(1);
    expect(document.querySelectorAll(".educationUniv-item")).toHaveLength(1);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 2,
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
      failedActionCandidateId: "action-add",
      mayCollectFieldsSnapshot: false,
    });
  });
});
