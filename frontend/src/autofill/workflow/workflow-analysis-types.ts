import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AddressResult, AddressSearch } from "../address/types";
import type { WorkflowAdapter } from "../adapters/workflow";
import type { AnalysisApiClient } from "../api/types";
import type { collectFieldsSnapshot, CollectedSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import type {
  ApprovedWriteResult,
  WriteResultListener,
} from "../write/executor";
import type { ProfileRepository } from "../../profile/profile-repository";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { WorkflowActivity } from "./progress-model";
import type { WriteFailureCode } from "../write/failure";
import type { Stage } from "./workflow-model";

type FieldsSnapshot = CollectedSnapshot<
  ReturnType<typeof collectFieldsSnapshot>["request"]
>;
type AddressRun = {
  controller: AbortController;
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

export interface WorkflowAnalysisContext {
  onAddressOperation?: (element: Element) => void;
  onActivity?: (activity: WorkflowActivity) => void;
  onWriteResult?: WriteResultListener;
  presentField?: (
    registry: CandidateRegistry,
    item: ReviewPlanItem,
  ) => Promise<void>;
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
  pageDocument: Document;
  repository: Pick<ProfileRepository, "load">;
  approvedSensitiveValues: MutableRefObject<Map<string, string>>;
  consideredSensitiveValues: MutableRefObject<Map<string, string>>;
  completedDriverKeys: MutableRefObject<ReadonlySet<string>>;
  completedGenericStateDrivers: MutableRefObject<
    ReadonlyMap<string, CompletedGenericStateDriver>
  >;
  deferredDriverGroups: MutableRefObject<ReadonlySet<Element>>;
  deferredDriverFailures?: MutableRefObject<DeferredDriverFailures>;
  setAddressResult: Dispatch<SetStateAction<AddressResult | undefined>>;
  setExceptionTitle: Dispatch<SetStateAction<string>>;
  setStage: Dispatch<SetStateAction<Stage>>;
  setFieldsSnapshot: Dispatch<SetStateAction<FieldsSnapshot | undefined>>;
  setReviewItems: Dispatch<SetStateAction<ReviewPlanItem[]>>;
  setPartial: Dispatch<SetStateAction<boolean>>;
  setWarnings: Dispatch<SetStateAction<string[]>>;
  setResults: Dispatch<SetStateAction<ApprovedWriteResult[]>>;
}
