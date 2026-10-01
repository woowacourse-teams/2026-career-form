import type { AddressPort } from "./relay";
import { addressMessage, type AddressMessage } from "./messages";
import { findKakaoResult } from "./kakao";
import { normalizeAddress } from "./match";
export function attachKakaoProvider(
  document: Document,
  port: AddressPort,
): void {
  let run: Extract<AddressMessage, { type: "SEARCH" }> | undefined;
  let selected: HTMLButtonElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline = 0,
    used = false,
    disconnected = false;
  const stop = () => {
    if (timer) clearTimeout(timer);
    run = undefined;
    selected = undefined;
  };
  const send = (type: "PROPOSE" | "SELECTED" | "FAILED", id: string) => {
    if (!disconnected)
      try {
        port.postMessage({ type, id });
      } catch {
        disconnected = true;
        stop();
      }
  };
  const fail = () => {
    const id = run?.id;
    stop();
    if (id) send("FAILED", id);
  };
  const current = () => {
    const input = document.querySelector<HTMLInputElement>("#region_name");
    const query = document.querySelector<HTMLInputElement>("#cQuery");
    return (
      run &&
      input &&
      query &&
      normalizeAddress(input.value) ===
        normalizeAddress(run.expected.address) &&
      normalizeAddress(query.value) === normalizeAddress(run.expected.address)
    );
  };
  const poll = () => {
    if (!run) return;
    if (Date.now() >= deadline) {
      fail();
      return;
    }
    const result = current()
      ? findKakaoResult(document, run.expected)
      : undefined;
    if (result) {
      selected = result;
      send("PROPOSE", run.id);
      timer = setTimeout(fail, 5000);
      return;
    }
    timer = setTimeout(poll, 100);
  };
  port.onMessage.addListener((value) => {
    const m = addressMessage(value);
    if (!m || disconnected) return;
    if (m.type === "SEARCH" && !used) {
      used = true;
      run = m;
      deadline = Date.now() + 8000;
      const inputs = document.querySelectorAll<HTMLInputElement>(
        "#region_name[name=region_name]",
      );
      const buttons =
        document.querySelectorAll<HTMLButtonElement>("button.btn_search");
      if (
        inputs.length !== 1 ||
        buttons.length !== 1 ||
        inputs[0].disabled ||
        inputs[0].readOnly ||
        buttons[0].disabled
      ) {
        fail();
        return;
      }
      if (current()) {
        timer = setTimeout(poll, 100);
        return;
      }
      const input = inputs[0];
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, m.expected.address);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      buttons[0].click();
      timer = setTimeout(poll, 100);
      return;
    }
    if (!run || m.id !== run.id) return;
    if (m.type === "CANCEL") {
      stop();
      return;
    }
    if (m.type === "COMMIT") {
      if (
        !selected ||
        !selected.isConnected ||
        !current() ||
        findKakaoResult(document, run.expected) !== selected
      ) {
        fail();
        return;
      }
      const button = selected,
        id = run.id;
      stop();
      button.click();
      send("SELECTED", id);
    }
  });
  port.onDisconnect.addListener(() => {
    disconnected = true;
    stop();
  });
}
