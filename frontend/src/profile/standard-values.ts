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
  {
    value: "toeic-speaking",
    label: "TOEIC Speaking",
    aliases: ["토익스피킹"],
  },
  { value: "toefl", label: "TOEFL" },
  { value: "teps", label: "TEPS", aliases: ["New TEPS"] },
  { value: "opic", label: "OPIc", aliases: ["OPIC", "오픽"] },
  { value: "ielts", label: "IELTS" },
  { value: "jlpt", label: "JLPT" },
  { value: "hsk", label: "HSK" },
  { value: "teps-speaking", label: "TEPS Speaking" },
  { value: "g-telp", label: "G-TELP" },
  { value: "flex", label: "FLEX" },
  { value: "jpt", label: "JPT" },
  { value: "sjpt", label: "SJPT" },
  { value: "hskk", label: "HSKK" },
  { value: "tsc", label: "TSC" },
  { value: "delf", label: "DELF" },
  { value: "dalf", label: "DALF" },
  { value: "dele", label: "DELE" },
  { value: "goethe-zertifikat", label: "Goethe-Zertifikat" },
  { value: "testdaf", label: "TestDaF" },
  { value: "topik", label: "TOPIK" },
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
/**
 * Synonym groups for the two fixed employmentStatus choices ("재직중", "퇴직").
 * These are profile-field vocabulary, compared without spaces.
 */
export const EMPLOYMENT_STATUS_SYNONYMS: Readonly<
  Record<string, readonly string[]>
> = {
  재직중: [
    "재직중",
    "재직",
    "현재재직중",
    "현재재직",
    "근무중",
    "현재근무중",
    "현직",
    "재직자",
  ],
  퇴직: ["퇴직", "퇴사", "퇴직함", "퇴사함", "퇴직자", "퇴사자", "퇴사완료"],
};

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
  "region:gangwon": ["강원도", "강원특별자치도"],
  "region:chungbuk": ["충청북도"],
  "region:chungnam": ["충청남도"],
  "region:jeonbuk": ["전라북도", "전북특별자치도"],
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

// Labels are the words company adapters already map (중증/경증).
export const DISABILITY_GRADE_OPTIONS: readonly StandardValueOption[] = [
  {
    value: "disability-grade:severe",
    label: "중증",
    aliases: [
      "심한 장애", "심한장애", "심한 장애인", "장애의 정도가 심한 장애인",
      "중증(심한장애)", "중증(기존1급~3급)", "1급", "2급", "3급",
    ],
  },
  {
    value: "disability-grade:mild",
    label: "경증",
    aliases: [
      "심하지 않은 장애", "심하지않은장애", "심하지 않은 장애인",
      "장애의 정도가 심하지 않은 장애인", "경증(심하지 않은 장애)",
      "경증(기존4급~6급)", "4급", "5급", "6급",
    ],
  },
];

// Sites split relations by kin (아들/딸); both still count as 자녀 for sites that do not.
export const VETERAN_RELATION_OPTIONS: readonly StandardValueOption[] = [
  { value: "veteran-relation:self", label: "본인", aliases: ["당사자"] },
  { value: "veteran-relation:spouse", label: "배우자", aliases: ["남편", "아내", "처"] },
  { value: "veteran-relation:son", label: "아들", aliases: ["자녀", "장남", "차남"] },
  { value: "veteran-relation:daughter", label: "딸", aliases: ["자녀", "장녀", "차녀"] },
  { value: "veteran-relation:father", label: "부", aliases: ["아버지", "부친"] },
  { value: "veteran-relation:mother", label: "모", aliases: ["어머니", "모친"] },
  { value: "veteran-relation:grandfather", label: "조부", aliases: ["할아버지"] },
  { value: "veteran-relation:grandmother", label: "조모", aliases: ["할머니"] },
  { value: "veteran-relation:sibling", label: "형제·자매", aliases: ["형제자매"] },
  { value: "veteran-relation:other", label: "기타" },
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
  ...DISABILITY_GRADE_OPTIONS,
  ...VETERAN_RELATION_OPTIONS,
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

const normalizedStandardValue = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase();

export function schoolRegionOption(
  value: string,
): StandardValueOption | undefined {
  const source = normalizedStandardValue(value);
  if (!source) return undefined;
  const matches = SCHOOL_REGION_OPTIONS.filter((option) =>
    [option.value, ...standardValueAliases(option.value)].some(
      (candidate) => normalizedStandardValue(candidate) === source,
    ),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function schoolRegionSearchValues(value: string): readonly string[] {
  const option = schoolRegionOption(value);
  return option
    ? [option.label, ...standardValueAliases(option.value)]
    : [value];
}

export function isStandardValueId(value: string): boolean {
  return STANDARD_VALUES.some((option) => option.value === value);
}
