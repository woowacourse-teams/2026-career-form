import type {
  ProfileCategoryDefinition,
  ProfileSectionDefinition,
} from "./field-definitions";
import type { Profile, ProfileCategoryId, ProfileEntry } from "./model";

export const EDITOR_GROUPS: {
  label: string;
  categories: ProfileCategoryId[];
}[] = [
  { label: "기본 정보", categories: ["personal", "contact"] },
  {
    label: "학력과 경험",
    categories: [
      "education",
      "languages",
      "certifications",
      "careers",
      "projects",
      "publications",
    ],
  },
  {
    label: "추가 정보",
    categories: ["compensation", "military", "veteran", "disability", "health"],
  },
];

export const CATEGORY_GUIDES: Record<ProfileCategoryId, string> = {
  personal: "지원서에 사용할 이름과 기본 정보를 정리해 주세요.",
  contact: "연락받을 이메일과 전화번호, 거주지 주소를 입력해 주세요.",
  education: "학교별로 이력을 추가하고, 재학 기간과 전공을 정리해 주세요.",
  languages: "공인시험 성적과 외국어 활용 능력을 각각 기록할 수 있어요.",
  certifications:
    "자격증 이름부터 취득일, 기억하기 어려운 등록번호까지 모아두세요.",
  careers: "직장별 근무 기간과 맡았던 일을 기록해 주세요.",
  projects: "참여한 프로젝트의 기간, 역할, 활동 내용을 정리해 주세요.",
  publications: "논문이나 특허를 한 건씩 추가하고 상세 내용을 적어 주세요.",
  compensation: "지원할 때 참고할 희망 처우를 기록해 주세요.",
  military: "해당하는 병역 정보만 입력해 주세요.",
  veteran: "지원서에 필요한 보훈 정보가 있다면 기록해 주세요.",
  disability: "지원서에 필요한 장애 정보가 있다면 기록해 주세요.",
  health: "필요한 건강정보만 항목별로 기록해 주세요.",
};

// Display grouping only: storage keys and the shared autofill field contract stay stable.
const FIELD_GROUPS: Record<string, { title: string; fields: string[] }[]> = {
  personal: [
    { title: "국문 이름", fields: ["koreanFamilyName", "koreanGivenName"] },
    { title: "영문 이름", fields: ["englishFamilyName", "englishGivenName"] },
    { title: "한자 이름", fields: ["hanjaFamilyName", "hanjaGivenName"] },
    { title: "기본 정보", fields: ["birthDate", "gender", "nationality"] },
  ],
  contact: [
    {
      title: "연락받을 곳",
      fields: [
        "email",
        "secondaryEmail",
        "phoneNumber",
        "emergencyPhoneNumber",
      ],
    },
    {
      title: "주소",
      fields: [
        "residenceCountry",
        "postalCode",
        "addressLine1",
        "addressLine2",
      ],
    },
  ],
  highSchool: [
    {
      title: "학교 정보",
      fields: [
        "academicProcess",
        "qualificationPassDate",
        "schoolName",
        "schoolRegion",
        "attendanceType",
      ],
    },
    {
      title: "재학 기간",
      fields: ["startDate", "endDate", "completionStatus"],
    },
  ],
  university: [
    {
      title: "학교 정보",
      fields: [
        "schoolType",
        "degreeLevel",
        "schoolName",
        "schoolRegion",
        "attendanceType",
      ],
    },
    {
      title: "재학 기간",
      fields: ["startDate", "endDate", "completionStatus", "transferStatus"],
    },
    {
      title: "전공과 성적",
      fields: [
        "majorName",
        "gpaScore",
        "gpaScale",
        "totalCredits",
        "doubleMajorStatus",
        "additionalMajorName",
        "minorStatus",
        "minorName",
      ],
    },
  ],
  graduateSchool: [
    {
      title: "학교 정보",
      fields: [
        "degreeLevel",
        "country",
        "schoolName",
        "schoolRegion",
        "attendanceType",
      ],
    },
    {
      title: "재학 기간",
      fields: ["startDate", "endDate", "admissionType", "completionStatus"],
    },
    {
      title: "전공과 성적",
      fields: [
        "majorClassification",
        "majorField",
        "majorName",
        "gpaScore",
        "gpaScale",
        "additionalMajorClassification",
        "additionalMajorField",
        "additionalMajorName",
      ],
    },
    {
      title: "연구와 논문",
      fields: ["labName", "labProfessorName", "thesisTitle", "thesisSummary"],
    },
  ],
  languageTest: [
    {
      title: "시험과 성적",
      fields: ["language", "testName", "grade", "acquisitionDate"],
    },
    {
      title: "등록과 증빙",
      fields: ["registrationNo", "evidenceDocumentPath"],
    },
  ],
  certificate: [
    {
      title: "자격 정보",
      fields: ["name", "grade", "issuer", "acquisitionDate"],
    },
    {
      title: "등록과 증빙",
      fields: ["registrationNo", "evidenceDocumentPath"],
    },
  ],
  career: [
    {
      title: "근무 정보",
      fields: ["companyName", "employmentType", "department", "position"],
    },
    {
      title: "근무 기간",
      fields: ["startDate", "endDate", "employmentStatus", "terminationReason"],
    },
    { title: "업무 내용", fields: ["responsibilities"] },
  ],
};

export function editorFieldGroups(section: ProfileSectionDefinition) {
  const definitions = FIELD_GROUPS[section.id];
  if (!definitions) return [{ title: "", fields: [...section.fields] }];
  const used = new Set<string>();
  const groups = definitions.map((group) => ({
    title: group.title,
    fields: group.fields.flatMap((id) => {
      const field = section.fields.find((candidate) => candidate.id === id);
      if (!field || used.has(id)) return [];
      used.add(id);
      return [field];
    }),
  }));
  const remaining = section.fields.filter((field) => !used.has(field.id));
  if (remaining.length) groups.push({ title: "기타 정보", fields: remaining });
  return groups.filter((group) => group.fields.length);
}

export function categoryMatches(
  category: ProfileCategoryDefinition,
  query: string,
) {
  const searchable = [
    category.label,
    ...category.sections.flatMap((section) => [
      section.label,
      ...section.fields.map((field) => field.label),
    ]),
    ...(category.topLevelFields ?? []).map((field) => field.label),
  ].join(" ");
  return searchable
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
}

export function categoryFilledCount(
  category: ProfileCategoryDefinition,
  profile: Profile,
) {
  const value = profile[category.id];
  if (Array.isArray(value)) {
    return value.filter((entry) =>
      Object.values(entry.values).some((text) => text.trim()),
    ).length;
  }
  return category.sections[0].fields.filter((field) => value[field.id]?.trim())
    .length;
}

export function categoryStatus(
  category: ProfileCategoryDefinition,
  profile: Profile,
) {
  const count = categoryFilledCount(category, profile);
  return count
    ? `${count}${category.repeatable ? "건 등록" : "개 입력"}`
    : "미입력";
}

export function entrySummary(entry: ProfileEntry) {
  const identity = [
    "schoolName",
    "testName",
    "name",
    "companyName",
    "projectName",
    "title",
    "language",
    "healthItemName",
  ]
    .map((key) => entry.values[key]?.trim())
    .find(Boolean);
  return identity || "새 항목의 정보를 입력해 주세요";
}

export const FIELD_EXAMPLES: Record<string, string> = {
  koreanFamilyName: "예: 홍",
  koreanGivenName: "예: 길동",
  englishFamilyName: "예: Hong",
  englishGivenName: "예: Gildong",
  hanjaFamilyName: "예: 洪",
  hanjaGivenName: "예: 吉童",
  email: "예: hello@example.com",
  secondaryEmail: "추가 이메일이 있다면 입력",
  nationality: "예: 대한민국",
  residenceCountry: "예: 대한민국",
  postalCode: "예: 12345",
  addressLine1: "도로명 또는 지번 주소",
  addressLine2: "동·호수 등 상세주소",
  schoolName: "정식 학교명을 입력해 주세요",
  language: "예: 영어, 일본어",
  testName: "예: TOEIC, OPIc",
  grade: "예: AL, 900",
  evidenceDocumentPath: "증빙 서류를 보관한 위치나 메모",
};

export const FULL_WIDTH_FIELDS = new Set([
  "schoolName",
  "addressLine1",
  "addressLine2",
  "thesisTitle",
  "title",
  "evidenceDocumentPath",
  "projectName",
  "majorName",
  "additionalMajorName",
  "minorName",
]);
