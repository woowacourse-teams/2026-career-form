import { isHplaceDocument } from "./fingerprint";
import type {
  FieldCandidateHandle,
  CandidateBlockReason,
} from "../../dom/types";

export const registrationSectionId = "hplace-registration";
export const registrationNames = {
  name: "hplace.registration.name",
  mobile: "hplace.registration.mobile",
  email: "hplace.registration.email",
} as const;
export type RegistrationKey = keyof typeof registrationNames;
export type RegistrationControls = Record<RegistrationKey, HTMLInputElement[]>;

function oneInput(
  document: Document,
  id: string,
  type: string,
  name: string,
): HTMLInputElement | undefined {
  const matches = document.querySelectorAll(`[id="${id}"]`);
  const input = matches[0];
  return matches.length === 1 &&
    input instanceof HTMLInputElement &&
    input.type === type &&
    input.name === name
    ? input
    : undefined;
}

function subject(input: HTMLInputElement, label: string): Element | undefined {
  const root = input.closest(".subject");
  const labels = root?.querySelectorAll(":scope > label.h2");
  return labels?.length === 1 && labels[0].textContent?.trim() === label
    ? root!
    : undefined;
}

function ownAction(document: Document, form: HTMLFormElement): boolean {
  try {
    const url = new URL(form.getAttribute("action") ?? "", document.URL);
    return (
      url.origin === document.location.origin &&
      url.pathname === "/app/applicant/writeResume"
    );
  } catch {
    return false;
  }
}

export function registrationControls(
  document: Document,
): RegistrationControls | undefined {
  if (
    document.location?.pathname !== "/app/applicant/registResume" ||
    !isHplaceDocument(document)
  )
    return undefined;
  const forms = document.querySelectorAll('[id="frm"]');
  const sections = document.querySelectorAll('[id="loginForm"]');
  const form = forms[0];
  const section = sections[0];
  if (
    !(form instanceof HTMLFormElement) ||
    forms.length !== 1 ||
    sections.length !== 1 ||
    !section.matches("section.writeResume") ||
    section.closest("form") !== form ||
    form.method !== "post" ||
    !ownAction(document, form)
  )
    return undefined;
  const name = oneInput(document, "name", "text", "name");
  const mobile = ["mobile1", "mobile2", "mobile3"].map((id) =>
    oneInput(document, id, "text", ""),
  );
  const email = oneInput(document, "email", "email", "email");
  const confirm = oneInput(document, "emailConfirm", "email", "");
  const combined = oneInput(document, "mobileCombined", "hidden", "mobile");
  const all = [name, ...mobile, email, confirm, combined];
  if (
    all.some(
      (input) =>
        !input || input.form !== form || input.closest("section") !== section,
    ) ||
    !name ||
    !email ||
    !confirm ||
    mobile.some((input) => !input)
  )
    return undefined;
  const phone = mobile as HTMLInputElement[];
  if (
    !subject(name, "성명") ||
    !subject(phone[0], "휴대전화") ||
    phone.some(
      (input) =>
        input.closest(".subject") !== phone[0].closest(".subject") ||
        input.parentElement?.parentElement !==
          phone[0].parentElement?.parentElement,
    ) ||
    phone.some((input, index) => input.maxLength !== [3, 4, 4][index]) ||
    !subject(email, "이메일") ||
    email.closest(".subject") !== confirm.closest(".subject") ||
    confirm.getAttribute("data-type") !== "email"
  )
    return undefined;
  return { name: [name], mobile: phone, email: [email, confirm] };
}

export function registrationKey(
  handle: FieldCandidateHandle,
): RegistrationKey | undefined {
  return (Object.keys(registrationNames) as RegistrationKey[]).find(
    (key) =>
      handle.candidate.domName === registrationNames[key] &&
      handle.candidate.domId === registrationNames[key],
  );
}

export function ownedRegistrationControls(
  handle: FieldCandidateHandle,
): HTMLInputElement[] | undefined {
  const key = registrationKey(handle);
  if (!key) return undefined;
  const document = handle.elements[0]?.ownerDocument;
  const controls =
    key && document ? registrationControls(document)?.[key] : undefined;
  return controls &&
    controls.length === handle.elements.length &&
    controls.every((input, index) => input === handle.elements[index])
    ? controls
    : undefined;
}

export function registrationBlockReason(
  inputs: HTMLInputElement[],
): CandidateBlockReason | undefined {
  if (inputs.some((input) => input.matches(":disabled, [aria-disabled=true]")))
    return "disabled";
  if (inputs.some((input) => input.readOnly)) return "readonly";
  if (inputs.some((input) => input.closest("[inert]"))) return "inert";
  for (const input of inputs) {
    for (
      let element: Element | null = input;
      element;
      element = element.parentElement
    ) {
      const style =
        element.ownerDocument.defaultView?.getComputedStyle(element);
      if (
        element.matches("[hidden], [aria-hidden=true]") ||
        style?.display === "none" ||
        style?.visibility === "hidden"
      )
        return "hidden";
    }
  }
  return undefined;
}

export function registrationValue(
  handle: FieldCandidateHandle,
): string | undefined {
  const key = registrationKey(handle);
  const inputs = ownedRegistrationControls(handle);
  if (!key || !inputs) return undefined;
  const values = inputs.map((input) => input.value);
  if (values.every((value) => value === "")) return "";
  if (key === "mobile") return values.join("-");
  if (key === "email")
    return values[0] === values[1] ? values[0] : values.join(" / ");
  return values[0];
}
