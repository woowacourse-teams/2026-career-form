import { cachedDomRead } from "./read-pass";
import {
  definitionListLabelOf, unassociatedLabelOf, fixedTextChunks, formText, structuralLabelOf, structuralRow,
} from "./metadata";
import { pageTitleMatcher } from "./page-title";
import { isTrustedId, trustedLabels } from "./trusted-id";
import type { SemanticContext } from "../api/types";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";

const FORM_TERMS = [
  "국문",
  "한글",
  "영문",
  "한자",
  "성명",
  "이름",
  "성",
  "성별",
  "생년월일",
  "연락처",
  "이메일",
  "휴대전화",
  "전화번호",
  "주소",
  "우편번호",
  "기본주소",
  "기본 주소",
  "상세주소",
  "나머지 주소",
  "상세 주소",
  "도로명 주소",
  "도로명주소",
  "지번 주소",
  "학력",
  "고등학교",
  "대학교",
  "대학원",
  "학교명",
  "전공",
  "부전공",
  "복수전공",
  "학위",
  "졸업",
  "재학",
  "휴학",
  "수료",
  "중퇴",
  "입학",
  "편입",
  "졸업예정",
  "입학일",
  "졸업일",
  "기간",
  "시작일",
  "종료일",
  "취득일",
  "발급일",
  "응시일",
  "학점",
  "만점",
  "성적",
  "점수",
  "등급",
  "주간",
  "야간",
  "국가",
  "도시",
  "소재지",
  "경력",
  "회사명",
  "기관명",
  "부서",
  "직위",
  "직책",
  "담당업무",
  "재직",
  "퇴사",
  "프로젝트",
  "프로젝트명",
  "역할",
  "활동내역",
  "활동 내역",
  "봉사활동",
  "봉사",
  "교내외 활동",
  "교외 활동",
  "대외 활동",
  "동아리 활동",
  "해외경험",
  "해외 경험",
  "공모전",
  "수상이력",
  "수상 이력",
  "상세내용",
  "설명",
  "수상",
  "수상명",
  "수여기관",
  "교육",
  "교육명",
  "교육기관",
  "교육시간",
  "자격증",
  "자격증명",
  "자격번호",
  "발급기관",
  "어학",
  "외국어",
  "언어",
  "시험명",
  "영어",
  "일본어",
  "중국어",
  "독일어",
  "프랑스어",
  "병역",
  "군필",
  "미필",
  "면제",
  "군별",
  "계급",
  "복무",
  "입대일자",
  "전역일자",
  "전역예정일자",
  "보훈",
  "장애",
  "건강",
  "대상",
  "비대상",
  "해당없음",
  "해당",
  "없음",
  "있음",
  "예",
  "아니오",
  "남성",
  "여성",
  "추가",
  "열기",
  "선택",
  "직접입력",
  "필수",
  "선택사항",
  "검색",
  "동의",
  "인증",
  "약관",
  "name",
  "full name",
  "first name",
  "last name",
  "given name",
  "family name",
  "korean",
  "english",
  "email",
  "phone",
  "mobile",
  "address",
  "address line 1",
  "address line 2",
  "road address",
  "detailed address",
  "postal code",
  "birth date",
  "date of birth",
  "gender",
  "education",
  "high school",
  "university",
  "graduate school",
  "school",
  "major",
  "degree",
  "gpa",
  "score",
  "grade",
  "start date",
  "end date",
  "graduation",
  "certificate",
  "certification",
  "issuer",
  "language",
  "test",
  "experience",
  "company",
  "department",
  "position",
  "project",
  "award",
  "training",
  "country",
  "city",
  "military",
  "veteran",
  "disability",
  "add",
  "open",
  "select",
  "required",
  "optional",
  "yes",
  "no",
  "male",
  "female",
  "YYYY-MM-DD",
  "YYYY-MM",
  "YYYYMMDD",
  "YYYYMM",
  "TOEIC",
  "TOEFL",
  "OPIC",
  "JLPT",
  "HSK",
];
const vocabulary = [
  ...new Set([
    ...FORM_TERMS,
    ...PROFILE_CATEGORIES.flatMap((category) => [
      category.label,
      ...category.sections.flatMap((section) => [
        section.label,
        ...section.fields.map((field) => field.label),
      ]),
      ...(category.topLevelFields ?? []).map((field) => field.label),
    ]),
  ]),
]
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

const formTerms = new Set(vocabulary.map((term) => term.toLowerCase()));

/**
 * Matches text that names the page (a job posting title), so it must not be
 * collected as a section title. A form term stays a section title even when
 * the page title repeats it ("학력 | 회사").
 */
export function pageTitleHeadingMatcher(
  document: Document,
): (text: string | null | undefined) => boolean {
  const namesPage = pageTitleMatcher(document);
  return (text) => {
    const term = formText(text);
    return term !== undefined && !formTerms.has(term.toLowerCase()) && namesPage(term);
  };
}

/**
 * English terms and one-syllable Korean terms ("예", "성") must not be glued
 * to a longer word of the same script, e.g. "예" inside "예정".
 */
function standaloneIndexOf(text: string, term: string): number {
  const glued = /^[a-z ]+$/.test(term)
    ? /[a-z]/
    : /^[가-힣]$/.test(term)
      ? /[가-힣]/
      : undefined;
  for (
    let index = text.indexOf(term);
    index >= 0;
    index = text.indexOf(term, index + 1)
  ) {
    if (
      !glued ||
      !(glued.test(text[index - 1] ?? "") ||
        glued.test(text[index + term.length] ?? ""))
    )
      return index;
  }
  return -1;
}

/** Return dictionary terms only: never forward arbitrary page prose or values. */
export function semanticText(
  value: string | null | undefined,
): string | undefined {
  const input = value
    ?.normalize("NFKC")
    // "전역(예정)일자": an inline qualifier belongs to the surrounding word.
    .replace(/(?<=[가-힣])\(([가-힣]+)\)(?=[가-힣])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!input || input.length > 512) return undefined;
  let remaining = input.toLowerCase();
  const matches: Array<{ index: number; term: string }> = [];
  for (const term of vocabulary) {
    const index = standaloneIndexOf(remaining, term.toLowerCase());
    if (index < 0) continue;
    matches.push({ index, term });
    remaining =
      remaining.slice(0, index) +
      " ".repeat(term.length) +
      remaining.slice(index + term.length);
  }
  return (
    matches
      .sort((a, b) => a.index - b.index)
      .map(({ term }) => term)
      .join(" ")
      .slice(0, 120) || undefined
  );
}

function staticText(element: Element | null): string | undefined {
  if (!element || element.matches("input, select, textarea, [contenteditable]"))
    return undefined;
  return cachedDomRead(element, "semantic-static-text", () => {
  const clone = element.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      "input, select, textarea, option, script, style, [contenteditable], [hidden], [aria-hidden='true']",
    )
    .forEach((child) => child.remove());
  return semanticText(clone.textContent);
  });
}

function linkedText(
  element: HTMLElement,
  attribute: string,
): string | undefined {
  const ids = element.getAttribute(attribute)?.trim().split(/\s+/) ?? [];
  if (ids.length > 8) return undefined;
  return semanticText(
    ids
      .map((id) => staticText(element.ownerDocument.getElementById(id)) ?? "")
      .join(" "),
  );
}

const DIRECT_HEADING =
  ":scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > [role='heading']";
const WRAPPED_HEADING =
  ":scope > * > h1, :scope > * > h2, :scope > * > h3, :scope > * > h4, :scope > * > h5, :scope > * > h6, :scope > * > [role='heading']";

function uniqueHeadingText(container: Element): string | undefined {
  return cachedDomRead(container, "semantic-heading", () => {
  const headings = [
    ...container.querySelectorAll(DIRECT_HEADING),
    ...container.querySelectorAll(WRAPPED_HEADING),
  ]
    .map(staticText)
    .filter((text): text is string => Boolean(text));
  const unique = [...new Set(headings)];
  return unique.length === 1 ? unique[0] : undefined;
  });
}

function nearestStructuralHeading(
  element: HTMLElement,
  section: Element | null,
): string | undefined {
  let current: Element | null = element.parentElement;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const heading = uniqueHeadingText(current);
    if (heading) return heading;
    if (current === section) break;
    current = current.parentElement;
  }
  return undefined;
}

function contextLabels(
  element: HTMLElement,
  section: Element | null,
): NonNullable<SemanticContext["labels"]> {
  const labels: NonNullable<SemanticContext["labels"]> = [];
  const add = (
    source: NonNullable<SemanticContext["labels"]>[number]["source"],
    text?: string,
  ) => {
    if (text && labels.length < 8) labels.push({ source, text });
  };
  add("aria-labelledby", linkedText(element, "aria-labelledby"));
  add("aria-label", semanticText(element.getAttribute("aria-label")));
  if ("labels" in element) {
    const controls = element as HTMLInputElement;
    add(
      "label",
      semanticText(
        Array.from(
          controls.labels?.length
            ? controls.labels
            : [unassociatedLabelOf(element)].filter(
                (label): label is HTMLLabelElement => Boolean(label),
              ),
        )
          .map(staticText)
          .filter(Boolean)
          .join(" "),
      ),
    );
  }
  add("label", semanticText(definitionListLabelOf(element)));
  add("placeholder", semanticText(element.getAttribute("placeholder")));
  add(
    "legend",
    staticText(
      element.closest("fieldset")?.querySelector(":scope > legend") ?? null,
    ),
  );
  add("section-heading", nearestStructuralHeading(element, section));
  add("description", linkedText(element, "aria-describedby"));
  return labels;
}

interface ContextOptions {
  generic?: boolean;
  group?: readonly HTMLElement[];
  recoverBrokenLabels?: boolean;
  titleNameCues?: boolean;
}

const NAME_CUE_SOURCES: ReadonlySet<NonNullable<SemanticContext["labels"]>[number]["source"]> = new Set([
  "label", "aria-label", "aria-labelledby", "placeholder",
]);

function genericContextLabels(
  element: HTMLElement,
  section: Element | null,
  group?: readonly HTMLElement[],
  recoverBrokenLabels = false,
  titleNameCues = false,
): NonNullable<SemanticContext["labels"]> {
  const labels: NonNullable<SemanticContext["labels"]> = [];
  const add = (source: NonNullable<SemanticContext["labels"]>[number]["source"], value?: string | null) => {
    const text = formText(value);
    if (text && labels.length < 8 &&
      !labels.some((label) => label.source === source && label.text === text))
      labels.push({ source, text });
  };
  const textOf = (node: Element | null) => node
    ? formText(fixedTextChunks(node).join(" "))
    : undefined;
  const linked = (attribute: string) => {
    const root = element.getRootNode() as Document | ShadowRoot;
    const ids = element.getAttribute(attribute)?.trim().split(/\s+/) ?? [];
    if (ids.length > 8) return undefined;
    return formText(ids.filter((id) => isTrustedId(root, id))
      .map((id) => textOf(root.getElementById(id))).filter(Boolean).join(" "));
  };
  const choice = element instanceof HTMLInputElement &&
    ["radio", "checkbox"].includes(element.type);
  const question = group ? structuralLabelOf(group)
    : choice ? undefined : structuralLabelOf([element]);
  if (group) {
    add("label", question?.label);
    add("description", question?.description);
  }
  add("aria-labelledby", linked("aria-labelledby"));
  add("aria-label", element.getAttribute("aria-label"));
  if ("labels" in element && !group) {
    const trusted = trustedLabels(element as HTMLInputElement);
    const owned = trusted.length ? trusted : [unassociatedLabelOf(element, recoverBrokenLabels)];
    add("label", owned.filter((label): label is HTMLLabelElement => Boolean(label))
      .map(textOf).filter(Boolean).join(" "));
  }
  add("label", definitionListLabelOf(element, true));
  if (!group) {
    add("label", question?.label);
    add("description", question?.description);
  }
  add("placeholder", element.getAttribute("placeholder"));
  // A control with no other name cue falls back to its title text, reusing the
  // existing label source so the shared API contract stays unchanged.
  if (titleNameCues && !group && !labels.some((label) => NAME_CUE_SOURCES.has(label.source)))
    add("label", element.getAttribute("title"));
  add("legend", textOf(element.closest("fieldset")?.querySelector(":scope > legend") ?? null));
  const row = structuralRow(element);
  // A job posting title above the form names the page, not a section.
  // Read the page once per collection pass, not once per field.
  const namesPage = cachedDomRead(element.ownerDocument, "page-title-heading", () =>
    pageTitleHeadingMatcher(element.ownerDocument));
  let current = element.parentElement;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const headings = [...current.querySelectorAll(`${DIRECT_HEADING}, ${WRAPPED_HEADING}`)]
      .filter((heading) => heading.parentElement === current ||
        !heading.parentElement?.querySelector("input, select, textarea"));
    const texts = [...new Set(headings.map(textOf).filter(Boolean))];
    if (texts.length === 1) {
      // Nothing above the page's own name is a narrower section.
      if (!namesPage(texts[0])) add("section-heading", texts[0]);
      break;
    }
    if (current === section || current === row) break;
    current = current.parentElement;
  }
  add("description", linked("aria-describedby"));
  return labels;
}

export function collectSemanticContext(
  element: HTMLElement,
  section: Element | null,
  options: ContextOptions = {},
): SemanticContext {
  const labels = options.generic
    ? genericContextLabels(element, section, options.group, options.recoverBrokenLabels, options.titleNameCues)
    : contextLabels(element, section);
  const context: SemanticContext = labels.length ? { labels } : {};
  if (
    element instanceof HTMLInputElement &&
    [
      "text",
      "email",
      "tel",
      "number",
      "date",
      "month",
      "url",
      "search",
    ].includes(element.type)
  ) {
    context.inputType = element.type as SemanticContext["inputType"];
  }
  if (
    [
      "none",
      "text",
      "decimal",
      "numeric",
      "tel",
      "search",
      "email",
      "url",
    ].includes(element.inputMode)
  ) {
    context.inputMode = element.inputMode as SemanticContext["inputMode"];
  }
  const autocomplete = element.getAttribute("autocomplete") ?? "";
  if (
    [
      "name",
      "given-name",
      "family-name",
      "additional-name",
      "email",
      "tel",
      "postal-code",
      "street-address",
      "address-line1",
      "address-line2",
      "country",
      "country-name",
      "bday",
      "bday-day",
      "bday-month",
      "bday-year",
      "organization",
      "organization-title",
      "off",
    ].includes(autocomplete)
  ) {
    context.autocomplete = autocomplete as SemanticContext["autocomplete"];
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    if (element.required) context.required = true;
    if ("multiple" in element && element.multiple) context.multiple = true;
    if (
      "maxLength" in element &&
      element.maxLength > 0 &&
      element.maxLength <= 100000
    )
      context.maxLength = element.maxLength;
  }
  return context;
}

export function collectActionSemanticContext(
  element: HTMLElement,
  section: Element | null,
  options: ContextOptions = {},
): Pick<SemanticContext, "labels" | "required" | "multiple"> {
  const { labels, required, multiple } = collectSemanticContext(
    element,
    section,
    options,
  );
  return {
    ...(labels ? { labels } : {}),
    ...(required ? { required } : {}),
    ...(multiple ? { multiple } : {}),
  };
}
