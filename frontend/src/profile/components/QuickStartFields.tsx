import { useRef, type InputHTMLAttributes } from "react";
import { PROFILE_CATEGORIES } from "../field-definitions";
import type { Profile, ProfileEntry, ProfileIdentity } from "../model";
import { QuickStartDateInput } from "./QuickStartDateInput";
import { CatalogNameInput } from "./CatalogNameInput";
import styles from "./QuickStart.module.css";

export type Chapter = "education" | "careers" | "projects";
export type Step =
  | "overview"
  | "educationDetails"
  | "name"
  | "email"
  | "phone"
  | "gender"
  | "birthDate"
  | "englishName"
  | "nationality"
  | "basics"
  | "educationType"
  | "school"
  | "major"
  | "completion"
  | "educationDates"
  | "educationSummary"
  | "experienceType"
  | "experienceName"
  | "experienceRole"
  | "experienceDates"
  | "experienceDetails"
  | "experienceSummary";
export const titles: Record<Step, string> = {
  overview: "저장한 정보",
  educationDetails: "학력 상세",
  name: "이름",
  email: "이메일",
  phone: "전화번호",
  gender: "성별",
  birthDate: "생년월일",
  englishName: "영문 이름",
  nationality: "국적",
  basics: "기본 정보",
  educationType: "학력 종류",
  school: "학교",
  major: "전공",
  completion: "재학 상태",
  educationDates: "재학 기간",
  educationSummary: "학력",
  experienceType: "경력·활동 종류",
  experienceName: "경력·활동 이름",
  experienceRole: "역할",
  experienceDates: "기간",
  experienceDetails: "활동 내용",
  experienceSummary: "경력·활동",
};

function emailSuggestions(value: string) {
  if (!/^[^\s@]+(?:@[^\s@]*)?$/.test(value)) return [];
  const [name, prefix = ""] = value.split("@");
  return ["naver.com", "gmail.com", "daum.net"]
    .filter((domain) => domain.startsWith(prefix.toLowerCase()))
    .map((domain) => `${name}@${domain}`)
    .filter((suggestion) => suggestion !== value);
}

export function phoneHint(value: string) {
  const digits = value.replace(/[ -]/g, "");
  return /^01\d{9}$/.test(digits)
    ? digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")
    : "";
}
function Input({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={styles.field}>
      {label}
      <input {...props} />
    </label>
  );
}
type ChoiceOption = string | { value: string; label: string };
function Choices({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.choiceGroup} role="group" aria-label={label}>
      <p>{label}</p>
      <div className={styles.choices}>
        {values.map((option) => {
          const selectedValue =
            typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return (
            <button
              type="button"
              key={selectedValue}
              aria-pressed={value === selectedValue}
              onClick={() =>
                onChange(value === selectedValue ? "" : selectedValue)
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function options(category: string, section: string, field: string) {
  return (
    PROFILE_CATEGORIES.find((item) => item.id === category)
      ?.sections.find((item) => item.id === section)
      ?.fields.find((item) => item.id === field)?.options ?? []
  );
}
export function QuickStartFields({
  step,
  profile,
  entry,
  chapter,
  updateSingle,
  updateEntry,
}: {
  step: Step;
  profile: Profile;
  entry: ProfileEntry;
  chapter: Chapter;
  updateSingle: (
    category: "personal" | "contact",
    field: string,
    value: string,
  ) => void;
  updateEntry: (
    field: string,
    value: string,
    identity?: ProfileIdentity,
  ) => void;
}) {
  const emailInput = useRef<HTMLInputElement>(null);
  const suggestions = emailSuggestions(profile.contact.email ?? "");
  const values = entry.values;
  const field = (id: string, label: string, type = "text") =>
    type === "date" ? (
      <QuickStartDateInput
        key={id}
        label={label}
        value={values[id] ?? ""}
        onChange={(value) => updateEntry(id, value)}
      />
    ) : (
      <Input
        key={id}
        label={label}
        type={type}
        value={values[id] ?? ""}
        onChange={(event) => updateEntry(id, event.target.value)}
      />
    );
  const choice = (
    id: string,
    label: string,
    choices: readonly ChoiceOption[],
  ) => (
    <Choices
      label={label}
      values={choices}
      value={values[id] ?? ""}
      onChange={(value) => updateEntry(id, value)}
    />
  );
  switch (step) {
    case "name":
      return (
        <div className={styles.nameFields}>
          <Input
            label="국문 성"
            autoComplete="family-name"
            placeholder="예: 홍"
            value={profile.personal.koreanFamilyName ?? ""}
            onChange={(e) =>
              updateSingle("personal", "koreanFamilyName", e.target.value)
            }
          />
          <Input
            label="국문 이름"
            autoComplete="given-name"
            placeholder="예: 길동"
            value={profile.personal.koreanGivenName ?? ""}
            onChange={(e) =>
              updateSingle("personal", "koreanGivenName", e.target.value)
            }
          />
        </div>
      );
    case "email":
      return (
        <>
          <label className={styles.field}>
            이메일
            <input
              ref={emailInput}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={profile.contact.email ?? ""}
              onChange={(e) => updateSingle("contact", "email", e.target.value)}
            />
          </label>
          {suggestions.length > 0 && (
            <div
              className={styles.emailSuggestions}
              role="group"
              aria-label="이메일 빠른 완성"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    updateSingle("contact", "email", suggestion);
                    emailInput.current?.focus();
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </>
      );
    case "phone":
      return (
        <>
          <Input
            label="전화번호"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01012345678"
            value={profile.contact.phoneNumber ?? ""}
            onChange={(e) =>
              updateSingle("contact", "phoneNumber", e.target.value)
            }
          />
          {phoneHint(profile.contact.phoneNumber ?? "") && (
            <p className={styles.note}>
              {phoneHint(profile.contact.phoneNumber ?? "")}
            </p>
          )}
        </>
      );
    case "gender":
      return (
        <>
          <Choices
            label="성별"
            values={["남성", "여성", "논바이너리"]}
            value={profile.personal.gender ?? ""}
            onChange={(value) => updateSingle("personal", "gender", value)}
          />
        </>
      );
    case "birthDate":
      return (
        <QuickStartDateInput
          label="생년월일"
          value={profile.personal.birthDate ?? ""}
          onChange={(value) => updateSingle("personal", "birthDate", value)}
        />
      );
    case "englishName":
      return (
        <div className={styles.nameFields}>
          <Input
            label="영문 성"
            placeholder="Hong"
            value={profile.personal.englishFamilyName ?? ""}
            onChange={(event) =>
              updateSingle("personal", "englishFamilyName", event.target.value)
            }
          />
          <Input
            label="영문 이름"
            placeholder="Gildong"
            value={profile.personal.englishGivenName ?? ""}
            onChange={(event) =>
              updateSingle("personal", "englishGivenName", event.target.value)
            }
          />
        </div>
      );
    case "nationality":
      return (
        <Input
          label="국적"
          placeholder="예: 대한민국"
          value={profile.personal.nationality ?? ""}
          onChange={(event) =>
            updateSingle("personal", "nationality", event.target.value)
          }
        />
      );
    case "school":
      return (
        <div className={styles.field}>
          <label htmlFor="quick-school">학교명</label>
          <CatalogNameInput
            id="quick-school"
            label="학교명"
            kind={
              entry.sectionId as "highSchool" | "university" | "graduateSchool"
            }
            value={values.schoolName ?? ""}
            identity={entry.identity}
            onChange={(value, identity) =>
              updateEntry("schoolName", value, identity)
            }
          />
        </div>
      );
    case "major":
      return field("majorName", "전공");
    case "completion":
      return choice(
        "completionStatus",
        "재학 상태",
        options("education", "university", "completionStatus"),
      );
    case "educationDetails":
      return (
        <>
          {entry.sectionId === "university" && (
            <>
              {choice(
                "schoolType",
                "학교 유형",
                options("education", "university", "schoolType"),
              )}
              {choice(
                "degreeLevel",
                "학위구분",
                options("education", "university", "degreeLevel"),
              )}
            </>
          )}
          {entry.sectionId === "graduateSchool" &&
            field("degreeLevel", "학위구분")}
          {choice(
            "attendanceType",
            "주·야간",
            options("education", entry.sectionId, "attendanceType"),
          )}
        </>
      );
    case "educationDates":
      return (
        <div className={styles.dateFields}>
          {field("startDate", "입학일", "date")}
          {!["재학중", "휴학"].includes(values.completionStatus ?? "") &&
            field(
              "endDate",
              values.completionStatus === "졸업예정"
                ? "졸업 예정일"
                : values.completionStatus === "중퇴"
                  ? "학업 종료일"
                  : "졸업일",
              "date",
            )}
        </div>
      );
    case "experienceName":
      return chapter === "careers"
        ? field("companyName", "직장명")
        : field("projectName", "프로젝트 이름");
    case "experienceRole":
      return chapter === "careers" ? (
        <>
          {choice(
            "employmentType",
            "고용형태",
            options("careers", "career", "employmentType"),
          )}
          {choice(
            "employmentStatus",
            "재직 여부",
            options("careers", "career", "employmentStatus"),
          )}
        </>
      ) : (
        field("role", "담당 역할")
      );
    case "experienceDates":
      return (
        <div className={styles.dateFields}>
          {field(
            "startDate",
            chapter === "careers" ? "입사일" : "활동 시작일",
            "date",
          )}
          {!(chapter === "careers" && values.employmentStatus === "재직중") &&
            field(
              "endDate",
              chapter === "careers" ? "퇴사일" : "활동 종료일",
              "date",
            )}
        </div>
      );
    case "experienceDetails": {
      const id = chapter === "careers" ? "responsibilities" : "activityDetails";
      return (
        <label className={styles.field}>
          {chapter === "careers" ? "담당업무" : "활동 상세내역"}
          <textarea
            rows={5}
            value={values[id] ?? ""}
            onChange={(e) => updateEntry(id, e.target.value)}
          />
        </label>
      );
    }
    default:
      return null;
  }
}
export type SummaryValue = [string, string, Step?];
export function basicSummary(profile: Profile): SummaryValue[] {
  const englishName = [
    profile.personal.englishFamilyName?.trim(),
    profile.personal.englishGivenName?.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  return [
    [
      "이름",
      `${profile.personal.koreanFamilyName ?? ""}${profile.personal.koreanGivenName ?? ""}`,
      "name",
    ],
    ["이메일", profile.contact.email ?? "", "email"],
    ["전화번호", profile.contact.phoneNumber ?? "", "phone"],
    ["성별", profile.personal.gender ?? "", "gender"],
    ["생년월일", profile.personal.birthDate ?? "", "birthDate"],
    ["영문 이름", englishName, "englishName"],
    ["국적", profile.personal.nationality ?? "", "nationality"],
  ];
}
export function Summary({
  values,
  onEdit,
}: {
  values: SummaryValue[];
  onEdit?: (step: Step) => void;
}) {
  const filled = values.filter(([, value]) => value.trim());
  return filled.length ? (
    <dl className={styles.summary}>
      {filled.map(([label, value, step]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value}
            {step && onEdit && (
              <button
                className={styles.summaryEdit}
                type="button"
                aria-label={`${label} 수정`}
                onClick={() => onEdit(step)}
              >
                수정
              </button>
            )}
          </dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className={styles.empty}>입력한 정보 없음</p>
  );
}
export function entrySummary(entry: ProfileEntry): SummaryValue[] {
  const schooling = ["highSchool", "university", "graduateSchool"].includes(
    entry.sectionId,
  );
  const editSteps: Record<string, Step> = {
    schoolName: "school",
    majorName: "major",
    completionStatus: "completion",
    schoolType: "educationDetails",
    degreeLevel: "educationDetails",
    attendanceType: "educationDetails",
    startDate: schooling ? "educationDates" : "experienceDates",
    endDate: schooling ? "educationDates" : "experienceDates",
    companyName: "experienceName",
    projectName: "experienceName",
    employmentType: "experienceRole",
    employmentStatus: "experienceRole",
    role: "experienceRole",
    responsibilities: "experienceDetails",
    activityDetails: "experienceDetails",
  };
  const fields =
    PROFILE_CATEGORIES.flatMap((category) => category.sections).find(
      (section) => section.id === entry.sectionId,
    )?.fields ?? [];
  return Object.entries(entry.values).map(([id, value]) => {
    const field = fields.find((field) => field.id === id);
    const option = field?.options?.find(
      (option) => typeof option !== "string" && option.value === value,
    );
    return [
      field?.label ?? id,
      typeof option === "object" ? option.label : value,
      editSteps[id],
    ];
  });
}
