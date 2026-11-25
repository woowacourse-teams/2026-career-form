import {
  isBasicStateDriver,
  writeBasic,
  settleBasicStateDriver,
  prefersBasicProfileValue,
} from "./hplace/basic-write";
import { v1AttachmentFieldHint } from "./hplace/v1-history-controls";
import type { AttachmentFieldHint } from "../attachments/file-fields";
import type { LinkKind } from "../../attachments/model";
import { ownedBasicControl } from "./hplace/basic-controls";
import { ownedV1Control } from "./hplace/v1-basic-controls";
import { ownedV1HistoryControl } from "./hplace/v1-history-controls";
import { ownedV1ExtraControl } from "./hplace/v1-extra-controls";
import {
  settleV1ExtraAdd,
  v1ExtraProfileCount,
} from "./hplace/v1-extra-collection";
import {
  isV1ExtraHandle,
  isV1ExtraSearchHandle,
  isV1ExtraStateDriver,
  settleV1ExtraStateDriver,
  v1ExtraSearchFailureTargets,
  writeV1Extra,
  writeV1ExtraSearch,
} from "./hplace/v1-extra-write";
import {
  isV1HistoryMajorAdd,
  settleV1HistoryAdd,
  v1HistoryProfileCount,
} from "./hplace/v1-history-collection";
import {
  isV1HistoryHandle,
  isV1HistorySearchHandle,
  isV1HistoryStateDriver,
  v1HistorySearchFailureTargets,
  prefersV1HistoryProfileValue,
  settleV1HistoryStateDriver,
  v1HistoryDriverRow,
  writeV1History,
  writeV1HistorySearch,
} from "./hplace/v1-history-write";
import {
  isV1StateDriver,
  prefersV1ProfileValue,
  settleV1StateDriver,
  v1DriverRow,
  writeV1,
} from "./hplace/v1-basic-write";
import {
  isRegistrationItem,
  settleRegistration,
  writeRegistration,
} from "./hplace/write";
import { startLocalTiming } from "../debug/local-timing";
import { hiddenCodeAdapters } from "../policy/hidden-code";
import { componentWorkflowAdapter } from "../policy/components/workflow";
import type { MatchedFieldAnalysis, PreparationPlan } from "../api/types";
import type { ActionCandidateHandle, FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import type { Profile, RepeatedProfileCategoryId } from "../../profile/model";
import { resolveCompany, resolveDocumentCompany } from "./company";
import { policyWorkflowAdapter } from "../policy/workflow";
import { executionPolicy } from "../workflow/execution-policy";
import type { FailureReporter } from "../write/failure";

export interface FreshRowPreparation {
  plan: PreparationPlan;
  currentGroupCount?: number;
  requiredAdditions?: number;
}

export interface RevealSelection {
  domName: string;
  profileFieldKey: string;
  itemIndex: number;
}

export interface WorkflowDiagnostic {
  code:
    | "PROFILE_UNAVAILABLE"
    | "PROFILE_NOT_SELECTED"
    | "TARGET_MISSING"
    | "SELECTED"
    | "SELECTION_FAILED"
    | "FOLLOW_UP_PLANS"
    | "FOLLOW_UP_BINDINGS"
    | "ANALYSIS_BLOCKED"
    | "ELIGIBLE_FIELDS"
    | "WRITTEN"
    | "SKIPPED";
  count: number;
}

export interface WorkflowAdapter {
  // Explicit company/field policy only; never a general conflict bypass.
  prefersProfileValue?(
    handle: FieldCandidateHandle,
    analysis: MatchedFieldAnalysis,
  ): boolean;
  normalizeProfileValue?(profileFieldKey: string, value: string): string;
  addressFieldNames?: readonly string[];
  prepareEducation?(
    document: Document,
    profile: import("../../profile/model").Profile,
    signal: AbortSignal,
  ): Promise<boolean>;
  educationPreparationActionId?: string;
  executeStateDriver?(
    document: Document,
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
    signal: AbortSignal,
    onFailure?: FailureReporter,
    beforeMutation?: () => Promise<boolean>,
  ): Promise<boolean | undefined>;
  canSelectProfileOption?(
    handle: ActionCandidateHandle,
    profileValue: string,
    profileFieldKey?: string,
  ): boolean | undefined;
  canWriteProfileOption?(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
  ): boolean | undefined;

  runAddress?(
    options: import("../address/types").AddressExecutionOptions,
  ): Promise<import("../address/types").AddressResult>;
  // The detail field must never be written without its verified search.
  addressRequiresSearch?: boolean;
  diagnosticsTitle?: string;
  repeatedProfileSectionHint?(actionDomId: string | undefined):
    | {
        categoryId: RepeatedProfileCategoryId;
        sectionId: string;
      }
    | undefined;
  repeatableProfileCount?(
    actionDomId: string | undefined,
    profile: Profile,
    /** Kinds with a stored file or link (an attachment row's add). */
    attachments?: ReadonlySet<LinkKind>,
  ): number | null | undefined;
  /** Kind and label of file inputs the generic attachment walk cannot place. */
  attachmentFieldHint?: AttachmentFieldHint;
  followUpRepeatableAction?(actionDomId: string | undefined): boolean;
  /** Opt-in: a failed non-native driver ends only itself; later drivers of
   * the same stage still run (the failed one is deferred as usual). */
  continueAfterDriverFailure?(
    item: ReviewPlanItem,
    handle: FieldCandidateHandle,
  ): boolean;
  /** Bounded wait for the page's reaction to a preparation click, before the refresh. */
  settlePreparationAction?(document: Document): Promise<void>;
  freshDefaultAfterAdd?(handle: ActionCandidateHandle): Element | undefined;
  educationSectionHint?(
    matchLabel: string,
  ): "highSchool" | "university" | "graduateSchool" | undefined;
  hasFreshRows(items: readonly FreshRowPreparation[]): boolean;
  isFreshRowDefault(domName: string | undefined): boolean;
  isStateDriver(item: ReviewPlanItem, domName: string | undefined): boolean;
  stateDriverStage?(
    item: ReviewPlanItem,
    handle: FieldCandidateHandle,
  ): number | undefined;
  waitForStateDriverReady?(
    document: Document,
    handle: FieldCandidateHandle,
    onFailure?: FailureReporter,
    context?: StateDriverContext,
  ): Promise<boolean>;
  settleStateDriver?(
    document: Document,
    handle: FieldCandidateHandle,
    onFailure?: FailureReporter,
    context?: StateDriverContext,
  ): Promise<boolean>;
  stateDriverFailureTargets?(
    item: ReviewPlanItem,
    handle: FieldCandidateHandle,
  ): Element[] | undefined;
  // Opt-in only: a failed search may defer its whole independently bound row.
  stateDriverFailureGroup?(
    item: ReviewPlanItem,
    handle: FieldCandidateHandle,
  ): Element | undefined;
  revealSelections: readonly RevealSelection[];
  selectReveal(
    document: Document,
    selection: RevealSelection,
    profileValue: string | undefined,
  ): WorkflowDiagnostic;
  revealedBindings(
    plans: readonly PreparationPlan[],
  ): ReadonlyMap<string, string>;
  revealedProfileFieldKey(
    field: MatchedFieldAnalysis,
    domName: string | undefined,
    bindings: ReadonlyMap<string, string>,
  ): string | undefined;
}

export interface StateDriverContext {
  readonly item: ReviewPlanItem;
  readonly signal: AbortSignal;
  readonly beforeMutation?: () => Promise<boolean>;
}

const genericWorkflowAdapter: WorkflowAdapter = {
  hasFreshRows: () => false,
  isFreshRowDefault: () => false,
  isStateDriver: () => false,
  revealSelections: [],
  selectReveal: () => ({ code: "TARGET_MISSING", count: 0 }),
  revealedBindings: () => new Map(),
  revealedProfileFieldKey: () => undefined,
};

const hplaceWorkflowAdapter: WorkflowAdapter = {
  ...genericWorkflowAdapter,
  prefersProfileValue: (handle, analysis) =>
    prefersBasicProfileValue(handle, analysis) ||
    prefersV1ProfileValue(handle, analysis) ||
    prefersV1HistoryProfileValue(handle, analysis),
  isStateDriver: (item, name) =>
    isRegistrationItem(item, name) ||
    isBasicStateDriver(item, name) ||
    isV1StateDriver(item, name) ||
    isV1HistoryStateDriver(item, name) ||
    isV1ExtraStateDriver(item, name),
  stateDriverStage: (item, handle) =>
    (ownedBasicControl(handle) &&
      isBasicStateDriver(item, handle.candidate.domName)) ||
    (ownedV1Control(handle) &&
      isV1StateDriver(item, handle.candidate.domName)) ||
    (ownedV1HistoryControl(handle) &&
      isV1HistoryStateDriver(item, handle.candidate.domName)) ||
    (ownedV1ExtraControl(handle) &&
      isV1ExtraStateDriver(item, handle.candidate.domName))
      ? 1
      : undefined,
  settleStateDriver: (_document, handle, _report, context) =>
    handle.candidate.domName?.startsWith("hplace.detail.")
      ? settleBasicStateDriver(handle, context?.signal, context?.item)
      : isV1HistoryHandle(handle)
        ? settleV1HistoryStateDriver(handle, context?.signal, context?.item)
        : isV1ExtraHandle(handle)
          ? settleV1ExtraStateDriver(handle, context?.item)
          : handle.candidate.domName?.startsWith("hplace.v1.")
            ? settleV1StateDriver(handle, context?.signal, context?.item)
            : Promise.resolve(
                !!context &&
                  settleRegistration(handle, context.item, context.signal),
              ),
  stateDriverFailureGroup: (item, handle) =>
    isBasicStateDriver(item, handle.candidate.domName)
      ? (handle.elements[0]?.closest(".subject") ?? undefined)
      : (v1DriverRow(item, handle) ?? v1HistoryDriverRow(item, handle)),
  executeStateDriver: (
    document,
    handle,
    item,
    signal,
    report,
    beforeMutation,
  ) =>
    ownedBasicControl(handle)
      ? writeBasic(handle, item, () => !signal.aborted, beforeMutation)
      : ownedV1ExtraControl(handle)
        ? ownedV1ExtraControl(handle)?.spec.kind === "search"
          ? writeV1ExtraSearch(
              handle,
              item,
              () => !signal.aborted,
              beforeMutation,
            ).then(({ written, code }) => {
              if (!written && code) report?.(code);
              return written;
            })
          : writeV1Extra(
              handle,
              item,
              () => !signal.aborted,
              beforeMutation,
            ).then((result) => {
              if (result === "option-unmatched") report?.("OPTION_UNMATCHED");
              return result === "written";
            })
        : ownedV1HistoryControl(handle)?.spec.kind === "search"
          ? writeV1HistorySearch(
              handle,
              item,
              () => !signal.aborted,
              beforeMutation,
            ).then(({ written, code }) => {
              if (!written && code) report?.(code);
              return written;
            })
          : ownedV1HistoryControl(handle)
            ? writeV1History(
                handle,
                item,
                () => !signal.aborted,
                beforeMutation,
              ).then((result) => {
                if (result === "option-unmatched") report?.("OPTION_UNMATCHED");
                return result === "written";
              })
            : ownedV1Control(handle)
              ? writeV1(
                  handle,
                  item,
                  () => !signal.aborted,
                  beforeMutation,
                ).then((result) => {
                  if (result === "option-unmatched")
                    report?.("OPTION_UNMATCHED");
                  return result === "written";
                })
              : writeRegistration(
                  document,
                  handle,
                  item,
                  signal,
                  report,
                  beforeMutation,
                ),
  // v1 step 2: one card per profile entry of the level (CF-509); step 3:
  // one 자격증 / 외국어활용능력 row per profile entry (CF-510).
  repeatableProfileCount: (actionDomId, profile, attachments) =>
    v1ExtraProfileCount(actionDomId, profile) ??
    v1HistoryProfileCount(actionDomId, profile, attachments),
  settlePreparationAction: async (document) => {
    await settleV1HistoryAdd(document);
    await settleV1ExtraAdd(document);
  },
  attachmentFieldHint: v1AttachmentFieldHint,
  // A failed v1 step-2 search defers only its own field (CF-509).
  continueAfterDriverFailure: (_item, handle) =>
    isV1HistorySearchHandle(handle) || isV1ExtraSearchHandle(handle),
  // ...and one whose input is already gone defers its re-located row.
  stateDriverFailureTargets: (_item, handle) =>
    v1HistorySearchFailureTargets(handle) ??
    v1ExtraSearchFailureTargets(handle),
  // The per-card major add runs in the follow-up preparation, after the
  // cards it belongs to exist.
  followUpRepeatableAction: isV1HistoryMajorAdd,
};

function resolveWorkflowAdapter(source: string | Document): WorkflowAdapter {
  if (typeof source !== "string") {
    const configured = hiddenCodeAdapters(source);
    if (configured) return configured.workflow;
  }
  if (typeof source !== "string" && executionPolicy(source)?.browserPolicy) {
    const policy = policyWorkflowAdapter(source);
    if (executionPolicy(source)?.browserPolicy?.schemaVersion !== 2)
      return policy;
    return {
      ...policy,
      prefersProfileValue: (handle, analysis) =>
        handle.owner === "legacy"
          ? prefersBasicProfileValue(handle, analysis)
          : policy.prefersProfileValue?.(handle, analysis) === true,
      isStateDriver: (item, name) =>
        hplaceWorkflowAdapter.isStateDriver(item, name) ||
        policy.isStateDriver(item, name),
      stateDriverStage: (item, handle) =>
        handle.owner === "legacy"
          ? hplaceWorkflowAdapter.stateDriverStage?.(item, handle)
          : policy.stateDriverStage?.(item, handle),
      executeStateDriver: (...args) =>
        args[1].owner === "legacy"
          ? hplaceWorkflowAdapter.executeStateDriver!(...args)
          : policy.executeStateDriver!(...args),
      settleStateDriver: (...args) =>
        args[1].owner === "legacy"
          ? hplaceWorkflowAdapter.settleStateDriver!(...args)
          : policy.settleStateDriver!(...args),
      stateDriverFailureGroup: (item, handle) =>
        handle.owner === "legacy"
          ? hplaceWorkflowAdapter.stateDriverFailureGroup?.(item, handle)
          : policy.stateDriverFailureGroup?.(item, handle),
    };
  }
  switch (
    typeof source === "string"
      ? resolveCompany(source)
      : resolveDocumentCompany(source)
  ) {
    case "hplace":
      return hplaceWorkflowAdapter;
    case "components":
      return typeof source === "string"
        ? genericWorkflowAdapter
        : componentWorkflowAdapter(source);
    case "policy":
    case "generic":
      return genericWorkflowAdapter;
  }
}

export function getWorkflowAdapter(source: string | Document): WorkflowAdapter {
  const adapter = resolveWorkflowAdapter(source);
  if (
    import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS !== "1" ||
    import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080"
  )
    return adapter;
  return {
    ...adapter,
    ...(adapter.executeStateDriver
      ? {
          executeStateDriver: async (
            ...args: Parameters<
              NonNullable<WorkflowAdapter["executeStateDriver"]>
            >
          ) => {
            const finish = startLocalTiming("driver-execute", {
              field: args[1].candidate.domName ?? "",
              command: args[2].analysis?.writePlan?.command ?? "",
            });
            try {
              return await adapter.executeStateDriver!(...args);
            } finally {
              finish();
            }
          },
        }
      : {}),
    ...(adapter.waitForStateDriverReady
      ? {
          waitForStateDriverReady: async (
            ...args: Parameters<
              NonNullable<WorkflowAdapter["waitForStateDriverReady"]>
            >
          ) => {
            const finish = startLocalTiming("driver-ready", {
              field: args[1].candidate.domName ?? "",
            });
            try {
              return await adapter.waitForStateDriverReady!(...args);
            } finally {
              finish();
            }
          },
        }
      : {}),
    ...(adapter.settleStateDriver
      ? {
          settleStateDriver: async (
            ...args: Parameters<
              NonNullable<WorkflowAdapter["settleStateDriver"]>
            >
          ) => {
            const finish = startLocalTiming("driver-settle", {
              field: args[1].candidate.domName ?? "",
            });
            try {
              return await adapter.settleStateDriver!(...args);
            } finally {
              finish();
            }
          },
        }
      : {}),
  };
}
