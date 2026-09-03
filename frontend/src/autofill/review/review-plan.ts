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
  ProfileCategoryId,
  RepeatedProfileCategoryId,
} from "../../profile/model";
import type { ValueBinding } from "../api/types";
import { resolveValueBinding } from "../profile/value-binding";

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
  "available" | "needs-review" | "conflict" | "sensitive" | "unavailable";

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
  analysis?: MatchedFieldAnalysis;
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
    .filter(({ item }) => item.status !== "unavailable")
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

function itemForAnalysis(
  analysis: FieldAnalysis,
  profile: Profile,
  registry: CandidateRegistry,
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
  if (lookup.status !== "ready") {
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
      analysis,
    );
  }

  const binding: ValueBinding | undefined = analysis.valueBinding ?? (
    analysis.profileFieldKey
      ? { type: "DIRECT", profileFieldKey: analysis.profileFieldKey }
      : undefined
  );
  if (!binding) {
    return unavailableItem(
      analysis.candidateId,
      fieldLabel,
      "프로필 값 연결 방식이 없습니다.",
      analysis,
    );
  }
  const parts = binding.type === "DIRECT"
    ? profileFieldParts(binding.profileFieldKey)
    : undefined;
  let itemIndex = lookup.handle.itemIndex;
  if (parts?.repeatable) {
    const profileEntries = profile[
      parts.categoryId as RepeatedProfileCategoryId
    ].filter((entry) => entry.sectionId === parts.sectionId);
    const formItemCount = registry.fieldItemCount(analysis.candidateId);
    if (itemIndex === undefined && parts.fieldId === "latestEducationType" && profileEntries.length === 1) {
      itemIndex = 0;
    }
    if (
      itemIndex === undefined ||
      formItemCount === undefined ||
      formItemCount !== profileEntries.length
    ) {
      return unavailableItem(
        analysis.candidateId,
        fieldLabel,
        "반복 입력 행과 저장된 프로필 항목의 개수가 달라 안전하게 연결할 수 없습니다.",
        analysis,
      );
    }
  }

  const profileValue = resolveValueBinding(profile, binding, itemIndex);
  if (profileValue.status !== "resolved") {
    const reason =
      profileValue.status === "ambiguous"
        ? "반복 프로필 항목을 하나로 안전하게 결정할 수 없습니다."
        : "입력할 프로필 값이 없습니다.";
    return unavailableItem(analysis.candidateId, fieldLabel, reason, analysis);
  }

  const pageValue = currentValue(lookup.handle);
  const hasConflict =
    pageValue.trim().length > 0 &&
    pageValue.trim() !== profileValue.value.trim();
  if (
    profileValue.sensitive ||
    analysis.autofillPolicy === "SENSITIVE_CONFIRMATION"
  ) {
    return {
      candidateId: analysis.candidateId,
      fieldLabel,
      ...(binding.type === "DIRECT" ? { profileFieldKey: binding.profileFieldKey } : {}),
      ...(profileValue.profileEntryId
        ? { profileEntryId: profileValue.profileEntryId }
        : {}),
      ...(itemIndex !== undefined ? { itemIndex } : {}),
      currentValue: pageValue,
      profileValue: profileValue.value,
      previewValue: "••••••••",
      status: "sensitive",
      selected: false,
      disabled: true,
      revealed: false,
      reason: "민감정보는 값을 확인한 뒤에만 선택할 수 있습니다.",
      analysis,
    };
  }
  if (hasConflict) {
    return {
      candidateId: analysis.candidateId,
      fieldLabel,
      ...(binding.type === "DIRECT" ? { profileFieldKey: binding.profileFieldKey } : {}),
      ...(profileValue.profileEntryId
        ? { profileEntryId: profileValue.profileEntryId }
        : {}),
      ...(itemIndex !== undefined ? { itemIndex } : {}),
      currentValue: pageValue,
      profileValue: profileValue.value,
      previewValue: profileValue.value,
      status: "conflict",
      selected: false,
      disabled: false,
      revealed: true,
      reason: "지원서에 기존 값이 있습니다.",
      analysis,
    };
  }
  if (analysis.autofillPolicy === "CONDITIONAL") {
    return {
      candidateId: analysis.candidateId,
      fieldLabel,
      ...(binding.type === "DIRECT" ? { profileFieldKey: binding.profileFieldKey } : {}),
      currentValue: pageValue,
      profileValue: profileValue.value,
      previewValue: profileValue.value,
      status: "needs-review",
      selected: false,
      disabled: false,
      revealed: true,
      reason: "지원서 조건을 확인한 뒤 선택해 주세요.",
      analysis,
    };
  }
  return {
    candidateId: analysis.candidateId,
    fieldLabel,
    ...(binding.type === "DIRECT" ? { profileFieldKey: binding.profileFieldKey } : {}),
    ...(profileValue.profileEntryId
      ? { profileEntryId: profileValue.profileEntryId }
      : {}),
    ...(itemIndex !== undefined ? { itemIndex } : {}),
    currentValue: pageValue,
    profileValue: profileValue.value,
    previewValue: profileValue.value,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "저장된 값과 지원서 필드가 명확히 연결되었습니다.",
    analysis,
  };
}

export function buildReviewPlan({
  analysis,
  profile,
  registry,
}: {
  analysis: FieldsAnalyzeResponse;
  profile: Profile;
  registry: CandidateRegistry;
}): ReviewPlan {
  if (analysis.analysisStatus === "BLOCKED") {
    return { status: "blocked", items: [] };
  }
  return {
    status: analysis.analysisStatus === "PARTIAL" ? "partial" : "ready",
    items: analysis.fields.map((field) =>
      itemForAnalysis(field, profile, registry),
    ),
  };
}

export function revealSensitiveReviewItem(
  item: ReviewPlanItem,
): ReviewPlanItem {
  if (item.status !== "sensitive" || !item.profileValue) return item;
  return {
    ...item,
    previewValue: item.profileValue,
    disabled: false,
    revealed: true,
  };
}
