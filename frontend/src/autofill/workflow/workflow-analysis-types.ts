import type {
  AnalyzeFieldsSnapshot,
  StaticFieldsSession,
} from "./static-fields-session";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AddressResult, AddressSearch } from "../address/types";
import type { WorkflowAdapter } from "../adapters/workflow";
import type { AnalysisApiClient } from "../api/types";
import type {
  collectFieldsSnapshot,
  collectFieldsSnapshotWithDropdowns,
  CollectedSnapshot,
} from "../dom/collect";
import type { GenericStructureContext } from "../generic/structure-context";
import type { ReviewPlanItem } from "../review/review-plan";
import type {
  ApprovedWriteResult,
  WriteResultListener,
} from "../write/executor";
import type { ProfileRepository } from "../../profile/profile-repository";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { WorkflowActivity } from "./progress-model";
import type { WriteFailureCode } from "../write/failure";
import type { SearchFollowUpControl } from "../interaction/search-follow-up";
import type { Stage } from "./workflow-model";
import type { ComponentResultTargets } from "./component-result-registry";
import type {
  GenericFieldGrade,
  GenericSectionResult,
} from "../generic/generic-analysis";

type FieldsSnapshot = CollectedSnapshot<
  ReturnType<typeof collectFieldsSnapshot>["request"]
>;
type AddressRun = {
  controller: AbortController;
  hplaceFieldsRequests?: number;
  nativeFieldsRequests?: number;
  nativeProgress?: string;
  button?: Element;
  task?: Promise<AddressResult>;
};
export type DeferredDriverFailures = WeakMap<
  Element,
  { key: string; code: WriteFailureCode }
>;

export interface CompletedGenericStateDriver {
  profileValue: string;
}

export interface ComponentStateDriverReceipt {
  originalItem: ReviewPlanItem;
  sourceRegistry: CandidateRegistry;
  captured: ComponentResultTargets;
  identity: string;
}

export interface GenericSearchFollowUp {
  item: ReviewPlanItem;
  target: HTMLInputElement;
  repeatRow: Element;
  controls: readonly SearchFollowUpControl[];
  profileEntryId: string;
  profileFieldKey: string;
  profileValue: string;
  actualValue: string;
  valid: boolean;
  reboundCandidateId?: string;
}

export type SearchFollowUpRef = MutableRefObject<
  GenericSearchFollowUp | undefined
>;
export type CompletedSearchFollowUpsRef = MutableRefObject<
  readonly GenericSearchFollowUp[]
>;

export interface WorkflowAnalysisContext {
  onAddressOperation?: (element: Element) => void;
  onActivity?: (activity: WorkflowActivity) => void;
  onWriteResult?: WriteResultListener;
  onSearchFollowUp?: (
    item: ReviewPlanItem,
    controls: readonly SearchFollowUpControl[],
    registry: CandidateRegistry,
  ) => void;
  searchFollowUp?: SearchFollowUpRef;
  completedSearchFollowUps?: CompletedSearchFollowUpsRef;
  presentField?: (
    registry: CandidateRegistry,
    item: ReviewPlanItem,
  ) => Promise<void>;
  /** Generic section flow only: field grades and section results for review. */
  onGenericGrades?: (
    grades: ReadonlyMap<string, GenericFieldGrade>,
    sections: readonly GenericSectionResult[],
  ) => void;
  onAnalysis?: (summary: {
    mode: "ADAPTER" | "GENERIC";
    durationMs: number;
    fieldCount: number;
    matchedCount: number;
  }) => void;
  adapter: WorkflowAdapter;
  addressRun: MutableRefObject<AddressRun>;
  addressSearch: AddressSearch;
  apiClient: AnalysisApiClient;
  analyzeFieldsSnapshot?: AnalyzeFieldsSnapshot;
  /** Injected only by the generic structure gate; omission keeps the old collector. */
  collectFields?: typeof collectFieldsSnapshotWithDropdowns;
  genericStructure?: GenericStructureContext;
  refreshFieldsAfterPass?: StaticFieldsSession["refreshAfterPass"];
  pageDocument: Document;
  repository: Pick<ProfileRepository, "load">;
  approvedSensitiveValues: MutableRefObject<Map<string, string>>;
  consideredSensitiveValues: MutableRefObject<Map<string, string>>;
  freshDefaultControls: MutableRefObject<WeakSet<Element>>;
  completedDriverKeys: MutableRefObject<ReadonlySet<string>>;
  completedGenericStateDrivers: MutableRefObject<
    ReadonlyMap<string, CompletedGenericStateDriver>
  >;
  completedComponentStateDrivers?: MutableRefObject<
    Map<string, ComponentStateDriverReceipt>
  >;
  deferredDriverGroups: MutableRefObject<ReadonlySet<Element>>;
  deferredDriverFailures?: MutableRefObject<DeferredDriverFailures>;
  setAddressResult: Dispatch<SetStateAction<AddressResult | undefined>>;
  setExceptionTitle: Dispatch<SetStateAction<string>>;
  setStage: Dispatch<SetStateAction<Stage>>;
  setFieldsSnapshot: Dispatch<SetStateAction<FieldsSnapshot | undefined>>;
  setResultRegistry?: Dispatch<SetStateAction<CandidateRegistry | undefined>>;
  rebindResultProgress?: (
    items: readonly ReviewPlanItem[],
    originalRegistry: CandidateRegistry,
    resultRegistry: CandidateRegistry,
  ) => void;
  setReviewItems: Dispatch<SetStateAction<ReviewPlanItem[]>>;
  setPartial: Dispatch<SetStateAction<boolean>>;
  setWarnings: Dispatch<SetStateAction<string[]>>;
  setResults: Dispatch<SetStateAction<ApprovedWriteResult[]>>;
}
