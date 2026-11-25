import type {
  ActionCandidate,
  FieldCandidate,
  FieldsAnalyzeRequest,
  PreparationAnalyzeRequest,
  SiteDescriptor,
} from "../../api/types";
import type { LinkKind } from "../../../attachments/model";
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
import { debugRuntimeSkip } from "../../debug/structural-diagnostics";
import { waitFor } from "./v1-basic-write";
import {
  historyGroups,
  historyLevelLabel,
  historyProfileSection,
  isV1HistoryPage,
  ownedV1HistoryAddAction,
  ownedV1HistoryControl,
  parseV1HistoryMajorAdd,
  v1AttachmentAddNames,
  v1HistoryAddActions,
  v1HistoryAddName,
  v1HistoryControls,
  v1HistoryLevels,
  v1HistorySectionId,
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

const attachmentKinds: Record<string, LinkKind> = {
  "hplace.v1.careerDescription.add": "resume",
  "hplace.v1.portfolio.add": "portfolio",
};

/** Counts last read per add action: the executor reads one right before each click. */
const lastCounts = new WeakMap<Document, Map<string, number>>();
const liveCount = (document: Document, name: string) =>
  v1HistoryAddActions(document).find((a) => a.name === name)?.count;

/**
 * After an add click, wait (bounded) until an action's count (cards of a
 * level, or major sub-rows of a card) differs from its last read value, so
 * the refreshed snapshot sees the re-rendered page. Returns at once elsewhere.
 */
export async function settleV1HistoryAdd(document: Document): Promise<void> {
  const seen = lastCounts.get(document);
  if (!seen?.size || !isV1HistoryPage(document)) return;
  await waitFor(
    () =>
      [...seen].some(
        ([name, count]) => (liveCount(document, name) ?? count) !== count,
      ),
    () => isV1HistoryPage(document),
  );
}

/**
 * Groups one add action needs (`needed = profile − existing` is the
 * executor's). Card adds: profile entries of the level (a 대입 검정고시 entry
 * has no high-school card). Major adds: 1 when the paired entry holds a
 * major name. undefined: not a step-2 action; null: an unknown step-2 name.
 */
export function v1HistoryProfileCount(
  actionDomId: string | undefined,
  profile: Profile,
  attachments?: ReadonlySet<LinkKind>,
): number | null | undefined {
  if (!actionDomId?.startsWith("hplace.v1.")) return undefined;
  // An attachment row: one entry when the profile stores that kind (file or
  // link); 경력기술서 is the profile's 이력서·경력기술서 document.
  const kind = attachmentKinds[actionDomId];
  if (kind) return attachments?.has(kind) ? 1 : 0;
  const entries = (group: (typeof historyGroups)[number]) => {
    const { categoryId, sectionId } = historyProfileSection[group];
    return profile[categoryId].filter((entry) => entry.sectionId === sectionId);
  };
  const major = parseV1HistoryMajorAdd(actionDomId);
  if (major)
    return entries(major.group)[major.index]?.values.majorName?.trim() ? 1 : 0;
  const group = historyGroups.find((g) => v1HistoryAddName(g) === actionDomId);
  if (!group) return null;
  return entries(group).filter(
    (entry) =>
      !(
        group === "highschool" &&
        entry.values.academicProcess === "대입 검정고시"
      ),
  ).length;
}

/** A per-card major add, run only by the follow-up preparation. */
export const isV1HistoryMajorAdd = (actionDomId: string | undefined) =>
  parseV1HistoryMajorAdd(actionDomId) !== undefined;

/**
 * The step-2 preparation section. Card adds: one per sound level showing its
 * add control (`button` with zero cards, `div[tabindex="0"]` after; both
 * sent as button/button). Major adds: the 전공 row's `추가하기` of a card
 * with no major sub-row yet. Every add stays registered after it ran, so the
 * executor can re-identify it; counts and state digests are read live.
 */
export function collectV1HistoryPreparation(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
): PreparationCollectedSnapshot {
  const registry = new CandidateRegistry();
  // Counts are remembered per snapshot: a count read by an earlier run (or
  // snapshot) must not end the next post-click wait early.
  lastCounts.set(document, new Map());
  const names = new Map<string, string>();
  const actionCandidates: ActionCandidate[] = [];
  v1HistoryAddActions(document).forEach((action, index) => {
    const candidate: ActionCandidate = {
      candidateId: `action-${index + 1}`,
      domId: action.name,
      domName: action.name,
      element: "button",
      control: "button",
      displayName:
        action.index === undefined
          ? (action.label ?? historyLevelLabel[action.group!])
          : "전공 추가하기",
      visibility: "visible",
    };
    const handle: ActionCandidateHandle = {
      kind: "action",
      candidateId: candidate.candidateId,
      candidate,
      sectionId: v1HistorySectionId,
      element: action.element,
      signature: createStructuralSignature([action.element]),
      isCurrentContext: () => ownedV1HistoryAddAction(handle) === action.name,
    };
    registry.registerAction(handle);
    names.set(candidate.candidateId, action.name);
    // Card adds always; a major or attachment add only while it has none.
    if ((action.index === undefined && !action.label) || action.count === 0)
      actionCandidates.push(candidate);
  });
  const request: PreparationAnalyzeRequest = {
    schemaVersion: 2,
    snapshotId,
    site,
    sections: [{ sectionId: v1HistorySectionId, actionCandidates }],
  };
  const live = (id: string) => {
    const name = names.get(id);
    return name
      ? v1HistoryAddActions(document).find((a) => a.name === name)
      : undefined;
  };
  return {
    request,
    registry,
    isSectionVisible: (sectionId) =>
      sectionId === v1HistorySectionId && isV1HistoryPage(document),
    countRepeatableGroups: (id) => {
      const action = live(id);
      if (action?.count !== undefined) {
        const seen = lastCounts.get(document) ?? new Map<string, number>();
        lastCounts.set(document, seen.set(action.name, action.count));
      } else if (action)
        // The executor stops on an unreadable count: say which kind, value-free.
        debugRuntimeSkip(
          action.name,
          "control-shape",
          `v1-history-count-undefined-${
            action.index !== undefined
              ? "major"
              : action.label
                ? "attachment"
                : "card"
          }`,
          "prepare",
        );
      return action?.count;
    },
    repeatableGroupState: (id) => live(id)?.state(),
    // One high-school card per application (MRS2 maxRows 1) and one major
    // sub-row per card in scope; other limits are not measured.
    repeatableGroupLimit: (id) => {
      const name = names.get(id);
      return name === v1HistoryAddName("highschool") ||
        parseV1HistoryMajorAdd(name) ||
        (name !== undefined && v1AttachmentAddNames.includes(name))
        ? 1
        : undefined;
    },
  };
}
