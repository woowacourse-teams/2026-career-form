import type { ActionCandidate, FieldCandidate } from "../api/types";
import type { MixedSectionGroup } from "./mixed-section-rows";
import type { ButtonDropdown } from "./button-dropdown";

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

/** Position of a field inside a mixed-section repeat group (C5). */
export interface MixedSectionRowContext {
  groupKey: string;
  rowIndex: number;
  rowCount: number;
  /** Selected kind-select option text when collected, if any. */
  selectedKind?: string;
  isKindSelect: boolean;
  /** The group the row belonged to when collected. */
  group: MixedSectionGroup;
}

export interface FieldCandidateHandle extends CandidateHandleBase {
  kind: "field";
  buttonDropdown?: ButtonDropdown;
  mixedSectionRow?: MixedSectionRowContext;
  isCurrentContext?: () => boolean;
  candidate: FieldCandidate;
  elements: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  customElements?: HTMLElement[];
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
