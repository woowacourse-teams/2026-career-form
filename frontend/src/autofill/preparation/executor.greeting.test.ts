import { beforeEach as useGreetingHost } from "vitest";
useGreetingHost(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://kakaomobility.career.greetinghr.com/ko/o/1/apply",
  });
});
import { describe, expect, it } from "vitest";

import type { PreparationPlan } from "../api/types";
import { collectPreparationSnapshot } from "../dom/collect";
import { executeApprovedPreparationPlans } from "./executor";

describe("Greeting approved preparation plan executor", () => {
  it("adds one graduate major and verifies the new named major row", async () => {
    const prefix = "educationalBackground.graduateSchools.0";
    document.body.innerHTML = `
      <div data-scope="field" data-part="root"><label>대학원*</label>
        <div data-scope="accordion" data-part="root">
          <div data-scope="accordion" data-part="item">
            <input name="${prefix}.schoolName">
            <div data-scope="field" data-part="root"><label>전공*</label>
              <button name="${prefix}.majors.0.majorClassification">주전공</button>
              <button name="${prefix}.majors.0.majorField">공학계열</button>
              <input name="${prefix}.majors.0" role="combobox">
              <button type="button" data-scope="tooltip" data-part="trigger">전공 추가</button>
            </div>
          </div>
        </div>
        <button type="button" data-scope="tooltip" data-part="trigger">항목 추가</button>
      </div>
    `;
    const add = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "전공 추가")!;
    let clicks = 0;
    add.addEventListener("click", () => {
      clicks += 1;
      add.insertAdjacentHTML(
        "beforebegin",
        `<button name="${prefix}.majors.1.majorClassification">복수전공</button>
         <button name="${prefix}.majors.1.majorField">사회계열</button>
         <input name="${prefix}.majors.1" role="combobox">`,
      );
    });
    const snapshot = () => {
      const collected = collectPreparationSnapshot(document);
      return {
        registry: collected.registry,
        isTargetSectionVisible: () => true,
        countRepeatableGroups: (
          plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
        ) => collected.countRepeatableGroups(plan.actionCandidateId),
        actions: collected.request.sections.flatMap(
          (section) => section.actionCandidates,
        ),
      };
    };
    const initial = snapshot();
    const actionCandidateId = initial.actions.find(
      (candidate) =>
        candidate.domId === "greeting:add:graduateSchools:0:majors",
    )?.candidateId;
    expect(actionCandidateId).toBeDefined();

    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          plan: {
            actionCandidateId: actionCandidateId!,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
          approved: true,
          localItemCount: 2,
        },
      ],
      initialSnapshot: initial,
      refreshSnapshot: async () => snapshot(),
      countRepeatableGroups: (current, plan) =>
        current.countRepeatableGroups?.(plan) ?? -1,
    });

    expect(clicks).toBe(1);
    expect(result).toMatchObject({ status: "completed", executedPlanCount: 1 });
    expect(
      snapshot().countRepeatableGroups({
        actionCandidateId: snapshot().actions.find(
          (candidate) =>
            candidate.domId === "greeting:add:graduateSchools:0:majors",
        )!.candidateId,
        command: "ADD_REPEATABLE_GROUP",
        expectedEffect: "GROUP_COUNT_INCREMENT",
      }),
    ).toBe(2);
  });
});
