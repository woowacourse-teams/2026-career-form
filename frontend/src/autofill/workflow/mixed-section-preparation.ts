import type { Profile } from "../../profile/model";
import { collectPreparationSnapshot } from "../dom/collect";
import {
  assignMixedRows,
  type MixedSectionGroup,
  shownKindSelect,
} from "../dom/mixed-section-rows";
import type { OptionSelectionResult } from "../preparation/executor";
import { selectNativeProfileOption } from "../preparation/select-profile-option";

const STABLE_ATTEMPTS = 5;
const STABLE_INTERVAL_MS = 100;

export interface MixedSectionPreparationOptions {
  document: Document;
  profile: Profile;
  signal: AbortSignal;
  recordOperation: (element: Element, category: string) => void;
}

function mixedGroupOf(document: Document): MixedSectionGroup | undefined {
  const snapshot = collectPreparationSnapshot(document);
  const groups = snapshot.request.sections
    .flatMap((section) => section.actionCandidates)
    .map((action) => snapshot.mixedSectionGroup?.(action.candidateId))
    .filter((group): group is MixedSectionGroup => group !== undefined);
  return groups.length === 1 ? groups[0] : undefined;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function settled(
  row: Element,
  reference: HTMLSelectElement,
  text: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < STABLE_ATTEMPTS; attempt += 1) {
    // Re-read the row: a kind change may render another branch's copy.
    const select = row.isConnected
      ? shownKindSelect(row, reference)
      : undefined;
    if (select?.selectedOptions[0]?.textContent?.trim() === text) return true;
    await wait(STABLE_INTERVAL_MS);
  }
  return false;
}

/**
 * Select each mixed row's education kind locally, in profile order (C7).
 * Returns undefined when no single mixed group matches the profile rows.
 */
export async function prepareMixedSectionRows({
  document,
  profile,
  signal,
  recordOperation,
}: MixedSectionPreparationOptions): Promise<
  OptionSelectionResult[] | undefined
> {
  if (signal.aborted) return undefined;
  const url = document.URL;
  const group = mixedGroupOf(document);
  if (!group) return undefined;
  const assignments = assignMixedRows(profile, group);
  if (assignments.length !== group.rows.length) return undefined;
  const results: OptionSelectionResult[] = [];
  for (const [index, assignment] of assignments.entries()) {
    if (signal.aborted || document.URL !== url) return results;
    const select = group.kindSelects[index]!;
    if (!assignment.optionText) {
      results.push("option-label-mismatch");
      continue;
    }
    const previous = select.value;
    const result = selectNativeProfileOption(select, assignment.optionText);
    // A changed kind can hide the branch that owned this select, which fails
    // the post-change check; the row's rendered kind select decides instead.
    if (
      result === "selected" ||
      (result === "action-not-ready" && select.value !== previous)
    ) {
      recordOperation(select, "학력");
      results.push(
        (await settled(group.rows[index]!, select, assignment.optionText))
          ? "selected"
          : "action-not-ready",
      );
    } else results.push(result);
  }
  return results;
}
