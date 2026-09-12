import type { Dispatch, SetStateAction } from "react";
import type { WorkflowAdapter, WorkflowDiagnostic } from "../adapters/workflow";
import type { AnalysisApiClient } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  resolveProfileFieldValue,
  type ReviewPlanItem,
} from "../review/review-plan";
import { executeApprovedWrites } from "../write/executor";
import { requiresSensitiveConfirmation } from "../profile/sensitive-confirmation";
import type { Profile } from "../../profile/model";
import { adapterProfileValue, type PreparationItem } from "./workflow-model";

interface RevealedFieldsContext {
  adapter: WorkflowAdapter;
  apiClient: AnalysisApiClient;
  pageDocument: Document;
  setWorkflowDiagnostics: Dispatch<SetStateAction<WorkflowDiagnostic[]>>;
}

export function createWriteRevealedFields({
  adapter,
  apiClient,
  pageDocument,
  setWorkflowDiagnostics,
}: RevealedFieldsContext) {
  const writeRevealedFields = async (
    loadedProfile: Profile,
    plans: readonly PreparationItem[],
  ) => {
    const revealedFieldBindings = adapter.revealedBindings(
      plans.map((item) => item.plan),
    );
    if (revealedFieldBindings.size === 0) return;
    const diagnostics: WorkflowDiagnostic[] = [
      { code: "FOLLOW_UP_BINDINGS", count: revealedFieldBindings.size },
    ];

    const snapshot = collectFieldsSnapshot(pageDocument);
    const analysis = await apiClient.analyzeFields(snapshot.request);
    if (analysis.analysisStatus === "BLOCKED") {
      setWorkflowDiagnostics([
        ...diagnostics,
        { code: "ANALYSIS_BLOCKED", count: 1 },
      ]);
      return;
    }

    const items = analysis.fields.flatMap((field) => {
      if (field.matchType !== "MATCH" || field.interactionStatus !== "READY")
        return [];
      const lookup = snapshot.registry.lookupField(field.candidateId);
      if (lookup.status !== "ready") return [];
      const domName =
        lookup.handle.candidate.domName ?? lookup.handle.candidate.domId;
      const profileFieldKey = adapter.revealedProfileFieldKey(
        field,
        domName,
        revealedFieldBindings,
      );
      if (!profileFieldKey) return [];
      // Resolve a sole saved entry independently of template-based DOM row indices.
      // Multiple saved entries remain ambiguous in the common profile resolver.
      const resolved = resolveProfileFieldValue(loadedProfile, profileFieldKey);
      // Only categories still requiring individual confirmation wait for review.
      // Military/veteran/disability details follow ordinary fresh-analysis writes.
      if (
        resolved.status !== "resolved" ||
        requiresSensitiveConfirmation(
          profileFieldKey,
          resolved.sensitive ||
            field.autofillPolicy === "SENSITIVE_CONFIRMATION",
        )
      )
        return [];
      const normalizedValue = adapterProfileValue(
        adapter,
        profileFieldKey,
        resolved.value,
      );
      const currentValue = lookup.handle.elements[0]?.value ?? "";
      if (currentValue.trim() && currentValue.trim() !== normalizedValue.trim())
        return [];
      return [
        {
          candidateId: field.candidateId,
          fieldLabel:
            lookup.handle.candidate.displayName ?? domName ?? "조건부 입력란",
          profileFieldKey,
          ...(resolved.profileEntryId
            ? { profileEntryId: resolved.profileEntryId }
            : {}),
          ...(lookup.handle.itemIndex !== undefined
            ? { itemIndex: lookup.handle.itemIndex }
            : {}),
          currentValue,
          profileValue: normalizedValue,
          previewValue: normalizedValue,
          status: "available" as const,
          selected: true,
          disabled: false,
          revealed: true,
          reason: "정책으로 연결된 조건부 입력란",
          analysis: field,
        } satisfies ReviewPlanItem,
      ];
    });
    diagnostics.push({ code: "ELIGIBLE_FIELDS", count: items.length });
    const results = executeApprovedWrites({
      items,
      approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
      registry: snapshot.registry,
    });
    diagnostics.push(
      {
        code: "WRITTEN",
        count: results.filter((result) => result.status === "written").length,
      },
      {
        code: "SKIPPED",
        count: results.filter((result) => result.status === "skipped").length,
      },
    );
    setWorkflowDiagnostics((previous) => [...previous, ...diagnostics]);
  };
  return writeRevealedFields;
}
