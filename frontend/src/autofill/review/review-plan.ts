import { executionPolicy } from "../workflow/execution-policy";
import { isSplitEmailTarget, SPLIT_EMAIL_REASON } from "../dom/split-email";
import type { WriteFailureCode } from "../write/failure";
import { resolveDocumentCompany } from "../adapters/company";
import {
  approveComponentGpaPairs,
  type ComponentGpaApproval,
} from "../policy/components/gpa";
import { customFieldValue } from "../dom/custom-field-value";
import { normalizeDisplayName } from "../write/display-name";
import {
  isReadonlySearchEligible,
  observeReadonlySearch,
} from "../interaction";
import { normalized } from "../interaction/readonly-search";
import { isAutofillProfileFieldKey } from "../profile/profile-field-key";
import type {
  FieldAnalysis,
  FieldsAnalyzeResponse,
  MatchedFieldAnalysis,
} from "../api/types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type {
  FieldValues,
  Profile,
  ProfileIdentity,
  ProfileCategoryId,
  RepeatedProfileCategoryId,
} from "../../profile/model";
import type { ValueBinding } from "../api/types";
import { resolveValueBinding } from "../profile/value-binding";
import {
  approveCatalogMatch,
  bindSearchIdentity,
} from "../profile/catalog-identity";
import {
  matchesApprovedCatalog,
  type ApprovedCatalogMatch,
} from "../profile/catalog-match";
import { catalogEvidenceForElement } from "../profile/catalog-evidence";
import { matchStandardOption } from "../profile/standard-option-match";
import { schoolRegionSearchValues } from "../../profile/standard-values";
import { formatProfileDate } from "../profile/date-format";
import {
  buildLocalSearchValuePlan,
  type LocalSearchValuePlan,
} from "../profile/search-value-plan";
import type { DateTargetApproval } from "./date-target-format";
import {
  resolveDateTargetFormat,
  validateDateTargetValue,
} from "./date-target-format";
import type { CalendarApproval } from "./calendar-approval";
import { createCalendarApproval } from "./calendar-approval";
import { calendarSurfaceFor } from "../interaction/calendar-surface";
import { dayCalendarSurfaceFor } from "../interaction/day-calendar-surface";
import {
  createDayCalendarApproval,
  type DayCalendarApproval,
} from "./day-calendar-approval";
import { assignMixedRows } from "../dom/mixed-section-rows";

export type ProfileValueResolution =
  | {
      status: "resolved";
      value: string;
      sensitive: boolean;
      profileEntryId?: string;
    }
  | { status: "missing"; sensitive: boolean }
  | { status: "ambiguous"; sensitive: boolean }
  | { status: "unknown"; sensitive: false };

export type ReviewItemStatus =
  "available" | "needs-review" | "conflict" | "unavailable";

export interface ReviewPlanItem {
  candidateId: string;
  fieldLabel: string;
  profileFieldKey?: string;
  profileEntryId?: string;
  itemIndex?: number;
  currentValue: string;
  profileValue?: string;
  previewValue: string;
  status: ReviewItemStatus;
  selected: boolean;
  disabled: boolean;
  revealed: boolean;
  reason: string;
  /** Generic-path only: the grade of the field. Static paths never set it. */
  genericGrade?: "AUTO" | "REVIEW" | "BLOCKED";
  /** Generic-path only: the grade reason or section failure code. */
  genericReasonCode?: string;
  /** Generic-path only: the control is hidden on the page; display filter only. */
  hiddenFromReview?: boolean;
  failureCode?: WriteFailureCode;
  analysis?: MatchedFieldAnalysis;
  dateApproval?: DateTargetApproval;
  calendarApproval?: CalendarApproval;
  /** Separate approval for readonly year-month-day calendars. */
  dayCalendarApproval?: DayCalendarApproval;
  componentGpaApproval?: ComponentGpaApproval;
  verifiedFreshDefaultValue?: string;
  /** Local-only approved search forms; never include these values in API requests. */
  searchValuePlan?: LocalSearchValuePlan;
  /** Explicit local profile selection; never serialize to the backend. */
  searchIdentity?: ProfileIdentity;
  /** Approved local evidence for one catalog entry; never part of API requests. */
  catalogMatch?: ApprovedCatalogMatch;
}

export interface ReviewPlan {
  status: "ready" | "partial" | "blocked";
  items: ReviewPlanItem[];
}

export function reviewItemsForDisplay(
  items: readonly ReviewPlanItem[],
): ReviewPlanItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        !item.hiddenFromReview &&
        (item.status !== "unavailable" || item.genericGrade !== undefined),
    )
    .sort((left, right) => {
      const leftOrder = left.item.status === "available" ? 0 : 1;
      const rightOrder = right.item.status === "available" ? 0 : 1;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ item }) => item);
}

interface ProfileFieldParts {
  categoryId: ProfileCategoryId;
  sectionId: string;
  fieldId: string;
  sensitive: boolean;
  repeatable: boolean;
  topLevel: boolean;
  inputType: string;
}

function profileFieldParts(value: string): ProfileFieldParts | undefined {
  const [categoryId, sectionId, fieldId, ...rest] = value.split(".");
  if (rest.length > 0 || !categoryId || !sectionId || !fieldId)
    return undefined;

  const category = PROFILE_CATEGORIES.find(
    (candidate) => candidate.id === categoryId,
  );
  const section = category?.sections.find(
    (candidate) => candidate.id === sectionId,
  );
  const field =
    section?.fields.find((candidate) => candidate.id === fieldId) ??
    category?.topLevelFields?.find((candidate) => candidate.id === fieldId);
  if (!category || !section || !field || field.id === "evidenceDocumentPath") {
    return undefined;
  }

  return {
    categoryId: category.id,
    sectionId: section.id,
    fieldId: field.id,
    sensitive: category.sensitive,
    repeatable: category.repeatable,
    topLevel:
      category.topLevelFields?.some(
        (candidate) => candidate.id === field.id,
      ) === true,
    inputType: field.inputType,
  };
}

function valueAt(values: FieldValues, fieldId: string): string | undefined {
  const value = values[fieldId];
  return value && value.trim() ? value : undefined;
}

export function resolveProfileFieldValue(
  profile: Profile,
  profileFieldKey: string,
  itemIndex?: number,
): ProfileValueResolution {
  const parts = profileFieldParts(profileFieldKey);
  if (!parts) return { status: "unknown", sensitive: false };

  if (!parts.repeatable) {
    const value = valueAt(
      profile[parts.categoryId] as FieldValues,
      parts.fieldId,
    );
    return value
      ? { status: "resolved", value, sensitive: parts.sensitive }
      : { status: "missing", sensitive: parts.sensitive };
  }

  const entries = profile[parts.categoryId as RepeatedProfileCategoryId];
  const matchingEntries = entries.filter(
    (entry) => entry.sectionId === parts.sectionId,
  );
  if (matchingEntries.length === 0) {
    return { status: "missing", sensitive: parts.sensitive };
  }
  if (itemIndex === undefined && matchingEntries.length > 1) {
    return { status: "ambiguous", sensitive: parts.sensitive };
  }
  const entry = matchingEntries[itemIndex ?? 0];
  if (!entry) return { status: "missing", sensitive: parts.sensitive };
  const value = valueAt(entry.values, parts.fieldId);
  return value
    ? {
        status: "resolved",
        value,
        sensitive: parts.sensitive,
        ...(itemIndex !== undefined ? { profileEntryId: entry.id } : {}),
      }
    : { status: "missing", sensitive: parts.sensitive };
}

function currentValue(handle: FieldCandidateHandle): string {
  const customValue = customFieldValue(handle);
  if (customValue !== undefined) return customValue;
  if (
    handle.candidate.control === "radio" ||
    handle.candidate.control === "checkbox"
  ) {
    return handle.elements
      .filter(
        (element): element is HTMLInputElement =>
          element instanceof HTMLInputElement && element.checked,
      )
      .map((element) => element.value)
      .join(", ");
  }
  const select = handle.elements[0];
  if (select instanceof HTMLSelectElement) {
    const selected = select.selectedOptions[0];
    return selected?.value ? (selected.textContent ?? "") : "";
  }
  return handle.elements[0]?.value ?? "";
}

function unavailableItem(
  candidateId: string,
  fieldLabel: string,
  reason: string,
  analysis?: MatchedFieldAnalysis,
): ReviewPlanItem {
  return {
    candidateId,
    fieldLabel,
    currentValue: "",
    previewValue: "입력 예정 값 없음",
    status: "unavailable",
    selected: false,
    disabled: true,
    revealed: false,
    reason,
    ...(analysis ? { analysis } : {}),
  };
}

function labelFor(candidateId: string, registry: CandidateRegistry): string {
  const lookup = registry.lookupField(candidateId);
  if (lookup.status === "ready" || lookup.status === "blocked") {
    return lookup.handle.candidate.displayName ?? "지원서 필드";
  }
  return "지원서 필드";
}

function certificateSearchValuePlan(
  profile: Profile,
  profileFieldKey: string,
  profileEntryId: string | undefined,
  originalName: string,
): LocalSearchValuePlan | undefined {
  if (
    profileFieldKey !== "certifications.certificate.name" ||
    !profileEntryId
  ) {
    return undefined;
  }
  const gradeCandidates = profile.certifications
    .filter(
      (entry) =>
        entry.sectionId === "certificate" && entry.id === profileEntryId,
    )
    .map((entry) => ({
      profileEntryId: entry.id,
      grade: entry.values.grade ?? "",
    }));
  return buildLocalSearchValuePlan({
    profileEntryId,
    originalName,
    gradeCandidates,
  });
}

/**
 * A single editable input without a calendar widget whose accepted date
 * format, read from its own type, placeholder and constraints, is year-month.
 */
function isYearMonthOnlyTarget(handle: FieldCandidateHandle): boolean {
  const element = handle.elements[0];
  if (handle.elements.length !== 1 || !(element instanceof HTMLInputElement))
    return false;
  if (calendarSurfaceFor(element) || dayCalendarSurfaceFor(element))
    return false;
  const target = resolveDateTargetFormat(handle);
  return (
    target.status === "resolved" &&
    (target.format === "YYYY-MM" || target.format === "YYYY.MM")
  );
}

/**
 * A SELECT_DATE target that is a plain editable year-month-only control needs
 * no calendar interaction: plan it as an ordinary text write so the date
 * format path derives and validates YYYY-MM. Anything else is unchanged.
 */
function withYearMonthWritePlan(
  analysis: FieldAnalysis,
  registry: CandidateRegistry,
  generic: boolean,
): FieldAnalysis {
  if (
    !generic ||
    analysis.matchType === "NO_MATCH" ||
    analysis.interactionStatus !== "READY" ||
    analysis.writePlan?.command !== "SELECT_DATE"
  )
    return analysis;
  const binding =
    analysis.valueBinding ??
    (analysis.profileFieldKey
      ? { type: "DIRECT" as const, profileFieldKey: analysis.profileFieldKey }
      : undefined);
  if (
    binding?.type !== "DIRECT" ||
    profileFieldParts(binding.profileFieldKey)?.inputType !== "date"
  )
    return analysis;
  const lookup = registry.lookupField(analysis.candidateId);
  return lookup.status === "ready" && isYearMonthOnlyTarget(lookup.handle)
    ? { ...analysis, writePlan: { command: "SET_TEXT" } }
    : analysis;
}

function itemForAnalysis(
  analysis: FieldAnalysis,
  profile: Profile,
  registry: CandidateRegistry,
  ignoreCurrentValueCandidateIds: ReadonlySet<string>,
  freshDefaultCandidateIds: ReadonlySet<string>,
  normalizeDirectValue?: (profileFieldKey: string, value: string) => string,
  generic = true,
  components = false,
): ReviewPlanItem {
  return itemForResolvedAnalysis(
    withYearMonthWritePlan(analysis, registry, generic),
    profile,
    registry,
    ignoreCurrentValueCandidateIds,
    freshDefaultCandidateIds,
    normalizeDirectValue,
    generic,
    components,
  );
}

function itemForResolvedAnalysis(
  analysis: FieldAnalysis,
  profile: Profile,
  registry: CandidateRegistry,
  ignoreCurrentValueCandidateIds: ReadonlySet<string>,
  freshDefaultCandidateIds: ReadonlySet<string>,
  normalizeDirectValue?: (profileFieldKey: string, value: string) => string,
  generic = true,
  components = false,
): ReviewPlanItem {
  const fieldLabel = labelFor(analysis.candidateId, registry);
  if (analysis.matchType === "NO_MATCH") {
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      "연결할 프로필 항목이 없습니다.",
    );
  }
  if (analysis.interactionStatus !== "READY" || !analysis.writePlan) {
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      "현재 상태에서는 안전하게 입력할 수 없습니다.",
      analysis,
    );
  }

  const lookup = registry.lookupField(analysis.candidateId);
  const componentDocument =
    "handle" in lookup
      ? (lookup.handle.elements[0] ?? lookup.handle.customElements?.[0])
          ?.ownerDocument
      : undefined;
  const component = componentDocument
    ? executionPolicy(componentDocument)?.componentPolicy
    : undefined;
  const searchCommand = analysis.writePlan.command === "SEARCH_SELECTION";
  const componentSearch =
    components &&
    searchCommand &&
    analysis.mappingStatus === "ADAPTER_VERIFIED" &&
    ((analysis.valueBinding?.type === "DIRECT" &&
      isAutofillProfileFieldKey(analysis.valueBinding.profileFieldKey)) ||
      (analysis.valueBinding?.type === "DERIVED" &&
        /^UNIVERSITY_ADDITIONAL_MAJOR_[12]_NAME$/.test(
          analysis.valueBinding.recipe,
        ))) &&
    lookup.status === "ready" &&
    !!component &&
    (new RegExp(component.patterns.searchField).test(
      lookup.handle.candidate.domName ?? "",
    ) ||
      (component.scopedSearches ?? []).some(
        (rule) =>
          lookup.handle.candidate.domName === rule.name &&
          lookup.handle.candidate.displayName === rule.label &&
          analysis.valueBinding!.profileFieldKey === rule.key,
      ));
  if (
    searchCommand &&
    !componentSearch &&
    (!generic ||
      analysis.mappingStatus !== "LLM_SUGGESTED" ||
      analysis.valueBinding?.type !== "DIRECT" ||
      !isAutofillProfileFieldKey(analysis.valueBinding.profileFieldKey))
  ) {
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      "검색 대상의 프로필 연결과 실행 경로를 확인할 수 없습니다.",
      analysis,
    );
  }
  const readonlySearch =
    analysis.mappingStatus === "LLM_SUGGESTED" &&
    analysis.writePlan.command === "SEARCH_SELECTION" &&
    lookup.status === "blocked" &&
    lookup.reason === "readonly" &&
    isReadonlySearchEligible(
      lookup.handle,
      lookup.handle.elements[0]!.ownerDocument,
    );
  const readonlyCalendar =
    analysis.writePlan.command === "SELECT_DATE" &&
    lookup.status === "blocked" &&
    lookup.reason === "readonly";
  if (
    (searchCommand && !readonlySearch && !componentSearch) ||
    (lookup.status !== "ready" && !readonlySearch && !readonlyCalendar)
  ) {
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      analysis.writePlan.command === "SEARCH_SELECTION" &&
        lookup.status === "blocked" &&
        lookup.reason === "readonly"
        ? observeReadonlySearch(lookup.handle).status === "ambiguous"
          ? "검색 버튼이 여러 개여서 원래 입력칸과 유일하게 연결할 수 없습니다."
          : "원래 입력칸과 같은 필드 그룹에서 안전한 검색 버튼을 찾지 못했습니다."
        : "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
      analysis,
    );
  }

  const binding: ValueBinding | undefined =
    analysis.valueBinding ??
    (analysis.profileFieldKey
      ? { type: "DIRECT", profileFieldKey: analysis.profileFieldKey }
      : undefined);
  if (!binding) {
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      "프로필 값 연결 방식이 없습니다.",
      analysis,
    );
  }
  if (
    generic &&
    analysis.mappingStatus === "LLM_SUGGESTED" &&
    binding.profileFieldKey === "contact.contact.email" &&
    isSplitEmailTarget(lookup.handle)
  ) {
    return {
      ...unavailableItem(
        analysis.candidateId,
        fieldLabel,
        SPLIT_EMAIL_REASON,
        analysis,
      ),
      failureCode: "SPLIT_EMAIL_UNSUPPORTED",
    };
  }
  const parts =
    binding.type === "DERIVED" &&
    /^UNIVERSITY_ADDITIONAL_MAJOR_[12]_(NAME|CLASSIFICATION|FIELD)$/.test(
      binding.recipe,
    )
      ? profileFieldParts(
          binding.profileFieldKey ?? "education.university.additionalMajorName",
        )
      : binding.profileFieldKey
        ? profileFieldParts(binding.profileFieldKey)
        : undefined;
  let itemIndex = lookup.handle.itemIndex;
  // A mixed-section row is bound through its local assignment (C8).
  const mixed = lookup.handle.mixedSectionRow;
  if (mixed?.isKindSelect) {
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      "학력 구분은 행 준비 단계에서 처리했습니다.",
      analysis,
    );
  }
  const mixedRow = mixed
    ? assignMixedRows(profile, mixed.group)[mixed.rowIndex]
    : undefined;
  if (mixed) {
    if (
      !mixedRow?.optionText ||
      assignMixedRows(profile, mixed.group).length !== mixed.rowCount ||
      mixed.selectedKind !== mixedRow.optionText ||
      parts?.sectionId !== mixedRow.sectionId
    ) {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        "학력 행의 구분과 저장된 프로필 항목이 일치하지 않아 안전하게 연결할 수 없습니다.",
        analysis,
      );
    }
    itemIndex = mixedRow.sectionIndex;
  }
  // A field inside a repeated row whose group boundary could not be proven
  // has a row but no index; it must not fall back to the sole profile entry.
  const unindexedRepeatRow =
    lookup.handle.itemId !== undefined && lookup.handle.itemIndex === undefined;
  if (!mixedRow && parts?.repeatable && !parts.topLevel) {
    const profileEntries = profile[
      parts.categoryId as RepeatedProfileCategoryId
    ].filter((entry) => entry.sectionId === parts.sectionId);
    const formItemCount = registry.fieldItemCount(analysis.candidateId);
    if (profileEntries.length === 1 && !unindexedRepeatRow) {
      itemIndex = 0;
    }
    const soleUngroupedProfileEntry =
      itemIndex === 0 &&
      (formItemCount === undefined || formItemCount === 0) &&
      profileEntries.length === 1;
    if (
      itemIndex === undefined ||
      (!soleUngroupedProfileEntry &&
        (formItemCount === undefined ||
          formItemCount !== profileEntries.length))
    ) {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        "반복 입력 행과 저장된 프로필 항목의 개수가 달라 안전하게 연결할 수 없습니다.",
        analysis,
      );
    }
  }

  const boundProfileValue = resolveValueBinding(profile, binding, itemIndex);
  if (boundProfileValue.status !== "resolved") {
    const reason =
      boundProfileValue.status === "ambiguous"
        ? "반복 프로필 항목을 하나로 안전하게 결정할 수 없습니다."
        : "입력할 프로필 값이 없습니다.";
    return unavailableItem(analysis.candidateId, fieldLabel, reason, analysis);
  }
  const catalogSource =
    binding.type !== "DERIVED"
      ? resolveValueBinding(
          profile,
          { type: "DIRECT", profileFieldKey: binding.profileFieldKey },
          itemIndex,
        )
      : undefined;
  const searchIdentity =
    binding.type !== "DERIVED" && catalogSource?.status === "resolved"
      ? bindSearchIdentity(
          profile,
          binding.profileFieldKey,
          catalogSource.profileEntryId,
          catalogSource.value,
        )
      : undefined;
  const catalogApproval =
    binding.type !== "DERIVED" && catalogSource?.status === "resolved"
      ? approveCatalogMatch(
          searchIdentity,
          binding.profileFieldKey,
          catalogSource.value,
        )
      : undefined;
  if (catalogApproval?.status === "invalid")
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      "선택한 항목의 식별 정보를 확인할 수 없습니다. 프로필에서 다시 선택해 주세요.",
      analysis,
    );
  const catalogMatch =
    catalogApproval?.status === "selected" ? catalogApproval.match : undefined;
  let dateApproval: DateTargetApproval | undefined;
  let calendarApproval: CalendarApproval | undefined;
  let dayCalendarApproval: DayCalendarApproval | undefined;
  let finalizedProfileValue = boundProfileValue;
  if (generic && analysis.writePlan.command === "SELECT_DATE") {
    if (
      binding.type !== "DIRECT" ||
      parts?.inputType !== "date" ||
      lookup.handle.elements.length !== 1 ||
      !(lookup.handle.elements[0] instanceof HTMLInputElement)
    ) {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        "월 달력 대상과 프로필 날짜 연결을 확인할 수 없습니다.",
        analysis,
      );
    }
    const calendarTarget = lookup.handle.elements[0];
    const repeatRow = {
      itemId: lookup.handle.itemId,
      itemGroupId: lookup.handle.itemGroupId,
      itemIndex,
    };
    const daySurface = dayCalendarSurfaceFor(calendarTarget);
    if (daySurface && calendarSurfaceFor(calendarTarget)) {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        "월 달력과 연월일 달력이 함께 연결되어 있어 날짜 단위를 하나로 확인할 수 없습니다.",
        analysis,
      );
    }
    if (daySurface) {
      try {
        dayCalendarApproval = createDayCalendarApproval({
          target: calendarTarget,
          originalDate: boundProfileValue.value,
          profileFieldKey: binding.profileFieldKey,
          profileEntryId: boundProfileValue.profileEntryId,
          itemIndex,
          repeatRow,
        });
      } catch {
        return unavailableItem(
          analysis.candidateId,
          fieldLabel,
          "읽기 전용 연월일 달력의 대상, 날짜 형식 또는 소유권을 확인할 수 없습니다.",
          analysis,
        );
      }
      finalizedProfileValue = {
        ...boundProfileValue,
        value: dayCalendarApproval.displayValue,
      };
    }
  }
  if (
    generic &&
    analysis.writePlan.command === "SELECT_DATE" &&
    !dayCalendarApproval &&
    binding.type === "DIRECT" &&
    lookup.handle.elements[0] instanceof HTMLInputElement
  ) {
    const source = formatProfileDate(boundProfileValue.value, "YYYY-MM");
    if (source.status !== "resolved") {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        `달력에 사용할 원본 날짜를 확인할 수 없습니다: ${source.reason}`,
        analysis,
      );
    }
    try {
      calendarApproval = createCalendarApproval({
        target: lookup.handle.elements[0],
        originalDate: boundProfileValue.value,
        targetYearMonth: source.value,
        profileFieldKey: binding.profileFieldKey,
        profileEntryId: boundProfileValue.profileEntryId,
        itemIndex,
        repeatRow: {
          itemId: lookup.handle.itemId,
          itemGroupId: lookup.handle.itemGroupId,
          itemIndex,
        },
      });
    } catch {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        "읽기 전용 월 달력의 대상과 소유권을 확인할 수 없습니다.",
        analysis,
      );
    }
    finalizedProfileValue = { ...boundProfileValue, value: source.value };
  }
  if (
    generic &&
    analysis.writePlan.command !== "SELECT_DATE" &&
    binding.type === "DIRECT" &&
    parts?.inputType === "date"
  ) {
    const target = resolveDateTargetFormat(lookup.handle);
    if (target.status !== "resolved") {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        `날짜 입력 형식을 확인할 수 없습니다: ${target.reason}`,
        analysis,
      );
    }
    const converted = formatProfileDate(boundProfileValue.value, target.format);
    if (converted.status !== "resolved") {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        `저장된 날짜를 변환할 수 없습니다: ${converted.reason}`,
        analysis,
      );
    }
    const validation = validateDateTargetValue(
      target.approval,
      converted.value,
    );
    if (validation.status !== "valid") {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        `날짜 입력값이 대상 조건과 맞지 않습니다: ${validation.reason}`,
        analysis,
      );
    }
    dateApproval = target.approval;
    finalizedProfileValue = { ...boundProfileValue, value: converted.value };
  }
  const profileValue =
    binding.type === "DIRECT" &&
    normalizeDirectValue &&
    !dateApproval &&
    !dayCalendarApproval
      ? {
          ...finalizedProfileValue,
          value: normalizeDirectValue(
            binding.profileFieldKey,
            finalizedProfileValue.value,
          ),
        }
      : finalizedProfileValue;

  const liveOptionMatch =
    analysis.writePlan.command === "SELECT_OPTION" &&
    profileValue.standardValueId
      ? matchStandardOption(
          profileValue.standardValueId,
          lookup.handle.candidate.options ?? [],
        )
      : undefined;
  if (
    liveOptionMatch &&
    (liveOptionMatch.status === "none" ||
      liveOptionMatch.status === "ambiguous")
  ) {
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      "지원서 선택값을 하나로 확인할 수 없어 자동 기입하지 않았습니다.",
      analysis,
    );
  }
  let resolvedProfileValue =
    liveOptionMatch?.status === "unique"
      ? { ...profileValue, value: liveOptionMatch.option.displayName }
      : profileValue;
  const catalogChoices =
    catalogMatch &&
    !(lookup.handle.buttonDropdown && catalogMatch.requiredDetail) &&
    (analysis.writePlan.command === "SELECT_OPTION" ||
      (analysis.writePlan.command === "SET_TEXT" &&
        lookup.handle.elements[0]?.getAttribute("role") === "combobox"))
      ? (lookup.handle.candidate.options ?? []).filter((option) => {
          const element = lookup.handle.optionElements.get(option.optionId);
          const evidence = element
            ? catalogEvidenceForElement(
                element,
                element instanceof HTMLOptionElement
                  ? (element.parentElement?.parentElement ??
                      element.parentElement ??
                      element)
                  : (element.parentElement ?? element),
                option.displayName,
              )
            : { label: option.displayName };
          return matchesApprovedCatalog(catalogMatch, evidence);
        })
      : undefined;
  if (catalogChoices) {
    if (catalogChoices.length !== 1)
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        "선택한 항목과 일치하는 지원서 선택지를 하나로 확인할 수 없습니다.",
        analysis,
      );
    resolvedProfileValue = {
      ...profileValue,
      value: catalogChoices[0].displayName,
    };
  }
  if (
    generic &&
    lookup.handle.buttonDropdown &&
    !catalogMatch?.requiredDetail
  ) {
    const matches = (lookup.handle.candidate.options ?? []).filter(
      (option) =>
        normalizeDisplayName(option.displayName) ===
        normalizeDisplayName(resolvedProfileValue.value),
    );
    if (analysis.writePlan.command !== "SELECT_OPTION" || matches.length !== 1)
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        "지원서 드롭다운의 일치 옵션을 하나로 확인할 수 없습니다.",
        analysis,
      );
    const option = matches[0];
    if (option)
      resolvedProfileValue = {
        ...resolvedProfileValue,
        value: option.displayName,
      };
  }
  const searchValuePlan =
    searchCommand && binding.type === "DIRECT"
      ? certificateSearchValuePlan(
          profile,
          binding.profileFieldKey,
          resolvedProfileValue.profileEntryId,
          resolvedProfileValue.value,
        )
      : undefined;

  const pageValue = currentValue(lookup.handle);
  const verifiedFreshDefault =
    components &&
    freshDefaultCandidateIds.has(analysis.candidateId) &&
    analysis.mappingStatus === "ADAPTER_VERIFIED" &&
    analysis.writePlan.command === "SELECT_BUTTON_OPTION" &&
    !!(component?.freshDefaults ?? []).some(
      (rule) =>
        rule.binding === binding.type &&
        rule.key ===
          (binding.type === "DERIVED"
            ? binding.recipe
            : binding.profileFieldKey) &&
        new RegExp(rule.pattern).test(lookup.handle.candidate.domName ?? "") &&
        pageValue.trim() === rule.value,
    );
  const hasConflict =
    !ignoreCurrentValueCandidateIds.has(analysis.candidateId) &&
    !verifiedFreshDefault &&
    pageValue.trim().length > 0 &&
    (searchCommand
      ? !(
          binding.type === "DIRECT" &&
          binding.profileFieldKey.endsWith(".schoolRegion")
            ? schoolRegionSearchValues(resolvedProfileValue.value)
            : [resolvedProfileValue.value]
        ).some((value) => normalized(pageValue) === normalized(value))
      : pageValue.trim() !== resolvedProfileValue.value.trim());
  if (hasConflict) {
    return {
      candidateId: analysis.candidateId,
      fieldLabel,
      ...(binding.type === "DIRECT" ||
      (binding.type !== "DERIVED" && catalogMatch)
        ? { profileFieldKey: binding.profileFieldKey }
        : {}),
      ...(resolvedProfileValue.profileEntryId
        ? { profileEntryId: resolvedProfileValue.profileEntryId }
        : {}),
      ...(itemIndex !== undefined ? { itemIndex } : {}),
      currentValue: pageValue,
      profileValue: resolvedProfileValue.value,
      previewValue: resolvedProfileValue.value,
      status: "conflict",
      selected: false,
      disabled: false,
      revealed: true,
      reason: "지원서에 기존 값이 있습니다.",
      analysis,
      ...(dateApproval ? { dateApproval } : {}),
      ...(calendarApproval ? { calendarApproval } : {}),
      ...(dayCalendarApproval ? { dayCalendarApproval } : {}),
      ...(searchValuePlan ? { searchValuePlan } : {}),
      ...(searchIdentity
        ? { searchIdentity, ...(catalogMatch ? { catalogMatch } : {}) }
        : {}),
    };
  }
  // Preselect only when the write-time search compares results with the stored
  // name alone. Alternative query forms (certificate name+grade splits, region
  // aliases, approved catalog queries) can select a different name.
  const selectsOriginalSearchName =
    generic &&
    searchCommand &&
    binding.type === "DIRECT" &&
    !catalogMatch &&
    !binding.profileFieldKey.endsWith(".schoolRegion") &&
    (!searchValuePlan ||
      (searchValuePlan.forms.length === 1 &&
        searchValuePlan.forms[0]?.kind === "original-exact"));
  if (analysis.autofillPolicy === "CONDITIONAL") {
    return {
      candidateId: analysis.candidateId,
      fieldLabel,
      ...(binding.type === "DIRECT" ||
      (binding.type !== "DERIVED" && catalogMatch)
        ? { profileFieldKey: binding.profileFieldKey }
        : {}),
      ...(resolvedProfileValue.profileEntryId
        ? { profileEntryId: resolvedProfileValue.profileEntryId }
        : {}),
      ...(itemIndex !== undefined ? { itemIndex } : {}),
      currentValue: pageValue,
      profileValue: resolvedProfileValue.value,
      previewValue: resolvedProfileValue.value,
      status: selectsOriginalSearchName ? "available" : "needs-review",
      selected: selectsOriginalSearchName,
      disabled: false,
      revealed: true,
      reason: selectsOriginalSearchName
        ? "검색 결과에서 저장된 값과 정확히 일치하는 항목만 선택해 입력합니다."
        : "지원서 조건을 확인한 뒤 선택해 주세요.",
      analysis,
      ...(verifiedFreshDefault
        ? { verifiedFreshDefaultValue: component!.labels.defaultMajor }
        : {}),
      ...(dateApproval ? { dateApproval } : {}),
      ...(calendarApproval ? { calendarApproval } : {}),
      ...(dayCalendarApproval ? { dayCalendarApproval } : {}),
      ...(searchValuePlan ? { searchValuePlan } : {}),
      ...(searchIdentity
        ? { searchIdentity, ...(catalogMatch ? { catalogMatch } : {}) }
        : {}),
    };
  }
  return {
    candidateId: analysis.candidateId,
    fieldLabel,
    ...(binding.type === "DIRECT" ||
    (binding.type !== "DERIVED" && catalogMatch)
      ? { profileFieldKey: binding.profileFieldKey }
      : {}),
    ...(resolvedProfileValue.profileEntryId
      ? { profileEntryId: resolvedProfileValue.profileEntryId }
      : {}),
    ...(itemIndex !== undefined ? { itemIndex } : {}),
    currentValue: pageValue,
    profileValue: resolvedProfileValue.value,
    previewValue: resolvedProfileValue.value,
    status: "available",
    // A calendar target whose approval was built from a complete profile date
    // (format resolved by the calendar surface) is a format difference, not an
    // ambiguity, so it is auto-selected. Conflicts returned earlier.
    selected:
      analysis.writePlan.command === "SELECT_DATE"
        ? generic && !!(calendarApproval || dayCalendarApproval)
        : true,
    disabled: false,
    revealed: true,
    reason:
      analysis.writePlan.command === "SELECT_DATE"
        ? currentValue(lookup.handle).trim() === finalizedProfileValue.value
          ? dayCalendarApproval
            ? "지원서에 같은 날짜가 이미 입력되어 있습니다."
            : "지원서에 같은 연월이 이미 입력되어 있습니다."
          : dayCalendarApproval
            ? "달력을 열어 저장된 날짜를 선택해 입력합니다."
            : calendarApproval
              ? "달력을 열어 저장된 연월을 선택해 입력합니다."
              : "달력 연월을 확인한 뒤 선택해 주세요."
        : "저장된 값과 지원서 필드가 명확히 연결되었습니다.",
    analysis,
    ...(verifiedFreshDefault
      ? { verifiedFreshDefaultValue: component!.labels.defaultMajor }
      : {}),
    ...(dateApproval ? { dateApproval } : {}),
    ...(calendarApproval ? { calendarApproval } : {}),
    ...(dayCalendarApproval ? { dayCalendarApproval } : {}),
    ...(searchValuePlan ? { searchValuePlan } : {}),
    ...(searchIdentity
      ? { searchIdentity, ...(catalogMatch ? { catalogMatch } : {}) }
      : {}),
  };
}

function repeatedBindingKey(item: ReviewPlanItem): string | undefined {
  if (item.analysis?.mappingStatus !== "LLM_SUGGESTED") return undefined;
  const profileFieldKey =
    item.analysis?.valueBinding?.profileFieldKey ??
    item.analysis?.profileFieldKey ??
    item.profileFieldKey;
  return item.profileEntryId && profileFieldKey
    ? `${item.profileEntryId}:${profileFieldKey}`
    : undefined;
}

function rejectDuplicateRepeatedBindings(
  items: ReviewPlanItem[],
): ReviewPlanItem[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = repeatedBindingKey(item);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return items.map((item) => {
    const key = repeatedBindingKey(item);
    if (!key || counts.get(key) === 1 || item.status === "unavailable") {
      return item;
    }
    return {
      ...item,
      status: "unavailable",
      selected: false,
      disabled: true,
      reason:
        "같은 반복 프로필 항목이 여러 지원서 행에 연결되어 자동 입력하지 않았습니다.",
    };
  });
}

export function buildReviewPlan({
  analysis,
  profile,
  registry,
  ignoreCurrentValueCandidateIds = new Set<string>(),
  freshDefaultCandidateIds = new Set<string>(),
  normalizeDirectValue,
}: {
  analysis: FieldsAnalyzeResponse;
  profile: Profile;
  registry: CandidateRegistry;
  ignoreCurrentValueCandidateIds?: ReadonlySet<string>;
  freshDefaultCandidateIds?: ReadonlySet<string>;
  normalizeDirectValue?: (profileFieldKey: string, value: string) => string;
}): ReviewPlan {
  if (analysis.analysisStatus === "BLOCKED") {
    return { status: "blocked", items: [] };
  }
  const components = analysis.fields.some((field) => {
    const lookup = registry.lookupField(field.candidateId);
    if (lookup.status !== "ready" && lookup.status !== "blocked") return false;
    const document = (
      lookup.handle.elements[0] ?? lookup.handle.customElements?.[0]
    )?.ownerDocument;
    return (
      document !== undefined &&
      resolveDocumentCompany(document) === "components"
    );
  });
  const items = analysis.fields.map((field) => {
    const item = itemForAnalysis(
      field,
      profile,
      registry,
      ignoreCurrentValueCandidateIds,
      freshDefaultCandidateIds,
      normalizeDirectValue,
      analysis.mode === "GENERIC",
      components && analysis.mode === "ADAPTER",
    );
    if (analysis.mode !== "GENERIC") return item;
    const lookup = registry.lookupField(field.candidateId);
    return lookup.status === "blocked" && lookup.reason === "hidden"
      ? { ...item, hiddenFromReview: true }
      : item;
  });
  return {
    status: analysis.analysisStatus === "PARTIAL" ? "partial" : "ready",
    items:
      components && analysis.mode === "ADAPTER"
        ? approveComponentGpaPairs(
            rejectDuplicateRepeatedBindings(items),
            registry,
          )
        : rejectDuplicateRepeatedBindings(items),
  };
}
