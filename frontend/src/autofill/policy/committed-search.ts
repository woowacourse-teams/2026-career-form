import { executionPolicy } from "../workflow/execution-policy";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { catalogApprovalForItem } from "../profile/catalog-identity";
import { currentNativeOwner, nativeOwnership } from "./native-form-collection";
import { runDomPlan } from "./action-plan";
import { visible } from "./primitives";
import {
  emptySearchTuple,
  searchTuple,
  searchNodes,
  sameSearchNodes,
  protectedSearchRow,
  namedSearchControl,
  recordSearchReceipt,
  searchReceipt,
} from "./native-form-search-dom";

export function committedSearchValue(
  handle: FieldCandidateHandle,
): string | undefined {
  const o = nativeOwnership(handle);
  if (!o?.field.search) return;
  const n = searchNodes(o.row, o.field, o.index);
  if (!n) return "";
  return searchTuple(n).find(Boolean) || n.query.value;
}
function approved(handle: FieldCandidateHandle, item: ReviewPlanItem) {
  const o = currentNativeOwner(handle),
    s = o?.field.search;
  if (
    !o ||
    !s ||
    !o.section.enabled ||
    !item.selected ||
    item.disabled ||
    item.candidateId !== handle.candidateId ||
    item.analysis?.candidateId !== handle.candidateId ||
    item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
    item.analysis.interactionStatus !== "READY" ||
    item.analysis.writePlan?.command !== "SET_TEXT" ||
    JSON.stringify(item.analysis.valueBinding) !==
      JSON.stringify(o.field.binding) ||
    !item.profileValue?.trim()
  )
    return;
  if (s.catalogKind === null) {
    if (item.searchIdentity || item.catalogMatch) return;
  } else {
    const approval = catalogApprovalForItem(item);
    if (
      approval.status === "invalid" ||
      (approval.status === "selected" &&
        (approval.match.kind !== s.catalogKind ||
          approval.match.requiredDetail !== undefined ||
          !approval.match.labels.includes(item.profileValue)))
    )
      return;
  }
  return o;
}
export function committedSearchMatches(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  const o = approved(handle, item);
  if (!o) return false;
  return searchReceipt(o.row, o.field, o.index)?.value === item.profileValue;
}
const pause = (view: Window, ms: number) =>
  new Promise<void>((resolve) => view.setTimeout(resolve, ms));
export async function executeCommittedSearch(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  signal: AbortSignal,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  const o = approved(handle, item),
    s = o?.field.search,
    n = o?.search;
  if (!o || !s || !n || signal.aborted) return false;
  if (committedSearchMatches(handle, item))
    return !beforeMutation || (await beforeMutation());
  const value = item.profileValue!.trim(),
    view = n.query.ownerDocument.defaultView!;
  const identity = () =>
    JSON.stringify([
      item.profileValue,
      item.profileFieldKey,
      item.searchIdentity,
      item.catalogMatch,
      item.analysis,
    ]);
  const captured = identity();
  const current = () =>
    identity() === captured &&
    !signal.aborted &&
    !!approved(handle, item) &&
    sameSearchNodes(n, searchNodes(o.row, o.field, o.index)) &&
    !protectedSearchRow(o.row, s, o.index);
  const detail = s.detailSelector
    ? o.row.querySelector(s.detailSelector)
    : undefined;
  const previousDetails = detail
    ? Array.from(detail.querySelectorAll("input,select,textarea"))
    : [];
  const detailEmpty = () =>
    !detail ||
    (detail.isConnected &&
      o.row.querySelector(s.detailSelector!) === detail &&
      Array.from(detail.querySelectorAll("input,select,textarea")).every(
        (e) => !("value" in e) || e.value === "",
      ));
  if (
    !current() ||
    value.length > 500 ||
    (n.query.maxLength >= 0 && value.length > n.query.maxLength) ||
    !visible(n.query) ||
    n.query.readOnly ||
    !emptySearchTuple(n) ||
    n.query.value !== "" ||
    !detailEmpty() ||
    (s.kind === "EXAM" && !detail)
  )
    return false;
  if (beforeMutation && !(await beforeMutation())) return false;
  if (
    !current() ||
    !emptySearchTuple(n) ||
    n.query.value !== "" ||
    !detailEmpty()
  )
    return false;
  const oldResults = new Set(n.results.querySelectorAll(s.resultSelector));
  if (
    !runDomPlan(
      [
        { op: "SET_VALUE", target: "query", value: "{query}" },
        { op: "EVENT", target: "query", event: "input" },
        {
          op: "KEY",
          target: "query",
          event: "keypress",
          key: "Enter",
          code: "Enter",
          legacyEnter: true,
        },
      ],
      { query: n.query },
      { query: value },
      current,
    )
  )
    return false;
  const deadline = Date.now() + s.timeoutMs;
  let buttons: HTMLButtonElement[] = [];
  while (
    current() &&
    n.query.value === value &&
    emptySearchTuple(n) &&
    Date.now() < deadline
  ) {
    const all = Array.from(n.results.querySelectorAll(s.resultSelector));
    if (all.some((e) => !oldResults.has(e))) {
      buttons = all.filter(
        (e): e is HTMLButtonElement =>
          e instanceof HTMLButtonElement && e.title === value,
      );
      break;
    }
    await pause(view, 10);
  }
  if (buttons.length !== 1) return false;
  const button = buttons[0],
    code = button.getAttribute("data-code") ?? "",
    meta: Record<string, string> = {};
  if (
    !/^[A-Za-z0-9_-]{1,64}$/.test(code) ||
    /^0+$/.test(code) ||
    s.forbiddenCodes?.includes(code) ||
    button.type !== "button" ||
    !visible(button) ||
    oldResults.has(button)
  )
    return false;
  if (
    Array.from(button.attributes).some(
      (a) =>
        a.name.startsWith("data-") &&
        a.name !== "data-code" &&
        !Object.values(s.metadata).includes(a.name),
    )
  )
    return false;
  for (const [key, attr] of Object.entries(s.metadata)) {
    const val = button.getAttribute(attr);
    if (val === null) return false;
    meta[key] = val;
  }
  if (s.kind !== "PLAIN" && !["true", "false"].includes(meta.score))
    return false;
  if (s.kind === "LICENSE" && !["true", "false"].includes(meta.registration))
    return false;
  if (
    s.kind === "EXAM" &&
    (!["true", "false"].includes(meta.grade) ||
      meta.setup !== "" ||
      !(meta.value === "" || meta.value === "null") ||
      !(
        meta.perfect === "" ||
        meta.perfect === "null" ||
        /^\d+(\.\d+)?$/.test(meta.perfect)
      ))
  )
    return false;
  const resultCurrent = () =>
    button.type === "button" &&
    visible(button) &&
    current() &&
    n.query.value === value &&
    emptySearchTuple(n) &&
    detailEmpty() &&
    n.results.contains(button) &&
    button.title === value &&
    button.getAttribute("data-code") === code &&
    Object.entries(s.metadata).every(
      ([k, a]) => button.getAttribute(a) === meta[k],
    ) &&
    Array.from(n.results.querySelectorAll(s.resultSelector)).filter(
      (e) => e.getAttribute("title") === value,
    ).length === 1;
  if (beforeMutation && !(await beforeMutation())) return false;
  if (!resultCurrent()) return false;
  button.click();
  const tupleCurrent = () =>
    current() &&
    JSON.stringify(searchTuple(n)) === JSON.stringify([value, code, value]);
  const settled = () => {
    if (!tupleCurrent()) return false;
    if (s.kind === "LICENSE" && meta.registration === "false") {
      const reg = namedSearchControl(o.row, s.registrationName!, o.index);
      if (reg && visible(reg, true)) return false;
    }
    if (s.kind !== "EXAM")
      return (o.field.driver?.dependencies ?? []).every((name) => {
        const field = o.section.fields.find((f) => f.name === name)!;
        if (
          s.kind === "LICENSE" &&
          meta.registration === "false" &&
          field.rawName === s.registrationName
        )
          return true;
        const control = namedSearchControl(o.row, field.rawName, o.index);
        return (
          !control ||
          (visible(control) && !("readOnly" in control && control.readOnly))
        );
      });
    const next = o.row.querySelector(s.detailSelector!);
    if (!next || previousDetails.some((e) => next.contains(e))) return false;
    const grade = namedSearchControl(o.row, s.gradeName!, o.index),
      score = namedSearchControl(o.row, s.scoreName!, o.index);
    return (
      (meta.grade === "true"
        ? grade instanceof HTMLSelectElement &&
          visible(grade) &&
          Array.from(grade.options).some((opt) => opt.value && !opt.disabled)
        : !grade) &&
      (meta.score === "true"
        ? score instanceof HTMLInputElement &&
          score.type === "number" &&
          visible(score) &&
          !score.readOnly
        : !score)
    );
  };
  const settleDeadline = Date.now() + s.timeoutMs;
  while (current() && !settled() && Date.now() < settleDeadline)
    await pause(view, 10);
  if (beforeMutation && !(await beforeMutation())) return false;
  if (!settled()) return false;
  const newDetail = s.detailSelector
    ? o.row.querySelector(s.detailSelector!)!
    : undefined;
  recordSearchReceipt({
    nodes: n,
    row: o.row,
    value,
    code,
    policy: JSON.stringify(s),
    url: o.url,
    form: JSON.stringify(executionPolicy(o.row.ownerDocument)?.browserPolicy),
    metadata: meta,
    detail: newDetail,
    details: newDetail
      ? Array.from(newDetail.querySelectorAll("input,select,textarea"))
      : [],
  });
  return committedSearchMatches(handle, item);
}
