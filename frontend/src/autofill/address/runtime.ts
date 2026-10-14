import { executionPolicy } from "../workflow/execution-policy";
import { localWorkflowLog } from "../debug/local-workflow";
import type { AddressPort } from "./relay";
import type { AddressSearch } from "./types";
import { addressMessage } from "./messages";
export function createAddressSearch(connect: () => AddressPort): AddressSearch {
  return (expected, maySelect, signal, onSelected) =>
    new Promise<boolean>((resolve) => {
      const policy =
        typeof document !== "undefined"
          ? executionPolicy(document)?.providerPolicy
          : undefined;
      if (signal.aborted || !policy) {
        resolve(false);
        return;
      }
      let port: AddressPort;
      try {
        port = connect();
      } catch {
        resolve(false);
        return;
      }
      const id = crypto.randomUUID();
      let finished = false,
        committed = false,
        checking = false;
      let phase = "connect";
      const finish = (success = false) => {
        if (finished) return;
        finished = true;
        localWorkflowLog("address-channel-finished", {
          phase,
          success,
          committed,
          checking,
        });
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        try {
          if (!success) port.postMessage({ type: "CANCEL", id });
          port.disconnect();
        } catch {
          /* Already disconnected. */
        }
        resolve(success);
      };
      const timer = setTimeout(() => finish(), 15000);
      const abort = () => finish();
      signal.addEventListener("abort", abort, { once: true });
      port.onDisconnect.addListener(() => {
        phase = "disconnected";
        finish();
      });
      port.onMessage.addListener((value) => {
        const message = addressMessage(value);
        if (finished || !message || message.id !== id) return;
        phase = message.type;
        localWorkflowLog("address-channel-message", { type: message.type });
        if (message.type === "PROPOSE" && !checking && !committed) {
          checking = true;
          void maySelect()
            .then((valid) => {
              if (finished || signal.aborted) return;
              if (!valid) {
                phase = "selection-validation-rejected";
                finish();
                return;
              }
              committed = true;
              try {
                port.postMessage({ type: "COMMIT", id });
              } catch {
                finish();
              }
            })
            .catch(() => finish());
        } else if (message.type === "SELECTED" && committed) {
          onSelected?.(message.selected);
          finish(true);
        } else if (message.type === "FAILED") {
          finish();
        }
      });
      try {
        phase = "waiting-provider";
        port.postMessage({ type: "SEARCH", id, expected, policy });
      } catch {
        finish();
      }
    });
}
