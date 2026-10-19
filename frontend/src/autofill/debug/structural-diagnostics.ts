/** Value-free, single-argument console lines for tools that cannot expand objects. */
import { isAutofillDebugEnabled } from "./autofill-debug";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlan } from "../review/review-plan";
export type StructuralSkipReason =
  | "owner-mismatch"
  | "label-mismatch"
  | "guide-missing"
  | "guide-ambiguous"
  | "zip-companion"
  | "asset-path"
  | "control-missing"
  | "control-shape"
  | "dependency-inactive"
  | "option-mismatch"
  | "disabled"
  | "section-missing"
  | "section-hidden"
  | "row-identity"
  | "legacy-owner"
  | "excluded-row"
  | "row-add-guard"
  | "unit-mismatch"
  | "existing-value"
  | "unselected"
  | "blocked"
  | "disabled-timeout"
  | "policy-missing"
  | "build-unavailable"
  | "result-click-no-effect"
  | "result-not-unique"
  | "staging-mismatch"
  | "submit-disabled-timeout"
  | "submit-no-effect"
  | "confirm-missing"
  | "confirm-ambiguous"
  | "readback-mismatch"
  | "cleanup-failed";
let scope: Set<string> | undefined;
let scopeStage: "collect" | "prepare" = "collect";
function line(message: string) {
  if (!isAutofillDebugEnabled()) return;
  try {
    console.info(`[CareerForm] ${message}`);
  } catch {
    /* Diagnostics never control autofill. */
  }
}
export function debugCollectionSkip(
  id: string,
  reason: StructuralSkipReason,
  detail: string,
) {
  if (!isAutofillDebugEnabled() || !scope) return;
  const key = `${id}:${reason}`;
  if (scope.has(key)) return;
  scope.add(key);
  line(`skip stage=${scopeStage} key=${id} reason=${reason} detail=${detail}`);
}
export function debugRuntimeSkip(
  id: string,
  reason: StructuralSkipReason,
  detail: string,
  stage: "collect" | "prepare" | "write" | "result" | "address" = "write",
) {
  line(`skip stage=${stage} key=${id} reason=${reason} detail=${detail}`);
}
type Candidates = {
  fields?: readonly unknown[];
  actionCandidates?: readonly unknown[];
};
type Snapshot = {
  request: {
    sections: readonly (Candidates & { items?: readonly Candidates[] })[];
  };
};
export function withStructuralCollection<T extends Snapshot>(
  stage: "fields" | "preparation",
  collect: () => T,
): T {
  if (!isAutofillDebugEnabled()) return collect();
  const previous = scope;
  const previousStage = scopeStage;
  scopeStage = stage === "fields" ? "collect" : "prepare";
  scope = new Set();
  try {
    const result = collect();
    const accepted = result.request.sections.reduce(
      (sum, s) =>
        sum +
        (s.fields?.length ?? s.actionCandidates?.length ?? 0) +
        (s.items ?? []).reduce(
          (n, i) => n + (i.fields?.length ?? i.actionCandidates?.length ?? 0),
          0,
        ),
      0,
    );
    line(
      `stage name=${stage} collected=${accepted + scope.size} accepted=${accepted} rejected=${scope.size} planned=0 executed=0`,
    );
    return result;
  } finally {
    scope = previous;
    scopeStage = previousStage;
  }
}
export async function debugRunBuild(
  read: () => Promise<unknown>,
): Promise<void> {
  if (!isAutofillDebugEnabled()) return;
  let revision = "UNKNOWN",
    state = "UNKNOWN";
  try {
    const info = await read();
    if (
      info &&
      typeof info === "object" &&
      "revision" in info &&
      typeof info.revision === "string" &&
      /^[0-9a-f]{40}$/.test(info.revision) &&
      "source_state" in info &&
      ["CLEAN", "DIRTY"].includes(String(info.source_state))
    ) {
      revision = info.revision;
      state = String(info.source_state);
    }
  } catch {
    /* Keep the unknown state explicit. */
  }
  if (revision === "UNKNOWN") {
    debugRuntimeSkip(
      "extension-build",
      "build-unavailable",
      "installed-snapshot",
      "prepare",
    );
    return;
  }
  line(`build revision=${revision} source_state=${state}`);
}
export function debugPreparationCounts(
  stage: "preparation" | "address",
  planned: number,
  executed: number,
) {
  line(
    `stage name=${stage} collected=0 accepted=0 rejected=0 planned=${planned} executed=${executed}`,
  );
}
export function debugReviewDecisions(
  plan: ReviewPlan,
  registry: CandidateRegistry,
) {
  if (!isAutofillDebugEnabled()) return;
  let rejected = 0;
  for (const item of plan.items) {
    if (item.selected && !item.disabled) continue;
    rejected++;
    const lookup = registry.lookupField(item.candidateId);
    if (!("handle" in lookup)) continue;
    const id =
      lookup.handle.candidate.domName ??
      lookup.handle.candidate.domId ??
      lookup.handle.sectionId;
    if (!id.startsWith("hplace")) continue;
    debugRuntimeSkip(
      id,
      item.status === "conflict"
        ? "existing-value"
        : item.disabled
          ? "blocked"
          : "unselected",
      "review-decision",
      "result",
    );
  }
  line(
    `stage name=review collected=${plan.items.length} accepted=${plan.items.length - rejected} rejected=${rejected} planned=0 executed=0`,
  );
}
