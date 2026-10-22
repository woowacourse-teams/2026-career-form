# 사전 채점 워크플로 (분모 동결)

확장을 실행하기 **전에** 페이지마다 독립 채점자 2명이 값 없는 구조(`grade/<label>.input.json`)와 합성 프로필만 보고 모든 칸을 분류한다. 의견이 갈린 칸은 심판이 정해 `grade/<label>.final.json`에 쓴다. 채점자는 제품 정책·어댑터 코드를 읽지 않는다.

## 실행

1. `node scripts/live-qa/cli.mjs census <tab> --label <label>`로 구조를 모은다.
2. `node scripts/live-qa/cli.mjs grade-input <label...>`로 채점 입력과 프로필 사본을 만든다.
3. `node scripts/live-qa/cli.mjs workflow-script pregrade --out <작업 폴더 안 경로>`가 출력한 경로를 Claude Code Workflow 도구의 `scriptPath`로 넘긴다. `args`는 다음과 같다.
   - `dir`: `<out>/grade` (기본 `~/.career-form-live-eval/live-qa/grade`)
   - `defs`: 저장소의 `frontend/src/profile/field-definitions.ts` 절대 경로
   - `labels`: 채점할 label 배열

분류: `AUTOFILLABLE`, `NO_PROFILE_KEY`, `PROFILE_VALUE_MISSING`, `OPTION_MISSING`, `CONDITIONAL_NOT_APPLICABLE`, `FORBIDDEN`, `NOT_A_FIELD`. 반복 행은 `rowExpansion`에 기존 행 수, 프로필 항목 수, 추가로 만들어야 할 행 수, 행당 입력 가능 칸 수를 적는다.

## 스크립트

```js
export const meta = {
  name: "pregrade-live-fields",
  description:
    "Blind pre-grading of live application form fields: two independent graders + reconciler per page",
  whenToUse:
    "Before running the extension on a live form, to freeze the AUTOFILLABLE denominator independently of the product",
  phases: [
    {
      title: "Grade",
      detail: "two independent blind graders per page",
      model: "sonnet",
    },
    {
      title: "Reconcile",
      detail: "judge resolves disagreements and writes final grading",
    },
  ],
};

const DIR = args.dir;
const PROFILE = `${DIR}/profile.synthetic.json`;
const DEFS = args.defs;

const CATEGORIES = [
  "AUTOFILLABLE",
  "NO_PROFILE_KEY",
  "PROFILE_VALUE_MISSING",
  "OPTION_MISSING",
  "CONDITIONAL_NOT_APPLICABLE",
  "FORBIDDEN",
  "NOT_A_FIELD",
];

const RULES = `
당신은 한국 채용 지원서 화면의 입력 칸을 사전 판정하는 독립 평가자다. 제품(자동 기입 확장)의 결과와 무관하게, "가상 프로필 값으로 사람이 채울 수 있는 칸"을 판정한다.

입력 자료:
- 페이지 구조(값 없음): {INPUT}  — controls[].i 가 칸 번호. type, name, section(섹션 제목), label(라벨/주변 문구), options(라디오 선택지), selectOptions(select 선택지 앞 30개), required/readonly/disabled.
- 가상 프로필(합성 데이터, 실제 개인정보 아님): ${PROFILE}
- 프로필 필드 정의(키 의미): ${DEFS}
금지: 저장소의 backend/policies, frontend/src/autofill/adapters, *policy* 파일을 읽지 마라. 제품의 매핑을 보면 독립 판정이 깨진다.

각 칸을 정확히 하나의 category로 분류한다:
- AUTOFILLABLE: 사용자 입력 칸이고, 의미가 프로필 필드와 대응하며, 그 프로필 값이 존재하고, select/radio라면 프로필 값과 맞는 선택지가 실제로 있다. 분할 칸(전화 3칸, 연·월 select)은 각 칸이 개별로 AUTOFILLABLE. 조건부 칸이라도 프로필 값 기준으로 해당되면(예: 프로필 병역=군필이면 군별·계급·복무기간) AUTOFILLABLE. readonly 검색형 칸(학교명·전공 검색, 주소 검색 결과)도 사람이 검색으로 채울 수 있으면 AUTOFILLABLE이며 note에 "search" 표시.
- NO_PROFILE_KEY: 프로필에 대응 개념 자체가 없음(지원경로, 추천인, 입사가능일자, 자기소개서·에세이, 회사별 추가질문, 사진 외 기타 등).
- PROFILE_VALUE_MISSING: 프로필에 대응 키는 있으나 가상 프로필에 값이 없음.
- OPTION_MISSING: 프로필 값은 있으나 사이트 선택지에 맞는 항목이 없음.
- CONDITIONAL_NOT_APPLICABLE: 조건부 칸인데 프로필 값 기준으로 해당 없음(예: 보훈 비대상인데 보훈번호).
- FORBIDDEN: 파일·사진 업로드(파일명 표시 칸 포함), 비밀번호, 동의, 본인인증, 지원분야/직무 선택(지원 의사 결정), 잠긴 신원 칸.
- NOT_A_FIELD: 실제 입력 칸이 아님(검색창 내부 질의칸, 표시용, 중복 렌더링 등).

각 칸에 profileKey(대응 프로필 경로, 예: personal.koreanFamilyName, education[1].schoolName — 프로필 JSON의 실제 경로), expected(가상 프로필에서 기대되는 화면 표시 값; select면 선택지 문구, 날짜는 사이트 형식 추정), note(짧게)를 적는다. AUTOFILLABLE이 아니면 expected는 빈 문자열.

반복 행(학력·경력·어학·자격증·프로젝트 등): 화면에 이미 있는 행의 칸은 위 규칙으로 분류한다. 추가로 rowExpansion에 섹션별로 existingRows(화면에 있는 행 수), profileEntries(그 섹션에 넣을 프로필 항목 수), extraRowsExpected(행 추가 버튼으로 더 만들어야 할 행 수, 추가 버튼이 없어 보이면 0으로 하고 note), autofillablePerRow(한 행에서 AUTOFILLABLE인 칸 수)를 적는다.

input.addButtons(있으면)는 화면에 보이는 '추가' 버튼 문구다. 섹션에 행(칸)이 0개라도 해당 추가 버튼이 있으면 existingRows=0, extraRowsExpected=profileEntries로 보고 autofillablePerRow는 그 섹션에 보통 있는 칸 중 프로필로 채울 수 있는 칸 수로 추정한다(note에 "estimated").
type이 button 또는 button-select인 칸은 커스텀 드롭다운이다(selectOptions가 있으면 선택지). 버튼에 보이는 안내 문구는 값이 아니다. 값이 이미 들어 있는지(hasValue)는 판정에 쓰지 않는다.
selectOptions가 placeholder뿐인 select는 앞 칸을 고르면 선택지가 로드되는 종속 select일 수 있다. 프로필 값이 있으면 AUTOFILLABLE로 두고 note에 "dependent select"를 적는다.
autofillablePerRow에는 행을 만든 뒤 선택에 따라 드러나는 칸(학교명·전공·학점 등)도 포함한다. 확장이 쓴 칸이 아니라 사람이 채울 수 있는 칸을 센다.
모든 controls[].i 를 빠짐없이 한 번씩 포함해야 한다.
`;

const GRADE_SCHEMA = {
  type: "object",
  properties: {
    controls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          category: { type: "string", enum: CATEGORIES },
          profileKey: { type: "string" },
          expected: { type: "string" },
          note: { type: "string" },
        },
        required: ["i", "category", "profileKey", "expected", "note"],
      },
    },
    rowExpansion: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" },
          existingRows: { type: "integer" },
          profileEntries: { type: "integer" },
          extraRowsExpected: { type: "integer" },
          autofillablePerRow: { type: "integer" },
          note: { type: "string" },
        },
        required: [
          "section",
          "existingRows",
          "profileEntries",
          "extraRowsExpected",
          "autofillablePerRow",
          "note",
        ],
      },
    },
    summary: { type: "string" },
  },
  required: ["controls", "rowExpansion", "summary"],
};

const FINAL_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string" },
    written: { type: "boolean" },
    controlCount: { type: "integer" },
    counts: {
      type: "object",
      properties: Object.fromEntries(
        CATEGORIES.map((c) => [c, { type: "integer" }]),
      ),
      required: CATEGORIES,
    },
    disagreements: { type: "integer" },
    extraRowsAutofillable: { type: "integer" },
    notes: { type: "string" },
  },
  required: [
    "label",
    "written",
    "controlCount",
    "counts",
    "disagreements",
    "extraRowsAutofillable",
    "notes",
  ],
};

const labels = args.labels;
const results = await pipeline(
  labels,
  (label) =>
    parallel(
      ["A", "B"].map(
        (who) => () =>
          agent(
            RULES.replace("{INPUT}", `${DIR}/${label}.input.json`) +
              `\n당신은 평가자 ${who}다. 다른 평가자의 결과는 보지 않는다. 결과는 StructuredOutput으로만 반환한다.`,
            {
              label: `grade:${label}:${who}`,
              phase: "Grade",
              schema: GRADE_SCHEMA,
              model: "sonnet",
            },
          ),
      ),
    ),
  (graded, label) => {
    const [a, b] = graded;
    if (!a || !b) return { label, written: false, error: "grader missing" };
    const diffs = [];
    const bi = new Map(b.controls.map((c) => [c.i, c]));
    for (const ca of a.controls) {
      const cb = bi.get(ca.i);
      if (
        !cb ||
        cb.category !== ca.category ||
        (ca.category === "AUTOFILLABLE" && ca.profileKey !== cb.profileKey)
      )
        diffs.push({ i: ca.i, A: ca, B: cb ?? null });
    }
    const prompt = `두 독립 평가자가 지원서 페이지 ${label}의 칸을 분류했다. 구조 자료: ${DIR}/${label}.input.json, 가상 프로필: ${PROFILE}, 필드 정의: ${DEFS}. (backend/policies, frontend/src/autofill/adapters, *policy* 파일은 읽지 마라.)
아래 분류 규칙을 그대로 따른다:
${RULES.replace("{INPUT}", `${DIR}/${label}.input.json`)}

평가자 A 결과(JSON): ${JSON.stringify(a)}
평가자 B 결과(JSON): ${JSON.stringify(b)}
불일치 칸 ${diffs.length}개: ${JSON.stringify(diffs.map((d) => d.i))}

할 일:
1. 일치한 칸은 그대로 두되, 명백히 둘 다 틀렸다면 고친다.
2. 불일치 칸은 구조 자료와 프로필을 직접 확인해 판정한다. 판단이 정말 애매하면 보수적으로(AUTOFILLABLE이 아닌 쪽으로) 두고 note에 "ambiguous"를 적는다.
3. rowExpansion도 둘을 대조해 확정한다.
4. 최종 결과를 JSON 파일 ${DIR}/${label}.final.json 에 Write 도구로 저장한다. 형식: {"label": "${label}", "controls": [{i, category, profileKey, expected, note}...모든 칸], "rowExpansion": [...], "summary": "..."}.
5. StructuredOutput으로 요약을 반환한다: counts는 category별 칸 수, extraRowsAutofillable은 sum(extraRowsExpected*autofillablePerRow), written은 파일 저장 성공 여부.`;
    return agent(prompt, {
      label: `reconcile:${label}`,
      phase: "Reconcile",
      schema: FINAL_SCHEMA,
    });
  },
);
return results;
```
