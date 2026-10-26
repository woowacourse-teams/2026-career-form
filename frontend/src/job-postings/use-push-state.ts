import { useCallback, useEffect, useState } from "react";
import type { VisibilityAnswer } from "./notification-check";
import type { PushClient } from "./push-client";
import type { PushStateView, RecordSource } from "./push-messages";

export interface PushStateHandle {
  state: PushStateView | undefined;
  failed: boolean;
  busy: boolean;
  setEnabled(enabled: boolean): Promise<void>;
  setAutoSave(enabled: boolean): Promise<void>;
  test(): Promise<void>;
  record(answer: VisibilityAnswer, source: RecordSource): Promise<void>;
  later(): Promise<void>;
}

// One background round-trip per action; storage changes refresh the view.
export function usePushState(client: PushClient): PushStateHandle {
  const [state, setState] = useState<PushStateView>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setState(await client.state());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [client]);
  useEffect(() => {
    void load();
    return client.subscribe(() => void load());
  }, [client, load]);
  const run = useCallback(async (action: () => Promise<PushStateView>) => {
    setBusy(true);
    try {
      setState(await action());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);
  return {
    state,
    failed,
    busy,
    setEnabled: (enabled) => run(() => client.setEnabled(enabled)),
    setAutoSave: (enabled) => run(() => client.setAutoSave(enabled)),
    test: () => run(() => client.test()),
    record: (answer, source) => run(() => client.record(answer, source)),
    later: () => run(() => client.later()),
  };
}
