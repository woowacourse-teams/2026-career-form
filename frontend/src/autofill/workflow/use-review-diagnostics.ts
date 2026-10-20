import { useEffect, useRef } from "react";
import type { FieldsAnalyzeRequest } from "../api/types";
import type { CollectedSnapshot } from "../dom/collect";
import type { GenericSectionResult } from "../generic/generic-analysis";
import {
  emitReviewDiagnostics,
  type ReviewDiagnosticContext,
} from "../generic/review-diagnostics";
import { segmentGenericSections } from "../generic/section-segments";
import type { ReviewPlanItem } from "../review/review-plan";
import type { Stage } from "./workflow-model";

/** Uses the same segmentation inputs and gs ordering as analyzeGenericFields. */
export function reviewDiagnosticContexts(
  snapshot: CollectedSnapshot<FieldsAnalyzeRequest>,
  document: Document,
  sections: readonly GenericSectionResult[],
): ReadonlyMap<string, ReviewDiagnosticContext> {
  const candidates = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const fields = candidates.flatMap((candidate) => {
    const lookup = snapshot.registry.lookupField(candidate.candidateId);
    if (!("handle" in lookup)) return [];
    const handle = lookup.handle;
    const element = handle.elements[0] ?? handle.customElements?.[0];
    return element
      ? [
          {
            element,
            label: candidate.displayName,
            control: candidate.control,
            candidate,
            itemIndex: handle.itemIndex,
            structureStage: handle.itemGroupId?.split(":stage:")[1],
          },
        ]
      : [];
  });
  const categories = new Map(
    sections.map((section) => [section.sectionId, section.category]),
  );
  const contexts = new Map<string, ReviewDiagnosticContext>();
  segmentGenericSections(document, fields).forEach((section, index) => {
    for (const field of section.fields) {
      contexts.set(field.candidate.candidateId, {
        candidate: field.candidate,
        sectionCategory: categories.get(`gs${index + 1}`) ?? "none",
        repeatRowIndex:
          field.candidate.semanticContext?.repeat?.rowIndex ??
          field.itemIndex ??
          null,
      });
    }
  });
  return contexts;
}

export function useReviewDiagnostics(
  stage: Stage,
  companyId: string,
  items: readonly ReviewPlanItem[],
  snapshot: CollectedSnapshot<FieldsAnalyzeRequest> | undefined,
  document: Document,
) {
  const sections = useRef<readonly GenericSectionResult[]>([]);
  const inReview = useRef(false);
  useEffect(() => {
    if (stage !== "review") {
      inReview.current = false;
      return;
    }
    if (inReview.current || companyId !== "generic" || !snapshot) return;
    inReview.current = true;
    if (
      import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS !== "1" ||
      import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080"
    )
      return;
    emitReviewDiagnostics(
      items,
      reviewDiagnosticContexts(snapshot, document, sections.current),
    );
  }, [stage, companyId, items, snapshot, document]);
  return (_grades: unknown, nextSections: readonly GenericSectionResult[]) => {
    sections.current = nextSections;
  };
}
