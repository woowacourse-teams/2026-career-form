import { hiddenCodeAdapters } from "../policy/hidden-code";
import { componentWriteAdapter } from "../policy/components/write";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { resolveCompany, resolveDocumentCompany } from "./company";
import { policyWriteAdapter } from "../policy/write";
import { executionPolicy } from "../workflow/execution-policy";

export type CompanyWriteAttempt =
  { handled: false } | { handled: true; written: boolean };

export interface CompanyWriteAdapter {
  tryWrite(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
  ): CompanyWriteAttempt;
  /** Read-only verification; must not click, write, or dispatch events. */
  verifyRetained?(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
  ): boolean | undefined;
  completion?(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
  ):
    | {
        stage: number;
        failureMessage: string;
        settle(
          current: () => boolean,
          beforeMutation?: () => Promise<boolean>,
        ): Promise<boolean>;
      }
    | undefined;
  afterWrite?(handle: FieldCandidateHandle, item: ReviewPlanItem): void;
}

const standardWriteAdapter: CompanyWriteAdapter = {
  tryWrite: () => ({ handled: false }),
};

// Platform identity alone does not establish a writable application field.
const unverifiedWriteAdapter: CompanyWriteAdapter = {
  tryWrite: () => ({ handled: true, written: false }),
};

export function getWriteAdapter(
  source: string | Document,
): CompanyWriteAdapter {
  if (typeof source !== "string") {
    const configured = hiddenCodeAdapters(source);
    if (configured) return configured.write;
  }
  if (typeof source !== "string" && executionPolicy(source)?.browserPolicy)
    return policyWriteAdapter;
  switch (
    typeof source === "string"
      ? resolveCompany(source)
      : resolveDocumentCompany(source)
  ) {
    case "hplace":
      return unverifiedWriteAdapter;
    case "components":
      return componentWriteAdapter;
    default:
      return standardWriteAdapter;
  }
}
