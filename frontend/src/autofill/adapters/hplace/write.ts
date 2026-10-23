import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { FailureReporter } from "../../write/failure";
import {
  ownedRegistrationControls,
  registrationBlockReason,
  registrationKey,
  registrationNames,
  registrationValue,
  type RegistrationKey,
} from "./registration";

export function isRegistrationItem(
  item: ReviewPlanItem,
  name?: string,
): boolean {
  const key = (Object.keys(registrationNames) as RegistrationKey[]).find(
    (key) => registrationNames[key] === name,
  );
  const binding = item.analysis?.valueBinding;
  return (
    !!key &&
    item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
    item.analysis.autofillPolicy === "ALLOWED" &&
    item.analysis.writePlan?.command === "SET_TEXT" &&
    (key === "name"
      ? binding?.type === "DERIVED" && binding.recipe === "KOREAN_FULL_NAME"
      : binding?.type === "DIRECT" &&
        binding.profileFieldKey ===
          `contact.contact.${key === "mobile" ? "phoneNumber" : "email"}`)
  );
}

function targetValues(
  key: RegistrationKey,
  value: string,
): string[] | undefined {
  if (key === "mobile") {
    if (!/^[\d -]+$/.test(value)) return undefined;
    return /^(01[016789])(\d{3,4})(\d{4})$/
      .exec(value.replace(/[ -]/g, ""))
      ?.slice(1);
  }
  if (key === "email")
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? [value, value]
      : undefined;
  return value ? [value] : undefined;
}

export function settleRegistration(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  signal?: AbortSignal,
): boolean {
  const key = registrationKey(handle);
  const inputs = ownedRegistrationControls(handle);
  const values = key ? targetValues(key, item.profileValue ?? "") : undefined;
  return (
    !signal?.aborted &&
    !!inputs &&
    !!values &&
    item.candidateId === handle.candidateId &&
    item.analysis?.candidateId === handle.candidateId &&
    isRegistrationItem(item, handle.candidate.domName) &&
    !registrationBlockReason(inputs) &&
    inputs.length === values.length &&
    inputs.every((input, index) => input.value === values[index]) &&
    (key !== "mobile" || registrationValue(handle) === values.join("-"))
  );
}

function validator(
  document: Document,
  input: HTMLInputElement,
  id: string,
): HTMLElement | undefined {
  const nodes = document.querySelectorAll<HTMLElement>(`[id="${id}"]`);
  return nodes.length === 1 &&
    nodes[0].closest(".subject") === input.closest(".subject")
    ? nodes[0]
    : undefined;
}

async function waitValidated(
  message: HTMLElement,
  current: () => boolean,
): Promise<boolean> {
  const end = performance.now() + 1200;
  while (current() && performance.now() < end) {
    if (message.classList.contains("ok")) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

export async function writeRegistration(
  document: Document,
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  signal: AbortSignal,
  _report?: FailureReporter,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  const key = registrationKey(handle);
  const inputs = ownedRegistrationControls(handle);
  const values = key ? targetValues(key, item.profileValue ?? "") : undefined;
  if (
    !key ||
    !inputs ||
    !values ||
    !isRegistrationItem(item, handle.candidate.domName) ||
    item.candidateId !== handle.candidateId ||
    item.analysis?.candidateId !== handle.candidateId ||
    item.analysis.interactionStatus !== "READY" ||
    item.disabled ||
    !item.selected ||
    values.length !== inputs.length ||
    inputs.some(
      (input, i) => input.maxLength >= 0 && values[i].length > input.maxLength,
    )
  )
    return false;
  const expected = inputs.map((input) => input.value);
  if (
    (expected.some((value) => value !== "") &&
      !expected.every((value, i) => value === values[i])) ||
    (key === "mobile" &&
      expected.every((value) => value === "") &&
      registrationValue(handle) !== "")
  )
    return false;
  const url = document.URL;
  const profileValue = item.profileValue;
  const messages =
    key === "name"
      ? [validator(document, inputs[0], "nameRegMsg")]
      : key === "email"
        ? [
            validator(document, inputs[0], "emailRegMsg"),
            validator(document, inputs[1], "emailValidaterMsg"),
          ]
        : [];
  if (messages.some((message) => !message)) return false;
  const current = () =>
    !signal.aborted &&
    document.URL === url &&
    item.profileValue === profileValue &&
    isRegistrationItem(item, handle.candidate.domName) &&
    item.selected &&
    !item.disabled &&
    item.status === "available" &&
    messages.every(
      (message, i) =>
        message?.isConnected &&
        validator(document, inputs[i], message.id) === message,
    ) &&
    ownedRegistrationControls(handle)?.every(
      (input, i) => input === inputs[i] && input.value === expected[i],
    ) === true &&
    !registrationBlockReason(inputs);
  if (!current()) return false;
  if (expected.every((value, i) => value === values[i]))
    return settleRegistration(handle, item, signal);
  // Blank controls with an old success marker cannot prove current validation.
  if (messages.some((message) => message?.classList.contains("ok")))
    return false;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return false;
  for (let i = 0; i < inputs.length; i++) {
    try {
      if (
        !current() ||
        (beforeMutation && !(await beforeMutation())) ||
        !current()
      )
        return false;
    } catch {
      return false;
    }
    const input = inputs[i];
    if (messages[i]?.classList.contains("ok")) return false;
    input.focus();
    if (!current()) return false;
    setter.call(input, values[i]);
    expected[i] = values[i];
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (!current()) return false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const valid = !messages[i] || (await waitValidated(messages[i]!, current));
    if (!current()) return false;
    // The source email blur may clear its confirmation; finish it before the next input.
    input.blur();
    if (!valid || !current()) return false;
  }
  return current() && settleRegistration(handle, item, signal);
}
