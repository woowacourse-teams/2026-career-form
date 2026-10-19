import {
  debugCollectionSkip,
  type StructuralSkipReason,
} from "../../debug/structural-diagnostics";
import { englishNameDomName } from "./english-name";
import { isHplaceDocument } from "./fingerprint";
import type { FieldCandidateHandle } from "../../dom/types";
export const detailSectionId = "hplace-detail-basic";
export const detailNames = {
  englishName: "hplace.detail.englishName",
  birthday: "hplace.detail.birthday",
  detailAddress: "hplace.detail.detailAddress",
  emergencyPhone: "hplace.detail.emergencyPhone",
} as const;
export type DetailKey = keyof typeof detailNames;
export type DetailControls = Partial<Record<DetailKey, HTMLInputElement>>;
export function detailControls(document: Document): DetailControls | undefined {
  const reject = (
    reason: StructuralSkipReason = "owner-mismatch",
    detail = "legacy-detail-anchors",
  ) => {
    debugCollectionSkip(detailSectionId, reason, detail);
    return undefined;
  };
  if (
    document.location.pathname !== "/mrs2/applicant/resume/writeResume" ||
    !isHplaceDocument(document)
  )
    return reject();
  const forms = document.querySelectorAll('[id="frm"]');
  const form = forms[0];
  if (forms.length !== 1 || !(form instanceof HTMLFormElement)) return reject();
  const sections = ["11", "13"].map((code) =>
    form.querySelectorAll(`section.writeResume[data-code="${code}"]`),
  );
  if (sections.some((s) => s.length !== 1)) return reject();
  const one = (
    name: string,
    id: string,
    max: number | undefined,
    section: Element,
  ): HTMLInputElement | undefined => {
    const all = document.querySelectorAll(`[name="${name}"]`);
    const input = all[0];
    return all.length === 1 &&
      input instanceof HTMLInputElement &&
      input.type === "text" &&
      input.id === id &&
      (!id || document.querySelectorAll(`[id="${id}"]`).length === 1) &&
      input.form === form &&
      input.closest("section") === section &&
      input.closest(".subject") &&
      (max === undefined || input.maxLength === max)
      ? input
      : undefined;
  };
  const englishName = one("englishName", "englishName", 64, sections[0][0]);
  const birthday = one("birthday", "birthday", undefined, sections[0][0]);
  const detailAddress = one(
    "currentAddress.detailAddress",
    "",
    128,
    sections[1][0],
  );
  if (
    !englishName ||
    !birthday ||
    !detailAddress ||
    englishName.closest(".subject") !== birthday.closest(".subject") ||
    birthday.dataset.dates !== "birthday:YMD"
  )
    return reject();
  for (const input of [englishName, birthday]) {
    const labels = document.querySelectorAll(`label[for="${input.id}"]`);
    if (
      labels.length !== 1 ||
      labels[0].closest(".subject") !== input.closest(".subject")
    )
      return reject("label-mismatch", "owned-title-label");
  }
  const row = detailAddress.closest('[data-row="address"]');
  const bases = document.querySelectorAll('[name="currentAddress.address"]');
  const base = bases[0];
  if (
    !row ||
    row.querySelectorAll('button[type="button"][data-type="currentAddress"]')
      .length !== 1 ||
    bases.length !== 1 ||
    !(base instanceof HTMLInputElement) ||
    base.type !== "text" ||
    !base.readOnly ||
    base.form !== form ||
    base.closest('[data-row="address"]') !== row
  )
    return reject();
  const emergencyPhone = one(
    "emergencyContact.contact",
    "",
    64,
    sections[1][0],
  );
  if (
    document.querySelector('[name="emergencyContact.contact"]') &&
    (!emergencyPhone ||
      emergencyPhone.getAttribute("data-validType") !== "PHONE" ||
      emergencyPhone
        .closest(".row")
        ?.querySelectorAll('[name="emergencyContact.comment"]').length !== 1)
  )
    return reject();
  return {
    englishName,
    birthday,
    detailAddress,
    ...(emergencyPhone ? { emergencyPhone } : {}),
  };
}
export function ownedDetailControl(
  handle: FieldCandidateHandle,
): { key: DetailKey; input: HTMLInputElement } | undefined {
  const key = (Object.keys(detailNames) as DetailKey[]).find(
    (k) =>
      handle.candidate.domName ===
        (k === "englishName" && handle.elements[0] instanceof HTMLInputElement
          ? englishNameDomName(handle.elements[0])
          : detailNames[k]) &&
      handle.candidate.domId === handle.candidate.domName,
  );
  const input = handle.elements[0];
  if (
    !key ||
    !(input instanceof HTMLInputElement) ||
    handle.elements.length !== 1 ||
    handle.sectionId !== detailSectionId ||
    detailControls(input.ownerDocument)?.[key] !== input
  )
    return undefined;
  return { key, input };
}
