import { runFlowProgram } from "../flow-plan";
import { runDomPlan } from "../action-plan";
// Common executor for forms with hidden codes and DOM-backed option controls.
import {
  contractValue,
  contractText,
  contractPattern,
  type HiddenCodeContract,
} from "./contract";
import type {
  AddressExecutionOptions,
  AddressResult,
} from "../../address/types";
import {
  normalizeAddress,
  firstAddressResult,
  matchesAddressText,
} from "../../address/match";

export function createAddressModule(
  document: Document,
  contract: HiddenCodeContract,
) {
  const addressFieldNames = contractValue<string[]>(
    contract.definitions.addressFields,
  );
  function visible(element: Element): boolean {
    if (!element.isConnected) return false;
    for (let p: Element | null = element; p; p = p.parentElement) {
      if (p.matches(contract.targets.hiddenAncestors)) return false;
      const style = element.ownerDocument.defaultView?.getComputedStyle(p);
      if (style?.display === "none" || style?.visibility === "hidden")
        return false;
    }
    return true;
  }
  function addressTrigger(document: Document): HTMLInputElement | undefined {
    if (
      document.location.host !== contract.host ||
      document.location.pathname !== contract.path
    )
      return;
    const fields = addressFieldNames.map((name) => {
      const found = document.querySelectorAll<HTMLInputElement>(
        contractText(contract.templates.addressInput, [name, name]),
      );
      return found.length === 1 ? found[0] : undefined;
    });
    if (
      !fields.every(
        (f, i) =>
          f instanceof HTMLInputElement &&
          f.type === contract.behavior.address.inputType &&
          (!contract.behavior.address.requireId ||
            f.id === addressFieldNames[i]) &&
          (!contract.behavior.address.requireName ||
            f.name === addressFieldNames[i]) &&
          f.readOnly ===
            contract.behavior.address.readOnlyFields.includes(
              addressFieldNames[i],
            ) &&
          !f.disabled &&
          visible(f),
      )
    )
      return;
    const trigger = fields[contract.behavior.address.roles.trigger]!;
    const domestic = document.querySelector<HTMLInputElement>(
      contract.behavior.address.requiredSelection.selector,
    );
    if (
      !domestic ||
      domestic.checked !==
        contract.behavior.address.requiredSelection.checked ||
      domestic.name !== contract.behavior.address.requiredSelection.name ||
      domestic.type !== contract.behavior.address.requiredSelection.type ||
      trigger.getAttribute(contract.tokens.dialogAttribute) !==
        contract.tokens.dialogId
    )
      return;
    if (document.querySelectorAll(contract.targets.addressDialog).length !== 1)
      return;
    return trigger;
  }
  function setText(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function modalCloseAction(modal: HTMLElement): HTMLButtonElement | undefined {
    const actions = Array.from(
      modal.querySelectorAll<HTMLButtonElement>(contract.targets.dialogClose),
    ).filter(
      (action) =>
        action.closest(contract.targets.ownedAddressDialog) === modal &&
        action.textContent
          ?.replace(contractPattern(contract.patterns.whitespace), " ")
          .trim() === contract.tokens.closeLabel,
    );
    return actions.length === 1 ? actions[0] : undefined;
  }
  async function runAddress({
    document,
    button,
    expected,
    loadCurrent,
    signal,
  }: AddressExecutionOptions): Promise<AddressResult> {
    const manual = (
      reason: string = contract.messages.addressUnconfirmed,
    ): AddressResult => ({ status: "manual", reason });
    if (
      contract.behavior.address.selection !== "FIRST_VISIBLE" ||
      ![
        "SELECTED_POSTAL_AND_ADDRESS",
        "POSTAL_AND_ROAD_WITHOUT_REFERENCE",
      ].includes(contract.behavior.address.verification) ||
      addressTrigger(document) !== button ||
      !contractPattern(contract.patterns.postalCode).test(
        expected.postalCode,
      ) ||
      !normalizeAddress(expected.address)
    )
      return manual();
    const fields = addressFieldNames.map((name) =>
      document.querySelector<HTMLInputElement>("#" + name)!,
    );
    const roles = contract.behavior.address.roles;
    const zip = fields[roles.zip],
      address = fields[roles.address],
      detail = fields[roles.detail];
    const originals = fields.map((f) => f.value);
    const desired: string[] = [];
    desired[roles.zip] = expected.postalCode;
    desired[roles.address] = expected.address;
    desired[roles.detail] = expected.detail;
    if (
      originals.some(
        (v, i) =>
          v !== "" && normalizeAddress(v) !== normalizeAddress(desired[i]),
      )
    )
      return manual(contract.messages.addressConflict);
    const modal = document.querySelector<HTMLElement>(
      contract.targets.addressDialog,
    )!;
    const modalWrap = modal.closest<HTMLElement>(
      contract.targets.dialogContainer,
    );
    const query = modal.querySelector<HTMLInputElement>(
      contract.targets.addressQuery,
    );
    const search = modal.querySelector<HTMLButtonElement>(
      contract.targets.addressSubmit,
    );
    const body = modal.querySelector<HTMLTableSectionElement>(
      contract.targets.addressResults,
    );
    const close = modalCloseAction(modal);
    if (
      modal.classList.contains(contract.tokens.openClass) ||
      !query ||
      query.type !== "text" ||
      !search ||
      search.type !== "button" ||
      !body ||
      document.querySelectorAll(contract.targets.addressQuery).length !== 1 ||
      document.querySelectorAll(contract.targets.addressSubmit).length !== 1 ||
      modal.querySelectorAll(contract.targets.addressResults).length !== 1
    )
      return manual();
    const modalReady = () =>
      modal.isConnected &&
      modal.classList.contains(contract.tokens.openClass) &&
      document.querySelector(contract.targets.addressQuery) === query &&
      document.querySelectorAll(contract.targets.addressQuery).length === 1 &&
      document.querySelector(contract.targets.addressSubmit) === search &&
      document.querySelectorAll(contract.targets.addressSubmit).length === 1 &&
      modal.querySelector(contract.targets.addressResults) === body &&
      modal.querySelectorAll(contract.targets.addressResults).length === 1 &&
      !query.disabled &&
      !query.readOnly &&
      !search.disabled &&
      !query.matches(":disabled") &&
      !search.matches(":disabled") &&
      visible(query) &&
      visible(search) &&
      visible(body);
    const targets = () =>
      !signal.aborted &&
      addressTrigger(document) === button &&
      fields.every(
        (f, i) => document.querySelector("#" + addressFieldNames[i]) === f,
      );
    const unchanged = () =>
      targets() && fields.every((f, i) => f.value === originals[i]);
    const unchangedIgnoringAbort = () =>
      addressTrigger(document) === button &&
      fields.every(
        (field, index) =>
          document.querySelector("#" + addressFieldNames[index]) === field &&
          field.value === originals[index],
      );
    const sameProfile = async () => {
      const p = await loadCurrent();
      return (
        p.address === expected.address &&
        p.postalCode === expected.postalCode &&
        p.detail === expected.detail
      );
    };
    let openedByRun = false;
    let ownedQueryValue = query.value;
    const closeOwnedModal = () => {
      if (!openedByRun || !modal.classList.contains(contract.tokens.openClass))
        return;
      const currentClose = modalCloseAction(modal);
      if (
        !modal.isConnected ||
        document.querySelector(contract.targets.addressDialog) !== modal ||
        document.querySelectorAll(contract.targets.addressDialog).length !==
          1 ||
        (modalWrap &&
          (!modalWrap.isConnected ||
            modal.closest(contract.targets.dialogContainer) !== modalWrap)) ||
        document.querySelector(contract.targets.addressQuery) !== query ||
        document.querySelectorAll(contract.targets.addressQuery).length !== 1 ||
        document.querySelector(contract.targets.addressSubmit) !== search ||
        document.querySelectorAll(contract.targets.addressSubmit).length !==
          1 ||
        modal.querySelector(contract.targets.addressResults) !== body ||
        modal.querySelectorAll(contract.targets.addressResults).length !== 1 ||
        currentClose !== close ||
        !currentClose ||
        currentClose.disabled ||
        currentClose.matches(":disabled") ||
        !visible(currentClose) ||
        query.value !== ownedQueryValue ||
        !unchangedIgnoringAbort()
      )
        return;
      currentClose.click();
    };
    try {
      if (!unchanged() || !(await sameProfile()) || !unchanged())
        return manual();
      if (
        zip.value === expected.postalCode &&
        normalizeAddress(address.value) === normalizeAddress(expected.address)
      ) {
        if (detail.value !== expected.detail) setText(detail, expected.detail);
        return targets() && detail.value === expected.detail
          ? {
              status: "written",
              reason: contract.messages.addressUnchanged,
            }
          : manual();
      }
      (button as HTMLInputElement).click();
      openedByRun =
        modal.isConnected &&
        modal.classList.contains(contract.tokens.openClass) &&
        document.querySelector(contract.targets.addressDialog) === modal;
      if (!modalReady() || !unchanged()) return manual();
      query.focus();
      setText(query, expected.address);
      ownedQueryValue = expected.address;
      let fresh = false;
      const observer = new MutationObserver(() => {
        fresh = true;
      });
      observer.observe(body, { childList: true, subtree: true });
      try {
        search.click();
        const deadline =
          Date.now() +
          contractValue<number>(contract.definitions.addressResultTimeoutMs);
        while (!fresh && Date.now() < deadline && unchanged() && modalReady())
          await new Promise((resolve) => setTimeout(resolve, 25));
        if (
          !fresh ||
          !unchanged() ||
          !modalReady() ||
          query.value !== expected.address ||
          !(await sameProfile()) ||
          !unchanged()
        )
          return manual();
        const selected = firstAddressResult(
          Array.from(
            body.querySelectorAll<HTMLAnchorElement>(
              contract.targets.addressResultButtons,
            ),
          )
            .filter((a) => visible(a))
            .map((element) => ({
              element,
              address: element.textContent?.trim(),
              postalCode: element
                .closest(contract.targets.resultRow)
                ?.querySelector(contract.targets.postalText)
                ?.textContent?.trim(),
            })),
        );
        if (
          !selected ||
          selected.element.tagName !== "A" ||
          selected.element
            .closest(contract.targets.resultRow)
            ?.querySelectorAll(contract.targets.addressResultButton).length !==
            1 ||
          !targets() ||
          !modalReady() ||
          query.value !== expected.address
        )
          return manual();
        selected.element.click();
        const callbackDeadline =
          Date.now() + contract.behavior.address.callbackTimeoutMs;
        while (
          Date.now() < callbackDeadline &&
          !signal.aborted &&
          targets() &&
          (zip.value !== selected.postalCode ||
            (contract.behavior.address.requireClosed &&
              modal.classList.contains(contract.tokens.openClass)))
        )
          await new Promise((resolve) =>
            setTimeout(resolve, contract.behavior.address.callbackPollMs),
          );
        if (
          !targets() ||
          zip.value !== selected.postalCode ||
          !matchesAddressText(
            address.value,
            selected.address!,
            contract.behavior.address.verification ===
              "POSTAL_AND_ROAD_WITHOUT_REFERENCE"
              ? "POSTAL_AND_ROAD_WITHOUT_REFERENCE"
              : undefined,
          ) ||
          (contract.behavior.address.requireClosed &&
            modal.classList.contains(contract.tokens.openClass)) ||
          (contract.behavior.address.detailAfterSelection === "EMPTY"
            ? detail.value !== ""
            : detail.value !== originals[roles.detail])
        )
          return manual();
        const completed = await runFlowProgram(
          contract.behavior.address.detailWorkflow,
          contract.behavior.address.detailEntrypoint,
          {
            targets: {
              detail,
              container: detail.closest<HTMLElement>(contract.targets.field),
            },
            values: {
              original: originals[roles.detail],
              desired: expected.detail,
              nonEmpty: String(Boolean(expected.detail)),
            },
            current: targets,
            checkpoint: sameProfile,
          },
        );
        return completed
          ? { status: "written", reason: contract.messages.addressWritten }
          : manual();
      } finally {
        observer.disconnect();
      }
    } catch {
      return manual();
    } finally {
      closeOwnedModal();
    }
  }

  return { addressFieldNames, addressTrigger, runAddress };
}
