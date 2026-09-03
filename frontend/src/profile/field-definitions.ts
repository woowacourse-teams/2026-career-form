import type { ProfileCategoryId } from "./model";

export type ProfileInputType =
  "date" | "email" | "tel" | "text" | "textarea" | "select";

export interface ProfileFieldDefinition {
  id: string;
  label: string;
  inputType: ProfileInputType;
  options?: readonly string[];
  visibleWhen?: (values: Record<string, string>) => boolean;
}

export interface ProfileSectionDefinition {
  id: string;
  label: string;
  fields: readonly ProfileFieldDefinition[];
}

export interface ProfileCategoryDefinition {
  id: ProfileCategoryId;
  label: string;
  repeatable: boolean;
  sensitive: boolean;
  sections: readonly ProfileSectionDefinition[];
  topLevelFields?: readonly ProfileFieldDefinition[];
}

const text = (id: string, label: string): ProfileFieldDefinition => ({
  id,
  label,
  inputType: "text",
});
const date = (id: string, label: string): ProfileFieldDefinition => ({
  id,
  label,
  inputType: "date",
});
const select = (
  id: string,
  label: string,
  options: readonly string[],
): ProfileFieldDefinition => ({
  id,
  label,
  inputType: "select",
  options,
});

export const PROFILE_CATEGORIES: readonly ProfileCategoryDefinition[] = [
  {
    id: "personal",
    label: "기본 인적사항",
    repeatable: false,
    sensitive: false,
    sections: [
      {
        id: "personal",
        label: "기본 인적사항",
        fields: [
          text("koreanFamilyName", "국문 성"),
          text("koreanGivenName", "국문 이름"),
          text("hanjaFamilyName", "한자 성"),
          text("hanjaGivenName", "한자 이름"),
          text("englishFamilyName", "영문 성"),
          text("englishGivenName", "영문 이름"),
          text("gender", "성별"),
          date("birthDate", "생년월일"),
          text("nationality", "국적"),
        ],
      },
    ],
  },
  {
    id: "contact",
    label: "연락처와 주소",
    repeatable: false,
    sensitive: false,
    sections: [
      {
        id: "contact",
        label: "연락처와 주소",
        fields: [
          { id: "email", label: "이메일주소", inputType: "email" },
          { id: "phoneNumber", label: "연락처", inputType: "tel" },
          text("postalCode", "우편번호"),
          text("addressLine1", "기본주소"),
          text("addressLine2", "상세주소"),
        ],
      },
    ],
  },
  {
    id: "education",
    label: "학력",
    repeatable: true,
    sensitive: false,
    sections: [
      {
        id: "highSchool",
        label: "고등학교",
        fields: [
          text("schoolName", "학교명"),
          date("startDate", "입학일"),
          date("endDate", "졸업일"),
        ],
      },
      {
        id: "university",
        label: "대학교",
        fields: [
          {
            id: "schoolType",
            label: "학교 유형",
            inputType: "select",
            options: ["전문대학", "대학교"],
          },
          text("degreeLevel", "학위구분"),
          text("schoolName", "학교명"),
          date("startDate", "입학일"),
          date("endDate", "졸업일"),
          text("completionStatus", "졸업구분"),
          text("gpaScore", "평점"),
          select("gpaScale", "기준평점", ["4.00", "4.30", "4.50", "100.00"]),
          text("majorName", "주전공명"),
          select("transferStatus", "편입유무", ["비해당", "해당"]),
          select("doubleMajorStatus", "복수전공유무", ["없음", "있음"]),
          select("minorStatus", "부전공유무", ["없음", "있음"]),
          {
            ...text("additionalMajorName", "복수전공명"),
            visibleWhen: (values) => values.doubleMajorStatus === "있음",
          },
          {
            ...text("minorName", "부전공명"),
            visibleWhen: (values) => values.minorStatus === "있음",
          },
        ],
      },
      {
        id: "graduateSchool",
        label: "대학원",
        fields: [
          text("degreeLevel", "학위구분"),
          text("country", "국가"),
          text("schoolName", "학교명"),
          date("startDate", "입학일"),
          date("endDate", "졸업일"),
          text("admissionType", "입학구분"),
          text("completionStatus", "졸업구분"),
          text("gpaScore", "평점"),
          text("gpaScale", "만점기준"),
          text("majorClassification", "주전공 구분"),
          text("majorField", "주전공 계열"),
          text("majorName", "주전공명"),
          text("additionalMajorClassification", "추가 전공 구분"),
          text("additionalMajorField", "추가 전공 계열"),
          text("additionalMajorName", "추가 전공명"),
        ],
      },
    ],
    topLevelFields: [
      select("latestEducationType", "최종학력", [
        "고등학교",
        "전문대학(전문학사)",
        "대학(학사)",
        "대학원(석사)",
        "대학원(박사)",
        "대학원(석박사통합)",
      ]),
    ],
  },
  {
    id: "languages",
    label: "어학",
    repeatable: true,
    sensitive: false,
    sections: [
      {
        id: "languageTest",
        label: "공인외국어시험",
        fields: [
          text("language", "외국어"),
          text("testName", "시험명"),
          text("registrationNo", "등록번호"),
          date("acquisitionDate", "취득일"),
          text("grade", "등급·점수"),
          text("evidenceDocumentPath", "증빙 서류 위치"),
        ],
      },
      {
        id: "languageSkill",
        label: "외국어활용능력",
        fields: [
          text("language", "외국어"),
          text("conversationalLevel", "회화수준"),
        ],
      },
    ],
  },
  {
    id: "certifications",
    label: "자격증·면허증",
    repeatable: true,
    sensitive: false,
    sections: [
      {
        id: "certificate",
        label: "자격증·면허증",
        fields: [
          text("name", "자격증명"),
          text("grade", "등급"),
          text("registrationNo", "등록번호"),
          text("issuer", "발급기관"),
          date("acquisitionDate", "취득일"),
          text("evidenceDocumentPath", "증빙 서류 위치"),
        ],
      },
    ],
  },
  {
    id: "projects",
    label: "프로젝트",
    repeatable: true,
    sensitive: false,
    sections: [
      {
        id: "project",
        label: "프로젝트",
        fields: [
          date("startDate", "활동 시작일"),
          date("endDate", "활동 종료일"),
          text("projectName", "프로젝트 이름"),
          text("role", "담당 역할"),
          {
            id: "activityDetails",
            label: "활동 상세내역",
            inputType: "textarea",
          },
        ],
      },
    ],
  },
  {
    id: "military",
    label: "병역",
    repeatable: false,
    sensitive: false,
    sections: [
      {
        id: "military",
        label: "병역",
        fields: [
          text("militaryStatus", "병역 상태"),
          select("militaryType", "병역구분", [
            "현역병",
            "상근예비역",
            "공익근무요원",
            "전문연구요원",
            "산업기능요원",
          ]),
          text("militaryBranch", "군별"),
          text("militarySpecialty", "병과"),
          text("militaryRank", "계급"),
          date("serviceStartDate", "복무 시작일"),
          date("serviceEndDate", "복무 종료일"),
          text("dischargeType", "전역구분"),
          text("exemptionReason", "면제·비대상 사유"),
        ],
      },
    ],
  },
  {
    id: "veteran",
    label: "보훈",
    repeatable: false,
    sensitive: false,
    sections: [
      {
        id: "veteran",
        label: "보훈",
        fields: [
          text("veteranStatus", "보훈 대상 여부"),
          text("veteranType", "보훈구분"),
          text("veteranRelation", "보훈 대상자와의 관계"),
          text("veteranNumber", "보훈번호"),
        ],
      },
    ],
  },
  {
    id: "disability",
    label: "장애",
    repeatable: false,
    sensitive: false,
    sections: [
      {
        id: "disability",
        label: "장애",
        fields: [
          text("disabilityStatus", "장애 여부"),
          text("disabilityType", "장애 유형"),
          text("disabilityGrade", "장애 정도·등급"),
          date("disabilityRegistrationDate", "장애 등록일"),
        ],
      },
    ],
  },
  {
    id: "health",
    label: "건강",
    repeatable: true,
    sensitive: false,
    sections: [
      {
        id: "health",
        label: "건강정보",
        fields: [
          text("healthItemName", "건강정보 항목"),
          text("healthStatusOrValue", "상태·값"),
          date("healthDate", "진단·확인일"),
          { id: "healthDetails", label: "상세내용", inputType: "textarea" },
        ],
      },
    ],
  },
] as const;

export function getCategoryDefinition(id: ProfileCategoryId) {
  const category = PROFILE_CATEGORIES.find((candidate) => candidate.id === id);
  if (!category) {
    throw new Error(`알 수 없는 프로필 범주: ${id}`);
  }
  return category;
}
