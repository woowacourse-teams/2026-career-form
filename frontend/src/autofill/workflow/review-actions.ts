import type { Dispatch, SetStateAction } from "react";
import {
  revealSensitiveReviewItem,
  type ReviewPlanItem,
} from "../review/review-plan";

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

  const revealSensitiveItem = (candidateId: string) => {
    setReviewItems((items) =>
      items.map((item) =>
        item.candidateId === candidateId
          ? revealSensitiveReviewItem(item)
          : item,
      ),
    );
  };
  return { toggleReviewItem, revealSensitiveItem };
}
