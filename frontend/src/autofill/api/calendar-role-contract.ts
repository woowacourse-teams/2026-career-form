import type {
  InteractionCandidate,
  InteractionDecisionRequest,
  InteractionRole,
} from "./interaction-types";

export const CALENDAR_MAX_CANDIDATES = 8;
export const CALENDAR_MAX_DECISIONS = 8;
export const CALENDAR_MAX_REQUEST_CANDIDATES = 32;
export const CALENDAR_MAX_REQUEST_BYTES = 16_384;
export const CALENDAR_MAX_ROLE_REQUESTS = 4;

export function validCalendarCandidate(
  role: InteractionRole,
  candidate: InteractionCandidate,
): boolean {
  const structure = candidate.calendarStructure;
  if (
    !structure ||
    candidate.semanticContext ||
    candidate.structure ||
    Object.keys(structure).length !== 6 ||
    ![
      "tag",
      "activation",
      "ownership",
      "unit",
      "unitEvidence",
      "valueShape",
    ].every((key) => Object.hasOwn(structure, key)) ||
    !["input", "img", "button", "select", "table", "a", "div"].includes(
      structure.tag,
    ) ||
    !["click", "focus", "change", "none"].includes(structure.activation) ||
    ![
      "linked-popup",
      "single-field",
      "adjacent-trigger",
      "bound-target",
    ].includes(structure.ownership) ||
    !["month", "day"].includes(structure.unit) ||
    !["target-format", "target-label", "month-options"].includes(
      structure.unitEvidence,
    ) ||
    ![
      "none",
      "year-options",
      "month-options",
      "day-grid",
      "previous",
      "next",
      "apply",
    ].includes(structure.valueShape) ||
    (structure.unitEvidence === "month-options" && structure.unit !== "month")
  )
    return false;
  switch (role) {
    case "CALENDAR_OPENER":
      return (
        structure.valueShape === "none" &&
        (structure.activation === "click" ||
          (structure.tag === "input" &&
            structure.activation === "focus" &&
            structure.ownership === "bound-target"))
      );
    case "CALENDAR_YEAR_TRIGGER":
      return (
        structure.activation === "click" && structure.valueShape === "none"
      );
    case "CALENDAR_YEAR_CONTROL":
      return (
        structure.tag === "select" &&
        structure.activation === "change" &&
        structure.valueShape === "year-options"
      );
    case "CALENDAR_MONTH_CONTROL":
      return (
        structure.tag === "select" &&
        structure.activation === "change" &&
        structure.valueShape === "month-options"
      );
    case "CALENDAR_DAY_CONTROL":
      return (
        structure.unit === "day" &&
        structure.activation === "click" &&
        structure.valueShape === "day-grid"
      );
    case "CALENDAR_NAVIGATION":
      return (
        structure.activation === "click" &&
        ["previous", "next"].includes(structure.valueShape)
      );
    case "CALENDAR_APPLY":
      return (
        structure.activation === "click" && structure.valueShape === "apply"
      );
    default:
      return false;
  }
}

export function calendarRequestWithinBounds(
  request: InteractionDecisionRequest,
): boolean {
  const decisions = request.decisions;
  return (
    decisions.length > 0 &&
    decisions.length <= CALENDAR_MAX_DECISIONS &&
    decisions.reduce(
      (count, decision) => count + decision.candidates.length,
      0,
    ) <= CALENDAR_MAX_REQUEST_CANDIDATES &&
    new TextEncoder().encode(JSON.stringify(request)).length <=
      CALENDAR_MAX_REQUEST_BYTES &&
    decisions.every(
      (decision) =>
        decision.candidates.length > 0 &&
        decision.candidates.length <= CALENDAR_MAX_CANDIDATES &&
        new Set(decision.candidates.map((candidate) => candidate.candidateId))
          .size === decision.candidates.length &&
        decision.candidates.every((candidate) =>
          validCalendarCandidate(decision.role, candidate),
        ),
    )
  );
}
