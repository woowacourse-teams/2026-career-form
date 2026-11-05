import { useEffect, useRef } from "react";
import type { Profile } from "../../profile/model";
import type { FieldsAnalyzeRequest } from "../api/types";
import type { CollectedSnapshot } from "../dom/collect";
import type { GenericSectionResult } from "../generic/generic-analysis";
import {
  emitReviewDiagnostics,
  localDiagnosticsEnabled,
  type ReviewDiagnosticContext,
} from "../generic/review-diagnostics";
import { segmentGenericSections } from "../generic/section-segments";
import type { ReviewPlanItem } from "../review/review-plan";
import type { Stage } from "./workflow-model";

const FIELD_ATTRIBUTE = "data-careerform-diagnostic-field";

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
  const ordinals = new Map(
    candidates.map((candidate, index) => [candidate.candidateId, index]),
  );
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
        fieldOrdinal: ordinals.get(field.candidate.candidateId) ?? null,
        pageSectionOrdinal: index,
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
  profile?: Profile,
) {
  const sections = useRef<readonly GenericSectionResult[]>([]);
  const contexts = useRef<
    ReadonlyMap<string, ReviewDiagnosticContext> | undefined
  >(undefined);
  const emittedSnapshot = useRef<
    CollectedSnapshot<FieldsAnalyzeRequest> | undefined
  >(undefined);
  const enabled = companyId === "generic" && localDiagnosticsEnabled();

  useEffect(() => {
    if (!enabled || stage !== "review" || !snapshot) {
      emittedSnapshot.current = undefined;
      return;
    }
    // Annotation happens only after product collection and analysis. The
    // snapshot-wide ordinal survives review filtering/sorting; observers join
    // previously pregraded elements by this marker, never by review DOM order.
    const nextContexts = reviewDiagnosticContexts(
      snapshot,
      document,
      sections.current,
    );
    const targets = new Map<string, Element[]>();
    const uses = new Map<Element, number>();
    for (const [id] of nextContexts) {
      const lookup = snapshot.registry.lookupField(id);
      if (!("handle" in lookup)) continue;
      const elements = [
        ...new Set<Element>([
          ...lookup.handle.elements,
          ...(lookup.handle.customElements ?? []),
        ]),
      ];
      targets.set(id, elements);
      for (const element of elements)
        uses.set(element, (uses.get(element) ?? 0) + 1);
    }
    const owned = new Map<Element, string>();
    for (const [id, context] of nextContexts) {
      const elements = targets.get(id) ?? [];
      if (
        context.fieldOrdinal === null ||
        !elements.length ||
        elements.some(
          (element) =>
            !element.isConnected ||
            element.hasAttribute(FIELD_ATTRIBUTE) ||
            uses.get(element) !== 1,
        )
      ) {
        context.fieldOrdinal = null;
        continue;
      }
      const ordinal = String(context.fieldOrdinal);
      for (const element of elements) {
        element.setAttribute(FIELD_ATTRIBUTE, ordinal);
        owned.set(element, ordinal);
      }
    }
    contexts.current = nextContexts;
    return () => {
      for (const [element, ordinal] of owned) {
        if (element.getAttribute(FIELD_ATTRIBUTE) === ordinal)
          element.removeAttribute(FIELD_ATTRIBUTE);
      }
      contexts.current = undefined;
    };
  }, [stage, enabled, snapshot, document]);

  useEffect(() => {
    if (
      !enabled ||
      stage !== "review" ||
      !snapshot ||
      !contexts.current ||
      emittedSnapshot.current === snapshot
    )
      return;
    emittedSnapshot.current = snapshot;
    emitReviewDiagnostics(items, contexts.current, profile);
  }, [stage, enabled, items, snapshot, profile]);
  return (_grades: unknown, nextSections: readonly GenericSectionResult[]) => {
    sections.current = nextSections;
  };
}
