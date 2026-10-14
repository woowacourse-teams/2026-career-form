import { componentCapability } from "../component-policy";
import { runDomPlan } from "../action-plan";
import { componentRules } from "../runtime-rules";
import { componentSelector } from "../component-dom";
import { componentPolicy } from "../../policy/component-policy";
import type {
  AddressExecutionOptions,
  AddressResult,
} from "../../address/types";
import { normalizeAddress, firstAddressResult } from "../../address/match";
import { waitFor } from "./workflow-controls";
import { componentUsable } from "./write";

export const componentAddressNames = (document: Document) =>
  componentCapability(document, "address")
    ? componentPolicy(document).addressNames
    : [];

function addressInputs(document: Document): HTMLInputElement[] | undefined {
  if (!componentCapability(document, "address")) return undefined;
  const inputs = componentAddressNames(document).map((name) => {
    const found = document.querySelectorAll<HTMLInputElement>(
      `input[name="${name}"]`,
    );
    return found.length === 1 ? found[0] : undefined;
  });
  return inputs.every(
    (input, index) =>
      input &&
      input.readOnly ===
        componentPolicy(document).structure.addressReadOnly[index] &&
      !input.disabled &&
      componentUsable(input),
  )
    ? (inputs as HTMLInputElement[])
    : undefined;
}

/** The unique "주소 찾기" button owned by the exact current-address field. */
export function componentAddressTrigger(
  document: Document,
): HTMLButtonElement | undefined {
  const inputs = addressInputs(document);
  if (!inputs) return undefined;
  let field = inputs[0].closest(componentSelector(inputs[0], "field"));
  while (field && !inputs.every((input) => field!.contains(input)))
    field =
      field.parentElement?.closest(
        componentSelector(field.parentElement, "field"),
      ) ?? null;
  const labels = field ? [...field.querySelectorAll("label")] : [];
  if (
    !field ||
    labels.length !== componentPolicy(document).addressStructure.labelCount ||
    labels[0].textContent?.replace(/[\s*]/g, "") !==
      componentPolicy(document).labels.address ||
    field.querySelectorAll("[name]").length !==
      componentAddressNames(document).length
  )
    return undefined;
  const buttons = [
    ...field.querySelectorAll<HTMLButtonElement>("button"),
  ].filter(
    (button) =>
      button.textContent?.trim() ===
      componentPolicy(document).labels.addressTrigger,
  );
  return buttons.length === 1 &&
    buttons[0].type === "button" &&
    componentUsable(buttons[0])
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
    componentSelector(dialog, "addressResults"),
  );
  if (lists.length !== 1) return undefined;
  return [
    ...lists[0].querySelectorAll(
      componentPolicy(dialog.ownerDocument).structure.addressRows,
    ),
  ].map((row) => {
    const labelled = (label: string) => {
      const parts = [
        ...row.querySelectorAll(
          componentPolicy(dialog.ownerDocument).structure.addressParts,
        ),
      ].filter(
        (part) =>
          part
            .querySelector(
              componentPolicy(dialog.ownerDocument).structure.addressPartLabel,
            )
            ?.textContent?.trim() === label,
      );
      if (
        parts.length !==
        componentPolicy(dialog.ownerDocument).addressStructure.resultLabelCount
      )
        return undefined;
      return parts[0]
        .textContent!.slice(
          componentPolicy(dialog.ownerDocument).addressStructure.labelRead ===
            "REMOVE_PREFIX"
            ? parts[0].querySelector(
                componentPolicy(dialog.ownerDocument).structure
                  .addressPartLabel,
              )!.textContent!.length
            : 0,
        )
        .trim();
    };
    return {
      element: row as HTMLElement,
      address: labelled(
        componentPolicy(dialog.ownerDocument).labels.addressResult,
      ),
      postalCode: labelled(
        componentPolicy(dialog.ownerDocument).labels.postalResult,
      ),
    };
  });
}

export async function runComponentAddress({
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
    componentAddressTrigger(document) !== button ||
    !/^\d{5}$/.test(expected.postalCode) ||
    !normalizeAddress(expected.address)
  )
    return manual();
  const rules = componentRules(document).address;
  const zip = fields[rules.zipIndex],
    address = fields[rules.addressIndex],
    detail = fields[rules.detailIndex];
  const desired: string[] = [];
  desired[rules.zipIndex] = expected.postalCode;
  desired[rules.addressIndex] = expected.address;
  desired[rules.detailIndex] = expected.detail;
  if (
    rules.protectExisting &&
    fields.some(
      (field, index) =>
        field.value !== "" &&
        !(
          index === rules.addressIndex &&
          rules.verification === "POSTAL_ONLY" &&
          zip.value === expected.postalCode
        ) &&
        normalizeAddress(field.value) !== normalizeAddress(desired[index]),
    )
  )
    return manual("지원서에 다른 주소가 입력되어 있어 덮어쓰지 않았습니다.");
  const targets = () =>
    !signal.aborted &&
    button.isConnected &&
    fields.every((field, index) => {
      const current = document.querySelectorAll(
        `input[name="${componentAddressNames(document)[index]}"]`,
      );
      return (
        current.length === 1 &&
        current[0] === field &&
        field.readOnly ===
          componentPolicy(document).structure.addressReadOnly[index] &&
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
  let selectedAddress = {
    address: expected.address,
    postalCode: expected.postalCode,
  };
  const selected = () =>
    zip.value === selectedAddress.postalCode &&
    (rules.verification === "POSTAL_ONLY" ||
      normalizeAddress(address.value) ===
        normalizeAddress(selectedAddress.address));
  const writeDetail = async (reason: string): Promise<AddressResult> => {
    if (
      !(await sameProfile()) ||
      !targets() ||
      componentAddressTrigger(document) !== button ||
      !selected() ||
      (rules.protectExisting &&
        detail.value !== "" &&
        detail.value !== expected.detail)
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
  if (rules.protectExisting && (zip.value || address.value)) return manual();

  const before = new Set(
    document.querySelectorAll(componentSelector(document, "openDialog")),
  );
  let dialog: HTMLElement | undefined;
  try {
    (button as HTMLElement).click();
    dialog = await waitFor(
      () => {
        const opened = [
          ...document.querySelectorAll<HTMLElement>(
            componentSelector(document, "openDialog"),
          ),
        ].filter(
          (candidate) =>
            !before.has(candidate) &&
            candidate.querySelectorAll(
              componentPolicy(document).structure.addressSearchInput,
            ).length === 1,
        );
        return opened.length === 1 ? opened[0] : undefined;
      },
      signal,
      document,
    );
    if (!dialog || !targets()) return manual();
    const query = dialog.querySelector<HTMLInputElement>(
      componentPolicy(document).structure.addressSearchInput,
    )!;
    if (query.disabled || query.readOnly || !componentUsable(query))
      return manual();
    const owner = dialog;
    let refreshed = false;
    const observer = new MutationObserver(() => {
      refreshed = true;
    });
    observer.observe(owner, { childList: true, subtree: true });
    if (
      !runDomPlan(
        componentPolicy(document).actionPlans.addressSearch,
        { input: query },
        { value: expected.address },
        () => !signal.aborted && query.isConnected,
      )
    ) {
      observer.disconnect();
      return manual();
    }
    // Only results rendered after this search may end it without a match.
    const row = await waitFor<HTMLElement | false>(
      () => {
        if (
          !owner.matches(componentSelector(owner, "openDialog")) ||
          query.value !== expected.address
        )
          return false;
        const rows = resultRows(owner) ?? [];
        if (!refreshed) return undefined;
        const first =
          rules.selectionStrategy === "FIRST_RESULT"
            ? firstAddressResult(rows)
            : undefined;
        return first && componentUsable(first.element)
          ? first.element
          : undefined;
      },
      signal,
      document,
      componentRules(document).timeouts.searchMs,
    ).finally(() => observer.disconnect());
    if (
      !row ||
      !(await sameProfile()) ||
      !targets() ||
      zip.value ||
      address.value
    )
      return manual();
    const first =
      rules.selectionStrategy === "FIRST_RESULT"
        ? firstAddressResult(resultRows(owner) ?? [])
        : undefined;
    if (
      !owner.matches(componentSelector(owner, "openDialog")) ||
      !owner.contains(query) ||
      query.value !== expected.address ||
      !first ||
      first.element !== row ||
      !componentUsable(row)
    )
      return manual();
    selectedAddress = {
      address: first.address!,
      postalCode: first.postalCode!,
    };
    row.click();
    const closed = await waitFor(
      () =>
        selected() &&
        (!rules.requireClosed ||
          !owner.matches(componentSelector(owner, "openDialog"))) &&
        componentAddressTrigger(document) === button
          ? true
          : undefined,
      signal,
      document,
      componentRules(document).timeouts.addressCloseMs,
    );
    if (!closed) return manual();
    return writeDetail("주소 검색 선택과 지원서 반영을 확인했습니다.");
  } finally {
    if (dialog?.matches(componentSelector(dialog, "openDialog"))) {
      const close = dialog.querySelectorAll<HTMLElement>(
        componentSelector(dialog, "dialogClose"),
      );
      if (close.length === 1) close[0].click();
    }
    if (dialog) {
      const owner = dialog;
      const restored = await waitFor(
        () =>
          !owner.matches(componentSelector(owner, "openDialog")) &&
          !fields.some((field) =>
            field.closest('[aria-hidden="true"], [inert]'),
          )
            ? true
            : undefined,
        signal,
        document,
        componentRules(document).timeouts.addressCloseMs,
      );
      if (!restored && !signal.aborted)
        throw new Error("주소 검색 창이 닫혔는지 확인하지 못했습니다.");
    }
  }
}
