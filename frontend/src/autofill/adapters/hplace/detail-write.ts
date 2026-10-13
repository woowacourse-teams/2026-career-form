import { normalizeAddress, type AddressIdentity } from "../../address/match";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { ownedDetailControl, type DetailKey } from "./detail";
import { registrationBlockReason } from "./registration";
function approved(key: DetailKey, item: ReviewPlanItem): boolean {
  const a = item.analysis,
    b = a?.valueBinding;
  return (
    a?.mappingStatus === "ADAPTER_VERIFIED" &&
    (a.autofillPolicy === "ALLOWED" ||
      (key === "emergencyPhone" && a.autofillPolicy === "CONDITIONAL")) &&
    a.interactionStatus === "READY" &&
    a.writePlan?.command === "SET_TEXT" &&
    (key === "englishName"
      ? b?.type === "DERIVED" && b.recipe === "ENGLISH_FULL_NAME_GIVEN_FIRST"
      : b?.type === "DIRECT" &&
        b.profileFieldKey ===
          (
            {
              birthday: "personal.personal.birthDate",
              detailAddress: "contact.contact.addressLine2",
              emergencyPhone: "contact.contact.emergencyPhoneNumber",
            } as const
          )[key])
  );
}
export function detailTargetValue(
  key: DetailKey,
  value: string,
): string | undefined {
  if (!value.trim()) return undefined;
  if (key === "birthday") {
    const m = /^(\d{4})([-.])(\d{2})\2(\d{2})$/.exec(value);
    if (!m) return undefined;
    const y = Number(m[1]),
      month = Number(m[3]),
      day = Number(m[4]);
    const date = new Date(0);
    date.setUTCFullYear(y, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return y >= 1900 &&
      y <= new Date().getFullYear() - 16 &&
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? `${m[1]}.${m[3]}.${m[4]}`
      : undefined;
  }
  if (key === "emergencyPhone" && !/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(value))
    return undefined;
  return value;
}
export async function writeDetail(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  currentRun: () => boolean,
  beforeMutation?: () => Promise<boolean>,
  expectedAddress?: AddressIdentity,
): Promise<boolean> {
  const owned = ownedDetailControl(handle);
  if (!owned) return false;
  const { key, input } = owned;
  const profileValue = item.profileValue;
  const target = detailTargetValue(key, profileValue ?? "");
  const original = input.value;
  const url = input.ownerDocument.URL;
  let expected = original;
  const current = () =>
    currentRun() &&
    input.ownerDocument.URL === url &&
    item.profileValue === profileValue &&
    item.selected &&
    !item.disabled &&
    (item.status === "available" ||
      (key === "emergencyPhone" &&
        item.status === "needs-review" &&
        item.analysis?.autofillPolicy === "CONDITIONAL")) &&
    item.candidateId === handle.candidateId &&
    item.analysis?.candidateId === handle.candidateId &&
    approved(key, item) &&
    ownedDetailControl(handle)?.input === input &&
    (key !== "detailAddress" ||
      detailAddressMatches(handle, expectedAddress)) &&
    !registrationBlockReason([input]) &&
    input.value === expected;
  if (
    !target ||
    (input.maxLength >= 0 && target.length > input.maxLength) ||
    (original !== "" && original !== target) ||
    !current()
  )
    return false;
  if (original === target) return true;
  try {
    if (beforeMutation && !(await beforeMutation())) return false;
  } catch {
    return false;
  }
  if (!current()) return false;
  input.focus();
  if (!current()) return false;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return false;
  setter.call(input, target);
  expected = target;
  for (const type of ["input", "change"]) {
    input.dispatchEvent(new Event(type, { bubbles: true }));
    if (!current()) return false;
  }
  input.blur();
  if (!current()) return false;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return current() && input.checkValidity();
}

export function detailAddressMatches(
  handle: FieldCandidateHandle,
  expected?: AddressIdentity,
): boolean {
  const owned = ownedDetailControl(handle);
  if (
    !owned ||
    owned.key !== "detailAddress" ||
    !expected ||
    !normalizeAddress(expected.address) ||
    !/^\d{5}$/.test(expected.postalCode)
  )
    return false;
  const { input } = owned;
  const document = input.ownerDocument;
  const row = input.closest('[data-row="address"]');
  const bases = document.querySelectorAll('[name="currentAddress.address"]');
  const postals = document.querySelectorAll('[name="currentAddress.zipCode"]');
  const displays = document.querySelectorAll(
    'span.postCode[data-type="currentAddress"][data-span="postcode"]',
  );
  const base = bases[0],
    postal = postals[0],
    display = displays[0];
  return (
    !!row &&
    bases.length === 1 &&
    postals.length === 1 &&
    displays.length === 1 &&
    base instanceof HTMLInputElement &&
    postal instanceof HTMLInputElement &&
    base.readOnly &&
    base.type === "text" &&
    postal.type === "text" &&
    postal.classList.contains("hidden") &&
    [base, postal, display].every(
      (element) => element.closest('[data-row="address"]') === row,
    ) &&
    base.form === input.form &&
    postal.form === input.form &&
    normalizeAddress(base.value) === normalizeAddress(expected.address) &&
    postal.value === expected.postalCode &&
    display.textContent?.trim() === expected.postalCode
  );
}
