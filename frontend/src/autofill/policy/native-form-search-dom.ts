import { executionPolicy, policyDigest } from "../workflow/execution-policy";
import type { NativeField, NativeSearch } from "./native-form-contract";
import { visible } from "./primitives";
export const searchName = (name: string, index?: number) =>
  name.replace("{index}", String(index));
function one(root: Element, selector: string) {
  const all = root.querySelectorAll(selector);
  return all.length === 1 ? all[0] : undefined;
}
export function namedSearchControl(row: Element, name: string, index?: number) {
  return one(row, `[name="${CSS.escape(searchName(name, index))}"]`);
}
export interface SearchNodes {
  query: HTMLInputElement;
  name: HTMLInputElement;
  code: HTMLInputElement;
  display: HTMLElement;
  results: HTMLElement;
  widget: Element;
}
export function searchNodes(
  row: Element,
  field: NativeField,
  index?: number,
): SearchNodes | undefined {
  const s = field.search;
  if (!s) return;
  const name = namedSearchControl(row, field.rawName, index),
    code = namedSearchControl(row, s.codeName, index),
    widget = name?.closest(s.widgetSelector);
  if (
    !(name instanceof HTMLInputElement) ||
    name.type !== "hidden" ||
    !(code instanceof HTMLInputElement) ||
    code.type !== "text" ||
    !code.classList.contains("hidden") ||
    !widget ||
    !row.contains(widget) ||
    code.parentElement !== widget ||
    name.parentElement !== widget
  )
    return;
  const query = one(widget, s.querySelector),
    results = one(widget, s.resultsSelector),
    display = one(widget, s.displaySelector);
  if (
    !(query instanceof HTMLInputElement) ||
    query.type !== "search" ||
    query.name ||
    !(results instanceof HTMLElement) ||
    !(display instanceof HTMLElement) ||
    query.closest("div.search") !== results.parentElement
  )
    return;
  return { query, name, code, display, results, widget };
}
export function sameSearchNodes(a: SearchNodes, b: SearchNodes | undefined) {
  return (
    !!b && (Object.keys(a) as (keyof SearchNodes)[]).every((k) => a[k] === b[k])
  );
}
export function searchTuple(n: SearchNodes) {
  return [n.name.value, n.code.value, n.display.textContent?.trim() ?? ""];
}
export const sameSearchTuple = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
export function emptySearchTuple(n: SearchNodes) {
  return searchTuple(n).every((x) => x === "");
}
export function protectedSearchRow(
  row: Element,
  s: NativeSearch,
  index?: number,
) {
  return (
    !!(s.protectedSelector && row.querySelector(s.protectedSelector)) ||
    s.forbiddenCodes?.includes(
      (
        namedSearchControl(row, s.codeName, index) as
          HTMLInputElement | undefined
      )?.value ?? "",
    ) === true ||
    !!(
      s.protectedVisibleSelector &&
      Array.from(row.querySelectorAll(s.protectedVisibleSelector)).some((e) =>
        visible(e, true),
      )
    ) ||
    (s.protectedValueNames ?? []).some((name) => {
      const matches = row.querySelectorAll(
        `[name="${CSS.escape(searchName(name, index))}"]`,
      );
      return (
        matches.length > 1 ||
        Array.from(matches).some((e) => "value" in e && !!e.value)
      );
    })
  );
}
export interface SearchReceipt {
  nodes: SearchNodes;
  row: Element;
  value: string;
  code: string;
  policy: string;
  url: string;
  form: string;
  metadata: Record<string, string>;
  details: Element[];
  detail?: Element;
}
const receipts = new WeakMap<Element, SearchReceipt>();
export function recordSearchReceipt(receipt: SearchReceipt) {
  receipts.set(receipt.nodes.query, receipt);
}
export function searchReceipt(
  row: Element,
  field: NativeField,
  index?: number,
): SearchReceipt | undefined {
  const n = searchNodes(row, field, index);
  if (!n || !field.search || protectedSearchRow(row, field.search, index))
    return;
  const r = receipts.get(n.query);
  if (
    !r ||
    r.url !== row.ownerDocument.URL ||
    r.form !==
      (policyDigest(executionPolicy(row.ownerDocument)?.browserPolicy) ?? "") ||
    r.row !== row ||
    r.policy !== policyDigest(field.search) ||
    !sameSearchNodes(r.nodes, n) ||
    !sameSearchTuple(searchTuple(n), [r.value, r.code, r.value]) ||
    r.details.some((e) => !e.isConnected || !row.contains(e)) ||
    (r.detail && row.querySelector(field.search.detailSelector!) !== r.detail)
  )
    return;
  return r;
}
export function searchGate(
  row: Element,
  field: NativeField,
  fields: NativeField[],
  index?: number,
): boolean {
  if (!field.gate) return true;
  const source = fields.find((f) => f.name === field.gate!.search);
  if (!source) return false;
  const r = searchReceipt(row, source, index);
  if (!r) return false;
  const m = r.metadata;
  return (
    field.gate.mode === "COMMITTED" ||
    (field.gate.mode === "GRADE_ONLY" &&
      m.grade === "true" &&
      m.score === "false") ||
    (field.gate.mode === "SCORE_ONLY" &&
      m.score === "true" &&
      m.grade === "false") ||
    (field.gate.mode === "REGISTRATION" &&
      (source.search!.kind === "LICENSE"
        ? m.registration === "true"
        : m.grade === "true" || m.score === "true"))
  );
}

export function excludedSearchRow(
  row: Element,
  field: NativeField,
  index?: number,
): boolean {
  const s = field.search;
  if (s?.kind !== "EXAM") return false;
  return protectedSearchRow(row, s, index);
}
