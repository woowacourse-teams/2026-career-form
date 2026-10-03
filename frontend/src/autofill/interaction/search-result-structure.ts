import type {
  InteractionCandidate,
  InteractionRole,
  ResultStructure,
} from "../api/interaction-types";
import { validateInteractionDecisionResponse } from "../api/validate-interaction-response";
import { InteractionDecisionBudgetError } from "../api/interaction-decision-session";
import {
  controlSignature,
  HIGH_RISK_ACTION,
  normalized,
  requestFor,
  selectedCandidate,
  type ElementBinding,
} from "./readonly-search";
import { SearchFailure, type SearchSession } from "./search-session";
import { elements, interactive, label, shown } from "./search-surface-dom";

const TAGS = new Set([
  "div",
  "li",
  "span",
  "ul",
  "ol",
  "table",
  "tbody",
  "tr",
  "td",
  "button",
  "a",
  "input",
]);
const ROLES = new Set([
  "none",
  "list",
  "listbox",
  "row",
  "listitem",
  "option",
  "button",
]);
const ACTION_LABEL = /^(선택|확인|select|choose|confirm)$/i;

export function resultActivation(
  element: HTMLElement,
): ResultStructure["activation"] {
  if (element.parentElement?.closest("a[href], button, label, summary"))
    return "none";
  if (
    !interactive(element) ||
    HIGH_RISK_ACTION.test(label(element)) ||
    element.hasAttribute("download") ||
    element.hasAttribute("formaction") ||
    element.hasAttribute("command") ||
    element.hasAttribute("popovertarget")
  )
    return "none";
  const target =
    element.getAttribute("target") ||
    element.ownerDocument.querySelector("base")?.getAttribute("target");
  if (target && target.toLowerCase() !== "_self") return "none";
  const href = element.getAttribute("href")?.trim();
  if (href && href !== "#") return "none";
  if (element.matches("button, input"))
    return (element as HTMLButtonElement).type === "button" ? "native" : "none";
  if (element.tagName === "A") return "native";
  if (!["DIV", "LI", "SPAN"].includes(element.tagName)) return "none";
  if (element.hasAttribute("onclick")) return "inline-click";
  if (
    element.tabIndex >= 0 &&
    (element.hasAttribute("onkeydown") || element.hasAttribute("onkeyup"))
  )
    return "keyboard";
  return "none";
}

function structure(element: HTMLElement, depth: number): ResultStructure {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role") ?? "none";
  if (!TAGS.has(tag) || !ROLES.has(role) || element.children.length > 24)
    throw new SearchFailure("decision_abstained");
  return {
    tag: tag as ResultStructure["tag"],
    ariaRole: role as ResultStructure["ariaRole"],
    activation: resultActivation(element),
    depth,
    childCount: element.children.length,
  };
}

/** A candidate denotes one shared shape across every row, never a data answer. */
type Shape = { elements: HTMLElement[]; depth: number };
function fingerprint(root: HTMLElement): string {
  return JSON.stringify(
    [root, ...elements<HTMLElement>(root, "*")].map((element) => [
      element.tagName,
      Array.from(element.attributes, (a) => [a.name, a.value]),
      element.textContent,
    ]),
  );
}
function homogeneous(rows: HTMLElement[]): boolean {
  const shape = (row: HTMLElement) =>
    JSON.stringify(
      [row, ...elements<HTMLElement>(row, "*")].map((e) => [
        e.tagName,
        e.getAttribute("role"),
        resultActivation(e),
        e.children.length,
      ]),
    );
  return (
    rows.length > 0 &&
    rows.length <= 24 &&
    rows.every((row) => shown(row) && shape(row) === shape(rows[0]!))
  );
}
function rowShapes(root: HTMLElement): Shape[] {
  let rows = Array.from(root.children) as HTMLElement[];
  const shapes: Shape[] = [];
  for (let depth = 1; depth <= 6; depth++) {
    if (!homogeneous(rows)) break;
    // Single wrapper around the whole list is not a result row.
    if (
      rows.length === 1 &&
      rows[0]!.children.length > 1 &&
      !elements<HTMLElement>(rows[0]!, "*").some(
        (e) => resultActivation(e) !== "none",
      )
    )
      break;
    shapes.push({ elements: rows, depth });
    if (
      !rows.every(
        (row) =>
          row.children.length === 1 &&
          !Array.from(row.childNodes).some(
            (n) => n.nodeType === 3 && normalized(n.textContent ?? ""),
          ),
      )
    )
      break;
    rows = rows.map((row) => row.firstElementChild as HTMLElement);
  }
  return shapes;
}

async function choose(
  session: SearchSession,
  role: InteractionRole,
  shapes: Shape[],
  current: () => void,
): Promise<Shape> {
  current();
  if (!shapes.length) throw new SearchFailure("decision_abstained");
  if (shapes.length > 8 || session.candidateCount + shapes.length > 24)
    throw new SearchFailure("decision_budget_exhausted");
  session.candidateCount += shapes.length;
  const bindings: ElementBinding<HTMLElement>[] = shapes.map((shape, index) => {
    const element = shape.elements[0]!;
    const candidateId = `result-${session.providerCalls}-${index}`;
    const candidate: InteractionCandidate = {
      candidateId,
      element:
        element.tagName === "BUTTON"
          ? "button"
          : element.tagName === "A"
            ? "link"
            : element.tagName === "INPUT"
              ? "input"
              : "custom",
      control:
        role === "SEARCH_RESULT_ACTION"
          ? "button"
          : role === "SEARCH_RESULT_ITEM"
            ? "item"
            : "container",
      visibility: "visible",
      relationToTarget: "DIALOG_CONTROL",
      structure: structure(element, shape.depth),
    };
    return {
      candidateId,
      candidate,
      element,
      signature: controlSignature(element),
    };
  });
  if (shapes.length === 1) return shapes[0]!;
  const descriptors = bindings.map((b) =>
    JSON.stringify(b.candidate.structure),
  );
  if (new Set(descriptors).size !== descriptors.length)
    throw new SearchFailure("decision_abstained");
  if (!session.args.decisionProvider)
    throw new SearchFailure("decision_abstained");
  if (++session.providerCalls > 2)
    throw new SearchFailure("decision_budget_exhausted");
  const binding = { decisionId: "result-shape", role, candidates: bindings };
  const request = requestFor(
    session.args.document,
    session.args.canonicalFieldKey,
    [binding],
  )!;
  try {
    const response = validateInteractionDecisionResponse(
      request,
      await session.race(session.args.decisionProvider(request)),
    );
    current();
    const selected = selectedCandidate(binding, request, response);
    if (typeof selected === "string")
      throw new SearchFailure(
        selected === "abstain"
          ? "decision_abstained"
          : "model_response_invalid",
      );
    return shapes[bindings.indexOf(selected)]!;
  } catch (error) {
    if (error instanceof SearchFailure) throw error;
    throw new SearchFailure(
      error instanceof InteractionDecisionBudgetError
        ? "decision_budget_exhausted"
        : "model_response_invalid",
    );
  }
}

function dataText(row: HTMLElement, action: HTMLElement): string {
  // Remove only a generic action label, never a data token or a campus qualifier.
  const clone = row.cloneNode(true) as HTMLElement;
  const original = [row, ...elements<HTMLElement>(row, "*")];
  const copied = [clone, ...elements<HTMLElement>(clone, "*")];
  if (ACTION_LABEL.test(normalized(action.textContent ?? "")))
    copied[original.indexOf(action)]?.remove();
  return normalized(clone.textContent ?? "");
}

export async function interpretResultStructure(
  root: HTMLElement,
  session: SearchSession,
  guard: () => void,
) {
  const initial = fingerprint(root);
  const nodes = [root, ...elements<HTMLElement>(root, "*")];
  const current = () => {
    session.check();
    guard();
    const live = [root, ...elements<HTMLElement>(root, "*")];
    if (
      live.length !== nodes.length ||
      live.some((n, i) => n !== nodes[i]) ||
      fingerprint(root) !== initial
    )
      throw new SearchFailure("result_stale");
  };
  await choose(
    session,
    "SEARCH_RESULT_CONTAINER",
    [{ elements: [root], depth: 0 }],
    current,
  );
  const shapes = rowShapes(root);
  // Completeness is established before any provider request using the entire row set.
  const rows = shapes[0]?.elements;
  const count =
    root.getAttribute("data-result-count") ?? root.getAttribute("aria-setsize");
  if (
    !rows ||
    (count !== null &&
      (!/^\d+$/.test(count) || Number(count) !== rows.length)) ||
    (count === null && root.getAttribute("data-search-complete") !== "true")
  )
    throw new SearchFailure("result_set_incomplete");
  for (const shape of shapes) {
    const positions = shape.elements.map((row) =>
      row.getAttribute("aria-posinset"),
    );
    if (
      shape.elements.some(
        (row) =>
          row.hasAttribute("aria-setsize") &&
          row.getAttribute("aria-setsize") !== String(rows.length),
      ) ||
      (positions.some((p) => p !== null) &&
        (new Set(positions).size !== rows.length ||
          positions.some(
            (p) =>
              p === null ||
              !/^\d+$/.test(p) ||
              Number(p) < 1 ||
              Number(p) > rows.length,
          )))
    )
      throw new SearchFailure("result_set_incomplete");
  }
  const rowShape = await choose(session, "SEARCH_RESULT_ITEM", shapes, current);
  const all = rowShape.elements.map((row) => [
    row,
    ...elements<HTMLElement>(row, "*"),
  ]);
  const actions = all[0]!.flatMap((element, index) => {
    if (
      resultActivation(element) === "none" ||
      elements<HTMLElement>(element, "*").some(
        (e) => resultActivation(e) !== "none",
      )
    )
      return [];
    const peers = all.map((items) => items[index]!);
    return peers.every((e) => resultActivation(e) !== "none")
      ? [{ elements: peers, depth: rowShape.depth + 1 }]
      : [];
  });
  if (!actions.length) throw new SearchFailure("result_activation_unsafe");
  const actionShape = await choose(
    session,
    "SEARCH_RESULT_ACTION",
    actions,
    current,
  );
  return {
    exact(expected: readonly string[]) {
      current();
      const matches = rowShape.elements
        .map((row, index) => ({ row, element: actionShape.elements[index]! }))
        .filter(({ row, element }) =>
          expected.some(
            (value) => normalized(value) === dataText(row, element),
          ),
        );
      if (matches.length > 1)
        throw new SearchFailure("multiple_matching_results");
      const match = matches[0];
      if (!match) throw new SearchFailure("search_results_not_found");
      if (resultActivation(match.element) === "none")
        throw new SearchFailure("result_activation_unsafe");
      return {
        ...match,
        signature: controlSignature(match.element),
        structured: true as const,
      };
    },
  };
}
