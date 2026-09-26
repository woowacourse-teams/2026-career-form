import { afterEach, describe, expect, it } from "vitest";

import type { PreparationPlan } from "../api/types";
import { collectPreparationSnapshot } from "../dom/collect";
import { createEmptyProfile } from "../../profile/model";
import { localItemCount } from "./AutofillWorkflow";
import { greetingWorkflowAdapter } from "../adapters/greeting/workflow";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function addPlan(
  snapshot: ReturnType<typeof collectPreparationSnapshot>,
  domId: string,
) {
  const action = snapshot.request.sections
    .flatMap((section) => section.actionCandidates)
    .find((candidate) => candidate.domId === domId)!;
  return {
    actionCandidateId: action.candidateId,
    command: "ADD_REPEATABLE_GROUP",
    expectedEffect: "GROUP_COUNT_INCREMENT",
  } satisfies PreparationPlan;
}

describe("Hyundai repeated profile counts", () => {
  it("counts foreign tests and language abilities from their own profile sections", () => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://talent.hyundai.com/apply/applyWrite.hc",
    });
    document.body.innerHTML = `
      <article id="foreign" class="field-form-apply">
        <div class="field-content"><input name="foreLang" /></div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
      <article id="foreignAbility" class="field-form-apply">
        <div class="field-content"><input name="foreLangAbility" /></div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
    `;
    const snapshot = collectPreparationSnapshot(document);
    const profile = createEmptyProfile();
    profile.languages.push(
      { id: "test-1", sectionId: "languageTest", values: {} },
      { id: "skill-1", sectionId: "languageSkill", values: {} },
      { id: "skill-2", sectionId: "languageSkill", values: {} },
    );

    expect(
      localItemCount(
        addPlan(snapshot, "hyundai:add:foreign"),
        snapshot,
        profile,
      ),
    ).toBe(1);
    expect(
      localItemCount(
        addPlan(snapshot, "hyundai:add:foreignAbility"),
        snapshot,
        profile,
      ),
    ).toBe(2);
  });

  it("uses the exact action DOM ID instead of section labels or ID prefixes", () => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://talent.hyundai.com/apply/applyWrite.hc",
    });
    document.body.innerHTML = `
      <article id="foreign" class="field-form-apply">
        <h2>foreignAbility</h2>
        <div class="field-content"><input name="foreLang" /></div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
      <article id="foreignAbilitySuffix" class="field-form-apply">
        <div class="field-content"><input name="foreLangAbility" /></div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
    `;
    const snapshot = collectPreparationSnapshot(document);
    const profile = createEmptyProfile();
    profile.languages.push(
      { id: "test-1", sectionId: "languageTest", values: {} },
      { id: "skill-1", sectionId: "languageSkill", values: {} },
      { id: "skill-2", sectionId: "languageSkill", values: {} },
    );

    expect(
      localItemCount(
        addPlan(snapshot, "hyundai:add:foreign"),
        snapshot,
        profile,
      ),
    ).toBe(1);
    expect(
      localItemCount(
        addPlan(snapshot, "hyundai:add:foreignAbilitySuffix"),
        snapshot,
        profile,
      ),
    ).toBe(3);
  });
});

describe("Greeting graduate major count", () => {
  it("adds only one complete second major from the matching graduate profile row", () => {
    const prefix = "educationalBackground.graduateSchools.0";
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>대학원*</label>
      <div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item">
        <input name="${prefix}.schoolName">
        <div data-scope="field" data-part="root"><label>전공*</label>
          <button name="${prefix}.majors.0.majorClassification">주전공</button>
          <button name="${prefix}.majors.0.majorField">공학계열</button>
          <input name="${prefix}.majors.0" role="combobox">
          <button type="button" data-scope="tooltip" data-part="trigger">전공 추가</button>
        </div></div></div></div>`;
    const snapshot = collectPreparationSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const plan = addPlan(snapshot, "greeting:add:graduateSchools:0:majors");
    const profile = createEmptyProfile();
    const values = {
      additionalMajorClassification: "복수전공",
      additionalMajorField: "사회계열",
      additionalMajorName: "경영학",
    };
    profile.education.push({
      id: "graduate-1",
      sectionId: "graduateSchool",
      values,
    });
    expect(
      localItemCount(plan, snapshot, profile, greetingWorkflowAdapter),
    ).toBe(2);
    delete (values as Partial<typeof values>).additionalMajorField;
    expect(
      localItemCount(plan, snapshot, profile, greetingWorkflowAdapter),
    ).toBeUndefined();
    delete (values as Partial<typeof values>).additionalMajorName;
    delete (values as Partial<typeof values>).additionalMajorClassification;
    expect(
      localItemCount(plan, snapshot, profile, greetingWorkflowAdapter),
    ).toBe(1);
  });
});
