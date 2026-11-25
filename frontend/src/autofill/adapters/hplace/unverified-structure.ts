import type { Profile } from "../../../profile/model";
import type { FieldsAnalyzeRequest } from "../../api/types";
import { resolveValueBinding } from "../../profile/value-binding";
import type { ReviewPlanItem } from "../../review/review-plan";
import { basicName, basicSpecs, type BasicKey } from "./basic-controls";
import { isHplaceDocument } from "./fingerprint";
import {
  isV1BasicPage,
  v1Name,
  v1PresentControls,
  v1Spec,
} from "./v1-basic-controls";
import {
  historyLevelLabel,
  historyProfileSection,
  historySpec,
  isV1HistoryPage,
  v1HistoryLevels,
  v1HistoryChip,
  v1HistoryMalformed,
  v1HistoryName,
  v1HistoryUnknownRows,
  type HistoryGroup,
} from "./v1-history-controls";
import {
  extraBlockTitle,
  extraProfileSection,
  extraSpec,
  isV1ExtraPage,
  v1ExtraBlocks,
  v1ExtraChip,
  v1ExtraMalformed,
  v1ExtraName,
  type ExtraGroup,
} from "./v1-extra-controls";

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
  const v1 = isV1BasicPage(document);
  const history = isV1HistoryPage(document);
  const extra = isV1ExtraPage(document);
  if (
    !v1 &&
    !history &&
    !extra &&
    (document.location?.pathname !== "/mrs2/applicant/resume/writeResume" ||
      !isHplaceDocument(document))
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
  if (history) return v1HistoryRows(document, profile, isCollected, row);
  if (extra) return v1ExtraRows(document, profile, isCollected, row);
  if (v1)
    return v1PresentControls(document).flatMap(({ key, enabled }) => {
      const spec = v1Spec(key);
      const profileFieldKey = "profile" in spec ? spec.profile : undefined;
      const hasValue = profileFieldKey
        ? resolved(profile, profileFieldKey)
        : detailFields
            .find(
              (
                f,
              ): f is Extract<
                (typeof detailFields)[number],
                { key: "englishName" }
              > => f.key === "englishName",
            )!
            .hasValue(profile);
      return enabled && hasValue && !isCollected(v1Name(key))
        ? [
            row(
              `v1-${key}`,
              spec.label,
              profileFieldKey,
              key === "englishName"
                ? `${profile.personal.englishFamilyName.trim()} ${profile.personal.englishGivenName.trim()}`
                : "",
            ),
          ]
        : [];
    });
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

/**
 * Step 2 (CF-509): a level whose cards cannot be told apart, a card control
 * that fails its contract, and the school and major search inputs (phase 2:
 * never typed into) are reported as 입력 불가 when the paired profile entry
 * holds a value.
 */
function v1HistoryRows(
  document: Document,
  profile: Profile,
  isCollected: (name: string) => boolean,
  row: (key: string, label: string, profileFieldKey?: string) => ReviewPlanItem,
): ReviewPlanItem[] {
  const entries = (group: HistoryGroup) => {
    const { categoryId, sectionId } = historyProfileSection[group];
    return profile[categoryId].filter((e) => e.sectionId === sectionId);
  };
  const prefix = (group: HistoryGroup) =>
    `${historyProfileSection[group].categoryId}.${historyProfileSection[group].sectionId}`;
  const rows: ReviewPlanItem[] = [];
  const malformed = v1HistoryMalformed(document);
  for (const level of v1HistoryLevels(document)) {
    const list = entries(level.group);
    if (level.status !== "ok") {
      if (list.length)
        rows.push(row(`v1-${level.group}`, historyLevelLabel[level.group]));
      continue;
    }
    if (level.group === "career") continue;
    level.cards.forEach((_, index) => {
      const values = list[index]?.values;
      if (!values) return;
      for (const field of ["academyName", "major0.majorName"] as const) {
        const spec = historySpec(level.group, field);
        const fieldId = spec?.profile.split(".")[2];
        const name = fieldId
          ? values[fieldId]?.replace(/\s+/g, " ").trim()
          : "";
        if (
          !spec ||
          !name ||
          isCollected(v1HistoryName(level.group, index, field))
        )
          continue;
        const chip = v1HistoryChip(document, level.group, index, field);
        if (chip !== undefined) {
          // Same name: the page already holds it (kept). Another: a conflict.
          if (chip !== name)
            rows.push({
              ...row(
                `v1-${level.group}-${index}-${field}`,
                spec.label,
                spec.profile,
              ),
              currentValue: chip,
              profileValue: name,
              previewValue: name,
              status: "conflict",
              revealed: true,
              reason: "지원서에 기존 값이 있습니다.",
              failureCode: undefined,
            });
          continue;
        }
        if (
          !malformed.some(
            (m) =>
              m.group === level.group && m.index === index && m.field === field,
          )
        )
          rows.push(
            row(
              `v1-${level.group}-${index}-${field}`,
              spec.label,
              spec.profile,
            ),
          );
      }
    });
  }
  for (const { group, index, field } of malformed) {
    const spec = historySpec(group, field)!;
    const fieldId = spec.profile.split(".")[2];
    if (
      entries(group)[index]?.values[fieldId]?.trim() &&
      !isCollected(v1HistoryName(group, index, field))
    )
      rows.push(row(`v1-${group}-${index}-${field}`, spec.label, spec.profile));
  }
  // Rows of a card no spec reads (CF-510: a second tenant's 퇴직사유): never
  // written; reported when the paired profile entry exists.
  for (const { group, index, title } of v1HistoryUnknownRows(document))
    if (entries(group)[index])
      rows.push(row(`v1-${group}-${index}-row-${title}`, title));
  return rows;
}

/**
 * Step 3 (CF-510): a 자격증 / 외국어활용능력 block that fails its contract and a
 * sub-row control that fails its own are reported as 입력 불가 when the paired
 * profile entry holds a value; a certificate chip with another name than the
 * profile is a conflict (never replaced).
 */
function v1ExtraRows(
  document: Document,
  profile: Profile,
  isCollected: (name: string) => boolean,
  row: (key: string, label: string, profileFieldKey?: string) => ReviewPlanItem,
): ReviewPlanItem[] {
  const entries = (group: ExtraGroup) => {
    const { categoryId, sectionId } = extraProfileSection[group];
    return profile[categoryId].filter((e) => e.sectionId === sectionId);
  };
  const rows: ReviewPlanItem[] = [];
  for (const block of v1ExtraBlocks(document)) {
    const list = entries(block.group);
    if (block.status !== "ok") {
      if (list.length)
        rows.push(row(`v1-${block.group}`, extraBlockTitle[block.group]));
      continue;
    }
    if (block.group !== "certificate") continue;
    const spec = extraSpec("certificate", "licenseName")!;
    block.subRows.forEach((_, index) => {
      const name = list[index]?.values.name?.replace(/\s+/g, " ").trim();
      if (
        !name ||
        isCollected(v1ExtraName("certificate", index, "licenseName"))
      )
        return;
      const chip = v1ExtraChip(document, index);
      if (chip !== undefined && chip !== name)
        rows.push({
          ...row(
            `v1-certificate-${index}-licenseName`,
            spec.label,
            spec.profile,
          ),
          currentValue: chip,
          profileValue: name,
          previewValue: name,
          status: "conflict",
          revealed: true,
          reason: "지원서에 기존 값이 있습니다.",
          failureCode: undefined,
        });
    });
  }
  for (const { group, index, field } of v1ExtraMalformed(document)) {
    const spec = extraSpec(group, field)!;
    const fieldId = spec.profile.split(".")[2];
    if (
      entries(group)[index]?.values[fieldId]?.trim() &&
      !isCollected(v1ExtraName(group, index, field))
    )
      rows.push(row(`v1-${group}-${index}-${field}`, spec.label, spec.profile));
  }
  return rows;
}
