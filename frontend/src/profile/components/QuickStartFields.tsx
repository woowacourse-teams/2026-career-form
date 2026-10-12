import type { InputHTMLAttributes } from "react";
import { PROFILE_CATEGORIES } from "../field-definitions";
import type { Profile, ProfileEntry, ProfileIdentity } from "../model";
import { CatalogNameInput } from "./CatalogNameInput";
import styles from "./QuickStart.module.css";

export type Chapter = "education" | "careers" | "projects";
export type Step =
  | "name"
  | "email"
  | "phone"
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
  name: "어떤 이름으로 불러드릴까요?",
  email: "연락받을 이메일을 알려주세요",
  phone: "전화번호도 함께 준비해 볼까요?",
  basics: "기본 정보가 준비됐어요",
  educationType: "어떤 학력을 추가할까요?",
  school: "다닌 학교를 알려주세요",
  major: "어떤 전공을 공부했나요?",
  completion: "현재 재학 상태는 어떤가요?",
  educationDates: "학교에 다닌 기간을 알려주세요",
  educationSummary: "학력도 준비됐어요",
  experienceType: "어떤 경험을 추가할까요?",
  experienceName: "경험의 이름을 알려주세요",
  experienceRole: "어떤 일을 맡았나요?",
  experienceDates: "함께한 기간을 알려주세요",
  experienceDetails: "어떤 일을 했는지 적어주세요",
  experienceSummary: "경험까지 차곡차곡 준비됐어요",
};
export function phoneHint(value: string) {
  const digits = value.replace(/[ -]/g, "");
  return /^01\d{9}$/.test(digits)
    ? digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")
    : "국가번호가 있는 번호도 그대로 입력할 수 있어요.";
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
function Choices({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.choiceGroup} role="group" aria-label={label}>
      <p>{label}</p>
      <div className={styles.choices}>
        {values.map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={value === option}
            onClick={() => onChange(value === option ? "" : option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
function options(category: string, section: string, field: string) {
  return (
    PROFILE_CATEGORIES.find((item) => item.id === category)
      ?.sections.find((item) => item.id === section)
      ?.fields.find((item) => item.id === field)?.options ?? []
  ).map((item) => (typeof item === "string" ? item : item.value));
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
  const values = entry.values;
  const field = (id: string, label: string, type = "text") => (
    <Input
      key={id}
      label={label}
      type={type}
      value={values[id] ?? ""}
      onChange={(event) => updateEntry(id, event.target.value)}
    />
  );
  const choice = (id: string, label: string, choices: readonly string[]) => (
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
            placeholder="김"
            value={profile.personal.koreanFamilyName ?? ""}
            onChange={(e) =>
              updateSingle("personal", "koreanFamilyName", e.target.value)
            }
          />
          <Input
            label="국문 이름"
            autoComplete="given-name"
            placeholder="이름"
            value={profile.personal.koreanGivenName ?? ""}
            onChange={(e) =>
              updateSingle("personal", "koreanGivenName", e.target.value)
            }
          />
        </div>
      );
    case "email":
      return (
        <Input
          label="이메일"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={profile.contact.email ?? ""}
          onChange={(e) => updateSingle("contact", "email", e.target.value)}
        />
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
          <p className={styles.note}>
            {phoneHint(profile.contact.phoneNumber ?? "")}
          </p>
        </>
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
    case "educationDates":
      return (
        <div className={styles.nameFields}>
          {field("startDate", "입학일", "date")}
          {field("endDate", "졸업일", "date")}
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
        <div className={styles.nameFields}>
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
            placeholder="지금 생각나는 만큼만 적어도 괜찮아요."
            onChange={(e) => updateEntry(id, e.target.value)}
          />
        </label>
      );
    }
    default:
      return null;
  }
}
export function Summary({ values }: { values: [string, string][] }) {
  const filled = values.filter(([, value]) => value.trim());
  return filled.length ? (
    <dl className={styles.summary}>
      {filled.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className={styles.empty}>
      아직 입력한 정보가 없어요. 필요할 때 돌아와 채워도 괜찮아요.
    </p>
  );
}
export function entrySummary(entry: ProfileEntry): [string, string][] {
  const fields =
    PROFILE_CATEGORIES.flatMap((category) => category.sections).find(
      (section) => section.id === entry.sectionId,
    )?.fields ?? [];
  return Object.entries(entry.values).map(([id, value]) => [
    fields.find((field) => field.id === id)?.label ?? id,
    value,
  ]);
}
