// The virtual application used by the AI scene and the hands-on trial. Every
// value is invented; nothing here comes from or goes to a real profile.
export type SampleField = {
  label: string;
  /** What the AI recognises the field as, in plain words. */
  meaning: string;
  /** Filled value; absent when the field needs the visitor's confirmation. */
  value?: string;
  /** How sure the AI is about the profile item it picked (0..1). */
  confidence: number;
};

export const SAMPLE_COMPANY = "커리어 테크";
export const SAMPLE_FORM_TITLE = "2027 상반기 신입 공채";
export const SAMPLE_NAME = "윤티모";

export const sampleFields: SampleField[] = [
  { label: "이름", meaning: "내 이름", value: SAMPLE_NAME, confidence: 0.97 },
  {
    label: "생년월일",
    meaning: "내 생일",
    value: "2001. 12. 09",
    confidence: 0.95,
  },
  {
    label: "휴대전화",
    meaning: "내 연락처",
    value: "010-1234-5678",
    confidence: 0.96,
  },
  {
    label: "이메일",
    meaning: "내 이메일",
    value: "timo@example.com",
    confidence: 0.98,
  },
  {
    label: "출신 학교",
    meaning: "내 학교 이름",
    value: "요들대학교",
    confidence: 0.94,
  },
  {
    label: "전공",
    meaning: "내 전공",
    value: "컴퓨터공학과",
    confidence: 0.93,
  },
  {
    label: "편입 여부",
    meaning: "내 입학 방법",
    value: "편입",
    confidence: 0.86,
  },
  {
    label: "졸업(예정)일",
    meaning: "내 졸업 날짜",
    value: "2027. 02",
    confidence: 0.91,
  },
  { label: "희망 근무지", meaning: "내 정보에 없어요", confidence: 0.31 },
  { label: "병역 사항", meaning: "골라야 해요", confidence: 0.62 },
];

export const filledCount = sampleFields.filter((f) => f.value).length;
export const reviewCount = sampleFields.length - filledCount;
