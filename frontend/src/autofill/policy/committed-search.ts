import { sameValueBinding } from "./binding-equality";
import {
  nativeRowWritable,
  recordNativeRowWrite,
} from "./native-form-row-state";
import { executionPolicy } from "../workflow/execution-policy";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { catalogApprovalForItem } from "../profile/catalog-identity";
import { currentNativeOwner, nativeOwnership } from "./native-form-collection";
import { runDomPlan } from "./action-plan";
import { visible } from "./primitives";
import {
  debugRuntimeSkip,
  type StructuralSkipReason,
} from "../debug/structural-diagnostics";
import type { FailureReporter, WriteFailureCode } from "../write/failure";
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
    !sameValueBinding(item.analysis.valueBinding, o.field.binding) ||
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
  if (!o || !nativeRowWritable(o)) return false;
  return searchReceipt(o.row, o.field, o.index)?.value === item.profileValue;
}
const pause = (view: Window, ms: number) =>
  new Promise<void>((resolve) => view.setTimeout(resolve, ms));
/** How long a changed result box without results must stay unchanged. */
const NO_RESULTS_STABLE_MS = 50;
/** Value class only: never the attribute value itself. */
function valueClass(value: string | null) {
  if (value === null) return "absent";
  if (["true", "false", "null", "undefined"].includes(value)) return value;
  if (value === "") return "empty";
  return /^\d+(\.\d+)?$/.test(value) ? "numeric" : "other";
}
const policyToken = (key: string) =>
  /^[A-Za-z0-9_]{1,32}$/.test(key) ? key : "key";
/** Identity snapshot of every node under the result box. */
function resultShape(results: Element): Node[] {
  const nodes: Node[] = [];
  const walker = results.ownerDocument.createTreeWalker(results);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    nodes.push(node);
  return nodes;
}
const sameShape = (a: readonly Node[], b: readonly Node[]) =>
  a.length === b.length && a.every((node, i) => node === b[i]);
interface SearchExit {
  reason: StructuralSkipReason;
  detail: string;
  code?: WriteFailureCode;
}
const contextChanged: SearchExit = {
  reason: "owner-mismatch",
  detail: "committed-search-context",
  code: "FIELD_CHANGED",
};
export async function executeCommittedSearch(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  signal: AbortSignal,
  beforeMutation?: () => Promise<boolean>,
  report?: FailureReporter,
): Promise<boolean> {
  const o = approved(handle, item),
    s = o?.field.search,
    n = o?.search;
  const key =
    (o ?? nativeOwnership(handle))?.field.name ?? "hplace.mrs2.search";
  // Every false exit names its step (fixed and policy tokens only) and,
  // where one fits, reports an explicit failure code for the driver itself.
  const fail = ({ reason, detail, code }: SearchExit) => {
    if (signal.aborted) return false;
    debugRuntimeSkip(key, reason, detail, "write");
    if (code) report?.(code);
    return false;
  };
  if (signal.aborted) return false;
  if (!o || !s)
    return fail({ reason: "unselected", detail: "committed-search-approval" });
  if (!n)
    return fail({
      reason: "control-missing",
      detail: "committed-search-widget",
      code: "SEARCH_FORM_UNVERIFIED",
    });
  const value = item.profileValue!.trim();
  const existing = (): SearchExit => {
    const [name, , display] = searchTuple(n);
    return name === value && (display === "" || display === value)
      ? {
          reason: "existing-value",
          detail: "committed-search-existing-same",
          code: "SEARCH_SELECTION_UNVERIFIED",
        }
      : { reason: "existing-value", detail: "committed-search-existing" };
  };
  if (!nativeRowWritable(o))
    return fail(
      emptySearchTuple(n)
        ? { reason: "existing-value", detail: "committed-search-row" }
        : existing(),
    );
  if (committedSearchMatches(handle, item))
    return !beforeMutation || (await beforeMutation());
  const view = n.query.ownerDocument.defaultView!;
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
    nativeRowWritable(o, [n.query, n.name, n.code]) &&
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
  if (protectedSearchRow(o.row, s, o.index))
    return fail({
      reason: "disabled",
      detail: "committed-search-protected",
      code: "FIELD_READONLY",
    });
  if (!current()) return fail(contextChanged);
  if (
    value.length > 500 ||
    (n.query.maxLength >= 0 && value.length > n.query.maxLength)
  )
    return fail({
      reason: "control-shape",
      detail: "committed-search-query-length",
      code: "SEARCH_FORM_UNVERIFIED",
    });
  if (!visible(n.query))
    return fail({
      reason: "disabled",
      detail: "committed-search-query",
      code: "FIELD_DISABLED",
    });
  if (n.query.readOnly)
    return fail({
      reason: "disabled",
      detail: "committed-search-query-readonly",
      code: "FIELD_READONLY",
    });
  if (!emptySearchTuple(n)) return fail(existing());
  if (n.query.value !== "" || !detailEmpty())
    return fail({ reason: "existing-value", detail: "committed-search-query" });
  if (s.kind === "EXAM" && !detail)
    return fail({
      reason: "control-missing",
      detail: "committed-search-detail",
      code: "SEARCH_FORM_UNVERIFIED",
    });
  if (beforeMutation && !(await beforeMutation())) return false;
  if (!current()) return fail(contextChanged);
  if (!emptySearchTuple(n)) return fail(existing());
  if (n.query.value !== "" || !detailEmpty())
    return fail({ reason: "existing-value", detail: "committed-search-query" });
  const oldResults = new Set(n.results.querySelectorAll(s.resultSelector));
  const queryWrite = { node: n.query, previous: n.query.value, value };
  if (
    !runDomPlan(
      [{ op: "SET_VALUE", target: "query", value: "{query}" }],
      { query: n.query },
      { query: value },
      current,
    )
  )
    return fail(contextChanged);
  recordNativeRowWrite(o, [n.query]);
  let completed = false;
  try {
    // The result box before Enter: a stale no-result box from an earlier
    // search stays identical and is never read as this search's answer.
    const before = resultShape(n.results);
    if (
      !runDomPlan(
        [
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
      return fail(contextChanged);
    if (!nativeRowWritable(o)) return fail(contextChanged);
    const deadline = Date.now() + s.timeoutMs;
    let buttons: HTMLButtonElement[] | undefined;
    let quiet: { shape: Node[]; since: number } | undefined;
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
      // The site answered (the box changed) without a single result.
      const shape = resultShape(n.results);
      if (sameShape(shape, before)) quiet = undefined;
      else if (!quiet || !sameShape(shape, quiet.shape))
        quiet = { shape, since: Date.now() };
      else if (Date.now() - quiet.since >= NO_RESULTS_STABLE_MS)
        return fail({
          reason: "result-not-unique",
          detail: "committed-search-results-0",
          code: "SEARCH_NO_RESULTS",
        });
      await pause(view, 10);
    }
    if (!buttons)
      return fail(
        current() && n.query.value === value && emptySearchTuple(n)
          ? {
              reason: "no-response",
              detail: "committed-search-no-response",
              code: "SEARCH_TIMEOUT",
            }
          : contextChanged,
      );
    if (buttons.length !== 1)
      return fail({
        reason: "result-not-unique",
        detail: "committed-search-results-n",
        code: buttons.length ? "SEARCH_AMBIGUOUS" : "SEARCH_NO_EXACT_MATCH",
      });
    const unsafe = (detail: string): SearchExit => ({
      reason: "option-mismatch",
      detail: `committed-search-${detail}`,
      code: "SEARCH_ACTIVATION_UNSAFE",
    });
    const button = buttons[0],
      code = button.getAttribute("data-code") ?? "",
      meta: Record<string, string> = {};
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(code) ||
      /^0+$/.test(code) ||
      s.forbiddenCodes?.includes(code)
    )
      return fail(unsafe(`metadata-code-${valueClass(code)}`));
    if (button.type !== "button" || !visible(button) || oldResults.has(button))
      return fail(unsafe("result-shape"));
    if (
      Array.from(button.attributes).some(
        (a) =>
          a.name.startsWith("data-") &&
          a.name !== "data-code" &&
          !Object.values(s.metadata).includes(a.name),
      )
    )
      return fail(unsafe("metadata-extra-attribute"));
    for (const [key, attr] of Object.entries(s.metadata)) {
      const val = button.getAttribute(attr);
      if (val === null)
        return fail(unsafe(`metadata-${policyToken(key)}-absent`));
      meta[key] = val;
    }
    const flag = (key: string) => ["true", "false"].includes(meta[key]);
    const rejected = (key: string) =>
      fail(unsafe(`metadata-${policyToken(key)}-${valueClass(meta[key])}`));
    if (s.kind !== "PLAIN" && !flag("score")) return rejected("score");
    if (s.kind === "LICENSE" && !flag("registration"))
      return rejected("registration");
    if (s.kind === "EXAM") {
      if (!flag("grade")) return rejected("grade");
      if (meta.setup !== "") return rejected("setup");
      if (!(meta.value === "" || meta.value === "null"))
        return rejected("value");
      if (!(
        meta.perfect === "" ||
        meta.perfect === "null" ||
        /^\d+(\.\d+)?$/.test(meta.perfect)
      ))
        return rejected("perfect");
    }
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
    if (!resultCurrent() || !nativeRowWritable(o))
      return fail(
        current()
          ? {
              reason: "result-not-unique",
              detail: "committed-search-results-changed",
              code: "SEARCH_UNCONFIRMED",
            }
          : contextChanged,
      );
    button.click();
    const tupleCurrent = () =>
      current() &&
      JSON.stringify(searchTuple(n)) === JSON.stringify([value, code, value]);
    /** Why the committed result is not settled yet; undefined once it is. */
    const unsettled = (): SearchExit | undefined => {
      if (!current()) return contextChanged;
      if (emptySearchTuple(n))
        return {
          reason: "result-click-no-effect",
          detail: "committed-search-click",
        };
      if (!tupleCurrent())
        return {
          reason: "readback-mismatch",
          detail: "committed-search-tuple",
          code: "SEARCH_UNCONFIRMED",
        };
      if (s.kind === "LICENSE" && meta.registration === "false") {
        const reg = namedSearchControl(o.row, s.registrationName!, o.index);
        if (reg && visible(reg, true)) return unsafe("registration-visible");
      }
      const dependencies: SearchExit = {
        reason: "disabled-timeout",
        detail: "committed-search-dependencies",
      };
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
        })
          ? undefined
          : dependencies;
      const examDetail: SearchExit = {
        reason: "disabled-timeout",
        detail: "committed-search-exam-detail",
        code: "EXAM_SCORE_NOT_READY",
      };
      const next = o.row.querySelector(s.detailSelector!);
      if (!next || previousDetails.some((e) => next.contains(e)))
        return examDetail;
      const grade = namedSearchControl(o.row, s.gradeName!, o.index),
        score = namedSearchControl(o.row, s.scoreName!, o.index);
      return (meta.grade === "true"
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
        ? undefined
        : examDetail;
    };
    const settleDeadline = Date.now() + s.timeoutMs;
    while (current() && unsettled() && Date.now() < settleDeadline)
      await pause(view, 10);
    if (beforeMutation && !(await beforeMutation())) return false;
    const exit = unsettled();
    if (exit) return fail(exit);
    if (!nativeRowWritable(o, [n.query, n.name, n.code]))
      return fail(contextChanged);
    recordNativeRowWrite(o, [n.query, n.name, n.code]);
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
    completed = committedSearchMatches(handle, item);
    return (
      completed ||
      fail({
        reason: "readback-mismatch",
        detail: "committed-search-receipt",
        code: "SEARCH_UNCONFIRMED",
      })
    );
  } finally {
    // Restore only our unchanged query. Committed tuples, foreign results, and user edits are never reset.
    if (
      !completed &&
      current() &&
      nativeRowWritable(o) &&
      emptySearchTuple(n) &&
      detailEmpty() &&
      queryWrite.node === n.query &&
      n.query.value === queryWrite.value &&
      (!beforeMutation || (await beforeMutation())) &&
      current() &&
      nativeRowWritable(o) &&
      emptySearchTuple(n) &&
      detailEmpty() &&
      n.query.value === queryWrite.value
    ) {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(n.query, queryWrite.previous);
      recordNativeRowWrite(o, [n.query]);
      n.query.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (
      !completed &&
      !signal.aborted &&
      n.query.isConnected &&
      n.query.value === queryWrite.value &&
      emptySearchTuple(n)
    )
      debugRuntimeSkip(key, "cleanup-failed", "committed-search-cleanup");
  }
}
