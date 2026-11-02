// The virtual application used by the AI scene and the hands-on trial. Every
// value is invented; nothing here comes from or goes to a real profile.
export type SampleField = {
  label: string;
  /** What the AI recognises the field as, in plain words. */
  meaning: string;
  /** Filled value; absent when the field needs the visitor's confirmation. */
  value?: string;
};

export const SAMPLE_COMPANY = "커리어 테크";
export const SAMPLE_FORM_TITLE = "2027 상반기 신입 공채";
export const SAMPLE_NAME = "윤티모";

export const sampleFields: SampleField[] = [
  { label: "이름", meaning: "내 이름", value: SAMPLE_NAME },
  { label: "생년월일", meaning: "내 생일", value: "2001. 12. 09" },
  { label: "휴대전화", meaning: "내 연락처", value: "010-1234-5678" },
  { label: "이메일", meaning: "내 이메일", value: "timo@example.com" },
  { label: "출신 학교", meaning: "내 학교 이름", value: "요들대학교" },
  { label: "전공", meaning: "내 전공", value: "컴퓨터공학과" },
  { label: "편입 여부", meaning: "내 입학 방법", value: "편입" },
  { label: "졸업(예정)일", meaning: "내 졸업 날짜", value: "2027. 02" },
  { label: "희망 근무지", meaning: "내 정보에 없어요" },
  { label: "병역 사항", meaning: "골라야 해요" },
];

export const filledCount = sampleFields.filter((f) => f.value).length;
export const reviewCount = sampleFields.length - filledCount;
