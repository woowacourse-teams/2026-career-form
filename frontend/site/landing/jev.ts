// Story data for the AI scene: how 의사결정 AI(JEV) reads an application.
// The steps mirror the real pipeline described on 기술 소개: split the form
// into sections, classify each section, narrow candidates, pick one with a
// confidence, fill, and leave uncertain fields for the visitor.
import { evenTriggers, type Playback } from "./step-playback";

/** Scroll boundaries: hero until 0.1, then seven equal steps. */
export const JEV_STEPS = [
  0.1, 0.2286, 0.3571, 0.4857, 0.6143, 0.7429, 0.8714, 1,
];

/** Rest stops sit just before the next step starts, so they read as that step finished. */
const STEP_EDGE = 1e-4;

/**
 * Stage 0 is the hero, stage s (1..7) is JEV step s-1 fully played. 0.08
 * screens leave the hero, then each step owns 0.7 screens of scroll;
 * AiScene.module.css sizes the track to match.
 */
export const AI_PLAYBACK: Playback = {
  rests: [0, ...JEV_STEPS.slice(1, -1).map((end) => end - STEP_EDGE), 1],
  triggers: evenTriggers(0.08, 0.7, 7),
  seconds: Array(7).fill(0.9),
};

/** A point `fraction` of the way through step `index` (0-based). */
export const stepAt = (index: number, fraction: number) =>
  JEV_STEPS[index] + fraction * (JEV_STEPS[index + 1] - JEV_STEPS[index]);

export const JEV_CAPTIONS = [
  ["자동 기입을 누르면", "의사결정 AI(JEV)가 지원서를 읽기 시작해요."],
  ["지원서를 묶음으로 나눠요", "반복되는 줄과 제목을 기준으로 칸을 묶어요."],
  ["묶음의 종류를 판단해요", "JEV가 인적사항, 학력 같은 종류를 정해요."],
  ["후보를 좁혀요", "칸마다 그 묶음에 맞는 내 정보만 후보로 남겨요."],
  ["하나 고르고 확신을 재요", "확신이 높으면 채우고, 낮으면 비워 둬요."],
  ["몇 초 만에 채워요", "칸 67개 지원서도 4.2초. 이전보다 약 5배 빨라요."],
  ["애매한 칸은 물어봐요", "확실하지 않은 칸은 비워두고 확인을 요청해요."],
] as const;

export const JEV_STATUS = [
  "자동 기입 시작",
  "묶음으로 나누는 중",
  "묶음 종류 판단 중",
  "후보 좁히는 중",
  "신뢰도 계산 중",
  "내 정보로 채우는 중",
  "분석 완료",
];

export const ANALYSIS_LOG = [
  ["지원서의 칸 ", "10개", " 발견"],
  ["반복되는 줄과 제목으로 ", "경계", " 찾기"],
  ["묶음 ", "3개", "로 나눔"],
] as const;

export type Certainty = "sure" | "unsure" | "unknown";

/** 80% and up fills, 50–80% asks first, below 50% stays empty. */
export const certainty = (confidence: number): Certainty =>
  confidence >= 0.8 ? "sure" : confidence >= 0.5 ? "unsure" : "unknown";

export const CERTAINTY_WORD: Record<Certainty, string> = {
  sure: "확실",
  unsure: "애매",
  unknown: "모름",
};

export const percent = (confidence: number) =>
  `${Math.round(confidence * 100)}%`;

export const FIELD_GROUPS = [
  {
    name: "인적사항",
    from: 0,
    to: 3,
    confidence: 0.98,
    note: "이름·생일·연락처 후보만 남김",
  },
  {
    name: "학력",
    from: 4,
    to: 7,
    confidence: 0.97,
    note: "학교·전공·학위·기간 후보만 남김",
  },
  {
    name: "희망 조건",
    from: 8,
    to: 9,
    confidence: 0.71,
    note: "맞는 프로필 항목이 적음",
  },
];

export const groupOf = (field: number) =>
  FIELD_GROUPS.findIndex((g) => field >= g.from && field <= g.to);

/** The field whose candidate narrowing is shown in step 4 (출신 학교). */
export const FOCUS_FIELD = 4;

export const PROFILE_ITEMS = [
  "이름",
  "영문명",
  "한자명",
  "생일",
  "성별",
  "국적",
  "휴대폰",
  "이메일",
  "주소",
  "우편번호",
  "비상연락",
  "학교명",
  "전공",
  "학위",
  "입학일",
  "졸업일",
  "학점",
  "편입",
  "소재지",
  "회사명",
  "부서",
  "직위",
  "입사일",
  "퇴사일",
  "담당업무",
  "자격증",
  "발급처",
  "취득일",
  "시험명",
  "점수",
  "등급",
  "응시일",
  "병역",
  "군별",
  "계급",
  "보훈",
  "수상",
  "활동",
  "기간",
  "링크",
  "자기소개",
  "사진",
];
export const EDUCATION_ITEMS = [
  "학교명",
  "전공",
  "학위",
  "입학일",
  "졸업일",
  "편입",
];
export const PICKED_ITEM = "학교명";

/** Fields shown on the confidence gauge, with what happens to each. */
export const CONFIDENCE_EXAMPLES = [
  [4, "확실해서 바로 채움"],
  [9, "애매해서 값을 보여주고 확인"],
  [8, "몰라서 비워 둠"],
] as const;

export const ANALYSIS_RESULT = {
  seconds: 4.2,
  previousSeconds: 22.1,
  fields: 67,
  speedup: "약 5배",
  linked: "91.0%",
  wrongValues: "0%",
  footnote: "합성 지원서 1개 · 5회 중 가장 느린 값(p95)",
};
