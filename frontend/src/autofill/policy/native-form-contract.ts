import type { ValueBinding } from "../api/types";
import type { RepeatedProfileCategoryId } from "../../profile/model";

export interface NativeSearch {
  protocol: "KEYPRESS_COMMITTED_TUPLE";
  catalogKind:
    | "highSchool"
    | "university"
    | "graduateSchool"
    | "certificate"
    | "languageTest"
    | null;
  widgetSelector: string;
  querySelector: string;
  resultsSelector: string;
  resultSelector: string;
  displaySelector: string;
  codeName: string;
  kind: "PLAIN" | "LICENSE" | "EXAM";
  metadata: Record<string, string>;
  timeoutMs: number;
  detailSelector?: string;
  protectedSelector?: string;
  protectedVisibleSelector?: string;
  protectedValueNames?: string[];
  forbiddenCodes?: string[];
  gradeName?: string;
  scoreName?: string;
  registrationName?: string;
}
export interface NativeField {
  unit?: { parentSelector: string; pseudo: "::after"; content: string };
  search?: NativeSearch;
  gate?: {
    search: string;
    mode: "COMMITTED" | "GRADE_ONLY" | "SCORE_ONLY" | "REGISTRATION";
  };
  name: string;
  rawName: string;
  scopeSelector?: string;
  dynamicOptions?:
    | { labels: string[]; codeFormat: "POSITIVE_INTEGER" }
    | { codeFormat: "OBSERVED" };
  type: "text" | "number" | "textarea" | "select" | "radio";
  label: string;
  binding: ValueBinding;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, string>;
  date?: {
    group: string;
    role: "START" | "END" | "SINGLE";
    formats: ("YM" | "YMD")[];
    peer?: string;
    tokens?: string[];
    maxDateSelector?: string;
    forbiddenAfterToday: boolean;
  };
  driver?: {
    stage: number;
    timeoutMs: number;
    dependencies: string[];
    settled: {
      field: string;
      state: "enabled" | "disabled";
      whenLabel?: string;
    }[];
  };
}
export interface NativeSection {
  excludedRow?: { name: string; reason: string };
  id: string;
  title: string;
  selector: string;
  enabled: boolean;
  reason?: string;
  anchors: string[];
  rows?: {
    selector: string;
    namePrefix: string;
    groupId: string;
    maxCount: number;
  };
  action?: {
    id: string;
    selector: string;
    label: string;
    categoryId: RepeatedProfileCategoryId;
    profileSectionId: string;
    scope?: "SECTION";
  };
  fields: NativeField[];
}
export interface NativeForm {
  capabilities: string[];
  path: string;
  formSelector: string;
  rootSelector: string;
  assetPaths: string[];
  maxFieldsRequests: number;
  sections: NativeSection[];
  unsupportedSections: { selector: string; reason: string; title: string }[];
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const keys = (x: object, allowed: string[]) =>
  Object.keys(x).every((k) => allowed.includes(k));
const str = (x: unknown): x is string =>
  typeof x === "string" && x.length > 0 && x.length <= 500;
const name = (x: unknown) => str(x) && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(x);
const template = (x: unknown) =>
  str(x) &&
  /^[A-Za-z][A-Za-z0-9_]*(?:\[\{index\}\])?(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(
    x,
  );
const list = (x: unknown, limit = 64): x is unknown[] =>
  Array.isArray(x) && x.length <= limit;
const integer = (x: unknown, min: number, max: number) =>
  Number.isInteger(x) && Number(x) >= min && Number(x) <= max;
function selector(x: unknown): x is string {
  if (!str(x)) return false;
  try {
    if (typeof document !== "undefined")
      document.createDocumentFragment().querySelector(x);
    return true;
  } catch {
    return false;
  }
}
export function validNativeForm(value: unknown): value is NativeForm {
  if (
    !object(value) ||
    !keys(value, [
      "capabilities",
      "path",
      "formSelector",
      "rootSelector",
      "assetPaths",
      "maxFieldsRequests",
      "sections",
      "unsupportedSections",
    ])
  )
    return false;
  const p = value as unknown as NativeForm;
  if (
    !list(p.capabilities, 5) ||
    p.capabilities.length < 4 ||
    new Set(p.capabilities).size !== p.capabilities.length ||
    !p.capabilities.every((c) =>
      [
        "SCOPED_FIELDS",
        "SINGLE_DEPTH_ROWS",
        "NATIVE_DRIVERS",
        "NATIVE_DATES",
        "KEYPRESS_COMMITTED_TUPLE",
      ].includes(c),
    ) ||
    !str(p.path) ||
    !/^\/[A-Za-z0-9/_-]+$/.test(p.path) ||
    !selector(p.formSelector) ||
    !selector(p.rootSelector) ||
    !list(p.assetPaths, 8) ||
    !p.assetPaths.length ||
    !p.assetPaths.every((a) => str(a) && /^\/[A-Za-z0-9/_.-]+\.js$/.test(a)) ||
    !integer(p.maxFieldsRequests, 1, 8) ||
    !list(p.sections, 16) ||
    !p.sections.length ||
    !list(p.unsupportedSections, 32)
  )
    return false;
  if (
    !p.unsupportedSections.every(
      (s) =>
        object(s) &&
        keys(s, ["selector", "reason", "title"]) &&
        selector(s.selector) &&
        str(s.reason) &&
        str(s.title),
    )
  )
    return false;
  const ids = new Set<string>();
  const fields = new Set<string>();
  return p.sections.every((s) => {
    if (
      !object(s) ||
      !keys(s, [
        "id",
        "excludedRow",
        "title",
        "selector",
        "enabled",
        "reason",
        "anchors",
        "rows",
        "action",
        "fields",
      ]) ||
      !name(s.id) ||
      ids.has(s.id) ||
      !str(s.title) ||
      !selector(s.selector) ||
      typeof s.enabled !== "boolean" ||
      (s.reason !== undefined && !str(s.reason)) ||
      (!s.enabled && !s.reason) ||
      !list(s.anchors) ||
      !s.anchors.every(name) ||
      !list(s.fields, 64) ||
      !s.fields.length
    )
      return false;
    ids.add(s.id);
    if (
      s.rows &&
      (!object(s.rows) ||
        !keys(s.rows, ["selector", "namePrefix", "groupId", "maxCount"]) ||
        !selector(s.rows.selector) ||
        !s.rows.selector.startsWith(":scope > ") ||
        !name(s.rows.namePrefix) ||
        !name(s.rows.groupId) ||
        !integer(s.rows.maxCount, 1, 32))
    )
      return false;
    if (
      s.action &&
      (!s.rows ||
        !object(s.action) ||
        !keys(s.action, [
          "id",
          "selector",
          "label",
          "categoryId",
          "profileSectionId",
          "scope",
        ]) ||
        !name(s.action.id) ||
        !selector(s.action.selector) ||
        !str(s.action.label) ||
        ![
          "careers",
          "projects",
          "languages",
          "education",
          "certifications",
        ].includes(s.action.categoryId) ||
        !name(s.action.profileSectionId) ||
        (s.action.scope !== undefined && s.action.scope !== "SECTION"))
    )
      return false;
    if (
      !s.fields.every((f) => {
        if (
          !object(f) ||
          !keys(f, [
            "unit",
            "name",
            "search",
            "gate",
            "rawName",
            "scopeSelector",
            "dynamicOptions",
            "type",
            "label",
            "binding",
            "maxLength",
            "min",
            "max",
            "step",
            "options",
            "date",
            "driver",
          ]) ||
          !name(f.name) ||
          fields.has(f.name) ||
          !template(f.rawName) ||
          Boolean(s.rows) !== f.rawName.includes("{index}") ||
          (s.rows && !f.rawName.startsWith(`${s.rows.namePrefix}[{index}].`)) ||
          !["text", "number", "textarea", "select", "radio"].includes(f.type) ||
          !str(f.label) ||
          !object(f.binding)
        )
          return false;
        fields.add(f.name);
        if (
          f.unit &&
          (!object(f.unit) ||
            !keys(f.unit, ["parentSelector", "pseudo", "content"]) ||
            f.type !== "number" ||
            !selector(f.unit.parentSelector) ||
            f.unit.pseudo !== "::after" ||
            !str(f.unit.content))
        )
          return false;
        if (
          f.search &&
          (!p.capabilities.includes("KEYPRESS_COMMITTED_TUPLE") ||
            f.type !== "text" ||
            !f.driver ||
            !validNativeSearch(f.search))
        )
          return false;
        if (
          f.gate &&
          (!object(f.gate) ||
            !keys(f.gate, ["search", "mode"]) ||
            !name(f.gate.search) ||
            !["COMMITTED", "GRADE_ONLY", "SCORE_ONLY", "REGISTRATION"].includes(
              f.gate.mode,
            ))
        )
          return false;
        if (f.scopeSelector !== undefined && !selector(f.scopeSelector))
          return false;
        if (f.dynamicOptions) {
          const d = f.dynamicOptions;
          if (f.type !== "select" || f.options !== undefined || !object(d))
            return false;
          if (d.codeFormat === "OBSERVED") {
            if (!keys(d, ["codeFormat"]) || f.gate?.mode !== "GRADE_ONLY")
              return false;
          } else if (
            !keys(d, ["labels", "codeFormat"]) ||
            d.codeFormat !== "POSITIVE_INTEGER" ||
            !list(d.labels, 128) ||
            !d.labels.length ||
            !d.labels.every(str) ||
            new Set(d.labels).size !== d.labels.length
          )
            return false;
        }
        const b = f.binding;
        if (!(
          (b.type === "DIRECT" &&
            keys(b, ["type", "profileFieldKey"]) &&
            name(b.profileFieldKey)) ||
          (b.type === "DERIVED" &&
            keys(b, ["type", "recipe"]) &&
            b.recipe === "HANJA_FULL_NAME") ||
          (b.type === "LOOKUP" &&
            keys(b, ["type", "profileFieldKey", "optionMap"]) &&
            name(b.profileFieldKey) &&
            object(b.optionMap) &&
            Object.entries(b.optionMap).length <= 128 &&
            Object.entries(b.optionMap).every(([k, v]) => str(k) && str(v)))
        ))
          return false;
        if (f.maxLength !== undefined && !integer(f.maxLength, 1, 20000))
          return false;
        if (
          [f.min, f.max, f.step].some(
            (n) => n !== undefined && !Number.isFinite(n),
          ) ||
          (f.step !== undefined && f.step <= 0) ||
          (f.min !== undefined && f.max !== undefined && f.min > f.max)
        )
          return false;
        if (
          ["select", "radio"].includes(f.type) &&
          !f.dynamicOptions &&
          (!object(f.options) ||
            Object.entries(f.options).length > 128 ||
            !Object.entries(f.options).every(
              ([k, v]) =>
                str(k) &&
                str(v) &&
                !["__proto__", "constructor", "prototype"].includes(k),
            ) ||
            new Set(Object.values(f.options)).size !==
              Object.keys(f.options).length)
        )
          return false;
        if (
          f.date &&
          (f.type !== "text" ||
            !object(f.date) ||
            !keys(f.date, [
              "group",
              "role",
              "formats",
              "peer",
              "forbiddenAfterToday",
              "tokens",
              "maxDateSelector",
            ]) ||
            !template(f.date.group) ||
            !["START", "END", "SINGLE"].includes(f.date.role) ||
            !list(f.date.formats, 2) ||
            !f.date.formats.length ||
            !f.date.formats.every((v) => v === "YM" || v === "YMD") ||
            (f.date.role === "SINGLE"
              ? f.date.peer !== undefined
              : !name(f.date.peer)) ||
            (f.date.tokens !== undefined &&
              (!list(f.date.tokens, 8) || !f.date.tokens.every(name))) ||
            (f.date.maxDateSelector !== undefined &&
              !selector(f.date.maxDateSelector)) ||
            typeof f.date.forbiddenAfterToday !== "boolean")
        )
          return false;
        if (
          f.driver &&
          (!object(f.driver) ||
            !keys(f.driver, [
              "stage",
              "timeoutMs",
              "dependencies",
              "settled",
            ]) ||
            !integer(f.driver.stage, 1, 6) ||
            !integer(f.driver.timeoutMs, 1, 2000) ||
            !list(f.driver.dependencies) ||
            !f.driver.dependencies.every(name) ||
            !list(f.driver.settled) ||
            !f.driver.settled.every(
              (r) =>
                object(r) &&
                keys(r, ["field", "state", "whenLabel"]) &&
                name(r.field) &&
                ["enabled", "disabled"].includes(r.state) &&
                (r.whenLabel === undefined || str(r.whenLabel)),
            ))
        )
          return false;
        return true;
      })
    )
      return false;
    return (
      (!s.excludedRow ||
        (object(s.excludedRow) &&
          keys(s.excludedRow, ["name", "reason"]) &&
          name(s.excludedRow.name) &&
          str(s.excludedRow.reason) &&
          s.fields.some(
            (f) => f.name === s.excludedRow!.name && f.search?.kind === "EXAM",
          ))) &&
      s.anchors.every((a) => s.fields.some((f) => f.name === a)) &&
      s.fields.every(
        (f) =>
          (!f.gate ||
            s.fields.some((p) => p.name === f.gate!.search && p.search)) &&
          (!f.date ||
            f.date.role === "SINGLE" ||
            s.fields.some(
              (p) =>
                p.name === f.date!.peer &&
                p.date?.peer === f.name &&
                p.date.role !== f.date!.role &&
                p.date.group === f.date!.group,
            )) &&
          (!f.driver ||
            (f.driver.dependencies.every((n) =>
              s.fields.some(
                (d) =>
                  d.name === n &&
                  (!d.driver || d.driver.stage > f.driver!.stage),
              ),
            ) &&
              f.driver.settled.every((r) =>
                f.driver!.dependencies.includes(r.field),
              ))),
      )
    );
  });
}

function validNativeSearch(s: NativeSearch): boolean {
  if (
    !object(s) ||
    !keys(s, [
      "protocol",
      "catalogKind",
      "widgetSelector",
      "querySelector",
      "resultsSelector",
      "resultSelector",
      "displaySelector",
      "codeName",
      "kind",
      "metadata",
      "timeoutMs",
      "detailSelector",
      "protectedSelector",
      "protectedVisibleSelector",
      "protectedValueNames",
      "forbiddenCodes",
      "gradeName",
      "scoreName",
      "registrationName",
    ]) ||
    s.protocol !== "KEYPRESS_COMMITTED_TUPLE" ||
    ![
      null,
      "highSchool",
      "university",
      "graduateSchool",
      "certificate",
      "languageTest",
    ].includes(s.catalogKind) ||
    !["PLAIN", "LICENSE", "EXAM"].includes(s.kind) ||
    !integer(s.timeoutMs, 1, 2000) ||
    !template(s.codeName)
  )
    return false;
  if (
    ![
      s.widgetSelector,
      s.querySelector,
      s.resultsSelector,
      s.resultSelector,
      s.displaySelector,
    ].every(selector)
  )
    return false;
  if (
    [s.detailSelector, s.protectedSelector, s.protectedVisibleSelector].some(
      (x) => x !== undefined && !selector(x),
    ) ||
    [s.gradeName, s.scoreName, s.registrationName].some(
      (x) => x !== undefined && !template(x),
    )
  )
    return false;
  if (
    s.protectedValueNames &&
    (!list(s.protectedValueNames, 8) || !s.protectedValueNames.every(template))
  )
    return false;
  if (
    s.forbiddenCodes &&
    (!list(s.forbiddenCodes, 16) || !s.forbiddenCodes.every(str))
  )
    return false;
  const expected =
    s.kind === "EXAM"
      ? ["grade", "score", "setup", "value", "perfect"]
      : s.kind === "LICENSE"
        ? ["score", "registration"]
        : [];
  return (
    object(s.metadata) &&
    Object.keys(s.metadata).length === expected.length &&
    expected.every((k) => /^data-[a-z]+$/.test(s.metadata[k])) &&
    (s.kind !== "EXAM" ||
      (!!s.detailSelector &&
        !!s.protectedSelector &&
        !!s.protectedValueNames?.length &&
        !!s.gradeName &&
        !!s.scoreName &&
        !!s.registrationName &&
        !!s.forbiddenCodes?.length)) &&
    (s.kind !== "LICENSE" || !!s.registrationName)
  );
}
