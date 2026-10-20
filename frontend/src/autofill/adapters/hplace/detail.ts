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
  // Steps 2/3 of the same writeResume page carry no detail sections 11/13.
  const missingSection = () => {
    const forms = document.querySelectorAll('[id="frm"]');
    return (
      forms.length === 1 &&
      ["11", "13"].some(
        (code) =>
          forms[0].querySelectorAll(`section.writeResume[data-code="${code}"]`)
            .length === 0,
      )
    );
  };
  if (document.location?.pathname !== "/mrs2/applicant/resume/writeResume")
    return reject();
  if (!isHplaceDocument(document))
    return missingSection()
      ? reject("section-missing", "legacy-detail-section")
      : reject();
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
  const skip = (
    key: DetailKey,
    reason: StructuralSkipReason = "owner-mismatch",
    detail = "legacy-detail-anchors",
  ) => {
    debugCollectionSkip(detailNames[key], reason, detail);
    return undefined;
  };
  const ownedLabel = (input: HTMLInputElement) => {
    const labels = document.querySelectorAll(`label[for="${input.id}"]`);
    return (
      labels.length === 1 &&
      labels[0].closest(".subject") === input.closest(".subject")
    );
  };
  // Each field is verified on its own: a missing control is simply absent
  // (tenants differ: com2us has no address, KDI no birthday), and a present
  // but malformed control drops only that field. Everything else in the
  // section keeps working, and unverified-structure reports the dropped one.
  const englishName = (() => {
    if (!document.querySelector('[name="englishName"]')) return undefined;
    const input = one("englishName", "englishName", 64, sections[0][0]);
    if (!input) return skip("englishName");
    return ownedLabel(input)
      ? input
      : skip("englishName", "label-mismatch", "owned-title-label");
  })();
  const birthday = (() => {
    if (!document.querySelector('[name="birthday"]')) return undefined;
    const input = one("birthday", "birthday", undefined, sections[0][0]);
    if (!input || input.dataset.dates !== "birthday:YMD")
      return skip("birthday");
    return ownedLabel(input)
      ? input
      : skip("birthday", "label-mismatch", "owned-title-label");
  })();
  const detailAddress = (() => {
    if (
      !document.querySelector('[name^="currentAddress."], [data-row="address"]')
    )
      return undefined;
    const input = one("currentAddress.detailAddress", "", 128, sections[1][0]);
    const row = input?.closest('[data-row="address"]');
    const bases = document.querySelectorAll('[name="currentAddress.address"]');
    const base = bases[0];
    return input &&
      row &&
      row.querySelectorAll('button[type="button"][data-type="currentAddress"]')
        .length === 1 &&
      bases.length === 1 &&
      base instanceof HTMLInputElement &&
      base.type === "text" &&
      base.readOnly &&
      base.form === form &&
      base.closest('[data-row="address"]') === row
      ? input
      : skip("detailAddress");
  })();
  const emergencyPhone = (() => {
    if (!document.querySelector('[name="emergencyContact.contact"]'))
      return undefined;
    const input = one("emergencyContact.contact", "", 64, sections[1][0]);
    return input &&
      input.getAttribute("data-validType") === "PHONE" &&
      input
        .closest(".row")
        ?.querySelectorAll('[name="emergencyContact.comment"]').length === 1
      ? input
      : skip("emergencyPhone");
  })();
  return {
    ...(englishName ? { englishName } : {}),
    ...(birthday ? { birthday } : {}),
    ...(detailAddress ? { detailAddress } : {}),
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
