import type { Profile } from "../../../profile/model";
import type { FieldsAnalyzeRequest } from "../../api/types";
import { resolveValueBinding } from "../../profile/value-binding";
import type { ReviewPlanItem } from "../../review/review-plan";
import { basicName, basicSpecs, type BasicKey } from "./basic-controls";
import { isHplaceDocument } from "./fingerprint";

export const STRUCTURE_UNVERIFIED_REASON = "입력 불가(화면 구조 확인 불가)";

/** Legacy step-1 detail fields: page control, profile source, collected name. */
const detailFields = [
  {
    key: "englishName",
    label: "영문이름",
    selector: '[name="englishName"]',
    // One field built from two profile values in a page-specific order: no
    // single profile key (and copy value) represents it.
    profileFieldKey: undefined,
    hasValue: (p: Profile) =>
      Boolean(
        p.personal.englishFamilyName?.trim() &&
        p.personal.englishGivenName?.trim(),
      ),
  },
  {
    key: "birthday",
    label: "생년월일",
    selector: '[name="birthday"]',
    profileFieldKey: "personal.personal.birthDate",
  },
  {
    key: "detailAddress",
    label: "상세주소",
    selector: '[name="currentAddress.detailAddress"]',
    profileFieldKey: "contact.contact.addressLine2",
  },
  {
    key: "emergencyPhone",
    label: "비상연락처",
    selector: '[name="emergencyContact.contact"]',
    profileFieldKey: "contact.contact.emergencyPhoneNumber",
  },
] as const;

/** Open for input now: not disabled and not hidden by the page. */
function active(element: Element): boolean {
  if (element.matches(":disabled")) return false;
  for (let e: Element | null = element; e; e = e.parentElement) {
    const style = e.ownerDocument.defaultView?.getComputedStyle(e);
    if (
      e.matches('[hidden],[inert],[aria-hidden="true"]') ||
      style?.display === "none" ||
      style?.visibility === "hidden"
    )
      return false;
  }
  return true;
}

const resolved = (profile: Profile, profileFieldKey: string) =>
  resolveValueBinding(profile, { type: "DIRECT", profileFieldKey }).status ===
  "resolved";

/**
 * Step-1 legacy fields that are on the page and open, have a profile value,
 * but were not collected because their structure failed the verified
 * contract. They are reported as "입력 불가" instead of staying silently empty.
 * Fields the page does not render, closed conditional fields and fields
 * without a profile value are not reported. Rows carry no page values; only the English-name row carries the profile
 * name in the user-chosen default order so it can be copied.
 */
export function hplaceUnverifiedRows(
  document: Document,
  request: FieldsAnalyzeRequest,
  profile: Profile,
): ReviewPlanItem[] {
  // Detached documents (overlay/demo pages) have no location.
  if (
    document.location?.pathname !== "/mrs2/applicant/resume/writeResume" ||
    !isHplaceDocument(document)
  )
    return [];
  const collected = new Set(
    request.sections.flatMap((section) => [
      ...section.fields.map((f) => f.domName ?? f.domId ?? ""),
      ...(section.items ?? []).flatMap((item) =>
        item.fields.map((f) => f.domName ?? f.domId ?? ""),
      ),
    ]),
  );
  const isCollected = (name: string) =>
    [...collected].some((c) => c === name || c.startsWith(`${name}.`));
  const row = (
    key: string,
    label: string,
    profileFieldKey: string | undefined,
    copyValue = "",
  ): ReviewPlanItem => ({
    candidateId: `hplace-unverified-${key}`,
    fieldLabel: label,
    ...(profileFieldKey ? { profileFieldKey } : {}),
    ...(copyValue ? { profileValue: copyValue } : {}),
    currentValue: "",
    previewValue: copyValue,
    status: "unavailable",
    selected: false,
    disabled: true,
    revealed: false,
    reason: STRUCTURE_UNVERIFIED_REASON,
    failureCode: "STRUCTURE_UNVERIFIED",
  });
  const rows: ReviewPlanItem[] = [];
  for (const field of detailFields) {
    const elements = Array.from(document.querySelectorAll(field.selector));
    const hasValue =
      "hasValue" in field
        ? field.hasValue(profile)
        : resolved(profile, field.profileFieldKey!);
    if (
      elements.length &&
      elements.every(active) &&
      hasValue &&
      !isCollected(`hplace.detail.${field.key}`)
    )
      rows.push(
        row(
          field.key,
          field.label,
          field.profileFieldKey,
          // English name: the user-chosen default order (family first).
          field.key === "englishName"
            ? `${profile.personal.englishFamilyName.trim()} ${profile.personal.englishGivenName.trim()}`
            : "",
        ),
      );
  }
  for (const key of Object.keys(basicSpecs) as BasicKey[]) {
    const spec = basicSpecs[key];
    const elements = Array.from(
      document.querySelectorAll(`[name="${spec.name}"]`),
    );
    if (
      elements.length &&
      elements.every(active) &&
      resolved(profile, spec.profile) &&
      !isCollected(basicName(key))
    )
      rows.push(row(key, spec.label, spec.profile));
  }
  return rows;
}
