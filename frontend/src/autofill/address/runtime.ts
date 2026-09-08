import type { AddressPort } from "./relay";
import type { AddressSearch } from "./types";
import { addressMessage } from "./messages";
export function createAddressSearch(connect: () => AddressPort): AddressSearch {
  return (expected, maySelect, signal) =>
    new Promise<boolean>((resolve) => {
      if (signal.aborted) {
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
      const finish = (success = false) => {
        if (finished) return;
        finished = true;
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
      port.onDisconnect.addListener(() => finish());
      port.onMessage.addListener((value) => {
        const message = addressMessage(value);
        if (finished || !message || message.id !== id) return;
        if (message.type === "PROPOSE" && !checking && !committed) {
          checking = true;
          void maySelect()
            .then((valid) => {
              if (finished || signal.aborted) return;
              if (!valid) {
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
          finish(true);
        } else if (message.type === "FAILED") {
          finish();
        }
      });
      try {
        port.postMessage({ type: "SEARCH", id, expected });
      } catch {
        finish();
      }
    });
}
