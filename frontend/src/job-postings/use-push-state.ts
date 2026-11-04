import { useCallback, useEffect, useState } from "react";
import type { VisibilityAnswer } from "./notification-check";
import type { PushClient } from "./push-client";
import type { PushStateView, RecordSource } from "./push-messages";

export interface PushStateHandle {
  state: PushStateView | undefined;
  failed: boolean;
  busy: boolean;
  setEnabled(enabled: boolean): Promise<void>;
  test(): Promise<void>;
  record(answer: VisibilityAnswer, source: RecordSource): Promise<void>;
  later(): Promise<void>;
  // Resolves whether the selection was saved; the caller reverts otherwise.
  setRoles(roles: readonly string[]): Promise<boolean>;
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
  // Resolves whether the action succeeded; failures only flip the flag.
  const run = useCallback(async (action: () => Promise<PushStateView>) => {
    setBusy(true);
    try {
      setState(await action());
      setFailed(false);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  const quiet = (action: () => Promise<PushStateView>): Promise<void> =>
    run(action).then(() => undefined);
  return {
    state,
    failed,
    busy,
    setEnabled: (enabled) => quiet(() => client.setEnabled(enabled)),
    test: () => quiet(() => client.test()),
    record: (answer, source) => quiet(() => client.record(answer, source)),
    later: () => quiet(() => client.later()),
    setRoles: (roles) => run(() => client.setRoles(roles)),
  };
}
