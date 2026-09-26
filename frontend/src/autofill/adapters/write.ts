import type { ExecutionAdapterId } from "../api/types";
import { greetingWriteAdapter } from "./greeting/write";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { resolveCompany } from "./company";
import { hyundaiWriteAdapter } from "./hyundai/write";
import { skWriteAdapter } from "./sk/write";

export type CompanyWriteAttempt =
  { handled: false } | { handled: true; written: boolean };

export interface CompanyWriteAdapter {
  tryWrite(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
  ): CompanyWriteAttempt;
  afterWrite?(handle: FieldCandidateHandle, item: ReviewPlanItem): void;
}

const standardWriteAdapter: CompanyWriteAdapter = {
  tryWrite: () => ({ handled: false }),
};

export function getWriteAdapter(
  host: string,
  executionAdapterId?: ExecutionAdapterId,
): CompanyWriteAdapter {
  if (executionAdapterId === "greeting-v1") return greetingWriteAdapter;
  switch (resolveCompany(host)) {
    case "hyundai":
      return hyundaiWriteAdapter;
    case "sk":
      return skWriteAdapter;
    default:
      return standardWriteAdapter;
  }
}
