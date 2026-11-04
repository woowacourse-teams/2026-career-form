import type { ProfileGroups, ResultModel } from "../workflow/result-model";
import { localDiagnosticsEnabled } from "./review-diagnostics";

/** Counts only: no labels, values or identifiers. */
export function buildResultDiagnostics(
  model: ResultModel,
  groups: ProfileGroups,
) {
  return {
    completed: model.completed.length,
    pending: model.pending.length,
    notInProfile: groups.notInProfile.length,
    profileUnset: groups.profileUnset.length,
  };
}

export function emitResultDiagnostics(
  model: ResultModel,
  groups: ProfileGroups,
): void {
  // Same inline gate as emitReviewDiagnostics so production drops this.
  if (import.meta.env.DEV !== true) return;
  if (!localDiagnosticsEnabled()) return;
  console.info(
    `[CareerForm] 결과 진단: ${JSON.stringify(buildResultDiagnostics(model, groups))}`,
  );
}
