import type { StructuralSkipReason } from "../../debug/structural-diagnostics";
import type { WriteFailureCode } from "../../write/failure";
import { setValue, waitFor } from "./v1-basic-write";

/**
 * The v1 search-and-pick engine shared by the step-2 school/major searches
 * (CF-509) and the step-3 certificate search (CF-510). It only touches the
 * search input, its widget's own `#dropdown-body`, the row holding the input
 * and the row title that closes a list; the callers own approval, existing
 * values and the chip read-back.
 */
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const text = (e: Element | null | undefined) => normalize(e?.textContent ?? "");

/** The row title span: clicking it closes a row's open list (measured; Escape,
 * blur and clearing the input do not) and keeps the typed value. */
export async function closeThroughTitle(
  row: Element,
  open: () => boolean,
  current: () => boolean,
): Promise<boolean> {
  (row.firstElementChild as HTMLElement).click();
  return waitFor(() => !open(), current);
}

const SEARCH_MS = 5000;
/** The register row is judged only this long after typing: the page shows it
 * once before the search answers (~100-300 ms, step2-probe-noresult.json). */
const REGISTER_MS = 1000;
/** Consecutive unchanged readings a settled list also needs (one per 25 ms
 * poll, STABLE_MS in all): after a main-thread pause the page's pending
 * update runs before the next poll, so a pause alone never settles a list. */
const STABLE_POLLS = 12;

/**
 * The structure of the page's own "register '<query>' as a new entry" row
 * (measured: `li > button > span > div > [svg, span]`, the span text-only).
 */
export function isRegisterShape(li: Element): HTMLButtonElement | undefined {
  const button = li.children.length === 1 ? li.children[0] : undefined;
  const wrapper =
    button?.children.length === 1 ? button.children[0] : undefined;
  const box = wrapper?.children.length === 1 ? wrapper.children[0] : undefined;
  const [icon, label] = Array.from(box?.children ?? []);
  // Measured (step2-probe-regtext.json): the label span holds only the
  // quoted name; 등록하기 is a text node outside it (in the div, or in the
  // span wrapping the div). Text anywhere else is not the register row.
  const outside = [...(wrapper?.childNodes ?? []), ...(box?.childNodes ?? [])]
    .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
    .map((n) => normalize(n.textContent ?? ""));
  const quoted = normalize(label?.textContent ?? "");
  return button instanceof HTMLButtonElement &&
    Array.from(button.childNodes).every(
      (n) => n === wrapper || !n.textContent?.trim(),
    ) &&
    wrapper instanceof HTMLSpanElement &&
    box instanceof HTMLDivElement &&
    box.children.length === 2 &&
    icon?.tagName.toLowerCase() === "svg" &&
    label instanceof HTMLSpanElement &&
    label.children.length === 0 &&
    quoted.length > 2 &&
    quoted.startsWith("'") &&
    quoted.endsWith("'") &&
    outside.length === 1 &&
    outside[0] === "등록하기" &&
    normalize(li.textContent ?? "").endsWith("등록하기")
    ? button
    : undefined;
}

/** The register row for exactly the typed name: `'` + name + `'등록하기`. */
export function isRegisterRow(li: Element, query: string): boolean {
  return (
    !!isRegisterShape(li) &&
    normalize(li.textContent ?? "") === `'${normalize(query)}'등록하기`
  );
}

const registerOnly = (items: readonly Element[], query: string) =>
  items.length === 1 && isRegisterRow(items[0], query);

/**
 * The one decision for a list that holds only the register row for the
 * profile name (no catalog match). Decided 2026-11-22: press it, which
 * registers the name as a free-text entry; the page then shows the same chip
 * as a picked row (step2-probe-register.json), verified like a pick.
 */
function onRegisterRowOnly(): "register" {
  return "register";
}
const STABLE_MS = 300;

/** Value-free structure of a row: tag and child count, level by level. */
function rowShape(li: Element): string {
  const parts = [`li${li.children.length}`];
  let level = Array.from(li.children);
  while (level.length && parts.length < 8) {
    parts.push(
      ...level.map((e) => `${e.tagName.toLowerCase()}${e.children.length}`),
    );
    level = level.flatMap((e) => Array.from(e.children));
  }
  return parts.slice(0, 8).join("-");
}

/**
 * The rows of a result list as (click target, name). Measured shape
 * (step2-probe-fail.json): `li > button > span "<name>"`, the span holding
 * only text; the list may sit in a scroll wrapper whose track divs are not
 * rows. Empty spacer `li`s are skipped. Any other row: its shape, no rows.
 */
function resultRows(body: Element): {
  rows?: { target: HTMLElement; name: string }[];
  shape?: string;
} {
  const rows: { target: HTMLElement; name: string }[] = [];
  for (const li of Array.from(body.querySelectorAll<HTMLElement>("ul > li"))) {
    if (li.children.length === 0 && !text(li)) continue;
    const button = li.children[0];
    const label = button?.children[0];
    if (
      li.children.length !== 1 ||
      !(button instanceof HTMLButtonElement) ||
      button.children.length !== 1 ||
      !(label instanceof HTMLSpanElement) ||
      label.children.length !== 0
    )
      return { shape: rowShape(li) };
    rows.push({ target: button, name: text(label) });
  }
  return { rows };
}

export interface V1SearchTarget {
  /** Diagnostics key: the wire name of the search field. */
  key: string;
  input: HTMLInputElement;
  /** The page element that holds the input until a pick replaces it. */
  row: Element;
  /** The row whose title span closes an open list. */
  titleRow: Element;
  /** The run, the URL, the review item and its approval are still current. */
  live: () => boolean;
  /** The page shows exactly the typed name as the field's one chip. */
  picked: () => boolean;
  skip: (
    key: string,
    reason: StructuralSkipReason,
    code: string,
    failureCode?: WriteFailureCode,
  ) => void;
}

/**
 * One search (stage-1 driver). Types the name once into the input, waits
 * (≤ 5 s) for the widget's own `#dropdown-body` list to settle, and clicks a
 * row only when exactly one row's text equals the name, or presses a lone
 * register row for exactly that name. The pick is verified by the input
 * leaving the row and `picked()`. Anything else clears the typed text,
 * closes the list without picking and reports a search code.
 */
export async function runV1Search(
  target: V1SearchTarget,
  name: string,
): Promise<{ written: boolean; code?: WriteFailureCode }> {
  const { key, input, row, titleRow, live, picked, skip } = target;
  const widget = input.closest("[data-review-key]") ?? input.parentElement!;
  const bodies = () => Array.from(widget.querySelectorAll("#dropdown-body"));
  const reasons: Partial<Record<WriteFailureCode, StructuralSkipReason>> = {
    SEARCH_NO_EXACT_MATCH: "result-not-unique",
    SEARCH_AMBIGUOUS: "result-not-unique",
    SEARCH_TIMEOUT: "disabled-timeout",
    SEARCH_NO_RESULTS: "control-missing",
    SEARCH_FORM_UNVERIFIED: "control-shape",
    SEARCH_SELECTION_UNVERIFIED: "result-click-no-effect",
  };
  const open = () => bodies().length > 0;
  const listed = () => {
    const [body, extra] = bodies();
    return body && !extra ? Array.from(body.querySelectorAll("ul > li")) : [];
  };
  let typedAt = 0;
  /** Value-free search state: elapsed ms, rows, register structure, text. */
  const state = (branch: string) => {
    const items = listed();
    const lone = items.length === 1 ? items[0] : undefined;
    return [
      `ms${Math.round((Date.now() - typedAt) / 100) * 100}`,
      `li${items.length}`,
      `reg${lone && isRegisterShape(lone) ? "yes" : "no"}`,
      `text${lone && isRegisterRow(lone, name) ? "yes" : "no"}`,
      `branch-${branch}`,
    ].join("-");
  };
  const branchOf = (code: WriteFailureCode, detail: string) =>
    detail === "search"
      ? code
          .replace(/^SEARCH_/, "")
          .toLowerCase()
          .replaceAll("_", "-")
      : detail
          .replace(/^search-/, "")
          .replace(/-answered-.*$/, "")
          .replace(/^(rows|lists)-.*$/, "$1");
  const cleanup = async (code: WriteFailureCode, detail = "search") => {
    skip(
      key,
      reasons[code] ?? "blocked",
      `${detail}-${state(branchOf(code, detail))}`,
      code,
    );
    if (input.isConnected) {
      setValue(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // Blur and clearing do not close the list; the row title does.
    if (open()) await closeThroughTitle(titleRow, open, () => true);
    if (open() || (input.isConnected && input.value !== ""))
      skip(key, "cleanup-failed", "search-cleanup");
    return { written: false, code };
  };
  input.focus();
  setValue(input, name);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  typedAt = Date.now();
  let shown = "";
  let since = 0;
  let polls = 0;
  // Settled: this widget's own list is stable and answers the query (a row
  // contains the name). A list shown on focus before the debounced search
  // (대학교/대학원 widgets) is not taken for the result.
  const settled = await waitFor(
    () => {
      const items = listed();
      if (!items.length) {
        shown = "";
        polls = 0;
        return false;
      }
      const now = items.map(text).join("\n");
      if (now !== shown) {
        shown = now;
        since = Date.now();
        polls = 0;
        return false;
      }
      polls++;
      // Settled: unchanged for STABLE_MS over STABLE_POLLS readings; a
      // lone register-shaped row also only REGISTER_MS after typing, so its
      // transient showing is never taken for the answer.
      return (
        Date.now() - since >= STABLE_MS &&
        polls >= STABLE_POLLS &&
        (!(items.length === 1 && isRegisterShape(items[0])) ||
          Date.now() - typedAt >= REGISTER_MS)
      );
    },
    () => live() && input.isConnected,
    SEARCH_MS,
  );
  if (!live() || !input.isConnected) return cleanup("SEARCH_UNCONFIRMED");
  // At the deadline a stable list that never answered is still judged below.
  if (!settled && !listed().length)
    return cleanup(
      bodies().length === 1 ? "SEARCH_NO_RESULTS" : "SEARCH_TIMEOUT",
    );
  const pickRow = async (clickTarget: HTMLElement) => {
    if (!live()) return cleanup("SEARCH_UNCONFIRMED");
    clickTarget.click();
    const done = await waitFor(
      () => !row.contains(input) && picked(),
      () => live(),
    );
    if (done) return { written: true };
    if (input.isConnected && row.contains(input))
      return cleanup("SEARCH_SELECTION_UNVERIFIED");
    skip(
      key,
      "result-click-no-effect",
      "search",
      "SEARCH_SELECTION_UNVERIFIED",
    );
    return { written: false, code: "SEARCH_SELECTION_UNVERIFIED" as const };
  };
  const finalRows = listed();
  // A register row is pressed only alone, for exactly this name, stable and
  // judged no earlier than REGISTER_MS after typing.
  // Only at the deadline: a settled list already passed this test.
  if (
    !settled &&
    finalRows.length === 1 &&
    isRegisterShape(finalRows[0]) &&
    (Date.now() - since < STABLE_MS || Date.now() - typedAt < REGISTER_MS)
  )
    return cleanup("SEARCH_TIMEOUT", "search-register-unsettled");
  if (finalRows.length > 1 && finalRows.some((li) => isRegisterShape(li)))
    return cleanup("SEARCH_FORM_UNVERIFIED", "search-register-mixed");
  if (
    finalRows.length === 1 &&
    isRegisterShape(finalRows[0]) &&
    !isRegisterRow(finalRows[0], name)
  )
    return cleanup("SEARCH_FORM_UNVERIFIED", "search-register-other-name");
  if (registerOnly(finalRows, name)) {
    if (onRegisterRowOnly() === "register") {
      const result = await pickRow(isRegisterShape(finalRows[0])!);
      if (result.written) skip(key, "unselected", "search-registered");
      return result;
    }
  }
  const body = bodies()[0];
  const answered = listed().some((li) => normalize(text(li)).includes(name))
    ? "yes"
    : "no";
  // Exactly one list (measured: one `ul`, scroll wrapper and track divs aside).
  const lists = body.querySelectorAll("ul").length;
  if (lists !== 1)
    return cleanup(
      "SEARCH_FORM_UNVERIFIED",
      `search-lists-${lists}-answered-${answered}`,
    );
  const { rows, shape } = resultRows(body);
  if (!rows)
    return cleanup(
      "SEARCH_FORM_UNVERIFIED",
      `search-rows-${shape ?? "none"}-answered-${answered}`,
    );
  const exact = rows.filter((r) => normalize(r.name) === name);
  if (exact.length === 0) return cleanup("SEARCH_NO_EXACT_MATCH");
  if (exact.length > 1) return cleanup("SEARCH_AMBIGUOUS");
  return pickRow(exact[0].target);
}
