import type { Profile } from "../../profile/model";
import type {
  AnalysisApiClient,
  FieldAnalysis,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  GenericFieldsResponse,
  NoMatchFieldAnalysis,
  SectionClassifyRequest,
  SectionControlKind,
} from "../api/types";
import type { CollectedSnapshot } from "../dom/collect";
import { resolveProfileFieldValue } from "../review/review-plan";
import {
  gradeGenericField,
  type FieldGrade,
  type GradeReason,
  type GradeSibling,
} from "./field-grading";
import {
  segmentGenericSections,
  type GenericSection,
} from "./section-segments";

/** Why every field of one section is BLOCKED. */
export const GENERIC_SECTION_FAILURE = {
  CLASSIFY_UNAVAILABLE: "CLASSIFY_UNAVAILABLE",
  ANALYZE_UNAVAILABLE: "ANALYZE_UNAVAILABLE",
  /** HTTP 404 from a backend without the generic endpoints. */
  ENDPOINT_UNAVAILABLE: "ENDPOINT_UNAVAILABLE",
  /** The backend returned the field with reason LLM_UNAVAILABLE. */
  LLM_UNAVAILABLE: "LLM_UNAVAILABLE",
  /** A local exception while preparing or converting this section. */
  SECTION_PROCESSING_FAILED: "SECTION_PROCESSING_FAILED",
} as const;

export type GenericSectionFailure =
  (typeof GENERIC_SECTION_FAILURE)[keyof typeof GENERIC_SECTION_FAILURE];

export interface GenericFieldGrade {
  grade: FieldGrade;
  reason?: GradeReason | GenericSectionFailure;
}

export interface GenericSectionResult {
  sectionId: string;
  title?: string;
  category?: string;
  blockedReason?: GenericSectionFailure;
}

export interface GenericAnalysisResult {
  analysis: FieldsAnalyzeResponse;
  /** Grades of matched or blocked fields; unmatched fields have none. */
  grades: ReadonlyMap<string, GenericFieldGrade>;
  sections: readonly GenericSectionResult[];
}

export type GenericAnalysisApi = Required<
  Pick<AnalysisApiClient, "classifySections" | "analyzeGenericFields">
>;

type ResponseField = Omit<
  GenericFieldsResponse["fields"][number],
  "candidateId"
>;

interface SectionOutcome {
  category: string;
  /** In the section's field order, so equal sections reuse it by position. */
  fields: readonly ResponseField[];
}

/** Results of one workflow run; dropped when the page URL changes. */
export interface GenericAnalysisCache {
  url?: string;
  readonly sections: Map<string, SectionOutcome>;
}

export function createGenericAnalysisCache(): GenericAnalysisCache {
  return { sections: new Map() };
}

interface SegmentField {
  element: Element;
  label?: string;
  control: string;
  candidate: FieldCandidate;
  itemIndex?: number;
}

interface SectionEntry {
  section: GenericSection<SegmentField>;
  sectionId: string;
  key: string;
}

// Classification request limits of the backend contract.
const MAX_LABELS = 32;
const MAX_LABEL_LENGTH = 200;
const MAX_TITLE_LENGTH = 200;
const MAX_DISPLAY_NAME_LENGTH = 120;
const UNCONFIRMED_CATEGORIES = new Set(["MIXED", "ABSTAIN"]);

function controlKind(candidate: FieldCandidate): SectionControlKind {
  switch (candidate.control) {
    case "text": {
      const inputType = candidate.semanticContext?.inputType;
      return inputType === "date" || inputType === "month" ? "DATE" : "TEXT";
    }
    case "textarea":
      return "TEXTAREA";
    case "select":
      return "SELECT";
    case "radio":
      return "RADIO";
    case "checkbox":
      return "CHECKBOX";
    case "button":
      return "BUTTON";
    default:
      return "OTHER";
  }
}

/** Structure and field state only; equal keys share one analysis result. */
function cacheKey(section: GenericSection<SegmentField>): string {
  return JSON.stringify([
    section.fingerprint,
    section.title ?? "",
    section.parentTitle ?? "",
    section.boundary === "repeat-row",
    section.fields.map(({ candidate }) => [
      candidate.visibility,
      candidate.disabled === true,
      candidate.readonly === true,
      candidate.inert === true,
    ]),
  ]);
}

function failureOf(
  error: unknown,
  fallback: GenericSectionFailure,
): GenericSectionFailure {
  return typeof error === "object" &&
    error !== null &&
    (error as { status?: unknown }).status === 404
    ? GENERIC_SECTION_FAILURE.ENDPOINT_UNAVAILABLE
    : fallback;
}

function noMatch(candidateId: string): NoMatchFieldAnalysis {
  return {
    candidateId,
    matchType: "NO_MATCH",
    mappingStatus: "LLM_SUGGESTED",
    interactionStatus: "BLOCKED",
    reasonCodes: ["NO_MATCH"],
  };
}

function classifyEntry(
  entry: SectionEntry,
): SectionClassifyRequest["sections"][number] {
  const { section } = entry;
  return {
    sectionId: entry.sectionId,
    ...(section.title
      ? { title: section.title.slice(0, MAX_TITLE_LENGTH) }
      : {}),
    labels: section.fields
      .flatMap(({ candidate }) => candidate.displayName?.trim() || [])
      .slice(0, MAX_LABELS)
      .map((label) => label.slice(0, MAX_LABEL_LENGTH)),
    controlKinds: [
      ...new Set(section.fields.map(({ candidate }) => controlKind(candidate))),
    ],
    repeated: section.boundary === "repeat-row",
  };
}

function convertSection(
  entry: SectionEntry,
  outcome: SectionOutcome,
  profile: Profile,
): { fields: FieldAnalysis[]; grades: [string, GenericFieldGrade][] } {
  const { section } = entry;
  const categoryOpen = !UNCONFIRMED_CATEGORIES.has(outcome.category);
  const matched = section.fields.flatMap((field, index) => {
    const response = outcome.fields[index];
    if (!response) throw new Error("Section result does not match its fields");
    return response.profileFieldKey && response.reason === undefined
      ? [{ index, profileFieldKey: response.profileFieldKey, response }]
      : [];
  });
  const fields: FieldAnalysis[] = [];
  const grades: [string, GenericFieldGrade][] = [];
  section.fields.forEach(({ candidate, itemIndex }, index) => {
    const response = outcome.fields[index]!;
    const { candidateId } = candidate;
    if (response.reason === "LLM_UNAVAILABLE") {
      fields.push(noMatch(candidateId));
      grades.push([
        candidateId,
        { grade: "BLOCKED", reason: GENERIC_SECTION_FAILURE.LLM_UNAVAILABLE },
      ]);
      return;
    }
    const profileFieldKey = response.profileFieldKey;
    if (!profileFieldKey) {
      fields.push(noMatch(candidateId));
      return;
    }
    const rowSiblings: GradeSibling[] | undefined =
      section.boundary === "repeat-row"
        ? matched
            .filter((sibling) => sibling.index !== index)
            .map((sibling) => ({
              profileFieldKey: sibling.profileFieldKey,
              confidence: sibling.response.confidence,
            }))
        : undefined;
    const resolution = resolveProfileFieldValue(
      profile,
      profileFieldKey,
      itemIndex,
    ).status;
    grades.push([
      candidateId,
      gradeGenericField({
        profileFieldKey,
        confidence: response.confidence,
        categoryConfirmed: response.categoryConfirmed && categoryOpen,
        hasProfileValue:
          resolution === "resolved" || resolution === "ambiguous",
        control: candidate.control,
        inputType: candidate.semanticContext?.inputType,
        options: candidate.options,
        rowSiblings,
      }),
    ]);
    fields.push({
      candidateId,
      matchType: "MATCH",
      valueBinding: { type: "DIRECT", profileFieldKey },
      autofillPolicy: response.autofillPolicy!,
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: response.interactionStatus,
      ...(response.writePlan ? { writePlan: response.writePlan } : {}),
    });
  });
  return { fields, grades };
}

/**
 * Generic-document field analysis: split sections, classify changed sections
 * once, match their fields by category once, grade each match locally, and
 * convert the result to the shared analysis shape. A failure blocks only the
 * sections it touches. Requests carry collected structure only: never profile
 * values, current input values or profile item counts.
 */
export async function analyzeGenericFields(
  snapshot: CollectedSnapshot<FieldsAnalyzeRequest>,
  document: Document,
  api: GenericAnalysisApi,
  profile: Profile,
  cache: GenericAnalysisCache,
): Promise<GenericAnalysisResult> {
  if (cache.url !== document.URL) {
    cache.sections.clear();
    cache.url = document.URL;
  }
  const { request } = snapshot;
  const candidates = request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const segmentFields: SegmentField[] = [];
  const orphans = new Set<string>();
  for (const candidate of candidates) {
    const lookup = snapshot.registry.lookupField(candidate.candidateId);
    const handle =
      lookup.status === "ready" || lookup.status === "blocked"
        ? lookup.handle
        : undefined;
    const element = handle?.elements[0] ?? handle?.customElements?.[0];
    if (!handle || !element) orphans.add(candidate.candidateId);
    else
      segmentFields.push({
        element,
        label: candidate.displayName,
        control: candidate.control,
        candidate,
        itemIndex: handle.itemIndex,
      });
  }
  const entries: SectionEntry[] = segmentGenericSections(
    document,
    segmentFields,
  ).map((section, index) => ({
    section,
    sectionId: `gs${index + 1}`,
    key: cacheKey(section),
  }));

  const outcomes = new Map<string, SectionOutcome>();
  const failures = new Map<string, GenericSectionFailure>();
  const pending = new Map<string, SectionEntry>();
  for (const entry of entries) {
    const cached = cache.sections.get(entry.key);
    if (cached) outcomes.set(entry.key, cached);
    else if (!pending.has(entry.key)) pending.set(entry.key, entry);
  }

  let blocked = false;
  const classifyEntries: SectionClassifyRequest["sections"] = [];
  const toClassify: SectionEntry[] = [];
  for (const entry of pending.values()) {
    try {
      classifyEntries.push(classifyEntry(entry));
      toClassify.push(entry);
    } catch {
      failures.set(
        entry.key,
        GENERIC_SECTION_FAILURE.SECTION_PROCESSING_FAILED,
      );
    }
  }
  const categories = new Map<string, string>();
  if (toClassify.length > 0) {
    try {
      const response = await api.classifySections({
        schemaVersion: 1,
        snapshotId: request.snapshotId,
        site: request.site,
        sections: classifyEntries,
      });
      if (response.status !== "COMPLETE") blocked = true;
      const byId = new Map(
        response.sections.map((section) => [
          section.sectionId,
          section.category,
        ]),
      );
      for (const entry of toClassify) {
        const category = byId.get(entry.sectionId);
        if (category === undefined)
          failures.set(entry.key, GENERIC_SECTION_FAILURE.CLASSIFY_UNAVAILABLE);
        else categories.set(entry.key, category);
      }
    } catch (error) {
      for (const entry of toClassify)
        failures.set(
          entry.key,
          failureOf(error, GENERIC_SECTION_FAILURE.CLASSIFY_UNAVAILABLE),
        );
    }
  }

  const toAnalyze = toClassify.filter((entry) => categories.has(entry.key));
  if (!blocked && toAnalyze.length > 0) {
    try {
      const response = await api.analyzeGenericFields({
        schemaVersion: 2,
        ...(request.supportedWriteCommands
          ? { supportedWriteCommands: request.supportedWriteCommands }
          : {}),
        snapshotId: request.snapshotId,
        site: request.site,
        sections: toAnalyze.map((entry) => ({
          sectionId: entry.sectionId,
          ...(entry.section.title
            ? {
                displayName: entry.section.title.slice(
                  0,
                  MAX_DISPLAY_NAME_LENGTH,
                ),
              }
            : {}),
          fields: entry.section.fields.map(({ candidate }) => candidate),
          category: categories.get(entry.key)!,
        })),
      });
      if (response.status !== "COMPLETE") blocked = true;
      const byId = new Map(
        response.fields.map(({ candidateId, ...field }) => [
          candidateId,
          field,
        ]),
      );
      for (const entry of toAnalyze) {
        const fields = entry.section.fields.map(({ candidate }) =>
          byId.get(candidate.candidateId),
        );
        if (blocked) continue;
        if (fields.some((field) => field === undefined)) {
          failures.set(
            entry.key,
            GENERIC_SECTION_FAILURE.SECTION_PROCESSING_FAILED,
          );
          continue;
        }
        const outcome: SectionOutcome = {
          category: categories.get(entry.key)!,
          fields: fields as ResponseField[],
        };
        outcomes.set(entry.key, outcome);
        if (!outcome.fields.some((field) => field.reason))
          cache.sections.set(entry.key, outcome);
      }
    } catch (error) {
      for (const entry of toAnalyze)
        failures.set(
          entry.key,
          failureOf(error, GENERIC_SECTION_FAILURE.ANALYZE_UNAVAILABLE),
        );
    }
  }

  if (blocked)
    return {
      analysis: {
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "BLOCKED",
        fields: candidates.map(({ candidateId }) => noMatch(candidateId)),
      },
      grades: new Map(),
      sections: entries.map(({ sectionId, section }) => ({
        sectionId,
        ...(section.title ? { title: section.title } : {}),
      })),
    };

  const analyses = new Map<string, FieldAnalysis>();
  const grades = new Map<string, GenericFieldGrade>();
  const sections: GenericSectionResult[] = [];
  let llmUnavailable = false;
  for (const entry of entries) {
    const outcome = outcomes.get(entry.key);
    let blockedReason: GenericSectionFailure | undefined =
      failures.get(entry.key) ??
      (outcome ? undefined : GENERIC_SECTION_FAILURE.SECTION_PROCESSING_FAILED);
    if (!blockedReason && outcome) {
      try {
        const converted = convertSection(entry, outcome, profile);
        converted.fields.forEach((field) =>
          analyses.set(field.candidateId, field),
        );
        converted.grades.forEach(([candidateId, grade]) =>
          grades.set(candidateId, grade),
        );
        if (outcome.fields.some((field) => field.reason)) {
          llmUnavailable = true;
          blockedReason = GENERIC_SECTION_FAILURE.LLM_UNAVAILABLE;
        }
      } catch {
        blockedReason = GENERIC_SECTION_FAILURE.SECTION_PROCESSING_FAILED;
      }
    }
    if (
      blockedReason &&
      blockedReason !== GENERIC_SECTION_FAILURE.LLM_UNAVAILABLE
    )
      for (const { candidate } of entry.section.fields) {
        analyses.set(candidate.candidateId, noMatch(candidate.candidateId));
        grades.set(candidate.candidateId, {
          grade: "BLOCKED",
          reason: blockedReason,
        });
      }
    sections.push({
      sectionId: entry.sectionId,
      ...(entry.section.title ? { title: entry.section.title } : {}),
      ...(outcome || categories.has(entry.key)
        ? { category: outcome?.category ?? categories.get(entry.key) }
        : {}),
      ...(blockedReason ? { blockedReason } : {}),
    });
  }
  for (const candidateId of orphans)
    grades.set(candidateId, {
      grade: "BLOCKED",
      reason: GENERIC_SECTION_FAILURE.SECTION_PROCESSING_FAILED,
    });

  return {
    analysis: {
      snapshotId: request.snapshotId,
      mode: "GENERIC",
      analysisStatus:
        orphans.size > 0 || sections.some((section) => section.blockedReason)
          ? "PARTIAL"
          : "COMPLETE",
      fields: candidates.map(
        ({ candidateId }) => analyses.get(candidateId) ?? noMatch(candidateId),
      ),
      ...(llmUnavailable ? { warningCodes: ["LLM_UNAVAILABLE" as const] } : {}),
    },
    grades,
    sections,
  };
}
