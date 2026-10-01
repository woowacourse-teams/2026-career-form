import type {
  AddressExecutionOptions,
  AddressResult,
} from "../../address/types";
import { normalizeAddress } from "../../address/match";

export const hyundaiAddressNames = ["postCd", "addr", "addrDtl"] as const;
function visible(element: Element): boolean {
  if (!element.isConnected) return false;
  for (let p: Element | null = element; p; p = p.parentElement) {
    if (p.matches("[hidden], [inert], [aria-hidden=true]")) return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(p);
    if (style?.display === "none" || style?.visibility === "hidden")
      return false;
  }
  return true;
}
export function hyundaiAddressTrigger(
  document: Document,
): HTMLInputElement | undefined {
  if (
    document.location.host !== "talent.hyundai.com" ||
    document.location.pathname !== "/apply/applyWrite.hc"
  )
    return;
  const fields = hyundaiAddressNames.map((name) => {
    const found = document.querySelectorAll<HTMLInputElement>(
      `#${name},input[name="${name}"]`,
    );
    return found.length === 1 ? found[0] : undefined;
  });
  if (
    !fields.every(
      (f, i) =>
        f instanceof HTMLInputElement &&
        f.type === "text" &&
        f.id === hyundaiAddressNames[i] &&
        f.name === hyundaiAddressNames[i] &&
        f.readOnly === i < 2 &&
        !f.disabled &&
        visible(f),
    )
  )
    return;
  const trigger = fields[0]!;
  const domestic = document.querySelector<HTMLInputElement>("#inExGb");
  if (
    !domestic?.checked ||
    domestic.name !== "inExGb" ||
    domestic.type !== "radio" ||
    trigger.getAttribute("data-modal") !== "modal-address"
  )
    return;
  if (document.querySelectorAll(".modal-address").length !== 1) return;
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
    modal.querySelectorAll<HTMLButtonElement>(
      "button.btn-modal-close[type='button']",
    ),
  ).filter(
    (action) =>
      action.closest(".modal.modal-address") === modal &&
      action.textContent?.replace(/\s+/g, " ").trim() === "닫기",
  );
  return actions.length === 1 ? actions[0] : undefined;
}
export async function runHyundaiAddress({
  document,
  button,
  expected,
  loadCurrent,
  signal,
}: AddressExecutionOptions): Promise<AddressResult> {
  const manual = (
    reason = "주소 검색 결과를 확정하지 못했습니다. 직접 확인해 주세요.",
  ): AddressResult => ({ status: "manual", reason });
  if (
    hyundaiAddressTrigger(document) !== button ||
    !/^\d{5}$/.test(expected.postalCode) ||
    !normalizeAddress(expected.address)
  )
    return manual();
  const fields = hyundaiAddressNames.map((name) =>
    document.querySelector<HTMLInputElement>("#" + name)!,
  );
  const [zip, address, detail] = fields;
  const originals = fields.map((f) => f.value);
  const desired = [expected.postalCode, expected.address, expected.detail];
  if (
    originals.some(
      (v, i) =>
        v !== "" && normalizeAddress(v) !== normalizeAddress(desired[i]),
    )
  )
    return manual("지원서에 다른 주소가 입력되어 있어 덮어쓰지 않았습니다.");
  const modal = document.querySelector<HTMLElement>(".modal-address")!;
  const modalWrap = modal.closest<HTMLElement>(".modal-wrap");
  const query = modal.querySelector<HTMLInputElement>("#addressKeyword");
  const search = modal.querySelector<HTMLButtonElement>("#btnAddress");
  const body =
    modal.querySelector<HTMLTableSectionElement>(".table-modal tbody");
  const close = modalCloseAction(modal);
  if (
    modal.classList.contains("active") ||
    !query ||
    query.type !== "text" ||
    !search ||
    search.type !== "button" ||
    !body ||
    document.querySelectorAll("#addressKeyword").length !== 1 ||
    document.querySelectorAll("#btnAddress").length !== 1 ||
    modal.querySelectorAll(".table-modal tbody").length !== 1
  )
    return manual();
  const modalReady = () =>
    modal.isConnected &&
    modal.classList.contains("active") &&
    document.querySelector("#addressKeyword") === query &&
    document.querySelectorAll("#addressKeyword").length === 1 &&
    document.querySelector("#btnAddress") === search &&
    document.querySelectorAll("#btnAddress").length === 1 &&
    modal.querySelector(".table-modal tbody") === body &&
    modal.querySelectorAll(".table-modal tbody").length === 1 &&
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
    hyundaiAddressTrigger(document) === button &&
    fields.every(
      (f, i) => document.querySelector("#" + hyundaiAddressNames[i]) === f,
    );
  const unchanged = () =>
    targets() && fields.every((f, i) => f.value === originals[i]);
  const unchangedIgnoringAbort = () =>
    hyundaiAddressTrigger(document) === button &&
    fields.every(
      (field, index) =>
        document.querySelector("#" + hyundaiAddressNames[index]) === field &&
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
    if (!openedByRun || !modal.classList.contains("active")) return;
    const currentClose = modalCloseAction(modal);
    if (
      !modal.isConnected ||
      document.querySelector(".modal-address") !== modal ||
      document.querySelectorAll(".modal-address").length !== 1 ||
      (modalWrap &&
        (!modalWrap.isConnected ||
          modal.closest(".modal-wrap") !== modalWrap)) ||
      document.querySelector("#addressKeyword") !== query ||
      document.querySelectorAll("#addressKeyword").length !== 1 ||
      document.querySelector("#btnAddress") !== search ||
      document.querySelectorAll("#btnAddress").length !== 1 ||
      modal.querySelector(".table-modal tbody") !== body ||
      modal.querySelectorAll(".table-modal tbody").length !== 1 ||
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
    if (!unchanged() || !(await sameProfile()) || !unchanged()) return manual();
    if (
      zip.value === expected.postalCode &&
      normalizeAddress(address.value) === normalizeAddress(expected.address)
    ) {
      if (detail.value !== expected.detail) setText(detail, expected.detail);
      return targets() && detail.value === expected.detail
        ? {
            status: "written",
            reason: "주소 일치와 상세주소 반영을 확인했습니다.",
          }
        : manual();
    }
    (button as HTMLInputElement).click();
    openedByRun =
      modal.isConnected &&
      modal.classList.contains("active") &&
      document.querySelector(".modal-address") === modal;
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
      const deadline = Date.now() + 3000;
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
      const matches = Array.from(
        body.querySelectorAll<HTMLAnchorElement>("tr .btn-address"),
      ).filter((a) => {
        const row = a.closest("tr");
        return (
          a.tagName === "A" &&
          visible(a) &&
          row?.querySelectorAll(".btn-address").length === 1 &&
          row.querySelector(".zipcode")?.textContent?.trim() ===
            expected.postalCode &&
          normalizeAddress(a.textContent ?? "") ===
            normalizeAddress(expected.address)
        );
      });
      if (
        matches.length !== 1 ||
        !targets() ||
        !modalReady() ||
        query.value !== expected.address
      )
        return manual();
      matches[0].click();
      // The site's synchronous normal selection clears detail. Restore only after
      // verifying both address components, modal closure and the expected clearing.
      if (
        !targets() ||
        zip.value !== expected.postalCode ||
        normalizeAddress(address.value) !==
          normalizeAddress(expected.address) ||
        modal.classList.contains("active") ||
        detail.value !== ""
      )
        return manual();
      if (originals[2]) setText(detail, originals[2]);
      if (!(await sameProfile()) || !targets() || detail.value !== originals[2])
        return manual();
      if (detail.value !== expected.detail) setText(detail, expected.detail);
      detail
        .closest(".field")
        ?.classList.toggle("exist", Boolean(expected.detail));
      return targets() && detail.value === expected.detail
        ? {
            status: "written",
            reason: "주소 검색 선택과 지원서 반영을 확인했습니다.",
          }
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
