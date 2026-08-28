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
  element: HTMLButtonElement | HTMLInputElement;
}

export interface FieldCandidateHandle extends CandidateHandleBase {
  kind: "field";
  candidate: FieldCandidate;
  elements: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  optionElements: Map<string, HTMLOptionElement | HTMLInputElement>;
}

export type CandidateLookup<T> =
  | { status: "ready"; handle: T }
  | { status: "blocked"; reason: CandidateBlockReason; handle: T }
  | { status: "stale" }
  | { status: "unknown" };
