import { afterEach, expect, it } from "vitest";
import { collectPreparationSnapshot } from "../../dom/collect";
import { createEmptyProfile } from "../../../profile/model";
import { localItemCount } from "../../workflow/AutofillWorkflow";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

it.each([0, 2])(
  "counts %i SK exams independently of a language skill",
  (examCount) => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(o: { url: string }): void };
      }
    ).jsdom.reconfigure({ url: "https://www.skcareers.com/apply" });
    document.body.innerHTML = `
    <div id="applyContentLinguistics" class="apply-form-box langExam-root">
      <div class="form-body"><button id="btnAddLangExam">공인 외국어 시험 추가</button></div>
    </div>
    <div id="applyContentLanguage" class="apply-form-box langAbility-root">
      <div class="form-body"><button id="btnAddLangAbility">외국어 능력 추가</button></div>
    </div>`;
    const snapshot = collectPreparationSnapshot(document);
    const profile = createEmptyProfile();
    for (let i = 0; i < examCount; i++)
      profile.languages.push({
        id: `exam-${i}`,
        sectionId: "languageTest",
        values: {},
      });
    profile.languages.push({
      id: "skill",
      sectionId: "languageSkill",
      values: {},
    });
    const count = (domId: string) => {
      const action = snapshot.request.sections
        .flatMap((s) => s.actionCandidates)
        .find((a) => a.domId === domId)!;
      return localItemCount(
        {
          actionCandidateId: action.candidateId,
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
        },
        snapshot,
        profile,
      );
    };
    expect(count("btnAddLangExam")).toBe(examCount);
    expect(count("btnAddLangAbility")).toBe(1);
  },
);
