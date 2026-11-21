import type {
  ActionCandidate,
  FieldCandidate,
  FieldsAnalyzeRequest,
  PreparationAnalyzeRequest,
  SiteDescriptor,
} from "../../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../../dom/candidate-registry";
import type {
  CollectedSnapshot,
  PreparationCollectedSnapshot,
} from "../../dom/collect";
import type {
  ActionCandidateHandle,
  FieldCandidateHandle,
} from "../../dom/types";
import type { Profile } from "../../../profile/model";
import { waitFor } from "./v1-basic-write";
import {
  cardState,
  historyGroups,
  historyLevelLabel,
  historyProfileSection,
  isV1HistoryPage,
  ownedV1HistoryAddAction,
  ownedV1HistoryControl,
  v1HistoryAddActions,
  v1HistoryAddName,
  v1HistoryCards,
  v1HistoryControls,
  v1HistoryLevels,
  v1HistorySectionId,
  type HistoryGroup,
} from "./v1-history-controls";

/**
 * One flat `hplace-v1-history` section (the backend rejects `items`). Each
 * handle carries its level as `itemGroupId` and its card order as
 * `itemIndex`; the item count of every sound level is declared so the review
 * plan binds card i to profile entry i and blocks a level whose card count
 * differs from its entries.
 */
export function collectV1HistoryFields(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const registry = new CandidateRegistry();
  const fields: FieldCandidate[] = v1HistoryControls(document).map(
    (control, index) => {
      const { spec } = control;
      const candidate: FieldCandidate = {
        candidateId: `field-${index + 1}`,
        domId: control.name,
        domName: control.name,
        element: spec.kind === "dropdown" ? "select" : "input",
        control:
          spec.kind === "dropdown"
            ? "select"
            : spec.kind === "toggle"
              ? "radio"
              : "text",
        displayName: spec.label,
        visibility: "visible",
        ...(spec.kind === "toggle" || spec.kind === "dropdown"
          ? {
              options: spec.options
                .filter(
                  (label) =>
                    spec.kind !== "toggle" || control.options.has(label),
                )
                .map((label) => ({ optionId: label, displayName: label })),
            }
          : {}),
      };
      const handle: FieldCandidateHandle = {
        kind: "field",
        candidateId: candidate.candidateId,
        candidate,
        sectionId: v1HistorySectionId,
        itemGroupId: control.group,
        itemIndex: control.index,
        elements: control.elements,
        ...(control.custom.length ? { customElements: control.custom } : {}),
        optionElements: control.options,
        signature: createStructuralSignature([
          ...control.elements,
          ...control.custom,
        ]),
        isCurrentContext: () => ownedV1HistoryControl(handle) !== undefined,
      };
      registry.registerField(handle);
      return candidate;
    },
  );
  for (const level of v1HistoryLevels(document))
    if (level.status === "ok")
      registry.setFieldItemCount(
        v1HistorySectionId,
        level.cards.length,
        level.group,
      );
  return {
    registry,
    request: {
      schemaVersion: 2,
      snapshotId,
      site,
      sections: fields.length
        ? [{ sectionId: v1HistorySectionId, fields }]
        : [],
    },
  };
}

/** Card counts last read per level: the executor reads one right before each click. */
const lastCounts = new WeakMap<Document, Map<HistoryGroup, number>>();

/**
 * After an add click, wait (bounded) until a level's card count differs from
 * its last read count, so the refreshed snapshot sees the re-rendered page
 * (new card and the add control's new shape). Returns at once elsewhere.
 */
export async function settleV1HistoryAdd(document: Document): Promise<void> {
  const seen = lastCounts.get(document);
  if (!seen?.size || !isV1HistoryPage(document)) return;
  await waitFor(
    () =>
      [...seen].some(
        ([group, count]) =>
          (v1HistoryCards(document, group)?.length ?? count) !== count,
      ),
    () => isV1HistoryPage(document),
  );
}

/**
 * Profile entries one add action needs cards for (`needed = entries -
 * existing cards` is the executor's). undefined: not a step-2 action;
 * null: a step-2 name this phase does not add (major sub-rows).
 */
export function v1HistoryProfileCount(
  actionDomId: string | undefined,
  profile: Profile,
): number | null | undefined {
  if (!actionDomId?.startsWith("hplace.v1.")) return undefined;
  const group = historyGroups.find((g) => v1HistoryAddName(g) === actionDomId);
  if (!group) return null;
  const { categoryId, sectionId } = historyProfileSection[group];
  return profile[categoryId].filter(
    (entry) =>
      entry.sectionId === sectionId &&
      // A 대입 검정고시 entry has no high-school card.
      !(
        group === "highschool" &&
        entry.values.academicProcess === "대입 검정고시"
      ),
  ).length;
}

/**
 * The step-2 preparation section: one add action per sound level that shows
 * its add control. Both measured shapes (`button` with zero cards,
 * `div[tabindex="0"]` after) are sent as button/button. Card counts and the
 * per-card state digest are read from the live page.
 */
export function collectV1HistoryPreparation(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
): PreparationCollectedSnapshot {
  const registry = new CandidateRegistry();
  const groups = new Map<string, HistoryGroup>();
  const actionCandidates: ActionCandidate[] = v1HistoryAddActions(document).map(
    ({ group, element }, index) => {
      const candidate: ActionCandidate = {
        candidateId: `action-${index + 1}`,
        domId: v1HistoryAddName(group),
        domName: v1HistoryAddName(group),
        element: "button",
        control: "button",
        displayName: historyLevelLabel[group],
        visibility: "visible",
      };
      const handle: ActionCandidateHandle = {
        kind: "action",
        candidateId: candidate.candidateId,
        candidate,
        sectionId: v1HistorySectionId,
        element,
        signature: createStructuralSignature([element]),
        isCurrentContext: () => ownedV1HistoryAddAction(handle) === group,
      };
      registry.registerAction(handle);
      groups.set(candidate.candidateId, group);
      return candidate;
    },
  );
  const request: PreparationAnalyzeRequest = {
    schemaVersion: 2,
    snapshotId,
    site,
    sections: [{ sectionId: v1HistorySectionId, actionCandidates }],
  };
  const cardsOf = (id: string) => {
    const group = groups.get(id);
    return group ? v1HistoryCards(document, group) : undefined;
  };
  return {
    request,
    registry,
    isSectionVisible: (sectionId) =>
      sectionId === v1HistorySectionId && isV1HistoryPage(document),
    countRepeatableGroups: (id) => {
      const count = cardsOf(id)?.length;
      const group = groups.get(id);
      if (group && count !== undefined) {
        const seen = lastCounts.get(document) ?? new Map();
        lastCounts.set(document, seen.set(group, count));
      }
      return count;
    },
    repeatableGroupState: (id) => cardsOf(id)?.map(cardState),
    // One high-school card per application (MRS2 maxRows 1); other limits
    // are not measured.
    repeatableGroupLimit: (id) =>
      groups.get(id) === "highschool" ? 1 : undefined,
  };
}
