import type { Profile } from "../../profile/model";
import { localProfileValue } from "./workflow-model";
import type { Dispatch, SetStateAction } from "react";
import type { ReviewPlanItem } from "../review/review-plan";

export function createReviewActions(
  setReviewItems: Dispatch<SetStateAction<ReviewPlanItem[]>>,
) {
  const toggleReviewItem = (candidateId: string) => {
    setReviewItems((items) =>
      items.map((item) =>
        item.candidateId === candidateId && !item.disabled
          ? { ...item, selected: !item.selected }
          : item,
      ),
    );
  };
  return { toggleReviewItem };
}

export function sensitiveValueApproved(
  approved: ReadonlyMap<string, string>,
  profile: Profile,
  key: string,
): boolean {
  const value = localProfileValue(profile, key);
  return value !== undefined && approved.get(key) === value;
}
