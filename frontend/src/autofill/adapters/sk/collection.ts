import type { CollectionAdapter } from "../collection";

const RENDERED_REPEAT_ACTIONS = [
  {
    id: "btnAddCareer",
    label: "경력 사항 추가",
    selector:
      "div#applyContentCareer.apply-form-box.career-root > div.form-body > div.form-item-group.career-item > div.form-item-asset > div.form-item-column.btn-control > div.form-add-control.column > button.btn.medium.btn-dashed.btnAddCareer",
  },
  {
    id: "btnAddCert",
    label: "자격/면허 추가",
    selector:
      "div#applyContentLicense.apply-form-box.cert-root > div.form-body > div.form-item-group.cert-Item > div.form-item-asset > div.form-item-column:not(.btn-control) > div.form-add-control.column > button.btn.medium.btn-dashed.btnAddCert",
  },
  {
    id: "btnAddLangExam",
    label: "공인 외국어 시험 추가",
    selector:
      "div#applyContentLinguistics.apply-form-box.langExam-root > div.form-body > div.form-item-group.langExam-Item > div.form-item-asset > div.form-item-column:not(.btn-control) > div.form-add-control.column > button.btn.medium.btn-dashed.btnAddLangExam",
  },
  {
    id: "btnAddLangAbility",
    label: "외국어 능력 추가",
    selector:
      "div#applyContentLanguage.apply-form-box.langAbility-root > div.form-body > div.form-item-group.langAbility-item > div.form-item-asset > div.form-item-column.btn-control > div.form-add-control.column > button.btn.medium.btn-dashed.btnAddLangAbility",
  },
] as const;

function actionDomId(element: HTMLElement): string | undefined {
  if (!(element instanceof HTMLButtonElement)) return undefined;

  const displayName = element.textContent?.replace(/\s+/g, " ").trim();
  const matches = RENDERED_REPEAT_ACTIONS.filter(
    ({ label, selector }) => displayName === label && element.matches(selector),
  );
  return matches.length === 1 ? matches[0]!.id : undefined;
}

export const skCollectionAdapter: CollectionAdapter = {
  sectionSelectors: [],
  collectsInputButtonFields: false,
  actionDomId,
  repeatableItemCandidates: () => undefined,
  requiresVisibleControl: (phase) => phase === "fields",
};
