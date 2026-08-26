// @ts-expect-error jsdom is a test-only dependency without a checked-in type package.
import { JSDOM } from "jsdom";

import html from "./hypothesis-validation-interview.html?raw";

export { html };

export const EXPECTED_SECTIONS = [
  "01 기본 정보",
  "02 학력사항",
  "03 자격증·면허증",
  "04 어학",
  "05 보훈",
] as const;

export const EXPECTED_MANUAL_SOURCE_CARD_TITLES = [
  "기본 정보 카드",
  "학력·보훈 정보 카드",
  "자격증·면허증 정보 카드",
  "어학 정보 카드",
] as const;

export const EXPECTED_MANUAL_SOURCE_CARD_VALUES = [
  [
    ["국문 이름", "김가온"],
    ["이메일", "gaon.kim@example.com"],
    ["연락처", "010-0000-1001"],
    ["생년월일", "2000-05-21"],
  ],
  [
    ["대학교명", "한빛대학교(가상)"],
    ["보훈 대상 여부", "비해당"],
  ],
  [
    ["자격증명", "정보처리 역량 인증"],
    ["등록번호", "CF-A-2024-0614"],
    ["유효 기간", "2024-06-14 ~ 2029-06-13"],
    ["등급", "기사급"],
    ["발급기관", "한빛자격평가원(가상)"],
  ],
  [
    ["외국어", "영어"],
    ["시험명", "TOEIC"],
    ["등록번호", "LANG-A-2024-0518"],
    ["취득일", "2024-05-18"],
    ["등급·점수", "900"],
    ["증빙 서류 위치", "가상 문서함 > 어학 > TOEIC 성적표"],
  ],
] as const;

export const EXPECTED_ASSISTED_SOURCE_CARD_TITLES = [
  "저장된 기본·학력·민감 프로필",
  "확인이 필요한 저장된 어학 프로필",
  "프로필에 없는 자격증·면허증 정보 카드",
] as const;

export const EXPECTED_ASSISTED_SOURCE_CARD_VALUES = [
  [
    ["국문 이름", "이서준"],
    ["이메일", "seojun.lee@example.com"],
    ["연락처", "010-0000-2002"],
    ["생년월일", "1999-11-03"],
    ["대학교명", "새봄대학교(가상)"],
    ["보훈 대상 여부", "검토 패널에서 펼쳐 확인"],
  ],
  [
    ["외국어", "영어"],
    ["시험명", "OPIc"],
    ["등록번호", "LANG-B-2023-1015"],
    ["취득일", "2023-10-15"],
    ["등급·점수", "IH"],
    ["증빙 서류 위치", "가상 문서함 > 어학 > OPIc 성적표"],
  ],
  [
    ["자격증명", "데이터분석 역량 인증"],
    ["등록번호", "CF-B-2023-1120"],
    ["유효 기간", "2023-11-20 ~ 2028-11-19"],
    ["등급", "2급"],
    ["발급기관", "새봄자격검정원(가상)"],
  ],
] as const;

export const EXPECTED_FIELD_KEYS_BY_SECTION = {
  basic: ["name", "email", "phone", "birthDate"],
  education: ["university"],
  certification: [
    "certificateName",
    "certificateNumber",
    "certificateValidityPeriod",
    "certificateGrade",
    "certificateIssuer",
  ],
  language: [
    "language",
    "languageTestName",
    "languageRegistrationNumber",
    "languageAcquisitionDate",
    "languageScore",
    "languageEvidenceDocumentPath",
  ],
  veteran: ["veteranStatus"],
} as const;

export const EXPECTED_FIELD_KEYS = [
  "name",
  "email",
  "phone",
  "birthDate",
  "university",
  "certificateName",
  "certificateNumber",
  "certificateValidityPeriod",
  "certificateGrade",
  "certificateIssuer",
  "language",
  "languageTestName",
  "languageRegistrationNumber",
  "languageAcquisitionDate",
  "languageScore",
  "languageEvidenceDocumentPath",
  "veteranStatus",
] as const;

export const EXPECTED_DETAIL_FIELDS = {
  certificateName: { label: "자격증명", type: "text" },
  certificateNumber: { label: "등록번호", type: "text" },
  certificateValidityPeriod: { label: "유효 기간", type: "text" },
  certificateGrade: { label: "등급", type: "text" },
  certificateIssuer: { label: "발급기관", type: "text" },
  language: { label: "외국어", type: "text" },
  languageTestName: { label: "시험명", type: "text" },
  languageRegistrationNumber: { label: "등록번호", type: "text" },
  languageAcquisitionDate: { label: "취득일", type: "date" },
  languageScore: { label: "등급·점수", type: "text" },
  languageEvidenceDocumentPath: {
    label: "증빙 서류 위치",
    type: "text",
  },
} as const;

export const MANUAL_INPUT_VALUES = {
  "manual-name": "김가온",
  "manual-email": "gaon.kim@example.com",
  "manual-phone": "010-0000-1001",
  "manual-birth-date": "2000-05-21",
  "manual-university": "한빛대학교(가상)",
  "manual-certificate-name": "정보처리 역량 인증",
  "manual-certificate-number": "CF-A-2024-0614",
  "manual-certificate-validity-period": "2024-06-14 ~ 2029-06-13",
  "manual-certificate-grade": "기사급",
  "manual-certificate-issuer": "한빛자격평가원(가상)",
  "manual-language": "영어",
  "manual-language-test-name": "TOEIC",
  "manual-language-registration-number": "LANG-A-2024-0518",
  "manual-language-acquisition-date": "2024-05-18",
  "manual-language-score": "900",
  "manual-language-evidence-document-path": "가상 문서함 > 어학 > TOEIC 성적표",
  "manual-veteran-status": "비해당",
} as const;

export const ASSISTED_DIRECT_INPUT_VALUES = {
  "assisted-university": "새봄대학교(가상)",
  "assisted-certificate-name": "데이터분석 역량 인증",
  "assisted-certificate-number": "CF-B-2023-1120",
  "assisted-certificate-validity-period": "2023-11-20 ~ 2028-11-19",
  "assisted-certificate-grade": "2급",
  "assisted-certificate-issuer": "새봄자격검정원(가상)",
  "assisted-language": "영어",
  "assisted-language-test-name": "OPIc",
  "assisted-language-registration-number": "LANG-B-2023-1015",
  "assisted-language-acquisition-date": "2023-10-15",
  "assisted-language-score": "IH",
  "assisted-language-evidence-document-path":
    "가상 문서함 > 어학 > OPIc 성적표",
  "assisted-veteran-status": "비해당",
} as const;

export const EMPTY_FORM_VALUES = {
  name: "",
  email: "",
  phone: "",
  birthDate: "",
  university: "",
  certificateName: "",
  certificateNumber: "",
  certificateValidityPeriod: "",
  certificateGrade: "",
  certificateIssuer: "",
  language: "",
  languageTestName: "",
  languageRegistrationNumber: "",
  languageAcquisitionDate: "",
  languageScore: "",
  languageEvidenceDocumentPath: "",
  veteranStatus: "",
} as const;

export const DEFAULT_APPROVED_ASSISTED_VALUES = {
  name: "이서준",
  email: "seojun.lee@example.com",
  phone: "010-0000-2002",
  birthDate: "1999-11-03",
  university: "",
  certificateName: "",
  certificateNumber: "",
  certificateValidityPeriod: "",
  certificateGrade: "",
  certificateIssuer: "",
  language: "",
  languageTestName: "",
  languageRegistrationNumber: "",
  languageAcquisitionDate: "",
  languageScore: "",
  languageEvidenceDocumentPath: "",
  veteranStatus: "",
} as const;

export const EXPECTED_REVIEW_KEYS = {
  available: ["name", "email", "phone", "birthDate"],
  review: [
    "university",
    "language",
    "languageTestName",
    "languageRegistrationNumber",
    "languageAcquisitionDate",
    "languageScore",
    "languageEvidenceDocumentPath",
  ],
  unavailable: [
    "certificateName",
    "certificateNumber",
    "certificateValidityPeriod",
    "certificateGrade",
    "certificateIssuer",
  ],
  sensitive: ["veteranStatus"],
} as const;

export const EXPECTED_REVIEW_VALUES = {
  name: "국문 이름 · 이서준",
  email: "이메일 · seojun.lee@example.com",
  phone: "연락처 · 010-0000-2002",
  birthDate: "생년월일 · 1999-11-03",
  university: "대학교명 · 새봄대학교(가상)",
  language: "외국어 · 영어",
  languageTestName: "시험명 · OPIc",
  languageRegistrationNumber: "등록번호 · LANG-B-2023-1015",
  languageAcquisitionDate: "취득일 · 2023-10-15",
  languageScore: "등급·점수 · IH",
  languageEvidenceDocumentPath:
    "증빙 서류 위치 · 가상 문서함 > 어학 > OPIc 성적표",
  certificateName: "자격증명 · 프로필에 없음",
  certificateNumber: "등록번호 · 프로필에 없음",
  certificateValidityPeriod: "유효 기간 · 프로필에 없음",
  certificateGrade: "등급 · 프로필에 없음",
  certificateIssuer: "발급기관 · 프로필에 없음",
  veteranStatus: "비해당",
} as const;

export const EXPECTED_STATUS_LABELS = {
  available: "입력 가능",
  review: "확인 필요",
  unavailable: "입력 불가",
  sensitive: "민감 확인",
} as const;

export const REDACTED_FIXTURE_VALUES = [
  "김가온",
  "gaon.kim@example.com",
  "010-0000-1001",
  "2000-05-21",
  "한빛대학교(가상)",
  "정보처리 역량 인증",
  "CF-A-2024-0614",
  "2024-06-14 ~ 2029-06-13",
  "기사급",
  "한빛자격평가원(가상)",
  "TOEIC",
  "LANG-A-2024-0518",
  "2024-05-18",
  "900",
  "가상 문서함 > 어학 > TOEIC 성적표",
  "이서준",
  "seojun.lee@example.com",
  "010-0000-2002",
  "1999-11-03",
  "새봄대학교(가상)",
  "데이터분석 역량 인증",
  "CF-B-2023-1120",
  "2023-11-20 ~ 2028-11-19",
  "2급",
  "새봄자격검정원(가상)",
  "OPIc",
  "LANG-B-2023-1015",
  "2023-10-15",
  "IH",
  "가상 문서함 > 어학 > OPIc 성적표",
  "영어",
  "비해당",
] as const;

export function createResearchDom() {
  return new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "dangerously",
    url: "file:///research/hypothesis-validation-interview.html",
  });
}

export function getElement<T extends HTMLElement>(
  document: Document,
  id: string,
): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`필수 요소가 없습니다: ${id}`);
  }
  return element as T;
}

export function fillInput(document: Document, id: string, value: string): void {
  getElement<HTMLInputElement>(document, id).value = value;
}

export function fillInputs(
  document: Document,
  values: Readonly<Record<string, string>>,
): void {
  Object.entries(values).forEach(([id, value]) =>
    fillInput(document, id, value),
  );
}

export function readFormValues(
  document: Document,
  formId: string,
): Record<string, string> {
  return Object.fromEntries(
    [
      ...document.querySelectorAll<HTMLInputElement>(
        `#${formId} input[data-fixture-key]`,
      ),
    ].map((input) => [input.dataset.fixtureKey, input.value]),
  );
}

export function normalizeText(text: string | null | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

export function readDefinitionPairs(card: Element): string[][] {
  return [...card.querySelectorAll("dt")].map((term) => [
    normalizeText(term.textContent),
    normalizeText(term.nextElementSibling?.textContent),
  ]);
}

export function readReviewInputs(
  document: Document,
  statusClass: string,
): HTMLInputElement[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(
      `#autofill-review .review-card.${statusClass} input[data-review-key]`,
    ),
  ];
}

export function startAssistedTaskForTest() {
  const dom = createResearchDom();
  const { document } = dom.window;

  fillInput(document, "participant-code", "P01");
  getElement<HTMLButtonElement>(document, "start-session").click();
  getElement<HTMLButtonElement>(document, "start-manual-task").click();

  fillInputs(document, MANUAL_INPUT_VALUES);
  getElement<HTMLButtonElement>(document, "complete-manual-task").click();
  getElement<HTMLButtonElement>(document, "start-assisted-task").click();

  return dom;
}

export function completeAssistedTaskForTest() {
  const dom = startAssistedTaskForTest();
  const { document } = dom.window;
  getElement<HTMLButtonElement>(document, "approve-autofill").click();

  fillInputs(document, ASSISTED_DIRECT_INPUT_VALUES);
  getElement<HTMLButtonElement>(document, "complete-assisted-task").click();

  return dom;
}

export function selectAllSurveyResponses(document: Document) {
  const selectedResponses = {
    "repeat-friction": "specific",
    "time-saving": "5",
    "partial-value": "5",
    "reason-understanding": "yes",
    trust: "4",
    intention: "yes",
    "automation-boundary": "fields",
  };
  Object.entries(selectedResponses).forEach(([name, value]) => {
    const input = document.querySelector<HTMLInputElement>(
      `#post-task-survey input[name="${name}"][value="${value}"]`,
    );
    if (!input) throw new Error(`사후 응답 항목이 없습니다: ${name}`);
    input.checked = true;
  });
}
