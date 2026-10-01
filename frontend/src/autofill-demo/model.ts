export type ReviewStatus =
  "available" | "needs-review" | "conflict" | "sensitive" | "unavailable";

export interface ReviewItem {
  id: string;
  fieldLabel: string;
  previewValue: string;
  status: ReviewStatus;
  selected: boolean;
  disabled: boolean;
  reason: string;
}

export type ReviewGroupId = "available" | "needs-human-review" | "unavailable";

export interface ReviewGroup {
  id: ReviewGroupId;
  label: string;
  description: string;
  items: ReviewItem[];
}

const REVIEW_GROUPS: readonly Omit<ReviewGroup, "items">[] = [
  {
    id: "available",
    label: "입력 가능",
    description: "연결이 명확해 바로 선택할 수 있습니다.",
  },
  {
    id: "needs-human-review",
    label: "사람 확인 필요",
    description: "선택지, 기존 값과 민감정보를 직접 확인해 주세요.",
  },
  {
    id: "unavailable",
    label: "입력 불가",
    description: "안전하게 입력할 수 없어 선택할 수 없습니다.",
  },
];

const MOCK_REVIEW_ITEMS: readonly Omit<ReviewItem, "selected" | "disabled">[] =
  [
    {
      id: "email",
      fieldLabel: "이메일주소",
      previewValue: "a***@example.com",
      status: "available",
      reason: "저장된 값과 지원서 필드가 명확히 연결됨",
    },
    {
      id: "nationality",
      fieldLabel: "국적",
      previewValue: "[국적 입력 예정 값]",
      status: "needs-review",
      reason: "지원서 선택지 확인 필요",
    },
    {
      id: "phone",
      fieldLabel: "연락처",
      previewValue: "010-****-0000",
      status: "conflict",
      reason: "기존 값 있음",
    },
    {
      id: "veteran",
      fieldLabel: "보훈 대상 여부",
      previewValue: "가려진 민감정보",
      status: "sensitive",
      reason: "지원 건별 개별 확인 필요",
    },
    {
      id: "motivation",
      fieldLabel: "지원 동기",
      previewValue: "입력 예정 값 없음",
      status: "unavailable",
      reason: "프로필 저장 대상이 아님",
    },
  ];

export function createMockReviewItems(): ReviewItem[] {
  return MOCK_REVIEW_ITEMS.map((item) => ({
    ...item,
    selected: item.status === "available",
    disabled: item.status === "unavailable",
  }));
}

function groupIdForStatus(status: ReviewStatus): ReviewGroupId {
  if (status === "available") return "available";
  if (status === "unavailable") return "unavailable";
  return "needs-human-review";
}

export function groupReviewItems(items: readonly ReviewItem[]): ReviewGroup[] {
  return REVIEW_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => groupIdForStatus(item.status) === group.id),
  }));
}

export function toggleReviewItem(
  items: readonly ReviewItem[],
  itemId: string,
): ReviewItem[] {
  const target = items.find((item) => item.id === itemId);
  if (!target || target.disabled) return [...items];
  return items.map((item) =>
    item.id === itemId ? { ...item, selected: !item.selected } : item,
  );
}
