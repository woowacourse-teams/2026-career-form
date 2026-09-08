import { hyundaiAddressTrigger } from "./address";
import type { CollectionAdapter } from "../collection";

function directFieldContents(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains("field-content"),
  );
}

type RowControlSpec = {
  element: "input" | "textarea";
  idBase: string;
  name: string;
  type?: string;
};

const PROJECT_ROW: readonly RowControlSpec[] = [
  { element: "input", idBase: "prjNm", name: "prjNm", type: "text" },
  { element: "input", idBase: "prjStDt", name: "prjStDt", type: "text" },
  { element: "input", idBase: "prjEndDt", name: "prjEndDt", type: "text" },
  {
    element: "input",
    idBase: "prjRoleNm",
    name: "prjRoleNm",
    type: "text",
  },
  { element: "textarea", idBase: "prjRoleDtl", name: "prjRoleDtl" },
];

const PUBLICATION_ROW: readonly RowControlSpec[] = [
  { element: "input", idBase: "typeGb", name: "", type: "button" },
  { element: "input", idBase: "title", name: "title", type: "text" },
  { element: "textarea", idBase: "cont", name: "cont" },
];

function fieldIndex(control: Element, idBase: string): number | undefined {
  const match = new RegExp(`^${idBase}_([1-9][0-9]*)$`).exec(control.id);
  return match ? Number(match[1]) : undefined;
}

function controlsInRow(
  scope: HTMLElement,
  row: HTMLElement,
): (HTMLInputElement | HTMLTextAreaElement)[] {
  return Array.from(
    row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    ),
  ).filter(
    (control) =>
      control.closest("article.field-form-apply") === scope &&
      control.closest(".field-content") === row,
  );
}

function hasVerifiedRow(
  scope: HTMLElement,
  fields: readonly RowControlSpec[],
): boolean {
  return directFieldContents(scope).some((row) => {
    const controls = controlsInRow(scope, row);
    let expectedIndex: number | undefined;
    for (const field of fields) {
      const control = controls.find(
        (candidate) =>
          candidate.tagName.toLowerCase() === field.element &&
          candidate.name === field.name &&
          (field.type === undefined ||
            (candidate instanceof HTMLInputElement &&
              candidate.type === field.type)),
      );
      if (!control) return false;
      const index = fieldIndex(control, field.idBase);
      if (
        index === undefined ||
        (expectedIndex !== undefined && index !== expectedIndex)
      ) {
        return false;
      }
      expectedIndex = index;
    }
    return expectedIndex !== undefined;
  });
}

export const hyundaiCollectionAdapter: CollectionAdapter = {
  sectionSelectors: ["article.field-form-apply"],
  collectsInputButtonFields: true,
  additionalActionElements(document) {
    const trigger = hyundaiAddressTrigger(document);
    return trigger ? [trigger] : [];
  },
  itemGroupId(element) {
    if (!element.matches("#academic > .field-content")) return undefined;
    const hidden = element.querySelector<HTMLInputElement>(
      "input[type=hidden][name=schGb]",
    );
    const button = element.querySelector<HTMLInputElement>(
      "input[type=button][id^=schGb_]",
    );
    const kinds: Record<string, [string, string]> = {
      "3": ["고등학교", "educationhighschool"],
      "4": ["전문대학", "educationuniversity"],
      "5": ["학사", "educationuniversity"],
      "6": ["석사", "educationgraduateschool"],
      "7": ["박사", "educationgraduateschool"],
    };
    const kind = hidden ? kinds[hidden.value] : undefined;
    if (
      !kind ||
      !button ||
      button.value !== kind[0] ||
      !/^schGb_[1-9][0-9]*$/.test(button.id)
    )
      return undefined;
    const wrap = button.closest(".select-wrap");
    const options = wrap?.querySelectorAll<HTMLButtonElement>(
      `button[data-code="${hidden!.value}"]`,
    );
    return wrap?.contains(hidden!) &&
      options?.length === 1 &&
      options[0].textContent?.trim() === kind[0]
      ? kind[1]
      : undefined;
  },
  actionDomId(element) {
    if (element === hyundaiAddressTrigger(element.ownerDocument))
      return "hyundai:search:address";
    if (
      !(element instanceof HTMLButtonElement) ||
      !element.classList.contains("btn-group-add")
    ) {
      return undefined;
    }
    const scope = element.closest<HTMLElement>("article.field-form-apply");
    if (!scope) return undefined;
    if (scope.id) return `hyundai:add:${scope.id}`;
    const project = hasVerifiedRow(scope, PROJECT_ROW);
    const publication = hasVerifiedRow(scope, PUBLICATION_ROW);
    if (project === publication) return undefined;
    return project ? "hyundai:add:project" : "hyundai:add:publication";
  },
  repeatableItemCandidates(container) {
    if (!container.matches("article.field-form-apply")) return undefined;
    return Array.from(container.children).filter((child) =>
      child.classList.contains("field-content"),
    );
  },
  requiresVisibleControl: (_phase, source) => source === "adapter",
};
