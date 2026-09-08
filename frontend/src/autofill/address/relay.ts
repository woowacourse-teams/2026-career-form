import { addressMessage, type AddressMessage } from "./messages";
export interface AddressPort {
  name: string;
  sender?: {
    id?: string;
    url?: string;
    origin?: string;
    frameId?: number;
    tab?: { id?: number; url?: string };
  };
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}
function sk(url: string | undefined): boolean {
  try {
    const u = new URL(url ?? "");
    return (
      u.origin === "https://www.skcareers.com" &&
      u.pathname.startsWith("/Application/Index/")
    );
  } catch {
    return false;
  }
}
function send(port: AddressPort | undefined, message: AddressMessage) {
  try {
    port?.postMessage(message);
  } catch {
    /* Disconnected ports cannot resume a run. */
  }
}
interface Run {
  top: AddressPort;
  frame?: AddressPort;
  frameId?: number;
  navigations: number;
  search: Extract<AddressMessage, { type: "SEARCH" }>;
  phase: "search" | "proposed" | "committed";
  timer: ReturnType<typeof setTimeout>;
}
export function createAddressRelay(
  extensionId: string,
): (port: AddressPort) => void {
  const providers = new Map<number, Set<AddressPort>>();
  const runs = new Map<number, Run>();
  const finish = (tab: number, failed = true) => {
    const run = runs.get(tab);
    if (!run) return;
    runs.delete(tab);
    clearTimeout(run.timer);
    send(run.frame, { type: "CANCEL", id: run.search.id });
    if (failed) send(run.top, { type: "FAILED", id: run.search.id });
  };
  const dispatch = (tab: number) => {
    const run = runs.get(tab);
    if (!run) return;
    const frames = [...(providers.get(tab) ?? [])];
    if (frames.length > 1) {
      finish(tab);
      return;
    }
    if (!run.frame && frames.length === 1) {
      const replacement = frames[0];
      if (
        run.frameId !== undefined &&
        replacement.sender?.frameId !== run.frameId
      ) {
        finish(tab);
        return;
      }
      run.frame = replacement;
      run.frameId = replacement.sender?.frameId;
      send(run.frame, run.search);
    }
  };
  return (port) => {
    if (!["cf-address-top", "cf-address-frame"].includes(port.name)) return;
    const s = port.sender,
      tab = s?.tab?.id;
    let valid = s?.id === extensionId && tab !== undefined;
    if (port.name === "cf-address-top")
      valid =
        valid &&
        s?.frameId === 0 &&
        sk(s?.url) &&
        s?.origin === "https://www.skcareers.com";
    else {
      try {
        const u = new URL(s?.url ?? "");
        valid =
          valid &&
          (s?.frameId ?? 0) > 0 &&
          u.origin === "https://postcode.map.kakao.com" &&
          u.pathname === "/search" &&
          s?.origin === u.origin &&
          sk(s?.tab?.url);
      } catch {
        valid = false;
      }
    }
    if (!valid || tab === undefined) {
      port.disconnect();
      return;
    }
    const frame = port.name === "cf-address-frame";
    if (frame) {
      const set = providers.get(tab) ?? new Set<AddressPort>();
      set.add(port);
      providers.set(tab, set);
      dispatch(tab);
    }
    let used = false;
    port.onMessage.addListener((value) => {
      const message = addressMessage(value);
      if (!message) return;
      if (!frame && message.type === "SEARCH" && !used) {
        used = true;
        if (runs.has(tab)) {
          finish(tab);
          send(port, { type: "FAILED", id: message.id });
          return;
        }
        const timer = setTimeout(() => finish(tab), 15000);
        runs.set(tab, {
          top: port,
          search: message,
          phase: "search",
          timer,
          navigations: 0,
        });
        dispatch(tab);
        return;
      }
      const run = runs.get(tab);
      if (!run || message.id !== run.search.id) return;
      if (frame && run.frame === port) {
        if (message.type === "PROPOSE" && run.phase === "search") {
          run.phase = "proposed";
          send(run.top, message);
        } else if (message.type === "SELECTED" && run.phase === "committed") {
          send(run.top, message);
          finish(tab, false);
        } else if (message.type === "FAILED") {
          finish(tab);
        }
      } else if (!frame && run.top === port) {
        if (message.type === "COMMIT" && run.phase === "proposed") {
          run.phase = "committed";
          send(run.frame, message);
        } else if (message.type === "CANCEL") {
          finish(tab);
        }
      }
    });
    port.onDisconnect.addListener(() => {
      if (frame) {
        providers.get(tab)?.delete(port);
        if (providers.get(tab)?.size === 0) providers.delete(tab);
      }
      const run = runs.get(tab);
      if (!run) return;
      if (run.top === port) finish(tab);
      else if (run.frame === port) {
        // Kakao submits its search form as a navigation in the same frame.
        // Retain only this in-flight search, never a proposed/committed selection.
        if (run.phase === "search" && run.navigations === 0) {
          run.navigations++;
          run.frame = undefined;
          dispatch(tab);
        } else finish(tab);
      }
    });
  };
}
