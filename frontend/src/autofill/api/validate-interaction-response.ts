import type {
  InteractionDecisionRequest,
  InteractionDecisionResponse,
} from "./interaction-types";
import { AnalysisContractError } from "./validate-response";
import { calendarRequestWithinBounds } from "./calendar-role-contract";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validResultStructure(value: unknown): boolean {
  return (
    record(value) &&
    keys(value, ["tag", "ariaRole", "activation", "depth", "childCount"]) &&
    [
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
    ].includes(String(value.tag)) &&
    ["none", "list", "listbox", "row", "listitem", "option", "button"].includes(
      String(value.ariaRole),
    ) &&
    ["none", "native", "inline-click", "keyboard"].includes(
      String(value.activation),
    ) &&
    typeof value.depth === "number" &&
    Number.isInteger(value.depth) &&
    value.depth >= 0 &&
    value.depth <= 6 &&
    typeof value.childCount === "number" &&
    Number.isInteger(value.childCount) &&
    value.childCount >= 0 &&
    value.childCount <= 24
  );
}

export function validateInteractionDecisionResponse(
  request: InteractionDecisionRequest,
  value: unknown,
): InteractionDecisionResponse {
  if (
    request.decisions.some((decision) =>
      decision.role.startsWith("CALENDAR_"),
    ) &&
    !calendarRequestWithinBounds(request)
  )
    throw new AnalysisContractError();
  if (
    !record(value) ||
    !keys(value, [
      "schemaVersion",
      "snapshotId",
      "status",
      "mode",
      "decisions",
    ]) ||
    value.schemaVersion !== 2 ||
    value.snapshotId !== request.snapshotId ||
    !Array.isArray(value.decisions) ||
    ![
      "COMPLETE",
      "LLM_UNAVAILABLE",
      "STATIC_POLICY_PRESENT",
      "POLICY_UNAVAILABLE",
    ].includes(String(value.status))
  )
    throw new AnalysisContractError();

  if (value.status !== "COMPLETE") {
    if (
      value.decisions.length !== 0 ||
      (value.status === "LLM_UNAVAILABLE"
        ? value.mode !== "GENERIC"
        : value.mode !== null)
    ) {
      throw new AnalysisContractError();
    }
    return value as unknown as InteractionDecisionResponse;
  }
  if (
    value.mode !== "GENERIC" ||
    value.decisions.length !== request.decisions.length
  ) {
    throw new AnalysisContractError();
  }
  const seen = new Set<string>();
  const selected = new Set<string>();
  for (const decision of value.decisions) {
    if (
      !record(decision) ||
      !keys(decision, ["decisionId", "role", "selection", "candidateId"]) ||
      typeof decision.decisionId !== "string" ||
      seen.has(decision.decisionId)
    ) {
      throw new AnalysisContractError();
    }
    seen.add(decision.decisionId);
    const expected = request.decisions.find(
      (entry) => entry.decisionId === decision.decisionId,
    );
    if (!expected || expected.role !== decision.role)
      throw new AnalysisContractError();
    if (decision.selection === "ABSTAINED") {
      if (decision.candidateId !== undefined && decision.candidateId !== null)
        throw new AnalysisContractError();
      continue;
    }
    const candidate = expected.candidates.find(
      (entry) => entry.candidateId === decision.candidateId,
    );
    if (
      decision.selection !== "SELECTED" ||
      !candidate ||
      selected.has(candidate.candidateId) ||
      candidate.visibility !== "visible" ||
      candidate.disabled ||
      candidate.readonly ||
      candidate.inert ||
      (expected.role.startsWith("SEARCH_RESULT_") &&
        (!candidate.structure ||
          !validResultStructure(candidate.structure) ||
          candidate.semanticContext !== undefined ||
          !["DIALOG_CONTROL", "SAME_CONTAINER"].includes(
            candidate.relationToTarget,
          ) ||
          (expected.role === "SEARCH_RESULT_ACTION" &&
            (candidate.structure.activation === "none" ||
              candidate.control !== "button")) ||
          (expected.role === "SEARCH_RESULT_CONTAINER" &&
            candidate.control !== "container") ||
          (expected.role === "SEARCH_RESULT_ITEM" &&
            candidate.control !== "item")))
    ) {
      throw new AnalysisContractError();
    }
    selected.add(candidate.candidateId);
  }
  return value as unknown as InteractionDecisionResponse;
}
