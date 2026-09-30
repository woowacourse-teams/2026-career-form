import { PROFILE_CATEGORIES } from "../../src/profile/field-definitions";
import { createExperimentProfile } from "./profile";
const profile = createExperimentProfile();
const education = profile.education[0]!.values;
const certificate = profile.certifications[0]!.values;
const language = profile.languages[0]!.values;
const career = profile.careers[0]!.values;
// A composed, uneven rhythm is replayed identically in every variant.
const fieldGapsMs = [
  280, 65, 100, 45, 420, 80, 55, 140, 510, 60, 90, 35, 380, 70, 125, 55, 460,
  65, 95, 40, 530, 80, 50, 110, 350, 60, 100, 45, 480, 75, 55, 130, 400, 65, 85,
  40, 560, 75, 105, 50,
];
export const scenarioFields = [
  ["family-name", "성", profile.personal.koreanFamilyName, "personal", "text"],
  ["given-name", "이름", profile.personal.koreanGivenName, "personal", "text"],
  [
    "english-family-name",
    "영문 성",
    profile.personal.englishFamilyName,
    "personal",
    "text",
  ],
  [
    "english-given-name",
    "영문 이름",
    profile.personal.englishGivenName,
    "personal",
    "text",
  ],
  ["nationality", "국적", profile.personal.nationality, "personal", "text"],
  [
    "hanja-family-name",
    "한자 성",
    profile.personal.hanjaFamilyName,
    "personal",
    "text",
  ],
  [
    "hanja-given-name",
    "한자 이름",
    profile.personal.hanjaGivenName,
    "personal",
    "text",
  ],
  ["birth-date", "생년월일", profile.personal.birthDate, "personal", "date"],
  ["email", "이메일", profile.contact.email, "contact", "text"],
  ["phone", "휴대전화", profile.contact.phoneNumber, "contact", "text"],
  [
    "residence-country",
    "거주 국가",
    profile.contact.residenceCountry,
    "contact",
    "text",
  ],
  [
    "secondary-email",
    "추가 이메일",
    profile.contact.secondaryEmail,
    "contact",
    "text",
  ],
  [
    "emergency-phone",
    "비상 연락처",
    profile.contact.emergencyPhoneNumber,
    "contact",
    "text",
  ],
  ["postal-code", "우편번호", profile.contact.postalCode, "contact", "text"],
  ["address-line-1", "주소", profile.contact.addressLine1, "contact", "text"],
  [
    "address-line-2",
    "상세주소",
    profile.contact.addressLine2,
    "contact",
    "text",
  ],
  ["degree", "학위", education.degreeLevel, "education", "text"],
  ["school", "학교명", education.schoolName, "education", "text"],
  ["major", "전공", education.majorName, "education", "text"],
  [
    "completion-status",
    "졸업 구분",
    education.completionStatus,
    "education",
    "text",
  ],
  ["enrolled", "입학일", education.startDate, "education", "date"],
  ["graduated", "졸업일", education.endDate, "education", "date"],
  ["gpa", "학점", education.gpaScore, "education", "text"],
  ["gpa-scale", "학점 기준", education.gpaScale, "education", "text"],
  ["school-region", "학교 소재지", education.schoolRegion, "education", "text"],
  ["total-credits", "총 이수학점", education.totalCredits, "education", "text"],
  [
    "attendance-type",
    "주야간 구분",
    education.attendanceType,
    "education",
    "text",
  ],
  ["language", "시험 언어", language.language, "languages", "text"],
  ["language-test", "시험명", language.testName, "languages", "text"],
  ["language-grade", "점수 / 등급", language.grade, "languages", "text"],
  [
    "language-registration",
    "시험 등록번호",
    language.registrationNo,
    "languages",
    "text",
  ],
  [
    "language-acquired",
    "시험 취득일",
    language.acquisitionDate,
    "languages",
    "date",
  ],
  ["career-company", "회사명", career.companyName, "careers", "text"],
  ["career-department", "부서", career.department, "careers", "text"],
  ["career-position", "직위", career.position, "careers", "text"],
  ["career-start", "입사일", career.startDate, "careers", "date"],
  ["career-end", "퇴사일", career.endDate, "careers", "date"],
  ["certificate", "자격증", certificate.name, "certifications", "text"],
  ["issuer", "발급기관", certificate.issuer, "certifications", "text"],
  ["acquired", "취득일", certificate.acquisitionDate, "certifications", "date"],
].map(([id, label, value, categoryId, type]) => ({
  id: id!,
  label: label!,
  value: value!,
  type: type!,
  categoryId: categoryId!,
  category: PROFILE_CATEGORIES.find(
    (category) => category.id === categoryId,
  )!.label.replaceAll("·", "/"),
}));
if (fieldGapsMs.length !== scenarioFields.length)
  throw Error("Each field needs a scheduled input time");
const writeTimesMs = fieldGapsMs.map((_, index) =>
  fieldGapsMs.slice(0, index + 1).reduce((sum, gap) => sum + gap, 0),
);
export const SCENARIO_DURATION_MS = writeTimesMs[writeTimesMs.length - 1]!;
export function startScenario({
  root,
  onProgress,
  onComplete,
  onError,
}: {
  root: HTMLElement;
  onProgress: (completed: number) => void;
  onComplete: (durationMs: number) => void;
  onError: () => void;
}): () => void {
  const inputs = scenarioFields.map((field) =>
    root.querySelector<HTMLInputElement>(`#${field.id}`),
  );
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;
  const stop = () => {
    stopped = true;
    timers.forEach(clearTimeout);
  };
  const fail = () => {
    stop();
    onError();
  };
  if (inputs.some((input) => !input)) {
    fail();
    return stop;
  }
  inputs.forEach((input) => {
    input!.value = "";
    delete input!.dataset.experimentFilled;
  });
  const started = performance.now();
  onProgress(0);
  scenarioFields.forEach((field, index) => {
    timers.push(
      setTimeout(() => {
        if (stopped) return;
        const input = inputs[index]!;
        if (!root.contains(input)) {
          fail();
          return;
        }
        input.value = field.value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (input.value !== field.value) {
          fail();
          return;
        }
        input.dataset.experimentFilled = "true";
        // Scroll only the form, keeping the panel and controls in place.
        const scroller = root.querySelector<HTMLElement>("[data-form-scroll]");
        if (scroller) {
          const bounds = input.getBoundingClientRect();
          const frame = scroller.getBoundingClientRect();
          if (bounds.bottom > frame.bottom || bounds.top < frame.top)
            scroller.scrollTop += bounds.top - frame.top - frame.height / 2;
        }
        onProgress(index + 1);
        if (index === scenarioFields.length - 1) {
          if (
            inputs.some(
              (element, i) =>
                !element ||
                !root.contains(element) ||
                element.value !== scenarioFields[i]!.value,
            )
          ) {
            fail();
            return;
          }
          stopped = true;
          onComplete(performance.now() - started);
        }
      }, writeTimesMs[index]!),
    );
  });
  return stop;
}
