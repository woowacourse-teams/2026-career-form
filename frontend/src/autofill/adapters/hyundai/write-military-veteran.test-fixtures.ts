import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

function gpaItem(display: string, code: string): ReviewPlanItem {
  return {
    candidateId: "hyundai-gpa-scale-1",
    fieldLabel: "만점기준",
    currentValue: "",
    profileValue: display,
    previewValue: display,
    status: "needs-review",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis: {
      candidateId: "hyundai-gpa-scale-1",
      matchType: "MATCH",
      valueBinding: {
        type: "BUTTON_OPTION",
        profileFieldKey: "education.university.gpaScale",
        optionMap: { [display]: display },
        optionCodeMap: { [display]: code },
      },
      autofillPolicy: "CONDITIONAL",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_BUTTON_OPTION" },
    },
  };
}

function buttonItem(
  candidateId: string,
  profileFieldKey: string,
  display: string,
  code: string,
): ReviewPlanItem {
  return {
    ...gpaItem(display, code),
    candidateId,
    fieldLabel: candidateId,
    analysis: {
      ...gpaItem(display, code).analysis!,
      candidateId,
      valueBinding: {
        type: "BUTTON_OPTION",
        profileFieldKey,
        optionMap: { fixture: display },
        optionCodeMap: { [display]: code },
      },
    },
  };
}

function renderExactButton({
  id,
  codegb,
  display,
  code,
  enabled,
  disabled,
  valid,
}: {
  id: string;
  codegb: string;
  display: string;
  code: string;
  enabled?: string;
  disabled?: string;
  valid?: string;
}) {
  document.body.innerHTML = `
    <article id="etc" class="field-form-apply">
      <div class="select-wrap">
        <input type="hidden" class="js-field" name="${id}" />
        <input type="button" class="btn-select" id="${id}" data-codegb="${codegb}" />
        <div class="select-option">
          <button type="button" data-code="${code}" data-enabled="${enabled ?? ""}" data-disabled="${disabled ?? ""}" data-valid="${valid ?? ""}">${display}</button>
        </div>
      </div>
    </article>`;
  const trigger = document.querySelector<HTMLInputElement>(`#${id}`)!;
  const article = document.querySelector<HTMLElement>("article#etc")!;
  if (["milDitinc", "milRank"].includes(id)) {
    article.insertAdjacentHTML(
      "afterbegin",
      '<div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="milCd" value="1"><input type="button" class="btn-select" id="milCd" data-codegb="0004" value="필"></div></div>',
    );
    trigger.required = true;
    if (id !== "milRank")
      article.insertAdjacentHTML(
        "beforeend",
        '<input type="button" id="milRank" required>',
      );
    if (id !== "milDitinc")
      article.insertAdjacentHTML(
        "beforeend",
        '<input type="button" id="milDitinc" required>',
      );
    article.insertAdjacentHTML(
      "beforeend",
      '<input id="milStartDt" required><input id="milEndDt" required><input type="button" id="milExcptCd" disabled>',
    );
  }
  if (id === "milExcptCd") {
    article.insertAdjacentHTML(
      "afterbegin",
      '<div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="milCd" value="5"><input type="button" class="btn-select" id="milCd" data-codegb="0004" value="면제"></div></div>',
    );
    trigger.required = true;
    article.insertAdjacentHTML(
      "beforeend",
      '<input id="milStartDt" disabled><input id="milEndDt" disabled><input type="button" id="milRank" disabled><input type="button" id="milDitinc" disabled>',
    );
  }
  if (id === "branchRel") {
    article.insertAdjacentHTML(
      "afterbegin",
      '<div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="branchYn" value="Y"><input type="button" class="btn-select" id="branchYn" data-codegb="1502" value="예"></div></div>',
    );
    trigger.required = true;
    article.insertAdjacentHTML(
      "beforeend",
      '<input type="checkbox" id="branchSupplyYn"><input type="button" id="branchAddPoint" required><input id="branchNo" required>',
    );
  }
  if (id === "injuryYn") {
    article.insertAdjacentHTML(
      "beforeend",
      '<input type="button" id="injuryGrade"><input type="button" id="injuryType"><input id="injuryTypeNm"><input id="injuryCont">',
    );
  }
  if (id === "injuryGrade" || id === "injuryType") {
    article.insertAdjacentHTML(
      "afterbegin",
      '<div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="injuryYn" value="Y"><input type="button" class="btn-select" id="injuryYn" data-codegb="1503" value="예"></div></div>',
    );
    article.insertAdjacentHTML(
      "beforeend",
      `${id === "injuryGrade" ? "" : '<input type="button" id="injuryGrade" required>'}${id === "injuryType" ? "" : '<input type="button" id="injuryType" required>'}<input id="injuryTypeNm"><input id="injuryCont">`,
    );
  }
  const hidden = document.querySelector<HTMLInputElement>(
    `input[type='hidden'][name='${id}']`,
  )!;
  const option = trigger
    .closest(".select-wrap")!
    .querySelector<HTMLButtonElement>(".select-option button")!;
  Object.defineProperty(option, "offsetParent", { value: document.body });
  let triggerClicks = 0;
  let optionClicks = 0;
  trigger.addEventListener("click", () => {
    triggerClicks += 1;
  });
  option.addEventListener("click", () => {
    optionClicks += 1;
    trigger.value = display;
    hidden.value = code;
  });
  const candidateId = `field-${id}`;
  return {
    trigger,
    hidden,
    option,
    handle: {
      kind: "field",
      candidateId,
      sectionId: "etc",
      signature: id,
      candidate: {
        candidateId,
        visibility: "visible",
        domId: id,
        element: "input",
        control: "button",
      },
      elements: [trigger],
      optionElements: new Map(),
    } as FieldCandidateHandle,
    triggerClicks: () => triggerClicks,
    optionClicks: () => optionClicks,
  };
}

export { buttonItem, gpaItem, renderExactButton };
