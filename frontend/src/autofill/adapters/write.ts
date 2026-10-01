import { greetingWriteAdapter } from "./greeting/write";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { resolveCompany, resolveDocumentCompany } from "./company";
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
  source: string | Document,
): CompanyWriteAdapter {
  switch (
    typeof source === "string"
      ? resolveCompany(source)
      : resolveDocumentCompany(source)
  ) {
    case "greeting":
      return greetingWriteAdapter;
    case "hyundai":
      return hyundaiWriteAdapter;
    case "sk":
      return skWriteAdapter;
    default:
      return standardWriteAdapter;
  }
}
