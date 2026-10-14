import { runDomPlan } from "../policy/action-plan";
import { localWorkflowLog } from "../debug/local-workflow";
import type { AddressPort } from "./relay";
import { addressMessage, type AddressMessage } from "./messages";
import { findKakaoResult, kakaoResultIdentity } from "./kakao";
import { normalizeAddress } from "./match";
export function attachKakaoProvider(
  document: Document,
  port: AddressPort,
): void {
  let run: Extract<AddressMessage, { type: "SEARCH" }> | undefined;
  let selected: HTMLButtonElement | undefined;
  let proposedIdentity: import("./match").AddressIdentity | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline = 0,
    used = false,
    disconnected = false;
  const stop = () => {
    if (timer) clearTimeout(timer);
    run = undefined;
    selected = undefined;
    proposedIdentity = undefined;
  };
  const send = (
    type: "PROPOSE" | "SELECTED" | "FAILED",
    id: string,
    identity?: import("./match").AddressIdentity,
  ) => {
    if (!disconnected)
      try {
        port.postMessage({
          type,
          id,
          ...(identity ? { selected: identity } : {}),
        });
      } catch {
        disconnected = true;
        stop();
      }
  };
  const fail = () => {
    localWorkflowLog("address-provider-failed", {
      queryMatches: !!current(),
      resultFound: !!(
        run && findKakaoResult(document, run.expected, run.policy)
      ),
      selected: !!selected,
      expired: Date.now() >= deadline,
    });
    const id = run?.id;
    stop();
    if (id) send("FAILED", id);
  };
  const current = () => {
    const input =
      run &&
      document.querySelector<HTMLInputElement>(run.policy.selectors.input);
    const query =
      run &&
      document.querySelector<HTMLInputElement>(run.policy.selectors.query);
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
      ? findKakaoResult(document, run.expected, run.policy)
      : undefined;
    if (result) {
      localWorkflowLog("address-provider-propose", {});
      selected = result;
      proposedIdentity = kakaoResultIdentity(result, run.policy);
      send("PROPOSE", run.id);
      timer = setTimeout(fail, run.policy.commitMs);
      return;
    }
    timer = setTimeout(poll, run!.policy.pollMs);
  };
  port.onMessage.addListener((value) => {
    const m = addressMessage(value);
    if (!m || disconnected) return;
    if (m.type === "SEARCH" && !used) {
      localWorkflowLog("address-provider-search", {});
      used = true;
      run = m;
      deadline = Date.now() + m.policy.searchMs;
      const inputs = document.querySelectorAll<HTMLInputElement>(
        m.policy.selectors.input,
      );
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        m.policy.selectors.trigger,
      );
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
        timer = setTimeout(poll, run!.policy.pollMs);
        return;
      }
      const input = inputs[0];
      if (
        !runDomPlan(
          m.policy.searchPlan,
          { input, control: buttons[0] },
          { value: m.expected.address },
          () => !!run && !disconnected && input.isConnected,
        )
      ) {
        fail();
        return;
      }
      timer = setTimeout(poll, run!.policy.pollMs);
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
        findKakaoResult(document, run.expected, run.policy) !== selected
      ) {
        fail();
        return;
      }
      const button = selected,
        id = run.id;
      const identity = kakaoResultIdentity(button, run.policy);
      if (!identity || !proposedIdentity || identity.postalCode !== proposedIdentity.postalCode || identity.address !== proposedIdentity.address) {
        fail();
        return;
      }
      stop();
      button.click();
      send("SELECTED", id, identity);
    }
  });
  port.onDisconnect.addListener(() => {
    disconnected = true;
    stop();
  });
}
