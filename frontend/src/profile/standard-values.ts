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

export const MILITARY_STATUS_OPTIONS: readonly StandardValueOption[] = [
  { value: "military-status:served", label: "군필", aliases: ["만기전역"] },
  { value: "military-status:serving", label: "복무중" },
  { value: "military-status:not-served", label: "미필" },
  { value: "military-status:exempt", label: "면제" },
  { value: "military-status:not-applicable", label: "비대상" },
];

export const MILITARY_BRANCH_OPTIONS: readonly StandardValueOption[] = [
  { value: "military-branch:army", label: "육군" },
  { value: "military-branch:navy", label: "해군" },
  { value: "military-branch:air-force", label: "공군" },
  { value: "military-branch:marine-corps", label: "해병대" },
  { value: "military-branch:combat-police", label: "전투경찰" },
  { value: "military-branch:coast-guard", label: "해양경찰" },
  { value: "military-branch:conscripted-police", label: "의무경찰" },
  { value: "military-branch:conscripted-firefighter", label: "의무소방" },
];

export const MILITARY_RANK_OPTIONS: readonly StandardValueOption[] = [
  { value: "military-rank:byeongjang", label: "병장" },
  { value: "military-rank:sangbyeong", label: "상병" },
  { value: "military-rank:ilbyeong", label: "일병" },
  { value: "military-rank:ibyeong", label: "이병" },
];

export const VETERAN_STATUS_OPTIONS: readonly StandardValueOption[] = [
  {
    value: "veteran-status:eligible",
    label: "대상",
    aliases: ["예", "해당", "있음", "Y", "yes", "true"],
  },
  {
    value: "veteran-status:not-eligible",
    label: "비대상",
    aliases: ["아니오", "비해당", "없음", "N", "no", "false"],
  },
];

export const DISABILITY_STATUS_OPTIONS: readonly StandardValueOption[] = [
  {
    value: "disability-status:eligible",
    label: "대상",
    aliases: ["예", "해당", "있음", "장애", "Y", "yes", "true"],
  },
  {
    value: "disability-status:not-eligible",
    label: "비대상",
    aliases: ["아니오", "비해당", "없음", "비장애", "N", "no", "false"],
  },
];
const SCHOOL_REGION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "region:seoul": ["서울특별시"],
  "region:busan": ["부산광역시"],
  "region:daegu": ["대구광역시"],
  "region:incheon": ["인천광역시"],
  "region:gwangju": ["광주광역시"],
  "region:daejeon": ["대전광역시"],
  "region:ulsan": ["울산광역시"],
  "region:sejong": ["세종특별자치시"],
  "region:gyeonggi": ["경기도"],
  "region:gangwon": ["강원도"],
  "region:chungbuk": ["충청북도"],
  "region:chungnam": ["충청남도"],
  "region:jeonbuk": ["전라북도"],
  "region:jeonnam": ["전라남도"],
  "region:gyeongbuk": ["경상북도"],
  "region:gyeongnam": ["경상남도"],
  "region:jeju": ["제주특별자치도"],
  "region:overseas": ["해외"],
};

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

const STANDARD_VALUES: readonly StandardValueOption[] = [
  ...LANGUAGE_OPTIONS,
  ...LANGUAGE_TEST_OPTIONS,
  ...SCHOOL_REGION_OPTIONS,
  ...ATTENDANCE_TYPE_OPTIONS,
  ...OPIC_GRADE_OPTIONS,
  ...MILITARY_STATUS_OPTIONS,
  ...MILITARY_BRANCH_OPTIONS,
  ...MILITARY_RANK_OPTIONS,
  ...VETERAN_STATUS_OPTIONS,
  ...DISABILITY_STATUS_OPTIONS,
];

export function languageGradeOptions(
  testId: string,
): readonly StandardValueOption[] {
  return testId === "opic" ? OPIC_GRADE_OPTIONS : [];
}

export function standardValueLabel(value: string): string | undefined {
  return STANDARD_VALUES.find((option) => option.value === value)?.label;
}

export function standardValueAliases(value: string): readonly string[] {
  const option = STANDARD_VALUES.find((candidate) => candidate.value === value);
  return option
    ? [
        option.label,
        ...(option.aliases ?? []),
        ...(SCHOOL_REGION_ALIASES[value] ?? []),
      ]
    : [];
}

export function isStandardValueId(value: string): boolean {
  return STANDARD_VALUES.some((option) => option.value === value);
}
