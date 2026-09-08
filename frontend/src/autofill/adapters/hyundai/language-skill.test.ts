import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../../profile/model";
import type { FieldsAnalyzeResponse } from "../../api/types";
import { collectFieldsSnapshot } from "../../dom/collect";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWrites } from "../../write/executor";

function setUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}
afterEach(() => {
  document.body.replaceChildren();
  setUrl("http://localhost:3000");
});

it("writes each language skill row and verifies its own code without inventing writing or reading levels", () => {
  setUrl("https://talent.hyundai.com/apply/applyWrite.hc");
  document.body.innerHTML = `<article id="foreignAbility" class="field-form-apply"></article>`;
  const labels = [
    {
      language: "영어",
      code: "02",
      level: "Advanced (비즈니스 가능)",
      levelCode: "02",
      alias: "비즈니스 가능",
    },
    {
      language: "일본어",
      code: "12",
      level: "Intermediate (일상생활 가능)",
      levelCode: "03",
      alias: "일상생활 가능",
    },
  ];
  for (let index = 0; index < labels.length; index += 1) {
    const row = document.createElement("div");
    row.className = "field-content";
    row.innerHTML = `<div class="field-group">
      <div class="select-wrap"><input type="hidden" class="js-field" name="foreLangAbility" /><input type="button" id="foreLangAbility_${index + 1}" /><div class="select-option"></div></div>
      <div class="select-wrap"><input type="hidden" class="js-field" name="speak" /><input type="button" id="speak_${index + 1}" /><div class="select-option"></div></div>
      <input type="button" id="write_${index + 1}" /><input type="button" id="read_${index + 1}" />
    </div>`;
    document.querySelector("article")!.append(row);
    for (const name of ["foreLangAbility", "speak"]) {
      const hidden = row.querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
      )!;
      const wrap = hidden.closest(".select-wrap")!;
      const trigger = wrap.querySelector<HTMLInputElement>(
        'input[type="button"]',
      )!;
      for (const label of labels) {
        const option = document.createElement("button");
        option.dataset.code = name === "speak" ? label.levelCode : label.code;
        option.textContent = name === "speak" ? label.level : label.language;
        Object.defineProperty(option, "offsetParent", { value: document.body });
        option.addEventListener("click", () => {
          hidden.value = option.dataset.code!;
          trigger.value = option.textContent!;
        });
        wrap.querySelector(".select-option")!.append(option);
      }
    }
  }
  const profile = createEmptyProfile();
  profile.languages = labels.map((label, index) => ({
    id: `skill-${index}`,
    sectionId: "languageSkill",
    values: { language: label.language, conversationalLevel: label.alias },
  }));
  const snapshot = collectFieldsSnapshot(document);
  const fields: FieldsAnalyzeResponse["fields"] = snapshot.request.sections
    .flatMap(
      (section) =>
        section.items?.flatMap((item) => item.fields) ?? section.fields,
    )
    .filter((field) => /^(foreLangAbility|speak)_/.test(field.domId ?? ""))
    .map((field) => {
      const speaking = field.domId!.startsWith("speak_");
      return {
        candidateId: field.candidateId,
        matchType: "MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: "CONDITIONAL",
        writePlan: { command: "SELECT_BUTTON_OPTION" },
        valueBinding: {
          type: "BUTTON_OPTION",
          profileFieldKey: speaking
            ? "languages.languageSkill.conversationalLevel"
            : "languages.languageSkill.language",
          optionMap: Object.fromEntries(
            labels.map((label) =>
              speaking
                ? [label.alias, label.level]
                : [label.language, label.language],
            ),
          ),
          optionCodeMap: Object.fromEntries(
            labels.map((label) =>
              speaking
                ? [label.level, label.levelCode]
                : [label.language, label.code],
            ),
          ),
        },
      };
    });
  const plan = buildReviewPlan({
    profile,
    registry: snapshot.registry,
    analysis: {
      snapshotId: snapshot.request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields,
    },
  });
  expect(plan.items).toHaveLength(4);
  const results = executeApprovedWrites({
    registry: snapshot.registry,
    items: plan.items.map((item) => ({ ...item, selected: true })),
    approvedCandidateIds: new Set(plan.items.map((item) => item.candidateId)),
  });
  expect(results).toEqual(
    Array.from({ length: 4 }, () =>
      expect.objectContaining({ status: "written" }),
    ),
  );
  expect(
    Array.from(
      document.querySelectorAll<HTMLInputElement>('[name="foreLangAbility"]'),
      (field) => field.value,
    ),
  ).toEqual(["02", "12"]);
  expect(
    Array.from(
      document.querySelectorAll<HTMLInputElement>('[name="speak"]'),
      (field) => field.value,
    ),
  ).toEqual(["02", "03"]);
  expect(
    Array.from(
      document.querySelectorAll<HTMLInputElement>(
        '[id^="write_"], [id^="read_"]',
      ),
      (field) => field.value,
    ),
  ).toEqual(["", "", "", ""]);
});
