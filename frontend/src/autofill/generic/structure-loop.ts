import type { Profile, ProfileCategoryId } from "../../profile/model";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type {
  InteractionCandidate,
  InteractionRole,
  TargetKind,
} from "../api/interaction-types";
import type {
  AnalysisApiClient,
  FieldCandidate,
  SectionClassifyRequest,
  SectionControlKind,
} from "../api/types";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
  type PreparationCollectedSnapshot,
} from "../dom/collect";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../preparation/executor";
import {
  kindOfEntry,
  sectionOfKind,
  type EducationRowKind,
} from "../profile/education-row-kind";
import { genericRowFor } from "../dom/repeatable-rows";
import { acquireDocumentRun } from "../interaction/document-run";
import {
  bindGenericStructureRows,
  createGenericStructureContext,
  type GenericStructureContext,
} from "./structure-context";
import { isSafeStructuralClick } from "./click-policy";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
  type GenericAnalysisApi,
} from "./generic-analysis";
import { decideRowKindOptions } from "./row-kind-options";
import {
  segmentGenericSections,
  type GenericSection,
  type SegmentField,
} from "./section-segments";

/** Rows or openings one section may receive before the loop gives up on it. */
const MAX_ACTIONS_PER_SECTION = 10;
const MAX_FAILURES_PER_CANDIDATE = 2;
const MAX_ITERATIONS = 200;
const MAX_LABEL_LENGTH = 120;
const COLLECTION_OPTIONS = { mixedSectionDetection: false } as const;

export type StructureActionKind =
  "ADD_ROW" | "REVEAL_SECTION" | "SELECT_ROW_KIND";

/** What the loop did, with structure only: never a profile or input value. */
export interface StructureLoopAction {
  kind: StructureActionKind;
  sectionTitle?: string;
  result: "done" | "blocked";
  reason?: string;
  rowIndex?: number;
  rowsBefore?: number;
  rowsAfter?: number;
}

export interface RemainingPoint {
  kind: "ADD_ROW" | "REVEAL_SECTION" | "SELECT_ROW_KIND";
  sectionTitle?: string;
  category?: string;
  /** ADD_ROW only. */
  rows?: number;
  needed?: number;
  /** SELECT_ROW_KIND only. */
  rowIndex?: number;
}

export interface StructureLoopQuestion {
  role: Extract<
    InteractionRole,
    "REPEAT_ADD" | "SECTION_REVEAL" | "ROW_KIND_OPTION"
  >;
  /** Display names of the candidates that were asked about. */
  candidates: string[];
}

export interface StructureLoopSection {
  title?: string;
  category?: string;
  status: "OPEN" | "BLOCKED";
  reason?: string;
  blockedRows: number[];
}

export type StructureLoopStop =
  "NONE_REMAINING" | "NO_PROGRESS" | "ABORTED" | "ITERATION_LIMIT" | "FAILED";

export interface StructureLoopResult {
  context: GenericStructureContext;
  stopReason: StructureLoopStop;
  actions: StructureLoopAction[];
  sections: StructureLoopSection[];
  /** The remaining points computed before the first action. */
  initialRemaining: RemainingPoint[];
  questions: StructureLoopQuestion[];
}

export interface StructureLoopOptions {
  document: Document;
  profile: Profile;
  apiClient: AnalysisApiClient;
  signal?: AbortSignal;
  onAction?: (action: StructureLoopAction) => void;
}

type LoopField = SegmentField & { candidate: FieldCandidate };

interface RowGroup {
  key: string;
  title?: string;
  category?: string;
  rows: GenericSection<LoopField>[];
}

interface Observation {
  prep: PreparationCollectedSnapshot;
  groups: RowGroup[];
  fieldsSnapshot: ReturnType<typeof collectFieldsSnapshot>;
  fieldCount: number;
}

interface ActionRef {
  candidateId: string;
  element: HTMLElement;
  label: string;
  sectionId: string;
  rows?: number;
}

type Point =
  | { kind: "ADD_ROW"; group: RowGroup; needed: number; actions: ActionRef[] }
  | { kind: "REVEAL_SECTION"; action: ActionRef }
  | {
      kind: "SELECT_ROW_KIND";
      group: RowGroup;
      rowIndex: number;
      select: HTMLSelectElement;
    };

// Representative profile keys the interaction service accepts per category.
const REPEAT_KEYS: Partial<Record<ProfileCategoryId, string>> = {
  education: "education.university.schoolName",
  careers: "careers.career.companyName",
  certifications: "certifications.certificate.name",
  languages: "languages.languageTest.language",
};
const REVEAL_PRIORITY: readonly ProfileCategoryId[] = [
  "education",
  "careers",
  "certifications",
  "languages",
  "projects",
  "publications",
];
const TARGET_OF_ROW_KIND: Record<EducationRowKind, TargetKind> = {
  HIGH_SCHOOL: "HIGH_SCHOOL",
  JUNIOR_COLLEGE: "ASSOCIATE",
  UNIVERSITY: "BACHELOR",
  MASTER: "MASTER",
  DOCTOR: "DOCTOR",
};

function profileKeyOf(category: ProfileCategoryId): string | undefined {
  const known = REPEAT_KEYS[category];
  if (known) return known;
  const definition = PROFILE_CATEGORIES.find(({ id }) => id === category);
  const section = definition?.sections[0];
  const field = section?.fields[0];
  return section && field ? `${category}.${section.id}.${field.id}` : undefined;
}

function repeatedEntries(
  profile: Profile,
  category: string | undefined,
): number | undefined {
  if (!category) return undefined;
  const entries = (profile as unknown as Record<string, unknown>)[category];
  return Array.isArray(entries) ? entries.length : undefined;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function truncated(text: string): string {
  return text.slice(0, MAX_LABEL_LENGTH);
}

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

function visibleControlCount(document: Document): number {
  const view = document.defaultView;
  return Array.from(
    document.querySelectorAll("input, select, textarea"),
  ).filter((control) => {
    if (control.closest("[hidden], [aria-hidden='true' i]")) return false;
    for (let node: Element | null = control; node; node = node.parentElement)
      if (view?.getComputedStyle(node).display === "none") return false;
    return true;
  }).length;
}

function sectionCacheKey(section: GenericSection<LoopField>): string {
  return JSON.stringify([
    section.fingerprint,
    section.title ?? "",
    section.parentTitle ?? "",
    section.boundary === "repeat-row",
  ]);
}

/**
 * Generic-document structural loop: observe, take one allowed structural
 * action, verify, repeat. It adds repeated rows up to the local profile entry
 * count, opens collapsed sections and chooses education row kinds, never
 * clicking anything `isSafeStructuralClick` refuses and never asking the
 * server about the same control twice. A failure blocks only its section.
 */
export async function runGenericStructureLoop(
  options: StructureLoopOptions,
): Promise<StructureLoopResult> {
  const { document, profile, apiClient, signal, onAction } = options;
  const initialUrl = document.URL;
  const actions: StructureLoopAction[] = [];
  const questions: StructureLoopQuestion[] = [];
  const blocked = new Map<string, StructureLoopSection>();
  const classified = new Map<string, string>();
  const context = createGenericStructureContext();
  const groupScopes = new Map<string, Element>();
  const addDecision = new Map<string, Element | null>();
  const revealAsked = new WeakSet<Element>();
  const revealChosen = new WeakSet<Element>();
  const rowKindOptions = new Map<string, Map<TargetKind, string | null>>();
  const handledSelects = new WeakSet<Element>();
  const failures = new WeakMap<Element, number>();
  const lastFailure = new Map<string, string>();
  const actionCounts = new WeakMap<Element, number>();
  const sectionsSeen = new Map<string, StructureLoopSection>();
  const containerIds = new WeakMap<Element, string>();
  const containerId = (element: Element): string => {
    let id = containerIds.get(element);
    if (!id) {
      id = `container${containerCounter}`;
      containerCounter += 1;
      containerIds.set(element, id);
    }
    return id;
  };
  let containerCounter = 0;
  let initialRemaining: RemainingPoint[] | undefined;
  let stopReason: StructureLoopStop = "NONE_REMAINING";
  const actionScope = (element: Element): Element =>
    element.closest("section, fieldset, [role='group']") ??
    element.parentElement ??
    document.body;

  const record = (action: StructureLoopAction) => {
    actions.push(action);
    onAction?.(action);
  };
  const sectionOf = (group: RowGroup): StructureLoopSection => {
    const existing = sectionsSeen.get(group.key);
    if (existing) return existing;
    const created: StructureLoopSection = {
      ...(group.title ? { title: group.title } : {}),
      ...(group.category ? { category: group.category } : {}),
      status: "OPEN",
      blockedRows: [],
    };
    sectionsSeen.set(group.key, created);
    return created;
  };
  const blockKey = (key: string, reason: string) => {
    const section = sectionsSeen.get(key);
    if (!section || section.status === "BLOCKED") return;
    section.status = "BLOCKED";
    section.reason = reason;
    blocked.set(key, section);
    const scope = groupScopes.get(key);
    if (scope) context.blockedScopes.set(scope, reason);
    record({
      kind: "ADD_ROW",
      ...(section.title ? { sectionTitle: section.title } : {}),
      result: "blocked",
      reason,
    });
  };
  const blockGroup = (group: RowGroup, reason: string) => {
    sectionOf(group);
    blockKey(group.key, reason);
  };

  async function classify(
    entries: GenericSection<LoopField>[],
    snapshotId: string,
    site: PreparationCollectedSnapshot["request"]["site"],
  ): Promise<void> {
    const pending = new Map<string, GenericSection<LoopField>>();
    for (const section of entries) {
      const key = sectionCacheKey(section);
      if (!classified.has(key) && !pending.has(key)) pending.set(key, section);
    }
    if (pending.size === 0 || !apiClient.classifySections) return;
    const sections: SectionClassifyRequest["sections"] = [];
    const idToKey = new Map<string, string>();
    [...pending].forEach(([key, section], index) => {
      const sectionId = `ls${index + 1}`;
      idToKey.set(sectionId, key);
      sections.push({
        sectionId,
        ...(section.title ? { title: truncated(section.title) } : {}),
        labels: section.fields
          .flatMap(({ candidate }) => candidate.displayName?.trim() || [])
          .slice(0, 32)
          .map((label) => label.slice(0, 200)),
        controlKinds: [
          ...new Set(
            section.fields.map(({ candidate }) => controlKind(candidate)),
          ),
        ],
        repeated: section.boundary === "repeat-row",
      });
    });
    try {
      const response = await apiClient.classifySections({
        schemaVersion: 1,
        snapshotId,
        site,
        sections,
      });
      if (response.status !== "COMPLETE") return;
      for (const { sectionId, category } of response.sections) {
        const key = idToKey.get(sectionId);
        if (key) classified.set(key, category);
      }
    } catch {
      // Unclassified groups are reported as blocked below.
    }
  }

  async function observe(): Promise<Observation> {
    const prep = collectPreparationSnapshot(document, COLLECTION_OPTIONS);
    const fieldsSnapshot = collectFieldsSnapshot(
      document,
      undefined,
      COLLECTION_OPTIONS,
    );
    const fields = new Map<string, LoopField>();
    for (const section of fieldsSnapshot.request.sections)
      for (const candidate of [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ]) {
        if (fields.has(candidate.candidateId)) continue;
        const lookup = fieldsSnapshot.registry.lookupField(
          candidate.candidateId,
        );
        const handle =
          lookup.status === "ready" || lookup.status === "blocked"
            ? lookup.handle
            : undefined;
        const element = handle?.elements[0] ?? handle?.customElements?.[0];
        if (element)
          fields.set(candidate.candidateId, {
            element,
            label: candidate.displayName,
            control: candidate.control,
            candidate,
          });
      }
    const sections = segmentGenericSections(document, [...fields.values()]);
    const repeated = sections.filter(
      (section) => section.boundary === "repeat-row",
    );
    await classify(
      repeated,
      fieldsSnapshot.request.snapshotId,
      fieldsSnapshot.request.site,
    );
    const groups = new Map<string, RowGroup>();
    for (const section of repeated) {
      // Rows of one group share a parent. Their labels can change (a chosen
      // row kind shows different fields), so a fingerprint cannot name them.
      const rowElement = section.fields[0]
        ? genericRowFor(section.fields[0].element)
        : undefined;
      const key = rowElement?.parentElement
        ? `${containerId(rowElement.parentElement)}|${section.title ?? ""}`
        : `${section.parentTitle ?? ""}|${section.title ?? ""}|${section.fingerprint}`;
      if (rowElement?.parentElement)
        groupScopes.set(key, rowElement.parentElement);
      const group = groups.get(key) ?? {
        key,
        ...(section.title ? { title: section.title } : {}),
        rows: [],
      };
      const category = classified.get(sectionCacheKey(section));
      if (category && !group.category) group.category = category;
      group.rows.push(section);
      groups.set(key, group);
    }
    return {
      prep,
      groups: [...groups.values()],
      fieldsSnapshot,
      fieldCount: fields.size,
    };
  }

  function ownerGroup(
    element: Element,
    groups: readonly RowGroup[],
  ): RowGroup | undefined {
    for (
      let ancestor = element.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const found = groups.find((group) =>
        group.rows[0]?.fields[0]
          ? ancestor.contains(group.rows[0].fields[0].element)
          : false,
      );
      if (found) return found;
    }
    return undefined;
  }

  const isCollapsedControl = (
    ref: ActionRef,
    groups: readonly RowGroup[],
  ): boolean =>
    ref.element.getAttribute("aria-expanded") === "false" &&
    !ownerGroup(ref.element, groups);

  function actionRefs(observation: Observation): ActionRef[] {
    const refs: ActionRef[] = [];
    for (const section of observation.prep.request.sections)
      for (const candidate of section.actionCandidates) {
        const lookup = observation.prep.registry.lookupAction(
          candidate.candidateId,
        );
        if (!("handle" in lookup) || lookup.status !== "ready") continue;
        const element = lookup.handle.element;
        if (
          !(element instanceof HTMLElement) ||
          !isSafeStructuralClick(element, document.body).allowed
        )
          continue;
        const rows = observation.prep.countRepeatableGroups(
          candidate.candidateId,
        );
        refs.push({
          candidateId: candidate.candidateId,
          element,
          label: truncated(candidate.displayName ?? ""),
          sectionId: section.sectionId,
          ...(rows !== undefined ? { rows } : {}),
        });
      }
    return refs;
  }

  function computePoints(observation: Observation): Point[] {
    const points: Point[] = [];
    const refs = actionRefs(observation);
    // A group whose last add failed and that is no longer found cannot be
    // retried; keep its reason instead of silently dropping it.
    for (const [key, reason] of lastFailure)
      if (!observation.groups.some((group) => group.key === key))
        blockKey(key, reason);
    for (const group of observation.groups) {
      const section = sectionOf(group);
      if (!group.category) {
        if (apiClient.classifySections && section.status === "OPEN")
          blockGroup(group, "CLASSIFY_UNAVAILABLE");
        continue;
      }
      const needed = repeatedEntries(profile, group.category);
      if (needed === undefined || section.status === "BLOCKED") continue;
      const owned = refs.filter(
        (ref) =>
          ref.rows !== undefined &&
          ownerGroup(ref.element, observation.groups) === group,
      );
      const rows = owned[0]?.rows || group.rows.length;
      if (rows < needed)
        points.push({ kind: "ADD_ROW", group, needed, actions: owned });
    }
    for (const ref of refs)
      if (isCollapsedControl(ref, observation.groups))
        points.push({ kind: "REVEAL_SECTION", action: ref });
    for (const group of observation.groups) {
      if (group.category !== "education") continue;
      if (sectionOf(group).status === "BLOCKED") continue;
      group.rows.forEach((row, rowIndex) => {
        const first = row.fields[0]?.element;
        const scope = first && genericRowFor(first)?.parentElement;
        if (first instanceof HTMLSelectElement && scope)
          context.educationGroups.add(scope);
        if (
          first instanceof HTMLSelectElement &&
          !handledSelects.has(first) &&
          rowIndex < profile.education.length &&
          (first.selectedIndex <= 0 || first.value === "") &&
          Array.from(first.options).filter(
            (option) => option.value !== "" && option.textContent?.trim(),
          ).length >= 2
        )
          points.push({
            kind: "SELECT_ROW_KIND",
            group,
            rowIndex,
            select: first,
          });
      });
    }
    return points;
  }

  const describe = (point: Point): RemainingPoint => {
    switch (point.kind) {
      case "ADD_ROW":
        return {
          kind: "ADD_ROW",
          ...(point.group.title ? { sectionTitle: point.group.title } : {}),
          ...(point.group.category ? { category: point.group.category } : {}),
          rows: point.actions[0]?.rows || point.group.rows.length,
          needed: point.needed,
        };
      case "REVEAL_SECTION":
        return {
          kind: "REVEAL_SECTION",
          ...(point.action.label ? { sectionTitle: point.action.label } : {}),
        };
      default:
        return {
          kind: "SELECT_ROW_KIND",
          ...(point.group.title ? { sectionTitle: point.group.title } : {}),
          category: "education",
          rowIndex: point.rowIndex,
        };
    }
  };

  const interactionCandidate = (ref: ActionRef): InteractionCandidate => ({
    candidateId: ref.candidateId,
    element: "button",
    control: "button",
    visibility: "visible",
    relationToTarget: "SAME_CONTAINER",
    ...(ref.label
      ? { semanticContext: { labels: [{ source: "label", text: ref.label }] } }
      : {}),
  });

  /** Asks once; undefined means the server could not decide. */
  async function askButtons(
    role: "REPEAT_ADD" | "SECTION_REVEAL",
    canonicalFieldKey: string,
    refs: ActionRef[],
    observation: Observation,
  ): Promise<string | null | undefined> {
    questions.push({ role, candidates: refs.map(({ label }) => label) });
    if (!apiClient.decideInteractions) return undefined;
    try {
      const response = await apiClient.decideInteractions({
        schemaVersion: 2,
        snapshotId: observation.fieldsSnapshot.request.snapshotId,
        site: observation.prep.request.site,
        decisions: [
          {
            decisionId: "structure",
            role,
            canonicalFieldKey,
            candidates: refs.map(interactionCandidate),
          },
        ],
      });
      if (response.status !== "COMPLETE") return undefined;
      const decision = response.decisions.find(
        ({ decisionId }) => decisionId === "structure",
      );
      return decision?.selection === "SELECTED" && decision.candidateId
        ? decision.candidateId
        : null;
    } catch {
      return undefined;
    }
  }

  const executionSnapshot = (
    collected: PreparationCollectedSnapshot,
    visible: () => boolean = () => true,
  ): PreparationSnapshot => ({
    registry: collected.registry,
    isTargetSectionVisible: visible,
    countRepeatableGroups: (plan) =>
      collected.countRepeatableGroups(plan.actionCandidateId),
    repeatableGroupState: (plan) =>
      collected.repeatableGroupState(plan.actionCandidateId),
  });

  const aborted = () =>
    signal?.aborted === true || document.URL !== initialUrl;

  async function addRow(
    point: Extract<Point, { kind: "ADD_ROW" }>,
    observation: Observation,
  ): Promise<boolean> {
    const { group } = point;
    const scope = actionScope(group.rows[0]!.fields[0]!.element);
    const used = actionCounts.get(scope) ?? 0;
    if (used >= MAX_ACTIONS_PER_SECTION) {
      blockGroup(group, "SECTION_ACTION_LIMIT");
      return false;
    }
    if (!addDecision.has(group.key)) {
      if (point.actions.length === 0) {
        blockGroup(group, lastFailure.get(group.key) ?? "NO_ADD_CONTROL");
        return false;
      }
      const category = group.category as ProfileCategoryId;
      const key = profileKeyOf(category);
      const chosenId = key
        ? await askButtons("REPEAT_ADD", key, point.actions, observation)
        : undefined;
      if (chosenId === undefined) {
        blockGroup(group, "INTERACTION_UNAVAILABLE");
        addDecision.set(group.key, null);
        return false;
      }
      const chosen = point.actions.find((ref) => ref.candidateId === chosenId);
      addDecision.set(group.key, chosen?.element ?? null);
      if (!chosen) {
        blockGroup(group, "REPEAT_ADD_ABSTAINED");
        return false;
      }
    }
    const element = addDecision.get(group.key);
    if (!element) return false;
    const action = point.actions.find((ref) => ref.element === element);
    if (!action) {
      blockGroup(group, lastFailure.get(group.key) ?? "ADD_CONTROL_GONE");
      return false;
    }
    if ((failures.get(element) ?? 0) >= MAX_FAILURES_PER_CANDIDATE) {
      blockGroup(group, lastFailure.get(group.key) ?? "ADD_FAILED");
      return false;
    }
    const rowsBefore = action.rows ?? group.rows.length;
    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          plan: {
            actionCandidateId: action.candidateId,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
          approved: true,
          localItemCount: rowsBefore + 1,
        },
      ],
      document,
      ...(signal ? { signal } : {}),
      beforeMutation: async () =>
        !aborted() && isSafeStructuralClick(action.element, document.body).allowed,
      initialSnapshot: executionSnapshot(observation.prep),
      refreshSnapshot: async () => {
        await settle();
        return executionSnapshot(
          collectPreparationSnapshot(document, COLLECTION_OPTIONS),
        );
      },
      countRepeatableGroups: (snapshot, plan) =>
        snapshot.countRepeatableGroups?.(plan) ?? Number.NaN,
    });
    actionCounts.set(scope, used + 1);
    if (document.URL !== initialUrl) {
      blockGroup(group, "URL_CHANGED");
      return false;
    }
    if (result.status === "completed") {
      record({
        kind: "ADD_ROW",
        ...(group.title ? { sectionTitle: group.title } : {}),
        result: "done",
        rowsBefore,
        rowsAfter: rowsBefore + 1,
      });
      return true;
    }
    const reason =
      result.status === "failed" ? result.reason : "approval-required";
    failures.set(element, (failures.get(element) ?? 0) + 1);
    lastFailure.set(group.key, `executor:${reason}`);
    if ((failures.get(element) ?? 0) >= MAX_FAILURES_PER_CANDIDATE)
      blockGroup(group, `executor:${reason}`);
    return true;
  }

  async function revealSection(
    point: Extract<Point, { kind: "REVEAL_SECTION" }>,
    observation: Observation,
  ): Promise<boolean> {
    const { action } = point;
    const scope = actionScope(action.element);
    const used = actionCounts.get(scope) ?? 0;
    const blockReveal = (reason: string) => {
      context.blockedScopes.set(scope, reason);
      sectionsSeen.set(`reveal:${containerId(scope)}`, {
        title: action.label,
        status: "BLOCKED",
        reason,
        blockedRows: [],
      });
      record({
        kind: "REVEAL_SECTION",
        ...(action.label ? { sectionTitle: action.label } : {}),
        result: "blocked",
        reason,
      });
    };
    if (used >= MAX_ACTIONS_PER_SECTION) {
      revealAsked.add(action.element);
      blockReveal("SECTION_ACTION_LIMIT");
      return false;
    }
    if (!revealAsked.has(action.element)) {
      const refs = [action];
      const category =
        REVEAL_PRIORITY.find((id) => (repeatedEntries(profile, id) ?? 0) > 0) ??
        "education";
      const chosenId = await askButtons(
        "SECTION_REVEAL",
        profileKeyOf(category) ?? "personal.personal.koreanFamilyName",
        refs,
        observation,
      );
      refs.forEach((ref) => revealAsked.add(ref.element));
      const chosen = refs.find((ref) => ref.candidateId === chosenId);
      if (chosen) revealChosen.add(chosen.element);
      if (chosenId === undefined || chosenId === null)
        blockReveal(
          chosenId === undefined
            ? "INTERACTION_UNAVAILABLE"
            : "SECTION_REVEAL_ABSTAINED",
        );
    }
    if (!revealChosen.has(action.element)) return false;
    revealChosen.delete(action.element);
    const before = visibleControlCount(document);
    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          plan: {
            actionCandidateId: action.candidateId,
            command: "REVEAL_SECTION",
            expectedEffect: "TARGET_VISIBLE",
            targetSectionId: action.sectionId,
          },
          approved: true,
        },
      ],
      document,
      ...(signal ? { signal } : {}),
      beforeMutation: async () =>
        !aborted() && isSafeStructuralClick(action.element, document.body).allowed,
      initialSnapshot: executionSnapshot(observation.prep),
      refreshSnapshot: async () => {
        await settle();
        return executionSnapshot(
          collectPreparationSnapshot(document, COLLECTION_OPTIONS),
          () => visibleControlCount(document) > before,
        );
      },
      countRepeatableGroups: () => Number.NaN,
    });
    actionCounts.set(scope, used + 1);
    if (document.URL !== initialUrl) {
      blockReveal("URL_CHANGED");
      return false;
    }
    if (result.status === "completed")
      record({
        kind: "REVEAL_SECTION",
        ...(action.label ? { sectionTitle: action.label } : {}),
        result: "done",
      });
    else
      blockReveal(
        `executor:${
          result.status === "failed" ? result.reason : "approval-required"
        }`,
      );
    return result.status === "completed";
  }

  async function selectRowKind(
    point: Extract<Point, { kind: "SELECT_ROW_KIND" }>,
    observation: Observation,
  ): Promise<boolean> {
    const { group, rowIndex, select } = point;
    const rowElement = genericRowFor(select);
    handledSelects.add(select);
    const section = sectionOf(group);
    const blockRow = (reason: string) => {
      section.blockedRows.push(rowIndex);
      if (rowElement) context.blockedScopes.set(rowElement, reason);
      record({
        kind: "SELECT_ROW_KIND",
        ...(group.title ? { sectionTitle: group.title } : {}),
        result: "blocked",
        reason,
        rowIndex,
      });
      return false;
    };
    const scope = actionScope(select);
    const used = actionCounts.get(scope) ?? 0;
    if (used >= MAX_ACTIONS_PER_SECTION) {
      blockGroup(group, "SECTION_ACTION_LIMIT");
      return false;
    }
    const optionList = Array.from(select.options)
      .map((option, index) => ({
        index,
        text: option.textContent?.replace(/\s+/g, " ").trim() ?? "",
        value: option.value,
      }))
      .filter((option) => option.value !== "" && option.text);
    const signature = optionList.map(({ text }) => text).join("\u0000");
    let byTarget = rowKindOptions.get(signature);
    if (!byTarget) {
      questions.push({
        role: "ROW_KIND_OPTION",
        candidates: optionList.map(({ text }) => truncated(text)),
      });
      try {
        byTarget = apiClient.decideInteractions
          ? await decideRowKindOptions(
              {
                decideInteractions:
                  apiClient.decideInteractions.bind(apiClient),
              },
              {
                snapshotId: observation.fieldsSnapshot.request.snapshotId,
                site: observation.prep.request.site,
                canonicalFieldKey: REPEAT_KEYS.education!,
                relationToTarget: "SAME_REPEAT_ROW",
                options: optionList.map((option) => ({
                  optionId: String(option.index),
                  visibility: "visible" as const,
                  semanticContext: {
                    labels: [
                      {
                        source: "label" as const,
                        text: truncated(option.text),
                      },
                    ],
                  },
                })),
              },
            )
          : new Map();
      } catch {
        byTarget = new Map();
      }
      rowKindOptions.set(signature, byTarget);
    }
    const kind = kindOfEntry(profile.education[rowIndex]!);
    if (!kind) return blockRow("NO_PROFILE_STAGE");
    const optionId = byTarget.get(TARGET_OF_ROW_KIND[kind]);
    if (!optionId) return blockRow("ROW_KIND_OPTION_UNDECIDED");
    if (aborted()) return false;
    const release = acquireDocumentRun(document);
    if (!release) return blockRow("run-in-progress");
    try {
      actionCounts.set(scope, used + 1);
      select.selectedIndex = Number(optionId);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
      if (document.URL !== initialUrl) return blockRow("URL_CHANGED");
      if (rowElement) {
        const entry = profile.education[rowIndex]!;
        context.educationRows.set(rowElement, {
          sectionId: sectionOfKind(kind),
          sectionIndex: profile.education
            .slice(0, rowIndex)
            .filter((previous) => previous.sectionId === entry.sectionId)
            .length,
          select,
          selectedValue: select.value,
        });
      }

      // Rematch what the row now shows: only keys of this stage may appear.
      const after = await observe();
      const row = after.groups
        .flatMap((candidateGroup) => candidateGroup.rows)
        .find((candidate) =>
          candidate.fields.some((field) => field.element === select),
        );
      if (!row) return blockRow("ROW_NOT_FOUND");
      const api: Partial<GenericAnalysisApi> = {
        classifySections: apiClient.classifySections?.bind(apiClient),
        analyzeGenericFields: apiClient.analyzeGenericFields?.bind(apiClient),
      };
      if (!api.classifySections || !api.analyzeGenericFields)
        return blockRow("REMATCH_UNAVAILABLE");
      let keys: string[];
      try {
        // Only the changed row is rematched. A previous row's result must not
        // be reused for another education stage with the same visible labels.
        const ids = new Set(
          row.fields.map(({ candidate }) => candidate.candidateId),
        );
        const rowSnapshot = bindGenericStructureRows(
          {
            ...after.fieldsSnapshot,
            request: {
              ...after.fieldsSnapshot.request,
              sections: after.fieldsSnapshot.request.sections
                .map((section) => ({
                  ...section,
                  fields: section.fields.filter((field) =>
                    ids.has(field.candidateId),
                  ),
                  items: (section.items ?? [])
                    .map((item) => ({
                      ...item,
                      fields: item.fields.filter((field) =>
                        ids.has(field.candidateId),
                      ),
                    }))
                    .filter((item) => item.fields.length > 0),
                }))
                .filter(
                  (section) =>
                    section.fields.length > 0 ||
                    (section.items?.length ?? 0) > 0,
                ),
            },
          },
          context,
        );
        const analysis = await analyzeGenericFields(
          rowSnapshot,
          document,
          api as GenericAnalysisApi,
          profile,
          createGenericAnalysisCache(),
        );
        keys = analysis.analysis.fields.flatMap((field) =>
          ids.has(field.candidateId) &&
          field.matchType === "MATCH" &&
          field.valueBinding &&
          "profileFieldKey" in field.valueBinding &&
          field.valueBinding.profileFieldKey
            ? [field.valueBinding.profileFieldKey]
            : [],
        );
      } catch {
        return blockRow("REMATCH_UNAVAILABLE");
      }
      const prefix = `education.${sectionOfKind(kind)}.`;
      if (keys.length === 0 || keys.some((key) => !key.startsWith(prefix)))
        return blockRow("STAGE_KEY_MISMATCH");
      record({
        kind: "SELECT_ROW_KIND",
        ...(group.title ? { sectionTitle: group.title } : {}),
        result: "done",
        rowIndex,
      });
      return true;
    } finally {
      release();
    }
  }

  let previousSignature: string | undefined;
  try {
    for (let iteration = 0; ; iteration += 1) {
      if (aborted()) {
        stopReason = "ABORTED";
        break;
      }
      if (iteration >= MAX_ITERATIONS) {
        stopReason = "ITERATION_LIMIT";
        break;
      }
      const observation = await observe();
      const points = computePoints(observation);
      initialRemaining ??= points.map(describe);
      if (points.length === 0) break;
      const signatureNow = JSON.stringify(points.map(describe));
      if (signatureNow === previousSignature) {
        stopReason = "NO_PROGRESS";
        for (const point of points)
          if (point.kind !== "REVEAL_SECTION")
            blockGroup(point.group, "NO_PROGRESS");
        break;
      }
      let acted = false;
      for (const point of points) {
        if (point.kind === "ADD_ROW") acted = await addRow(point, observation);
        else if (point.kind === "REVEAL_SECTION")
          acted = await revealSection(point, observation);
        else acted = await selectRowKind(point, observation);
        if (acted) break;
        if (aborted()) break;
      }
      previousSignature = acted ? signatureNow : undefined;
      if (!acted && points.every((point) => point.kind === "REVEAL_SECTION")) {
        // Every collapsed control was declined; nothing else can change.
        const pending = points.filter(
          (point) =>
            point.kind === "REVEAL_SECTION" &&
            !revealChosen.has(point.action.element) &&
            !revealAsked.has(point.action.element),
        );
        if (pending.length === 0) break;
      }
    }
  } catch {
    // A local failure must end the loop, never the whole preparation step.
    stopReason = "FAILED";
    context.blockedScopes.set(document.body, "STRUCTURE_LOOP_FAILED");
  }

  return {
    context,
    stopReason,
    actions,
    sections: [...sectionsSeen.values()],
    initialRemaining: initialRemaining ?? [],
    questions,
  };
}
