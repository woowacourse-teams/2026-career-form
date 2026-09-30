import { PROFILE_CATEGORIES } from "../../src/profile/field-definitions";
import { createDemoProfile } from "../demo/fixtures";
const profile = createDemoProfile();
const education = profile.education[0]!.values;
const certificate = profile.certifications[0]!.values;
export const FIELD_INTERVAL_MS = 667;
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
  ["email", "이메일", profile.contact.email, "contact", "text"],
  ["phone", "휴대전화", profile.contact.phoneNumber, "contact", "text"],
  [
    "residence-country",
    "거주 국가",
    profile.contact.residenceCountry,
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
  ["certificate", "자격증", certificate.name, "certifications", "text"],
  ["issuer", "발급기관", certificate.issuer, "certifications", "text"],
  ["acquired", "취득일", certificate.acquisitionDate, "certifications", "date"],
].map(([id, label, value, categoryId, type]) => ({
  id: id!,
  label: label!,
  value: value!,
  type: type!,
  category: PROFILE_CATEGORIES.find(
    (category) => category.id === categoryId,
  )!.label.replaceAll("·", "/"),
}));
export const SCENARIO_DURATION_MS = scenarioFields.length * FIELD_INTERVAL_MS;
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
      setTimeout(
        () => {
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
          const scroller =
            root.querySelector<HTMLElement>("[data-form-scroll]");
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
        },
        (index + 1) * FIELD_INTERVAL_MS,
      ),
    );
  });
  return stop;
}
