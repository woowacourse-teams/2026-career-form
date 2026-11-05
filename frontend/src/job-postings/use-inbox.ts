import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackEvent } from "../analytics/events";
import {
  PushApiError,
  type PushApiErrorCode,
  type ServerPosting,
} from "./push-api";
import type { PushClient } from "./push-client";

export interface InboxHandle {
  postings: ServerPosting[] | undefined;
  error: PushApiErrorCode | undefined;
  loading: boolean;
  reload(): Promise<void>;
}

// Server postings, nearest deadline first. The first successful read counts as
// the inbox being viewed.
export function useInbox(client: PushClient, track: TrackEvent): InboxHandle {
  const [postings, setPostings] = useState<ServerPosting[]>();
  const [error, setError] = useState<PushApiErrorCode>();
  const [loading, setLoading] = useState(true);
  const viewed = useRef(false);
  const trackRef = useRef(track);
  trackRef.current = track;
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await client.inbox();
      setPostings([...rows].sort((a, b) => a.closesAt - b.closesAt));
      setError(undefined);
      if (!viewed.current) {
        viewed.current = true;
        trackRef.current("posting_inbox_viewed", { surface: "options" });
      }
    } catch (failure) {
      setError(failure instanceof PushApiError ? failure.code : "NETWORK");
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { postings, error, loading, reload };
}
