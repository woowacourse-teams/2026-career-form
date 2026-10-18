import type {
  StructureLoopAction,
  StructureActionKind,
} from "./structure-loop";

/**
 * Display model for the generic structure loop. It receives structure only
 * (kind, section title, result, reason code) and replaces reason codes with
 * fixed text, so no profile or input value can reach the screen or Console.
 */
export type StructureLoopStatus =
  "not-run" | "ran-no-actions" | "ran-with-actions";

export interface StructureDiagnostics {
  status: StructureLoopStatus;
  actions: readonly StructureLoopAction[];
}

export interface StructureActionLine {
  kindText: string;
  sectionTitle?: string;
  resultText: "완료" | "막힘";
  reasonText?: string;
}

const STATUS_TEXT: Record<StructureLoopStatus, string> = {
  "not-run": "구조 자동 준비 미실행",
  "ran-no-actions": "구조 자동 준비를 실행했고 필요한 행동 없음",
  "ran-with-actions": "구조 자동 준비를 실행하고 자동으로 한 일이 있음",
};

const KIND_TEXT: Record<StructureActionKind, string> = {
  ADD_ROW: "행 추가",
  REVEAL_SECTION: "영역 열기",
  SELECT_ROW_KIND: "행 종류 선택",
};

const GENERAL_REASON_TEXT = "자동으로 준비하지 못했습니다. 직접 확인해 주세요.";

const REASON_TEXT: Record<string, string> = {
  CLASSIFY_UNAVAILABLE: "섹션 종류를 확인하지 못했습니다.",
  SECTION_ACTION_LIMIT: "한 섹션에서 할 수 있는 자동 행동 횟수를 넘었습니다.",
  NO_ADD_CONTROL: "행을 추가하는 버튼을 찾지 못했습니다.",
  ADD_CONTROL_GONE: "행을 추가하는 버튼이 사라졌습니다.",
  ADD_FAILED: "행을 추가하지 못했습니다.",
  INTERACTION_UNAVAILABLE: "추가 버튼을 고르지 못했습니다.",
  REPEAT_ADD_ABSTAINED: "추가 버튼이 분명하지 않아 누르지 않았습니다.",
  URL_CHANGED: "페이지 주소가 바뀌어 멈췄습니다.",
  NO_PROGRESS: "행동했지만 화면이 달라지지 않았습니다.",
  NO_PROFILE_STAGE: "맞는 프로필 항목이 없습니다.",
  ROW_KIND_OPTION_UNDECIDED: "행 종류를 정하지 못했습니다.",
  ROW_NOT_FOUND: "대상 행을 찾지 못했습니다.",
  REMATCH_UNAVAILABLE: "행을 다시 분석하지 못했습니다.",
  STAGE_KEY_MISMATCH: "행 종류와 프로필 항목이 맞지 않습니다.",
};

export function createStructureDiagnostics(
  ran: boolean,
  actions: readonly StructureLoopAction[],
): StructureDiagnostics {
  if (!ran) return { status: "not-run", actions: [] };
  return {
    status: actions.length > 0 ? "ran-with-actions" : "ran-no-actions",
    actions: [...actions],
  };
}

export function structureStatusText(status: StructureLoopStatus): string {
  return STATUS_TEXT[status];
}

export function blockedReasonText(code: string | undefined): string {
  return (
    (code !== undefined && Object.hasOwn(REASON_TEXT, code)
      ? REASON_TEXT[code]
      : undefined) ?? GENERAL_REASON_TEXT
  );
}

export function structureActionLine(
  action: StructureLoopAction,
): StructureActionLine {
  const blocked = action.result === "blocked";
  return {
    kindText: KIND_TEXT[action.kind],
    ...(action.sectionTitle ? { sectionTitle: action.sectionTitle } : {}),
    resultText: blocked ? "막힘" : "완료",
    ...(blocked ? { reasonText: blockedReasonText(action.reason) } : {}),
  };
}

/** Status and counts only: no section title, code or value. */
export function structureConsoleLine(
  diagnostics: StructureDiagnostics,
): string {
  const blocked = diagnostics.actions.filter(
    (action) => action.result === "blocked",
  ).length;
  return `구조 자동 준비: 상태=${diagnostics.status}, 완료 ${diagnostics.actions.length - blocked}, 막힘 ${blocked}`;
}
