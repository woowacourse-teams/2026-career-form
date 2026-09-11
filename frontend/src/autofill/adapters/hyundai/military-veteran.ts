import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

export const HYUNDAI_CONDITIONAL_DRIVERS = new Map([
  [
    "milCd",
    {
      codegb: "0004",
      profileFieldKey: "military.military.militaryStatus",
    },
  ],
  [
    "branchYn",
    {
      codegb: "1502",
      profileFieldKey: "veteran.veteran.veteranStatus",
    },
  ],
  [
    "injuryYn",
    {
      codegb: "1503",
      profileFieldKey: "disability.disability.disabilityStatus",
    },
  ],
]);

type HyundaiConditionalDriver = "milCd" | "branchYn" | "injuryYn";

export function exactHyundaiEtcArticle(
  element: Element,
): HTMLElement | undefined {
  const article = element.closest<HTMLElement>("article#etc.field-form-apply");
  return article && element.closest("article.field-form-apply") === article
    ? article
    : undefined;
}

function exactDriverTrigger(
  document: Document,
  id: HyundaiConditionalDriver,
): HTMLInputElement | undefined {
  const article = document.querySelector<HTMLElement>(
    "article#etc.field-form-apply",
  );
  if (!article) return undefined;
  const triggers = article.querySelectorAll<HTMLInputElement>(
    `input[type='button']#${id}`,
  );
  if (triggers.length !== 1) return undefined;
  const trigger = triggers[0]!;
  const spec = HYUNDAI_CONDITIONAL_DRIVERS.get(id)!;
  const wrap = trigger.closest(".select-wrap");
  const hidden = wrap?.querySelectorAll<HTMLInputElement>(
    `:scope > input[type='hidden'][name='${id}']`,
  );
  return trigger.name === "" &&
    trigger.dataset.codegb === spec.codegb &&
    trigger.classList.contains("btn-select") &&
    trigger.isConnected &&
    exactHyundaiEtcArticle(trigger) === article &&
    trigger.closest(".field") &&
    hidden?.length === 1 &&
    hidden[0]!.classList.contains("js-field")
    ? trigger
    : undefined;
}

export function exactConditionalDriver(
  handle: FieldCandidateHandle,
  item?: ReviewPlanItem,
): HyundaiConditionalDriver | undefined {
  const id = handle.candidate.domId;
  const spec = id ? HYUNDAI_CONDITIONAL_DRIVERS.get(id) : undefined;
  const trigger = handle.elements[0];
  if (
    !spec ||
    (id !== "milCd" && id !== "branchYn" && id !== "injuryYn") ||
    handle.elements.length !== 1 ||
    !(trigger instanceof HTMLInputElement) ||
    trigger !== exactDriverTrigger(trigger.ownerDocument, id) ||
    handle.candidate.domName !== undefined ||
    handle.candidate.element !== "input" ||
    handle.candidate.control !== "button"
  ) {
    return undefined;
  }
  if (
    item &&
    (item.candidateId !== handle.candidateId ||
      item.analysis?.candidateId !== item.candidateId ||
      item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
      item.analysis.interactionStatus !== "READY" ||
      item.analysis.writePlan?.command !== "SELECT_BUTTON_OPTION" ||
      item.analysis.valueBinding?.type !== "BUTTON_OPTION" ||
      item.analysis.valueBinding.profileFieldKey !== spec.profileFieldKey)
  ) {
    return undefined;
  }
  return id;
}

function exactStateControl(
  document: Document,
  id: string,
): HTMLInputElement | HTMLTextAreaElement | undefined {
  const article = document.querySelector<HTMLElement>(
    "article#etc.field-form-apply",
  );
  if (!article) return undefined;
  const matches = Array.from(
    article.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      `:is(input, textarea)#${id}:not([type='hidden'])`,
    ),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function controlsMatch(
  document: Document,
  required: readonly string[],
  optional: readonly string[],
  disabled: readonly string[],
): boolean {
  return (
    required.every((id) => {
      const control = exactStateControl(document, id);
      return Boolean(control && !control.disabled && control.required);
    }) &&
    optional.every((id) => {
      const control = exactStateControl(document, id);
      return Boolean(control && !control.disabled && !control.required);
    }) &&
    disabled.every((id) => {
      const control = exactStateControl(document, id);
      return Boolean(control && control.disabled && !control.required);
    })
  );
}

function optionalControlMatches(
  document: Document,
  id: string,
  disabled: boolean,
  required: boolean,
): boolean {
  const article = document.querySelector<HTMLElement>(
    "article#etc.field-form-apply",
  );
  if (!article) return false;
  const controls = article.querySelectorAll<HTMLInputElement>(
    `input#${id}:not([type='hidden'])`,
  );
  return (
    controls.length === 0 ||
    (controls.length === 1 &&
      controls[0]!.disabled === disabled &&
      controls[0]!.required === required)
  );
}

function driverValue(
  trigger: HTMLInputElement,
  id: HyundaiConditionalDriver,
): { display: string; code: string } | undefined {
  const hidden = trigger
    .closest(".select-wrap")!
    .querySelector<HTMLInputElement>(
      `:scope > input[type='hidden'][name='${id}']`,
    )!;
  return trigger.value && hidden.value
    ? { display: trigger.value, code: hidden.value }
    : undefined;
}

function driverStateSettled(
  document: Document,
  id: HyundaiConditionalDriver,
): boolean {
  const trigger = exactDriverTrigger(document, id);
  if (!trigger) return false;
  const value = driverValue(trigger, id);
  if (!value) return false;
  if (id === "milCd") {
    if (value.code === "1" && value.display === "필") {
      return (
        controlsMatch(
          document,
          ["milStartDt", "milEndDt", "milRank", "milDitinc"],
          [],
          ["milExcptCd"],
        ) && optionalControlMatches(document, "milSpeNm", false, true)
      );
    }
    if (value.code === "5" && value.display === "면제") {
      return (
        controlsMatch(
          document,
          ["milExcptCd"],
          [],
          ["milStartDt", "milEndDt", "milRank", "milDitinc"],
        ) && optionalControlMatches(document, "milSpeNm", true, false)
      );
    }
    if (
      (value.code === "2" && value.display === "미필") ||
      (value.code === "7" && value.display === "비대상(여성/해외국적)")
    ) {
      return (
        controlsMatch(
          document,
          [],
          [],
          ["milExcptCd", "milStartDt", "milEndDt", "milRank", "milDitinc"],
        ) && optionalControlMatches(document, "milSpeNm", true, false)
      );
    }
    return false;
  }
  if (id === "branchYn") {
    if (value.code === "Y" && value.display === "예") {
      return controlsMatch(
        document,
        ["branchRel", "branchAddPoint", "branchNo"],
        ["branchSupplyYn"],
        [],
      );
    }
    if (value.code === "N" && value.display === "아니오") {
      return controlsMatch(
        document,
        [],
        [],
        ["branchRel", "branchSupplyYn", "branchAddPoint", "branchNo"],
      );
    }
    return false;
  }
  const injuryDetails = ["injuryGrade", "injuryType", "injuryCont"];
  if (value.code === "Y" && value.display === "예") {
    return injuryDetails.every((detail) => {
      const control = exactStateControl(document, detail);
      return Boolean(control && !control.disabled);
    });
  }
  if (value.code === "N" && value.display === "아니오") {
    return injuryDetails.every((detail) => {
      const control = exactStateControl(document, detail);
      return Boolean(control && control.disabled);
    });
  }
  return false;
}

function driverMatches(
  document: Document,
  id: HyundaiConditionalDriver,
  display: string,
  code: string,
): boolean {
  const trigger = exactDriverTrigger(document, id);
  const value = trigger ? driverValue(trigger, id) : undefined;
  return (
    value?.display === display &&
    value.code === code &&
    driverStateSettled(document, id)
  );
}

export function conditionalDriverSettled(
  document: Document,
  handle: FieldCandidateHandle,
): boolean {
  const id = exactConditionalDriver(handle);
  return id ? driverStateSettled(document, id) : false;
}

export function dependentDriverSettled(
  document: Document,
  fieldId: string,
): boolean {
  if (
    fieldId === "milStartDt" ||
    fieldId === "milEndDt" ||
    fieldId === "milRank" ||
    fieldId === "milDitinc"
  ) {
    return driverMatches(document, "milCd", "필", "1");
  }
  if (fieldId === "milExcptCd") {
    return driverMatches(document, "milCd", "면제", "5");
  }
  if (fieldId === "branchRel" || fieldId === "branchNo") {
    return driverMatches(document, "branchYn", "예", "Y");
  }
  if (fieldId === "injuryGrade" || fieldId === "injuryType") {
    return driverMatches(document, "injuryYn", "예", "Y");
  }
  return true;
}
