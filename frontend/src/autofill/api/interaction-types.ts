import type { SemanticContext, SiteDescriptor } from "./types";

export type InteractionRole =
  | "SEARCH_POPUP_OPENER"
  | "SEARCH_QUERY_INPUT"
  | "SEARCH_SUBMIT"
  | "SEARCH_RESULT_CONTAINER"
  | "SEARCH_RESULT_ITEM"
  | "SEARCH_RESULT_ACTION"
  | "CALENDAR_OPENER"
  | "CALENDAR_YEAR_TRIGGER"
  | "CALENDAR_APPLY"
  | "CALENDAR_YEAR_CONTROL"
  | "CALENDAR_MONTH_CONTROL"
  | "CALENDAR_DAY_CONTROL"
  | "CALENDAR_NAVIGATION";

/** Finite structural evidence only; never labels, selectors or handler source. */
export interface ResultStructure {
  tag:
    | "div"
    | "li"
    | "span"
    | "ul"
    | "ol"
    | "table"
    | "tbody"
    | "tr"
    | "td"
    | "button"
    | "a"
    | "input";
  ariaRole:
    "none" | "list" | "listbox" | "row" | "listitem" | "option" | "button";
  activation: "none" | "native" | "inline-click" | "keyboard";
  depth: number;
  childCount: number;
}

/** Finite locally substantiated evidence; no raw DOM text or date values. */
export interface CalendarStructure {
  tag: "input" | "img" | "button" | "select" | "table" | "a" | "div";
  activation: "click" | "focus" | "change" | "none";
  ownership:
    "linked-popup" | "single-field" | "adjacent-trigger" | "bound-target";
  unit: "month" | "day";
  unitEvidence: "target-format" | "target-label" | "month-options";
  valueShape:
    | "none"
    | "year-options"
    | "month-options"
    | "day-grid"
    | "previous"
    | "next"
    | "apply";
}

export interface InteractionCandidate {
  candidateId: string;
  element: "input" | "button" | "link" | "custom";
  control: "text" | "search" | "button" | "submit" | "container" | "item";
  structure?: ResultStructure;
  calendarStructure?: CalendarStructure;
  visibility: "visible" | "hidden";
  disabled?: true;
  readonly?: true;
  inert?: true;
  relationToTarget:
    | "TARGET_CONTROL"
    | "SAME_FIELD_GROUP"
    | "SAME_REPEAT_ROW"
    | "SAME_CONTAINER"
    | "DIALOG_CONTROL";
  semanticContext?: {
    labels?: Array<{
      source:
        NonNullable<SemanticContext["labels"]>[number]["source"] | "title";
      text: string;
    }>;
    required?: true;
  };
}

export interface InteractionDecisionRequest {
  schemaVersion: 2;
  snapshotId: string;
  site: SiteDescriptor;
  decisions: Array<{
    decisionId: string;
    role: InteractionRole;
    canonicalFieldKey: string;
    candidates: InteractionCandidate[];
  }>;
}

export interface InteractionDecisionResponse {
  schemaVersion: 2;
  snapshotId: string;
  status:
    | "COMPLETE"
    | "LLM_UNAVAILABLE"
    | "STATIC_POLICY_PRESENT"
    | "POLICY_UNAVAILABLE";
  mode: "GENERIC" | null;
  decisions: Array<{
    decisionId: string;
    role: InteractionRole;
    selection: "SELECTED" | "ABSTAINED";
    candidateId?: string | null;
  }>;
}

export type InteractionDecisionProvider = (
  request: InteractionDecisionRequest,
) => Promise<InteractionDecisionResponse>;
