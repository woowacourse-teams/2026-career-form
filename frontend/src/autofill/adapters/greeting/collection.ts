import type { CollectionAdapter } from "../collection";

const ROW = '[data-scope="accordion"][data-part="item"]';
const ACCORDION = '[data-scope="accordion"][data-part="root"]';
const TOGGLE =
  '[data-scope="toggle-group"][data-part="root"][role="radiogroup"]';
const FIELD = '[data-scope="field"][data-part="root"]';
const EDUCATION_NAME =
  /^educationalBackground\.(universities|graduateSchools)\.(0|[1-9]\d*)\.(.+)$/;
const BUTTON_FIELD =
  /^(enrollmentPeriod\.(startDate|endDate)|completionStatus|gpa\.scoreScale|majors\.\d+\.(majorClassification|majorField)|degreeLevel)$/;

export interface GreetingRowIdentity {
  itemGroupId: "educationuniversity" | "educationgraduateschool";
  index: number;
  prefix: string;
}

/** Named descendants establish identity; generated accordion IDs are not stable. */
export function greetingRowIdentity(
  element: Element,
): GreetingRowIdentity | undefined {
  if (!element.matches(ROW)) return undefined;
  const controls = [...element.querySelectorAll("[name]")].filter(
    (control) => control.closest(ROW) === element,
  );
  const names = controls.map((control) => control.getAttribute("name")!);
  if (new Set(names).size !== names.length) return undefined;
  const matches = names.map((name) => EDUCATION_NAME.exec(name));
  const school = matches.filter((match) => match?.[3] === "schoolName");
  if (school.length !== 1) return undefined;
  const identity = school[0]!;
  const kind = identity[1]!;
  const index = Number(identity[2]);
  if (
    !Number.isSafeInteger(index) ||
    matches.some(
      (match) => !match || match[1] !== kind || Number(match[2]) !== index,
    )
  )
    return undefined;
  return {
    itemGroupId:
      kind === "universities"
        ? "educationuniversity"
        : "educationgraduateschool",
    index,
    prefix: `educationalBackground.${kind}.${index}`,
  };
}

function ownedLabel(field: Element): string | undefined {
  const labels = [
    ...field.querySelectorAll('label, [data-scope="field"][data-part="label"]'),
  ].filter((label) => label.closest(FIELD) === field);
  return labels.length === 1
    ? labels[0]!.textContent?.replace(/[\s*]/g, "")
    : undefined;
}

function labeledField(element: Element): Element | undefined {
  let field = element.closest(FIELD);
  while (field && field.closest(ROW) === element.closest(ROW)) {
    if (ownedLabel(field)) return field;
    field = field.parentElement?.closest(FIELD) ?? null;
  }
  return undefined;
}

/** Picker trigger text and accessible names may contain the current answer. */
export function greetingFieldLabel(element: HTMLElement): string | undefined {
  const field = labeledField(element);
  if (field) return ownedLabel(field);
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const label = element.labels?.[0];
    if (!label) return undefined;
    const clone = label.cloneNode(true) as Element;
    clone
      .querySelectorAll("input, select, textarea, button, [contenteditable]")
      .forEach((control) => control.remove());
    return clone.textContent?.replace(/[\s*]/g, "") || undefined;
  }
  return undefined;
}

function radioGroupName(element: Element): string | undefined {
  if (!element.matches(TOGGLE)) return undefined;
  const field = labeledField(element);
  if (!field || field.querySelectorAll(TOGGLE).length !== 1) return undefined;
  const label = ownedLabel(field);
  const specifications: Record<
    string,
    {
      suffix: string;
      options: string[];
      personal?: boolean;
      universityOnly?: boolean;
    }
  > = {
    장애여부: {
      suffix: "disability.disabilityStatus",
      options: ["비대상", "대상"],
      personal: true,
    },
    보훈여부: {
      suffix: "veteran.veteranStatus",
      options: ["비대상", "대상"],
      personal: true,
    },
    학위구분: {
      suffix: "degreeLevel",
      options: ["전문학사", "학사"],
      universityOnly: true,
    },
    입학구분: { suffix: "admissionType", options: ["입학", "편입"] },
    "주/야간구분": { suffix: "attendanceType", options: ["주간", "야간"] },
  };
  const spec = label && specifications[label];
  if (!spec) return undefined;
  const options = [
    ...element.querySelectorAll(
      'button[data-scope="toggle-group"][data-part="item"][role="radio"]',
    ),
  ].map((option) => option.textContent?.trim());
  if (
    options.length !== spec.options.length ||
    spec.options.some(
      (option) =>
        options.filter((candidate) => candidate === option).length !== 1,
    )
  )
    return undefined;
  const row = element.closest(ROW);
  if (spec.personal)
    return row
      ? undefined
      : `militaryServicePreferentialEmploymentStatus.${spec.suffix}`;
  const identity = row && greetingRowIdentity(row);
  if (
    !identity ||
    (spec.universityOnly && identity.itemGroupId !== "educationuniversity")
  )
    return undefined;
  return `${identity.prefix}.${spec.suffix}`;
}

export function greetingRadioGroupDomName(
  element: Element,
): string | undefined {
  const name = radioGroupName(element);
  if (!name) return undefined;
  const matches = [...element.ownerDocument.querySelectorAll(TOGGLE)].filter(
    (candidate) => radioGroupName(candidate) === name,
  );
  return matches.length === 1 ? name : undefined;
}

export function greetingSyntheticDomName(element: Element): string | undefined {
  if (element.matches(TOGGLE)) return greetingRadioGroupDomName(element);
  const selector =
    'input[role="combobox"][data-scope="combobox"][data-part="input"]:not([name])';
  if (!element.matches(selector) || element.closest(ROW)) return undefined;
  const matches = [...element.ownerDocument.querySelectorAll(selector)].filter(
    (candidate) => {
      const field = labeledField(candidate);
      return (
        !candidate.closest(ROW) &&
        field &&
        ["이메일주소", "이메일"].includes(ownedLabel(field) ?? "")
      );
    },
  );
  return matches.length === 1 && matches[0] === element
    ? "basicInformation.email"
    : undefined;
}

/** Extra custom fields only; native inputs remain the common collector's job. */
export function greetingFieldElements(document: Document): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(`button[name], ${TOGGLE}`),
  ].filter((element) => {
    if (element.matches(TOGGLE))
      return greetingRadioGroupDomName(element) !== undefined;
    const name = element.getAttribute("name")!;
    const topLevelLabels: Record<string, string> = {
      "basicInformation.birthdate": "생년월일",
      "militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus":
        "병역사항",
      "militaryServicePreferentialEmploymentStatus.militaryService.branchOfService":
        "군별",
      "militaryServicePreferentialEmploymentStatus.militaryService.rank":
        "계급",
      "militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.startDate":
        "복무기간",
      "militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.endDate":
        "복무기간",
      "militaryServicePreferentialEmploymentStatus.disability.degreeOfDisability":
        "장애정도",
      "militaryServicePreferentialEmploymentStatus.disability.descriptionOfDisability":
        "장애내용",
    };
    const topLevelLabel = topLevelLabels[name];
    if (topLevelLabel) {
      const field = labeledField(element);
      return Boolean(
        field &&
        !element.closest(ROW) &&
        ownedLabel(field) === topLevelLabel &&
        document.querySelectorAll(`[name="${name}"]`).length === 1,
      );
    }
    const match = EDUCATION_NAME.exec(name);
    if (!match || !BUTTON_FIELD.test(match[3]!)) return false;
    const row = element.closest(ROW);
    const identity = row && greetingRowIdentity(row);
    return Boolean(
      identity &&
      name.startsWith(`${identity.prefix}.`) &&
      row!.querySelectorAll(`[name="${name}"]`).length === 1,
    );
  });
}

function educationSectionKind(
  field: Element,
): "universities" | "graduateSchools" | undefined {
  if (!field.matches(FIELD)) return undefined;
  const labels = [
    ...field.querySelectorAll('label, [data-scope="field"][data-part="label"]'),
  ].filter((label) => label.closest(FIELD) === field);
  if (labels.length !== 1) return undefined;
  const label = labels[0]!.textContent?.replace(/[\s*]/g, "");
  return label === "대학교"
    ? "universities"
    : label === "대학원"
      ? "graduateSchools"
      : undefined;
}

export function greetingSectionContainer(
  element: Element,
): Element | undefined {
  let field = element.closest(FIELD);
  while (field) {
    const kind = educationSectionKind(field);
    if (kind) {
      const matches = [...element.ownerDocument.querySelectorAll(FIELD)].filter(
        (candidate) => educationSectionKind(candidate) === kind,
      );
      return matches.length === 1 ? field : undefined;
    }
    field = field.parentElement?.closest(FIELD) ?? null;
  }
  return undefined;
}

function educationAddAction(element: HTMLElement): string | undefined {
  if (
    !element.matches('button[data-scope="tooltip"][data-part="trigger"]') ||
    element.textContent?.trim() !== "항목 추가"
  )
    return undefined;
  const field = greetingSectionContainer(element);
  if (!field || element.parentElement !== field) return undefined;
  const kind = educationSectionKind(field)!;
  const addButtons = [
    ...field.querySelectorAll(
      'button[data-scope="tooltip"][data-part="trigger"]',
    ),
  ].filter(
    (button) =>
      button.parentElement === field &&
      button.textContent?.trim() === "항목 추가",
  );
  if (addButtons.length !== 1) return undefined;
  const rows = [...field.querySelectorAll(ROW)];
  if (
    rows.some(
      (row) =>
        !greetingRowIdentity(row)?.prefix.startsWith(
          `educationalBackground.${kind}.`,
        ),
    )
  )
    return undefined;
  return `greeting:add:${kind}`;
}

/** A graduate major row is counted only when all three named controls share its index. */
export function greetingMajorRowsForAction(
  element: Element,
): HTMLInputElement[] | undefined {
  if (
    !element.isConnected ||
    !element.matches('button[data-scope="tooltip"][data-part="trigger"]') ||
    element.textContent?.trim() !== "전공 추가"
  )
    return undefined;
  const row = element.closest(ROW);
  const identity = row && greetingRowIdentity(row);
  if (
    !identity ||
    identity.itemGroupId !== "educationgraduateschool" ||
    identity.index > 127
  )
    return undefined;
  const field = labeledField(element);
  if (!field || field.closest(ROW) !== row || ownedLabel(field) !== "전공")
    return undefined;
  const adds = [
    ...field.querySelectorAll(
      'button[data-scope="tooltip"][data-part="trigger"]',
    ),
  ].filter((button) => button.textContent?.trim() === "전공 추가");
  if (adds.length !== 1 || adds[0] !== element) return undefined;
  const prefix = `${identity.prefix}.majors.`;
  const named = [...field.querySelectorAll<HTMLElement>("[name]")].filter(
    (candidate) => candidate.getAttribute("name")?.startsWith(prefix),
  );
  const indices = new Set<number>();
  for (const candidate of named) {
    const suffix = candidate.getAttribute("name")!.slice(prefix.length);
    const match = /^([0-4])(?:\.(majorClassification|majorField))?$/.exec(
      suffix,
    );
    if (!match) return undefined;
    indices.add(Number(match[1]));
  }
  if (indices.size < 1 || indices.size > 5) return undefined;
  const rows: HTMLInputElement[] = [];
  for (let index = 0; index < indices.size; index += 1) {
    if (!indices.has(index)) return undefined;
    const base = `${prefix}${index}`;
    const name = named.filter(
      (candidate) => candidate.getAttribute("name") === base,
    );
    const classification = named.filter(
      (candidate) =>
        candidate.getAttribute("name") === `${base}.majorClassification`,
    );
    const majorField = named.filter(
      (candidate) => candidate.getAttribute("name") === `${base}.majorField`,
    );
    if (
      name.length !== 1 ||
      !(name[0] instanceof HTMLInputElement) ||
      name[0].getAttribute("role") !== "combobox" ||
      classification.length !== 1 ||
      !classification[0].matches("button") ||
      majorField.length !== 1 ||
      !majorField[0].matches("button")
    )
      return undefined;
    rows.push(name[0]);
  }
  return rows;
}

function majorAddAction(element: HTMLElement): string | undefined {
  if (!greetingMajorRowsForAction(element)) return undefined;
  const row = element.closest(ROW)!;
  const identity = greetingRowIdentity(row)!;
  return `greeting:add:graduateSchools:${identity.index}:majors`;
}

export const greetingCollectionAdapter: CollectionAdapter = {
  sectionSelectors: [ACCORDION],
  collectsInputButtonFields: false,
  itemGroupId: (element) => greetingRowIdentity(element)?.itemGroupId,
  actionDomId: (element) =>
    majorAddAction(element) ?? educationAddAction(element),
  repeatableItemCandidates(container) {
    const isAccordion = container.matches(ACCORDION);
    const sectionKind = educationSectionKind(container);
    if (
      !isAccordion &&
      (!sectionKind || greetingSectionContainer(container) !== container)
    )
      return undefined;
    const rows = [...container.querySelectorAll(ROW)].filter((row) =>
      isAccordion
        ? row.closest(ACCORDION) === container
        : greetingSectionContainer(row) === container,
    );
    const identities = rows.map(greetingRowIdentity);
    if (
      identities.some(
        (identity) =>
          !identity ||
          (sectionKind &&
            !identity.prefix.startsWith(
              `educationalBackground.${sectionKind}.`,
            )),
      )
    )
      return [];
    const keys = identities.map((identity) => identity!.prefix);
    if (new Set(keys).size !== keys.length) return [];
    const ordered = rows.sort(
      (left, right) =>
        greetingRowIdentity(left)!.index - greetingRowIdentity(right)!.index,
    );
    const counts = new Map<string, number>();
    for (const row of ordered) {
      const identity = greetingRowIdentity(row)!;
      const expected = counts.get(identity.itemGroupId) ?? 0;
      if (identity.index !== expected) return [];
      counts.set(identity.itemGroupId, expected + 1);
    }
    return ordered;
  },
  requiresVisibleControl: () => true,
};
