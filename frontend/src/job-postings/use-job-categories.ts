import { useCallback, useEffect, useState } from "react";
import type { JobCategoriesView } from "./job-roles";
import { PushApiError } from "./push-api";
import type { PushClient } from "./push-client";

export interface JobCategoriesHandle {
  // undefined until the first answer from the background arrives.
  view: JobCategoriesView | undefined;
  loading: boolean;
  reload(): Promise<void>;
}

// The background answers with the server list or its cache; when even that
// round-trip fails, the last list shown stays on screen with the error.
export function useJobCategories(client: PushClient): JobCategoriesHandle {
  const [view, setView] = useState<JobCategoriesView>();
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setView(await client.categories());
    } catch (failure) {
      const error =
        failure instanceof PushApiError ? failure.code : ("NETWORK" as const);
      setView((previous) => ({
        categories: previous?.categories ?? null,
        error,
      }));
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { view, loading, reload };
}
