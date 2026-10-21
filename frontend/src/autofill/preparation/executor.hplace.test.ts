import { afterEach, expect, it } from "vitest";

import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import {
  renderHplaceLogin,
  resetHplacePage,
} from "../workflow/test-utils/hplace.fixture";
import { executeApprovedPreparationPlans } from "./executor";

afterEach(() => {
  resetHplacePage();
});

it.each(["before-execution", "before-mutation"] as const)(
  "does not click an approved preparation action when Hplace is identified %s",
  async (phase) => {
    renderHplaceLogin();
    const assets = document.head.innerHTML;
    document.head.replaceChildren();
    const button = document.createElement("button");
    button.textContent = "추가 정보 열기";
    button.type = "button";
    document.body.append(button);
    let visible = false;
    let clicks = 0;
    button.onclick = () => {
      clicks += 1;
      visible = true;
    };
    const registry = new CandidateRegistry();
    registry.registerAction({
      kind: "action",
      candidateId: "synthetic-action",
      sectionId: "synthetic-section",
      candidate: {
        candidateId: "synthetic-action",
        element: "button",
        control: "button",
        visibility: "visible",
      },
      element: button,
      signature: createStructuralSignature([button]),
    });
    const snapshot = { registry, isTargetSectionVisible: () => visible };
    if (phase === "before-execution") document.head.innerHTML = assets;
    const result = await executeApprovedPreparationPlans({
      document,
      approvedPlans: [
        {
          approved: true,
          plan: {
            actionCandidateId: "synthetic-action",
            command: "REVEAL_SECTION",
            expectedEffect: "TARGET_VISIBLE",
            targetSectionId: "synthetic-section",
          },
        },
      ],
      initialSnapshot: snapshot,
      refreshSnapshot: async () => snapshot,
      countRepeatableGroups: () => 0,
      beforeMutation: async () => {
        if (phase === "before-mutation") document.head.innerHTML = assets;
        return true;
      },
    });
    expect(clicks).toBe(0);
    expect(visible).toBe(false);
    expect(result).toMatchObject({ status: "failed", executedPlanCount: 0 });
  },
);
