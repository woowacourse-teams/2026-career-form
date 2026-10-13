import { useRef, type InputHTMLAttributes } from "react";
import { PROFILE_CATEGORIES } from "../field-definitions";
import type { Profile, ProfileEntry, ProfileIdentity } from "../model";
import { QuickStartDateInput } from "./QuickStartDateInput";
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
export const descriptions: Record<Step, string> = {
  name: "지원서에 사용할 이름이에요. Enter를 누르면 다음 칸으로 이동해요.",
  email:
    "아이디를 입력한 뒤 이메일 주소를 골라 완성할 수 있어요. 직접 입력해도 좋아요.",
  phone: "평소 연락받는 번호를 입력해 주세요. 하이픈 없이 입력해도 괜찮아요.",
  basics:
    "여기까지 입력한 내용을 확인해 보세요. 학력과 경험은 나중에 채워도 좋아요.",
  educationType:
    "먼저 학력 하나만 골라볼까요? 필요한 항목은 나중에 더 추가할 수 있어요.",
  school:
    "학교 이름을 검색하거나 직접 입력해 주세요. 검색 결과는 방향키와 Enter로 고를 수 있어요.",
  major: "지원서에 사용할 전공 이름을 적어 주세요.",
  completion: "지금 상태를 골라 주세요. 선택한 항목을 다시 누르면 해제돼요.",
  educationDates:
    "기억나는 날짜만 입력해도 괜찮아요. 건너뛰면 미완성 날짜는 저장하지 않아요.",
  educationSummary:
    "입력한 학력을 확인해 보세요. 지금 자동 기입을 시작해도 좋아요.",
  experienceType:
    "소개하고 싶은 경험 하나부터 시작해요. 직장경력이 없어도 괜찮아요.",
  experienceName: "지원서에 적을 회사 또는 프로젝트 이름을 입력해 주세요.",
  experienceRole:
    "맡았던 역할이나 근무 형태를 알려주세요. 필요한 항목만 선택해도 좋아요.",
  experienceDates:
    "재직 중이라면 퇴사일은 필요 없어요. 건너뛰면 미완성 날짜는 저장하지 않아요.",
  experienceDetails:
    "맡은 일과 결과를 한두 문장으로 적어 보세요. 자세한 내용은 나중에 다듬어도 좋아요.",
  experienceSummary:
    "입력한 경험을 확인해 보세요. 준비한 정보로 자동 기입을 시작할 수 있어요.",
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
        <div className={styles.dateFields}>
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
