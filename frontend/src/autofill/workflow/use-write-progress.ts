import { useMemo, useState } from "react";
import {
  createProgressTracker,
  progressCategory,
  type WriteProgress,
} from "./progress-model";
import type { WriteResultListener } from "../write/executor";

export function useWriteProgress(
  pageDocument: Document,
  isCurrent: () => boolean,
  recordOperation: (element: Element, category: string) => void,
) {
  const progressTracker = useMemo(
    () => createProgressTracker(),
    [pageDocument],
  );
  const [progress, setProgress] = useState<WriteProgress[]>([]);
  const onWriteResult: WriteResultListener = (item, result, registry) => {
    if (!isCurrent()) return;
    const nextProgress = progressTracker.record(item, result, registry);
    const progressId = progressTracker.progressIdFor(
      item.candidateId,
      registry,
    );
    if (
      result.status === "written" &&
      nextProgress.some((entry) => entry.id === progressId && !entry.unchanged)
    ) {
      const lookup = registry.lookupField(item.candidateId);
      if (lookup.status === "ready" || lookup.status === "blocked")
        lookup.handle.elements.forEach((element) =>
          recordOperation(element, progressCategory(item)),
        );
    }
    setProgress(nextProgress);
  };
  return { progressTracker, progress, onWriteResult };
}
