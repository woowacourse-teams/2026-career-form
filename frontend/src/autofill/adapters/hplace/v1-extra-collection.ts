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
  extraBlockTitle,
  extraGroups,
  extraProfileSection,
  isV1ExtraPage,
  ownedV1ExtraAddAction,
  ownedV1ExtraControl,
  v1ExtraAddActions,
  v1ExtraAddName,
  v1ExtraBlocks,
  v1ExtraControls,
  v1ExtraSectionId,
} from "./v1-extra-controls";

/**
 * One flat `hplace-v1-extra` section, like step 2: each handle carries its
 * block as `itemGroupId` and its sub-row order as `itemIndex`, and the row
 * count of every sound block is declared, so the review plan binds sub-row i
 * to profile entry i and blocks a group whose row count differs.
 */
export function collectV1ExtraFields(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const registry = new CandidateRegistry();
  const fields: FieldCandidate[] = v1ExtraControls(document).map(
    (control, index) => {
      const { spec } = control;
      const dropdown = spec.kind === "dropdown";
      const candidate: FieldCandidate = {
        candidateId: `field-${index + 1}`,
        domId: control.name,
        domName: control.name,
        element: dropdown ? "select" : "input",
        control: dropdown ? "select" : "text",
        displayName: spec.label,
        visibility: "visible",
        ...(dropdown
          ? {
              options: spec.options.map((label) => ({
                optionId: label,
                displayName: label,
              })),
            }
          : {}),
      };
      const handle: FieldCandidateHandle = {
        kind: "field",
        candidateId: candidate.candidateId,
        candidate,
        sectionId: v1ExtraSectionId,
        itemGroupId: control.group,
        itemIndex: control.index,
        elements: control.elements,
        ...(control.custom.length ? { customElements: control.custom } : {}),
        optionElements: control.options,
        signature: createStructuralSignature([
          ...control.elements,
          ...control.custom,
        ]),
        isCurrentContext: () => ownedV1ExtraControl(handle) !== undefined,
      };
      registry.registerField(handle);
      return candidate;
    },
  );
  for (const block of v1ExtraBlocks(document))
    if (block.status === "ok")
      registry.setFieldItemCount(
        v1ExtraSectionId,
        block.subRows.length,
        block.group,
      );
  return {
    registry,
    request: {
      schemaVersion: 2,
      snapshotId,
      site,
      sections: fields.length ? [{ sectionId: v1ExtraSectionId, fields }] : [],
    },
  };
}

/** Counts last read per add action: the executor reads one right before each click. */
const lastCounts = new WeakMap<Document, Map<string, number>>();
const liveCount = (document: Document, name: string) =>
  v1ExtraAddActions(document).find((a) => a.name === name)?.count;

/**
 * After an add click, wait (bounded) until a block's row count differs from
 * its last read value, so the refreshed snapshot sees the re-rendered page.
 * Returns at once elsewhere.
 */
export async function settleV1ExtraAdd(document: Document): Promise<void> {
  const seen = lastCounts.get(document);
  if (!seen?.size || !isV1ExtraPage(document)) return;
  await waitFor(
    () =>
      [...seen].some(
        ([name, count]) => (liveCount(document, name) ?? count) !== count,
      ),
    () => isV1ExtraPage(document),
  );
}

/** Rows one step-3 add needs: the profile entries of its section; undefined elsewhere. */
export function v1ExtraProfileCount(
  actionDomId: string | undefined,
  profile: Profile,
): number | undefined {
  const group = extraGroups.find((g) => v1ExtraAddName(g) === actionDomId);
  if (!group) return undefined;
  const { categoryId, sectionId } = extraProfileSection[group];
  return profile[categoryId].filter((entry) => entry.sectionId === sectionId)
    .length;
}

/**
 * The step-3 preparation section: the 추가하기 of each sound in-scope block
 * (sent as button/button). Every add stays registered after it ran, so the
 * executor can re-identify it; counts and state digests are read live.
 */
export function collectV1ExtraPreparation(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
): PreparationCollectedSnapshot {
  const registry = new CandidateRegistry();
  lastCounts.set(document, new Map());
  const names = new Map<string, string>();
  const actionCandidates: ActionCandidate[] = [];
  v1ExtraAddActions(document).forEach((action, index) => {
    const candidate: ActionCandidate = {
      candidateId: `action-${index + 1}`,
      domId: action.name,
      domName: action.name,
      element: "button",
      control: "button",
      displayName: extraBlockTitle[action.group],
      visibility: "visible",
    };
    const handle: ActionCandidateHandle = {
      kind: "action",
      candidateId: candidate.candidateId,
      candidate,
      sectionId: v1ExtraSectionId,
      element: action.element,
      signature: createStructuralSignature([action.element]),
      isCurrentContext: () => ownedV1ExtraAddAction(handle) === action.name,
    };
    registry.registerAction(handle);
    names.set(candidate.candidateId, action.name);
    actionCandidates.push(candidate);
  });
  const request: PreparationAnalyzeRequest = {
    schemaVersion: 2,
    snapshotId,
    site,
    sections: [{ sectionId: v1ExtraSectionId, actionCandidates }],
  };
  const live = (id: string) => {
    const name = names.get(id);
    return name
      ? v1ExtraAddActions(document).find((a) => a.name === name)
      : undefined;
  };
  return {
    request,
    registry,
    isSectionVisible: (sectionId) =>
      sectionId === v1ExtraSectionId && isV1ExtraPage(document),
    countRepeatableGroups: (id) => {
      const action = live(id);
      if (action) {
        const seen = lastCounts.get(document) ?? new Map<string, number>();
        lastCounts.set(document, seen.set(action.name, action.count));
      }
      return action?.count;
    },
    repeatableGroupState: (id) => live(id)?.state(),
    // No row limit is measured; the executor fails closed on a click that adds nothing.
    repeatableGroupLimit: () => undefined,
  };
}
