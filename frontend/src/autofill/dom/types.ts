import type { ActionCandidate, FieldCandidate } from "../api/types";

export type CandidateBlockReason =
  "disabled" | "readonly" | "hidden" | "inert" | "unsupported";

interface CandidateHandleBase {
  candidateId: string;
  sectionId: string;
  itemId?: string;
  itemIndex?: number;
  itemGroupId?: string;
  signature: string;
}

export interface ActionCandidateHandle extends CandidateHandleBase {
  kind: "action";
  candidate: ActionCandidate;
  element: HTMLButtonElement | HTMLInputElement | HTMLSelectElement;
}

export interface FieldCandidateHandle extends CandidateHandleBase {
  kind: "field";
  isCurrentContext?: () => boolean;
  candidate: FieldCandidate;
  elements: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  /**
   * Exact option nodes collected with this field. Native controls use option or
   * input nodes; a bounded ARIA combobox may use a role=option HTMLElement.
   */
  optionElements: ReadonlyMap<string, HTMLElement>;
}

export type CandidateLookup<T> =
  | { status: "ready"; handle: T }
  | { status: "blocked"; reason: CandidateBlockReason; handle: T }
  | { status: "stale" }
  | { status: "unknown" };
