import type {
  AddressExecutionOptions,
  AddressResult,
} from "../../address/types";
import { normalizeAddress } from "../../address/match";
import { waitFor } from "./workflow-controls";
import { greetingUsable } from "./write";

export const greetingAddressNames = [
  "personalInformation.currentAddress.postalCode",
  "personalInformation.currentAddress.address",
  "personalInformation.currentAddress.detailedAddress",
] as const;
const FIELD = '[data-scope="field"][data-part="root"]';
const OPEN_DIALOG =
  '[role="dialog"][data-scope="dialog"][data-part="content"][data-state="open"]';

function addressInputs(document: Document): HTMLInputElement[] | undefined {
  const inputs = greetingAddressNames.map((name) => {
    const found = document.querySelectorAll<HTMLInputElement>(
      `input[name="${name}"]`,
    );
    return found.length === 1 ? found[0] : undefined;
  });
  return inputs.every(
    (input, index) =>
      input &&
      input.readOnly === index < 2 &&
      !input.disabled &&
      greetingUsable(input),
  )
    ? (inputs as HTMLInputElement[])
    : undefined;
}

/** The unique "주소 찾기" button owned by the exact current-address field. */
export function greetingAddressTrigger(
  document: Document,
): HTMLButtonElement | undefined {
  const inputs = addressInputs(document);
  if (!inputs) return undefined;
  let field = inputs[0].closest(FIELD);
  while (field && !inputs.every((input) => field!.contains(input)))
    field = field.parentElement?.closest(FIELD) ?? null;
  const labels = field ? [...field.querySelectorAll("label")] : [];
  if (
    !field ||
    labels.length !== 1 ||
    labels[0].textContent?.replace(/[\s*]/g, "") !== "현주소" ||
    field.querySelectorAll("[name]").length !== greetingAddressNames.length
  )
    return undefined;
  const buttons = [
    ...field.querySelectorAll<HTMLButtonElement>("button"),
  ].filter((button) => button.textContent?.trim() === "주소 찾기");
  return buttons.length === 1 &&
    buttons[0].type === "button" &&
    greetingUsable(buttons[0])
    ? buttons[0]
    : undefined;
}

function setText(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Each result shows one labelled road address and one labelled postal code. */
function resultRows(dialog: HTMLElement) {
  const lists = dialog.querySelectorAll(
    '[data-scope="scroll-area"][data-part="content"]',
  );
  if (lists.length !== 1) return undefined;
  return [...lists[0].children].map((row) => {
    const labelled = (label: string) => {
      const parts = [...row.children].filter(
        (part) => part.firstElementChild?.textContent?.trim() === label,
      );
      if (parts.length !== 1) return undefined;
      return parts[0]
        .textContent!.slice(parts[0].firstElementChild!.textContent!.length)
        .trim();
    };
    return {
      element: row as HTMLElement,
      address: labelled("주소"),
      postalCode: labelled("우편번호"),
    };
  });
}

export async function runGreetingAddress({
  document,
  button,
  expected,
  loadCurrent,
  signal,
}: AddressExecutionOptions): Promise<AddressResult> {
  const manual = (
    reason = "주소 검색 결과를 확정하지 못했습니다. 직접 확인해 주세요.",
  ): AddressResult => ({ status: "manual", reason });
  const fields = addressInputs(document);
  if (
    !fields ||
    greetingAddressTrigger(document) !== button ||
    !/^\d{5}$/.test(expected.postalCode) ||
    !normalizeAddress(expected.address)
  )
    return manual();
  const [zip, address, detail] = fields;
  const desired = [expected.postalCode, expected.address, expected.detail];
  if (
    fields.some(
      (field, index) =>
        field.value !== "" &&
        normalizeAddress(field.value) !== normalizeAddress(desired[index]),
    )
  )
    return manual("지원서에 다른 주소가 입력되어 있어 덮어쓰지 않았습니다.");
  const targets = () =>
    !signal.aborted &&
    button.isConnected &&
    fields.every((field, index) => {
      const current = document.querySelectorAll(
        `input[name="${greetingAddressNames[index]}"]`,
      );
      return (
        current.length === 1 &&
        current[0] === field &&
        field.readOnly === index < 2 &&
        !field.disabled
      );
    });
  const sameProfile = async () => {
    const current = await loadCurrent();
    return (
      current.address === expected.address &&
      current.postalCode === expected.postalCode &&
      current.detail === expected.detail
    );
  };
  const selected = () =>
    zip.value === expected.postalCode &&
    normalizeAddress(address.value) === normalizeAddress(expected.address);
  const writeDetail = async (reason: string): Promise<AddressResult> => {
    if (
      !(await sameProfile()) ||
      !targets() ||
      greetingAddressTrigger(document) !== button ||
      !selected() ||
      (detail.value !== "" && detail.value !== expected.detail)
    )
      return manual();
    if (detail.value !== expected.detail) setText(detail, expected.detail);
    return targets() && detail.value === expected.detail
      ? { status: "written", reason }
      : manual();
  };
  if (!(await sameProfile()) || !targets()) return manual();
  if (selected())
    return writeDetail("주소 일치와 상세주소 반영을 확인했습니다.");
  if (zip.value || address.value) return manual();

  const before = new Set(document.querySelectorAll(OPEN_DIALOG));
  let dialog: HTMLElement | undefined;
  try {
    (button as HTMLElement).click();
    dialog = await waitFor(() => {
      const opened = [
        ...document.querySelectorAll<HTMLElement>(OPEN_DIALOG),
      ].filter(
        (candidate) =>
          !before.has(candidate) &&
          candidate.querySelectorAll('input[type="search"]').length === 1,
      );
      return opened.length === 1 ? opened[0] : undefined;
    }, signal);
    if (!dialog || !targets()) return manual();
    const query = dialog.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    if (query.disabled || query.readOnly || !greetingUsable(query))
      return manual();
    const owner = dialog;
    let refreshed = false;
    const observer = new MutationObserver(() => {
      refreshed = true;
    });
    observer.observe(owner, { childList: true, subtree: true });
    query.focus();
    setText(query, expected.address);
    query.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    // Only results rendered after this search may end it without a match.
    const row = await waitFor<HTMLElement | false>(
      () => {
        if (!owner.matches(OPEN_DIALOG) || query.value !== expected.address)
          return false;
        const rows = resultRows(owner) ?? [];
        const matches = rows.filter(
          (result) =>
            result.postalCode === expected.postalCode &&
            !!result.address &&
            normalizeAddress(result.address) ===
              normalizeAddress(expected.address),
        );
        if (matches.length > 1 || (refreshed && rows.length && !matches.length))
          return false;
        return matches.length === 1 && greetingUsable(matches[0].element)
          ? matches[0].element
          : undefined;
      },
      signal,
      5000,
    ).finally(() => observer.disconnect());
    if (
      !row ||
      !(await sameProfile()) ||
      !targets() ||
      zip.value ||
      address.value
    )
      return manual();
    const matches = (resultRows(owner) ?? []).filter(
      (result) =>
        result.postalCode === expected.postalCode &&
        !!result.address &&
        normalizeAddress(result.address) === normalizeAddress(expected.address),
    );
    if (
      !owner.matches(OPEN_DIALOG) ||
      !owner.contains(query) ||
      query.value !== expected.address ||
      matches.length !== 1 ||
      matches[0].element !== row ||
      !greetingUsable(row)
    )
      return manual();
    row.click();
    const closed = await waitFor(
      () =>
        selected() &&
        !owner.matches(OPEN_DIALOG) &&
        greetingAddressTrigger(document) === button
          ? true
          : undefined,
      signal,
      3000,
    );
    if (!closed) return manual();
    return writeDetail("주소 검색 선택과 지원서 반영을 확인했습니다.");
  } finally {
    if (dialog?.matches(OPEN_DIALOG)) {
      const close = dialog.querySelectorAll<HTMLElement>(
        '[data-scope="dialog"][data-part="close-trigger"]',
      );
      if (close.length === 1) close[0].click();
    }
    if (dialog) {
      const owner = dialog;
      const restored = await waitFor(
        () =>
          !owner.matches(OPEN_DIALOG) &&
          !fields.some((field) =>
            field.closest('[aria-hidden="true"], [inert]'),
          )
            ? true
            : undefined,
        signal,
        3000,
      );
      if (!restored && !signal.aborted)
        throw new Error("주소 검색 창이 닫혔는지 확인하지 못했습니다.");
    }
  }
}
