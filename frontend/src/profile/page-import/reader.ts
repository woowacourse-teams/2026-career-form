import { resolveDocumentCompany } from "../../autofill/adapters/company";
import { greetingBasicControls } from "../../autofill/adapters/greeting/fingerprint";
import {
  greetingSyntheticDomName,
  greetingRadioGroupDomName,
  greetingFieldLabel,
} from "../../autofill/adapters/greeting/collection";
import { greetingSections } from "../../autofill/adapters/greeting/sections";
import { formatProfileDate } from "../../autofill/profile/date-format";
import { standardValueAliases } from "../standard-values";
import type { ProfileIdentity, ProfileCategoryId } from "../model";
import {
  greetingImportMappings,
  greetingRepeatedMappings,
  greetingSensitiveMappings,
  importDefinition,
} from "./greeting-import-mappings";

export interface ImportCandidate {
  readonly source: string;
  readonly rowIndex?: number;
  readonly profileFieldKey?: string;
  readonly status: "available" | "review" | "unsupported";
  readonly reason: string;
  readonly value?: string;
  readonly precision?: "month" | "day";
  readonly identity?: ProfileIdentity;
  readonly label?: string;
  readonly sectionId?: string;
  readonly categoryId?: ProfileCategoryId;
  readonly sensitive?: boolean;
  readonly reviewKind?: "koreanName" | "englishName";
}
interface ImportField {
  source: string;
  profileFieldKey?: string;
  rowIndex?: number;
  kind?: string;
  reviewKind?: "koreanName" | "englishName";
}
const ROW = '[data-scope="accordion"][data-part="item"]';
const CONTROLS =
  'input,textarea,select,button[name],[data-scope="toggle-group"][role="radiogroup"]';
function namedSource(element: Element) {
  return (
    element.getAttribute("name") ||
    greetingSyntheticDomName(element) ||
    greetingRadioGroupDomName(element) ||
    importRowRadioName(element)
  );
}
function rowPath(name: string) {
  for (const [kind, section] of Object.entries(greetingSections)) {
    const base = section.prefix + ".";
    if (!name.startsWith(base)) continue;
    const tail = name.slice(base.length);
    const match = section.singleton ? null : /^(0|[1-9]\d*)\.(.+)$/.exec(tail);
    if (!section.singleton && !match) return undefined;
    const index = section.singleton ? 0 : Number(match![1]);
    if (!Number.isSafeInteger(index)) return undefined;
    return {
      kind,
      index,
      suffix: section.singleton ? tail : match![2],
      prefix: section.singleton ? section.prefix : section.prefix + "." + index,
    };
  }
}
/** The same known toggle signatures, with import-local row failure isolation. */
function importRowRadioName(element: Element): string | undefined {
  if (
    !element.matches(
      '[data-scope="toggle-group"][data-part="root"][role="radiogroup"]',
    )
  )
    return undefined;
  const row = element.closest(ROW);
  if (!row) return undefined;
  const paths = [...row.querySelectorAll("[name]")]
    .filter((control) => control.closest(ROW) === row)
    .map((control) => rowPath(control.getAttribute("name")!))
    .filter((path) => path !== undefined);
  const prefix = paths[0]?.prefix;
  if (
    !prefix ||
    paths.some((path) => path.prefix !== prefix) ||
    !["universities", "graduateSchools"].includes(paths[0].kind)
  )
    return undefined;
  const label = greetingFieldLabel(element as HTMLElement);
  const signatures: Record<string, { suffix: string; options: string[] }> = {
    학위구분: { suffix: "degreeLevel", options: ["전문학사", "학사"] },
    입학구분: { suffix: "admissionType", options: ["입학", "편입"] },
    "주/야간구분": { suffix: "attendanceType", options: ["주간", "야간"] },
  };
  const signature = label && signatures[label];
  if (!signature) return undefined;
  if (signature.suffix === "degreeLevel" && paths[0].kind !== "universities")
    return undefined;
  const options = [...element.querySelectorAll('[role="radio"]')].map(
    (control) => control.textContent?.trim(),
  );
  if (
    options.length !== signature.options.length ||
    signature.options.some(
      (option) => options.filter((text) => text === option).length !== 1,
    )
  )
    return undefined;
  return prefix + "." + signature.suffix;
}
function ownMapping(
  map: Readonly<Record<string, string>>,
  key: string,
): string | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}
function mapping(source: string): ImportField {
  if (source === "basicInformation.name") return { source, kind: "name" };
  if (source === "basicInformation.englishName")
    return { source, kind: "name", reviewKind: "englishName" };
  let profileFieldKey =
    ownMapping(greetingImportMappings, source) ??
    (source.startsWith("militaryServicePreferentialEmploymentStatus.")
      ? ownMapping(
          greetingSensitiveMappings,
          source.slice("militaryServicePreferentialEmploymentStatus.".length),
        )
      : undefined);
  const path = rowPath(source);
  const group = path && greetingRepeatedMappings[path.kind];
  if (group && ownMapping(group.fields, path!.suffix))
    profileFieldKey = `${group.category}.${group.section}.${group.fields[path!.suffix]}`;
  return {
    source,
    ...(profileFieldKey ? { profileFieldKey } : {}),
    ...(path ? { rowIndex: path.index } : {}),
  };
}
function unsupported(field: ImportField, reason: string): ImportCandidate {
  const { kind: _kind, ...identity } = field;
  return { ...identity, status: "unsupported", reason };
}
function visible(element: Element) {
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (
      current.hasAttribute("hidden") ||
      current.hasAttribute("inert") ||
      current.getAttribute("aria-hidden") === "true"
    )
      return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse"
    )
      return false;
  }
  return true;
}
/** Reads local controls independently; a malformed field never aborts its siblings. */
export function readGreetingImport(
  document: Document,
): readonly ImportCandidate[] {
  if (
    !greetingBasicControls(document) ||
    resolveDocumentCompany(document) !== "greeting"
  )
    return [
      {
        source: "document",
        status: "unsupported",
        reason: "unrecognized_document",
      },
    ];
  const sources = new Map<string, Element[]>();
  let unnamedIndex = 0;
  const identificationFailures = new Set<string>();
  for (const element of document.querySelectorAll(CONTROLS)) {
    let source: string | undefined;
    try {
      source = namedSource(element) ?? undefined;
    } catch {
      source = `unmapped-control:${unnamedIndex++}`;
      identificationFailures.add(source);
    }
    if (!source) source = `unmapped-control:${unnamedIndex++}`;
    const list = sources.get(source) ?? [];
    list.push(element);
    sources.set(source, list);
  }
  for (const source of [
    "basicInformation.name",
    "basicInformation.email",
    "basicInformation.phoneNumber.nationalNumber",
  ])
    if (!sources.has(source)) sources.set(source, []);
  // Preserve missing date diagnostics on recognized university rows.
  for (const source of [...sources.keys()]) {
    const path = rowPath(source);
    if (path?.kind === "universities")
      for (const suffix of [
        "schoolName",
        "enrollmentPeriod.startDate",
        "enrollmentPeriod.endDate",
      ]) {
        const key = path.prefix + "." + suffix;
        if (!sources.has(key)) sources.set(key, []);
      }
  }
  const results: ImportCandidate[] = [];
  for (const [source, elements] of sources) {
    let field = mapping(source);
    if (identificationFailures.has(source)) {
      results.push(unsupported(field, "read_failed"));
      continue;
    }
    try {
      field = majorMapping(field, sources);
      results.push(readField(field, elements, sources));
    } catch {
      results.push(unsupported(field, "read_failed"));
    }
  }
  // Greeting renders these values even on untouched, empty repeated rows.
  // Other readable fields (including dates or descriptions without a name) keep
  // the row meaningful; an unreadable sibling must not discard those fields.
  const defaultOnly = (candidate: ImportCandidate) => {
    const path = rowPath(candidate.source);
    return (
      (path?.kind === "graduateSchools" &&
        path.suffix === "majors.0.majorClassification" &&
        candidate.value === "주전공") ||
      (path?.kind === "workExperiences" &&
        path.suffix === "employmentStatus" &&
        candidate.value === "퇴사" &&
        sources.get(candidate.source)?.[0] instanceof HTMLInputElement &&
        (sources.get(candidate.source)![0] as HTMLInputElement).type ===
          "checkbox")
    );
  };
  const meaningfulRows = new Set(
    results
      .filter(
        (candidate) =>
          candidate.status !== "unsupported" && !defaultOnly(candidate),
      )
      .map((candidate) => rowPath(candidate.source)?.prefix)
      .filter((prefix) => prefix !== undefined),
  );
  for (let index = 0; index < results.length; index++) {
    const candidate = results[index];
    if (
      defaultOnly(candidate) &&
      !meaningfulRows.has(rowPath(candidate.source)!.prefix)
    )
      results[index] = unsupported(mapping(candidate.source), "empty");
  }
  const destinations = new Map<string, number>();
  for (const candidate of results) {
    if (!candidate.profileFieldKey || candidate.status === "unsupported")
      continue;
    const key = `${candidate.profileFieldKey}:${candidate.rowIndex ?? "single"}`;
    destinations.set(key, (destinations.get(key) ?? 0) + 1);
  }
  return results
    .map((candidate) => {
      const key = `${candidate.profileFieldKey}:${candidate.rowIndex ?? "single"}`;
      if (
        candidate.status !== "unsupported" &&
        (destinations.get(key) ?? 0) > 1
      ) {
        const {
          value: _value,
          identity: _identity,
          precision: _precision,
          ...field
        } = candidate;
        return {
          ...field,
          status: "unsupported" as const,
          reason: "ambiguous_destination",
        };
      }
      return candidate;
    })
    .sort((a, b) => (a.rowIndex ?? -1) - (b.rowIndex ?? -1));
}
function majorMapping(
  field: ImportField,
  sources: Map<string, Element[]>,
): ImportField {
  const path = rowPath(field.source);
  const match =
    path?.kind === "universities" &&
    /^majors\.([1-9]\d*)(\.majorClassification)?$/.exec(path.suffix);
  if (!match || !path) return field;
  const base = path.prefix + ".majors." + match[1];
  const controls = sources.get(base + ".majorClassification") ?? [];
  if (controls.length !== 1 || !visible(controls[0])) return field;
  const classification = controls[0].textContent?.trim();
  const part =
    classification === "복수전공"
      ? "additionalMajorName"
      : classification === "부전공"
        ? "minorName"
        : undefined;
  if (!part) return field;
  const classifications = [...sources]
    .filter(
      ([source]) =>
        source.startsWith(path.prefix + ".majors.") &&
        source.endsWith(".majorClassification"),
    )
    .flatMap(([, items]) => items)
    .filter(
      (control) =>
        visible(control) && control.textContent?.trim() === classification,
    );
  if (classifications.length !== 1) return field;
  return {
    ...field,
    profileFieldKey:
      "education.university." +
      (match[2]
        ? part === "minorName"
          ? "minorStatus"
          : "doubleMajorStatus"
        : part),
  };
}
function readField(
  field: ImportField,
  elements: Element[],
  sources: Map<string, Element[]>,
): ImportCandidate {
  if (!field.profileFieldKey && field.kind !== "name")
    return unsupported(field, "no_profile_mapping");
  if (elements.length > 1) return unsupported(field, "ambiguous_field");
  if (!elements.length) return unsupported(field, "not_collected");
  const element = elements[0];
  if (!visible(element)) return unsupported(field, "hidden_or_inert");
  const path = rowPath(field.source);
  if (path) {
    const row = element.closest(ROW);
    if (!row) return unsupported(field, "unbound_control");
    const rowPaths = [...row.querySelectorAll("[name]")]
      .filter((control) => control.closest(ROW) === row)
      .map((control) => rowPath(control.getAttribute("name")!))
      .filter((item) => item !== undefined);
    if (rowPaths.some((item) => item.prefix !== path.prefix))
      return unsupported(field, "invalid_rows");
    const owners = new Set(
      [...sources]
        .filter(([source]) => rowPath(source)?.prefix === path.prefix)
        .flatMap(([, items]) => items.map((item) => item.closest(ROW)))
        .filter(Boolean),
    );
    if (owners.size !== 1) return unsupported(field, "invalid_rows");
  } else if (element.closest(ROW)) return unsupported(field, "unbound_control");
  let value: string;
  if (element instanceof HTMLInputElement) {
    if (
      element.type === "checkbox" &&
      field.profileFieldKey === "careers.career.employmentStatus"
    )
      value = element.checked ? "재직중" : "퇴사";
    else if (["text", "email", "tel", "number", "date"].includes(element.type))
      value = element.value;
    else return unsupported(field, "unsupported_control");
  } else if (element instanceof HTMLTextAreaElement) value = element.value;
  else if (element instanceof HTMLSelectElement) {
    if (!element.value.trim()) return unsupported(field, "empty");
    value = element.selectedOptions[0]?.textContent ?? "";
  } else if (element.getAttribute("role") === "radiogroup") {
    const selected = element.querySelectorAll(
      '[role="radio"][aria-checked="true"]',
    );
    if (selected.length !== 1) return unsupported(field, "empty");
    value = selected[0].textContent ?? "";
  } else if (element instanceof HTMLButtonElement) {
    if (
      ["data-placeholder", "data-placeholder-shown"].some(
        (name) =>
          element.hasAttribute(name) && element.getAttribute(name) !== "false",
      )
    )
      return unsupported(field, "empty");
    value = element.textContent ?? "";
  } else return unsupported(field, "unsupported_control");
  value = value.trim();
  if (!value || ["선택", "선택해 주세요", "선택해주세요"].includes(value))
    return unsupported(field, "empty");
  if (field.kind === "name") {
    const { kind: _kind, ...nameIdentity } = field;
    return {
      ...nameIdentity,
      status: "review",
      reason: "name_unsplittable",
      value,
    };
  }
  const definition = importDefinition(field.profileFieldKey!);
  if (!definition) return unsupported(field, "no_profile_mapping");
  const { category, section, field: target } = definition;
  const legacy = [
    "contact.contact.email",
    "contact.contact.phoneNumber",
    "education.university.schoolName",
    "education.university.startDate",
    "education.university.endDate",
  ].includes(field.profileFieldKey!);
  const identity = {
    ...field,
    ...(!legacy
      ? {
          label: target.label,
          sectionId: section.id,
          categoryId: category.id,
          sensitive: category.sensitive,
        }
      : {}),
  };
  if (target.inputType === "date") return dateCandidate(identity, value);
  if (target.inputType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return unsupported(field, "invalid_email");
  if (target.inputType === "tel") {
    if (!/^[0-9 -]+$/.test(value))
      return unsupported(field, "unsupported_phone_format");
    value = value.replace(/[ -]/g, "");
    if (!/^0\d{9,10}$/.test(value))
      return unsupported(field, "unsupported_phone_format");
  }
  const aliases: Record<string, Record<string, string>> = {
    employmentType: { 정규직: "정규", 계약직: "계약", 파견직: "파견" },
    transferStatus: { 입학: "비해당", 편입: "해당" },
    gpaScale: { "4.0": "4.00", "4.3": "4.30", "4.5": "4.50", "100": "100.00" },
    militaryBranch: {
      해병: "해병대",
      전경: "전투경찰",
      해경: "해양경찰",
      의경: "의무경찰",
    },
  };
  const fieldAliases = Object.hasOwn(aliases, target.id)
    ? aliases[target.id]
    : undefined;
  value = (fieldAliases ? ownMapping(fieldAliases, value) : undefined) ?? value;
  if (typeof value !== "string") return unsupported(field, "invalid_value");
  if (["doubleMajorStatus", "minorStatus"].includes(target.id)) value = "있음";
  if (target.options) {
    const matches = target.options.filter((option) =>
      typeof option === "string"
        ? option === value
        : [
            option.value,
            option.label,
            ...standardValueAliases(option.value),
          ].includes(value),
    );
    if (matches.length !== 1) return unsupported(field, "unknown_option");
    value = typeof matches[0] === "string" ? matches[0] : matches[0].value;
  }
  if (
    ["schoolName", "testName", "companyName"].includes(target.id) ||
    (category.id === "certifications" && target.id === "name")
  )
    return {
      ...identity,
      status: "review",
      reason: "catalog_unverified",
      value,
      identity: { status: "manual", originalText: value },
    };
  return { ...identity, status: "available", reason: "direct", value };
}
function dateCandidate(field: ImportField, text: string): ImportCandidate {
  const match = /^(\d{4})([.-])\s*(\d{2})(?:\2\s*(\d{2}))?$/.exec(text);
  if (
    !match ||
    Number(match[1]) < 1 ||
    Number(match[3]) < 1 ||
    Number(match[3]) > 12
  )
    return unsupported(field, "invalid_date");
  const { kind: _kind, ...identity } = field;
  const value = `${match[1]}-${match[3]}${match[4] ? `-${match[4]}` : ""}`;
  if (!match[4])
    return {
      ...identity,
      status: "review",
      reason: "month_precision",
      value,
      precision: "month",
    };
  if (formatProfileDate(value, "YYYY-MM-DD").status !== "resolved")
    return unsupported(field, "invalid_date");
  return {
    ...identity,
    status: "available",
    reason: "direct",
    value,
    precision: "day",
  };
}
