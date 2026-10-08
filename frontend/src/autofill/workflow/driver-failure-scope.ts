import type { ApprovedWriteResult } from "../write/write-result";

const PRE_MUTATION_CODES: ReadonlySet<string> = new Set([
  "CONFLICT",
  "NOT_APPROVED",
  "DUPLICATE_BINDING",
  "REVIEW_UNAVAILABLE",
]);

/**
 * True only when a generic state driver reported a failure before it changed
 * the page. Anything that may have touched the page stays uncertain.
 */
export function isPreMutationFailure(result: ApprovedWriteResult): boolean {
  if (result.status !== "skipped") return false;
  if (result.outcome === "unsupported" || result.outcome === "unchanged")
    return true;
  return result.code !== undefined && PRE_MUTATION_CODES.has(result.code);
}
