import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { resolveCompany } from "./company";
import { hyundaiWriteAdapter } from "./hyundai/write";

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

export function getWriteAdapter(host: string): CompanyWriteAdapter {
  return resolveCompany(host) === "hyundai"
    ? hyundaiWriteAdapter
    : standardWriteAdapter;
}
