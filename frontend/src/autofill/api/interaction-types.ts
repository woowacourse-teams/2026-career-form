import type { SemanticContext, SiteDescriptor } from "./types";

export type InteractionRole =
  "SEARCH_POPUP_OPENER" | "SEARCH_QUERY_INPUT" | "SEARCH_SUBMIT";

export interface InteractionCandidate {
  candidateId: string;
  element: "input" | "button" | "link" | "custom";
  control: "text" | "search" | "button" | "submit";
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
