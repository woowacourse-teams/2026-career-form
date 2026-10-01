import type { ActionAnalysis, Visibility } from './types';

interface SemanticMatch {
  profileField: string;
  section: string;
  confidence: 'exact' | 'heuristic' | 'unknown';
}

const FIELD_RULES: Array<[RegExp, string, string]> = [
  [/국문.*성(?!명)|한글.*성(?!명)/, 'koreanFamilyName', 'personal'],
  [/국문.*이름|한글.*이름/, 'koreanGivenName', 'personal'],
  [/한자.*성(?!명)/, 'hanjaFamilyName', 'personal'],
  [/한자.*이름/, 'hanjaGivenName', 'personal'],
  [/영문.*성(?!명)|familyname|lastname|surname/, 'englishFamilyName', 'personal'],
  [/영문.*이름|givenname|firstname/, 'englishGivenName', 'personal'],
  [/성별|gender/, 'gender', 'personal'],
  [/생년월일|생일|birthdate|birthday/, 'birthDate', 'personal'],
  [/국적|nationality/, 'nationality', 'personal'],
  [/이메일|email/, 'email', 'contact'],
  [/휴대폰|핸드폰|전화번호|연락처|mobile|phone/, 'phoneNumber', 'contact'],
  [/우편번호|zipcode|postalcode/, 'postalCode', 'contact'],
  [/상세주소|addressline2/, 'addressLine2', 'contact'],
  [/기본주소|도로명주소|주소|address/, 'addressLine1', 'contact'],
  [/학교명|schoolname|university/, 'schoolName', 'education'],
  [/학위구분|학위|degree/, 'degreeLevel', 'education'],
  [/입학일|입학년월|입학년도|startdate/, 'startDate', 'education'],
  [/졸업일|졸업년월|졸업년도|enddate/, 'endDate', 'education'],
  [/졸업구분|재학상태|completionstatus/, 'completionStatus', 'education'],
  [/평점|학점|gpa/, 'gpaScore', 'education'],
  [/만점|gpascale/, 'gpaScale', 'education'],
  [/추가전공|복수전공|부전공/, 'additionalMajorName', 'education'],
  [/전공명|주전공|major/, 'majorName', 'education'],
  [/외국어|언어|language/, 'language', 'language'],
  [/시험명|어학시험|testname/, 'testName', 'language'],
  [/회화수준|활용수준|conversational/, 'conversationalLevel', 'language'],
  [/등록번호|자격번호|면허번호|registration/, 'registrationNo', 'qualification'],
  [/발급기관|발행기관|시행기관|issuer/, 'issuer', 'qualification'],
  [/취득일|취득년월|발급일|합격일|acquisitiondate/, 'acquisitionDate', 'qualification'],
  [/자격.*등급|면허.*등급/, 'grade', 'qualification'],
  [/어학.*등급|어학.*점수|시험.*점수|성적|score/, 'grade', 'language'],
  [/자격.*명|자격증|면허.*명|qualification|certificate/, 'name', 'qualification'],
  [/등급|점수|grade/, 'grade', 'unknown'],
  [/회사명|직장명|company/, 'companyName', 'career'],
  [/입사일|입사년월/, 'startDate', 'career'],
  [/퇴사일|퇴사년월/, 'endDate', 'career'],
  [/직급|직위/, 'position', 'career'],
  [/담당업무|업무내용/, 'responsibilities', 'career'],
  [/자기소개|essay/, 'essay', 'essay'],
];

const ACTION_RULES: Array<[RegExp, string, ActionAnalysis['kind'], boolean]> = [
  [/자격.*추가|면허.*추가/, 'qualification.add', 'reveal', true],
  [/어학.*추가|외국어.*추가|시험.*추가/, 'language.add', 'reveal', true],
  [/학력.*추가|학교.*추가/, 'education.add', 'reveal', true],
  [/경력.*추가/, 'career.add', 'reveal', true],
  [/프로젝트.*추가/, 'project.add', 'reveal', true],
  [/펼치기|더보기|expand/, 'section.expand', 'reveal', true],
  [/주소.*검색/, 'address.search', 'navigation', false],
  [/삭제|remove|delete/, 'entry.remove', 'unsafe', false],
  [/저장|임시저장|save/, 'application.save', 'unsafe', false],
  [/제출|submit/, 'application.submit', 'unsafe', false],
  [/다음|next|이전|previous|미리보기/, 'application.navigate', 'navigation', false],
];

export function inferFieldSemantics(element: HTMLElement): SemanticMatch {
  const sources = semanticSources(element);
  for (const [pattern, profileField, section] of FIELD_RULES) {
    const matchedIndex = sources.findIndex((source) => pattern.test(source));
    if (matchedIndex >= 0) {
      return { profileField, section, confidence: matchedIndex < 2 ? 'exact' : 'heuristic' };
    }
  }
  return { profileField: 'unknown', section: 'unknown', confidence: 'unknown' };
}

export function inferAction(element: HTMLElement, visibility: Visibility): ActionAnalysis {
  const displayName = firstNonEmpty([
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.textContent,
    element.getAttribute('value'),
  ]);
  const source = normalize([
    displayName,
    element.getAttribute('name'),
    element.id,
  ].filter(Boolean).join(' '));
  for (const [pattern, action, kind, safeToInvoke] of ACTION_RULES) {
    if (pattern.test(source)) {
      return actionAnalysis(element, displayName, action, kind, visibility, safeToInvoke);
    }
  }
  return actionAnalysis(element, displayName, 'unknown', 'unknown', visibility, false);
}

export function controlIdentifiers(element: HTMLElement): {
  domId: string;
  domName: string;
  displayName: string;
} {
  const document = element.ownerDocument;
  const labelledBy = element.getAttribute('aria-labelledby')
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ') ?? '';
  const explicitLabels = 'labels' in element
    ? Array.from((element as HTMLInputElement).labels ?? []).map((label) => label.textContent ?? '').join(' ')
    : '';
  return {
    domId: element.id,
    domName: element.getAttribute('name') ?? '',
    displayName: firstNonEmpty([
      element.getAttribute('aria-label'), labelledBy, explicitLabels,
      element.getAttribute('placeholder'), element.getAttribute('title'),
    ]),
  };
}

function semanticSources(element: HTMLElement): string[] {
  const document = element.ownerDocument;
  const labelledBy = element.getAttribute('aria-labelledby')
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ') ?? '';
  const explicitLabels = 'labels' in element
    ? Array.from((element as HTMLInputElement).labels ?? []).map((label) => label.textContent ?? '').join(' ')
    : '';
  const nearby = [
    element.closest('label')?.textContent,
    element.closest('td')?.previousElementSibling?.textContent,
    element.closest('dd')?.previousElementSibling?.textContent,
    element.parentElement?.previousElementSibling?.textContent,
  ].filter(Boolean).join(' ');
  return [
    element.getAttribute('aria-label') ?? '',
    labelledBy,
    explicitLabels,
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('name') ?? '',
    element.id,
    nearby,
  ].map(normalize).filter(Boolean);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_\-()[\]{}:：·.,/+*]/g, '');
}

function actionAnalysis(
  element: HTMLElement,
  displayName: string,
  action: string,
  kind: ActionAnalysis['kind'],
  visibility: Visibility,
  safeToInvoke: boolean,
): ActionAnalysis {
  return {
    action,
    element: element.localName,
    domId: element.id,
    domName: element.getAttribute('name') ?? '',
    displayName,
    kind,
    visibility,
    safeToInvoke,
  };
}

function firstNonEmpty(values: Array<string | null | undefined>): string {
  const value = values
    .map((candidate) => candidate?.replace(/\s+/g, ' ').trim() ?? '')
    .find(Boolean) ?? '';
  return value.slice(0, 120);
}
