export interface StandardValueOption {
  value: string;
  label: string;
  aliases?: readonly string[];
}

export const LANGUAGE_OPTIONS: readonly StandardValueOption[] = [
  { value: "language:en", label: "영어" },
  { value: "language:ja", label: "일본어" },
  { value: "language:zh", label: "중국어" },
  { value: "language:de", label: "독일어" },
  { value: "language:fr", label: "프랑스어" },
  { value: "language:es", label: "스페인어" },
  { value: "language:ru", label: "러시아어" },
  { value: "language:other", label: "기타" },
];

export const LANGUAGE_TEST_OPTIONS: readonly StandardValueOption[] = [
  { value: "toeic", label: "TOEIC", aliases: ["토익"] },
  { value: "toefl", label: "TOEFL" },
  { value: "teps", label: "TEPS", aliases: ["New TEPS"] },
  { value: "opic", label: "OPIc", aliases: ["OPIC", "오픽"] },
  { value: "ielts", label: "IELTS" },
  { value: "jlpt", label: "JLPT" },
  { value: "hsk", label: "HSK" },
];

const LANGUAGE_TEST_IDS: Readonly<Record<string, readonly string[]>> = {
  "language:en": ["toeic", "toefl", "teps", "opic", "ielts"],
  "language:ja": ["jlpt"],
  "language:zh": ["hsk"],
};

export const SCHOOL_REGION_OPTIONS: readonly StandardValueOption[] = [
  { value: "region:seoul", label: "서울" },
  { value: "region:busan", label: "부산" },
  { value: "region:daegu", label: "대구" },
  { value: "region:incheon", label: "인천" },
  { value: "region:gwangju", label: "광주" },
  { value: "region:daejeon", label: "대전" },
  { value: "region:ulsan", label: "울산" },
  { value: "region:sejong", label: "세종" },
  { value: "region:gyeonggi", label: "경기" },
  { value: "region:gangwon", label: "강원" },
  { value: "region:chungbuk", label: "충북" },
  { value: "region:chungnam", label: "충남" },
  { value: "region:jeonbuk", label: "전북" },
  { value: "region:jeonnam", label: "전남" },
  { value: "region:gyeongbuk", label: "경북" },
  { value: "region:gyeongnam", label: "경남" },
  { value: "region:jeju", label: "제주" },
  { value: "region:overseas", label: "해외" },
];

export const ATTENDANCE_TYPE_OPTIONS: readonly StandardValueOption[] = [
  { value: "attendance:day", label: "주간" },
  { value: "attendance:night", label: "야간" },
];

const OPIC_GRADE_OPTIONS: readonly StandardValueOption[] = [
  { value: "opic:nh", label: "Novice High", aliases: ["NH"] },
  { value: "opic:nm", label: "Novice Mid", aliases: ["NM"] },
  { value: "opic:nl", label: "Novice Low", aliases: ["NL"] },
  { value: "opic:ih", label: "Intermediate High", aliases: ["IH"] },
  { value: "opic:im1", label: "Intermediate Mid 1", aliases: ["IM1"] },
  { value: "opic:im2", label: "Intermediate Mid 2", aliases: ["IM2"] },
  { value: "opic:im3", label: "Intermediate Mid 3", aliases: ["IM3"] },
  { value: "opic:al", label: "Advanced Low", aliases: ["AL"] },
  { value: "opic:ah", label: "Advanced High", aliases: ["AH"] },
];

const JLPT_GRADE_OPTIONS: readonly StandardValueOption[] = [
  { value: "jlpt:n1", label: "N1" },
  { value: "jlpt:n2", label: "N2" },
  { value: "jlpt:n3", label: "N3" },
  { value: "jlpt:n4", label: "N4" },
  { value: "jlpt:n5", label: "N5" },
];

const HSK_GRADE_OPTIONS: readonly StandardValueOption[] = [
  { value: "hsk:1", label: "1급" },
  { value: "hsk:2", label: "2급" },
  { value: "hsk:3", label: "3급" },
  { value: "hsk:4", label: "4급" },
  { value: "hsk:5", label: "5급" },
  { value: "hsk:6", label: "6급" },
  { value: "hsk:7", label: "7급" },
  { value: "hsk:8", label: "8급" },
  { value: "hsk:9", label: "9급" },
];

const STANDARD_VALUES: readonly StandardValueOption[] = [
  ...LANGUAGE_OPTIONS,
  ...LANGUAGE_TEST_OPTIONS,
  ...SCHOOL_REGION_OPTIONS,
  ...ATTENDANCE_TYPE_OPTIONS,
  ...OPIC_GRADE_OPTIONS,
  ...JLPT_GRADE_OPTIONS,
  ...HSK_GRADE_OPTIONS,
];

export function languageTestOptions(
  languageId: string,
): readonly StandardValueOption[] {
  const testIds = LANGUAGE_TEST_IDS[languageId] ?? [];
  return LANGUAGE_TEST_OPTIONS.filter((option) => testIds.includes(option.value));
}

export function languageGradeOptions(
  testId: string,
): readonly StandardValueOption[] {
  if (testId === "opic") return OPIC_GRADE_OPTIONS;
  if (testId === "jlpt") return JLPT_GRADE_OPTIONS;
  if (testId === "hsk") return HSK_GRADE_OPTIONS;
  return [];
}

export function standardValueLabel(value: string): string | undefined {
  return STANDARD_VALUES.find((option) => option.value === value)?.label;
}

export function standardValueAliases(value: string): readonly string[] {
  const option = STANDARD_VALUES.find((candidate) => candidate.value === value);
  return option ? [option.label, ...(option.aliases ?? [])] : [];
}

export function isStandardValueId(value: string): boolean {
  return STANDARD_VALUES.some((option) => option.value === value);
}
