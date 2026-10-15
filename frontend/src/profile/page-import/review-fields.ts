import { PROFILE_CATEGORIES } from "../field-definitions";
import type { ImportCandidate } from "./reader";

export function destination(candidate: ImportCandidate) {
  const [categoryId, sectionId, fieldId, extra] =
    candidate.profileFieldKey?.split(".") ?? [];
  if (extra) return undefined;
  const category = PROFILE_CATEGORIES.find((item) => item.id === categoryId);
  const section = category?.sections.find((item) => item.id === sectionId);
  const field = section?.fields.find((item) => item.id === fieldId);
  if (!category || !section || !field) return undefined;
  if (
    category.repeatable &&
    (candidate.rowIndex === undefined ||
      !Number.isSafeInteger(candidate.rowIndex) ||
      candidate.rowIndex < 0)
  )
    return undefined;
  return { category, section, field };
}

export function displayValue(
  value: string | undefined,
  candidate: ImportCandidate,
): string {
  if (!value) return "없음";
  const option = destination(candidate)?.field.options?.find((option) =>
    typeof option === "string" ? option === value : option.value === value,
  );
  return option && typeof option !== "string" ? option.label : value;
}

export const NAME_GROUPS = [
  {
    source: "basicInformation.name",
    title: "이름 확인",
    keys: [
      ["koreanFamilyName", "국문 성"],
      ["koreanGivenName", "국문 이름"],
    ],
  },
  {
    source: "basicInformation.englishName",
    title: "영문 이름 확인",
    keys: [
      ["englishFamilyName", "영문 성"],
      ["englishGivenName", "영문 이름"],
    ],
  },
] as const;
export const isName = (candidate: ImportCandidate) =>
  NAME_GROUPS.some((group) => group.source === candidate.source);
export const groupKey = (candidate: ImportCandidate) =>
  `${candidate.profileFieldKey?.split(".").slice(0, 2).join(".")}.${candidate.rowIndex}`;
export const fieldLabel = (candidate: ImportCandidate) => {
  const dest = destination(candidate)!;
  const label =
    dest.field.id === "email"
      ? "이메일"
      : dest.field.id === "phoneNumber"
        ? "전화번호"
        : dest.field.label;
  return dest.category.repeatable
    ? `${dest.section.label} ${candidate.rowIndex! + 1} ${label}`
    : label;
};
export function skippedReason(reason: string) {
  if (["no_profile_mapping", "unsupported_field"].includes(reason))
    return "대응하는 프로필 항목이 없어 제외";
  if (reason === "empty") return "비어 있어 제외";
  if (reason === "hidden_or_inert")
    return "숨겨져 있거나 비활성 영역에 있어 제외";
  if (reason === "unrecognized_document")
    return "Greeting 지원서 구조를 확인할 수 없어 제외";
  if (
    reason.includes("ambiguous") ||
    reason.includes("invalid_rows") ||
    reason.includes("unbound")
  )
    return "필드 또는 행의 연결이 모호하여 제외";
  if (reason.includes("invalid") || reason.includes("format"))
    return "값의 형식을 확인할 수 없어 제외";
  if (["read_error", "read_failed"].includes(reason))
    return "값을 읽는 중 오류가 발생하여 제외";
  return "현재 페이지에서 안전하게 읽을 수 없어 제외";
}
