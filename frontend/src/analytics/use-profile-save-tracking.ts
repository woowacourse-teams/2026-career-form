import { useMemo, useRef } from "react";
import {
  countCompletedCategories,
  type ProfileRepository,
} from "../profile/profile-repository";
import type { AnalyticsProperties, TrackEvent } from "./events";

export function useProfileSaveTracking(
  repository: ProfileRepository,
  track: TrackEvent,
  surface: AnalyticsProperties["surface"],
) {
  const latestTrack = useRef(track);
  latestTrack.current = track;
  return useMemo(() => {
    const safeTrack: TrackEvent = (event, properties) => {
      try {
        latestTrack.current(event, properties);
      } catch {
        // Telemetry cannot turn a successful save or navigation into a failure.
      }
    };
    const trackedRepository: ProfileRepository = {
      load: () => repository.load(),
      loadLayout: () => repository.loadLayout(),
      saveLayout: (layout) => repository.saveLayout(layout),
      save: async (profile) => {
        await repository.save(profile);
        // Inspect the snapshot that completed, not a newer in-progress edit.
        if (countCompletedCategories(profile) > 0) {
          safeTrack("profile_first_saved", { surface });
        }
      },
    };
    return { repository: trackedRepository, track: safeTrack };
  }, [repository, surface]);
}
