# 칸 단위 판정 워크플로

확장 실행 뒤 `join`으로 만든 `grade/<label>.joined.json`을 페이지마다 판정자 1명이 판정하고, 정답이 아닌 항목은 반박 담당이 원자료를 다시 열어 확인한다. 결과 배열을 파일로 저장해 `report --verdicts`에 넘긴다.

캡처가 있는 페이지(테스트 계정 탭의 `run`이 남긴 `run.json.captures`)는 Judge와 병렬로 캡처 판정자가 `grade/<label>.capture-input.json`의 캡처 이미지와 기대값 목록만 보고 화면에 보이는 값을 `grade/<label>.capture.json`에 적는다. 캡처 판정자는 DOM 판정, joined, run 파일을 열지 않는다. 두 판정의 대조는 `report`가 코드로 한다(`report/capture-compare.mjs`). 캡처가 없는 label은 Capture 단계를 건너뛴다.

## 실행

1. `node scripts/live-qa/cli.mjs run <tab> --label <label>`
2. `node scripts/live-qa/cli.mjs join <label...>` — 마지막 줄 `captureLabels: [...]`가 캡처가 있는 label이다.
3. `node scripts/live-qa/cli.mjs workflow-script verify --out <작업 폴더 안 경로>`가 출력한 경로를 Workflow 도구의 `scriptPath`로 넘긴다. `args`: `{ "dir": "<out>/grade", "labels": [...], "captureLabels": [...] }` (`captureLabels`는 `join`이 출력한 배열, 없으면 생략)
4. 결과(JSON 배열)를 `<out>/grade/verdicts.json`으로 저장하고 `node scripts/live-qa/cli.mjs report <label...> --verdicts <out>/grade/verdicts.json`. 결과의 `captureWritten`이 `false`인 label은 캡처 판정을 다시 돌린다.

숫자 필드(`correct`, `missed` 등)는 스키마 호환을 위해 남아 있지만 보고서는 쓰지 않는다. `report`가 `items`와 joined 행에서 다시 세고, 모델 숫자와 다르면 비고에 `verdict-mismatch`로 표시한다.

판정 종류: `CORRECT`, `WRONG`, `MISSED`, `EXTRA_CORRECT`, `EXTRA_WRONG`, `EXPECTATION_ERROR`, `UNVERIFIABLE`(실행 전 값이나 마운트 기본값이 그대로 남아 비교할 수 없는 칸, 분모 밖에서 따로 셈). 날짜 구분자, 전화 하이픈, `코드|문구` 같은 형식 차이는 정답으로 본다.

분모 규칙은 모든 플랫폼에서 같다: 실행 전 칸 중 AUTOFILLABLE + 실행 뒤 새로 생긴 칸(새 행, 선택 뒤 드러난 칸) 중 프로필에 값이 있는 칸 + 만들어지지 않은 행의 추정 칸. 확장이 쓴 칸만 분모에 넣으면 성공 쪽으로 치우친다(2026-10-21 측정의 교훈).

## 스크립트

```js
export const meta = {
  name: "verify-live-fill",
  description:
    "Per page: judge extension writes against blind pre-grading, then adversarially re-check every flagged item",
  whenToUse:
    "After running the extension on a live form and joining DOM results with pre-grading",
  phases: [
    {
      title: "Judge",
      detail:
        "one judge per page classifies every AUTOFILLABLE control and every added row control",
    },
    {
      title: "Capture",
      detail:
        "independent reader writes what each capture shows, without the DOM verdict",
    },
    {
      title: "Challenge",
      detail: "skeptic re-checks all non-correct items per page",
    },
  ],
};
const DIR = args.dir;
const PROFILE = `${DIR}/profile.synthetic.json`;
const CAPTURE_LABELS = args.captureLabels ?? [];
const KINDS = [
  "CORRECT",
  "WRONG",
  "MISSED",
  "EXTRA_CORRECT",
  "EXTRA_WRONG",
  "EXPECTATION_ERROR",
  "UNVERIFIABLE",
];
const ITEM = {
  type: "object",
  properties: {
    ref: { type: "string" },
    kind: { type: "string", enum: KINDS },
    expected: { type: "string" },
    written: { type: "string" },
    note: { type: "string" },
  },
  required: ["ref", "kind", "expected", "written", "note"],
};
const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string" },
    autofillable: { type: "integer" },
    correct: { type: "integer" },
    wrong: { type: "integer" },
    missed: { type: "integer" },
    expectationErrors: { type: "integer" },
    unverifiable: { type: "integer" },
    extraWritten: { type: "integer" },
    extraCorrect: { type: "integer" },
    extraWrong: { type: "integer" },
    createdRowsExpected: { type: "integer" },
    createdRowsObserved: { type: "integer" },
    items: { type: "array", items: ITEM },
    summary: { type: "string" },
  },
  required: [
    "label",
    "autofillable",
    "correct",
    "wrong",
    "missed",
    "expectationErrors",
    "unverifiable",
    "extraWritten",
    "extraCorrect",
    "extraWrong",
    "createdRowsExpected",
    "createdRowsObserved",
    "items",
    "summary",
  ],
};

const CAPTURE_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string" },
    captureWritten: { type: "boolean" },
    seenCount: { type: "integer" },
    emptyCount: { type: "integer" },
    notVisibleCount: { type: "integer" },
    note: { type: "string" },
  },
  required: [
    "label",
    "captureWritten",
    "seenCount",
    "emptyCount",
    "notVisibleCount",
    "note",
  ],
};

const capturePrompt = (
  label,
) => `화면 캡처 읽기. 자료는 ${DIR}/${label}.capture-input.json 하나뿐이다.
- captures[]: 실행 뒤 화면 캡처 파일(file, 절대경로 PNG)과 섹션 이름(name), 그 캡처에 들어 있을 칸 번호(controls). Read 도구로 PNG를 열어 본다.
- expected[]: 칸 번호 i, 섹션, 라벨, type, 기대값(합성 프로필). 기대값은 칸을 찾는 데만 쓰고, 보이는 값을 기대값에 맞춰 적지 않는다.
할 일: expected의 각 i에 대해 캡처에서 그 칸을 찾아 화면에 보이는 값을 seen에 그대로 적는다. 칸은 보이는데 비어 있으면 빈 문자열 "", 어느 캡처에서도 칸을 찾지 못하면 null. select·라디오·체크박스는 선택된 문구를 적는다. 날짜·전화는 보이는 형식 그대로 적는다.
결과를 ${DIR}/${label}.capture.json 에 Write 도구로 저장한다. 형식: [{"i": <번호>, "seen": "<값>" | "" | null}, ...] (expected의 모든 i를 한 번씩).
금지: ${DIR}/${label}.joined.json, *.run.json, *.final.json, *.input.json, verdicts, 그리고 다른 판정자의 결과를 열지 마라. backend/policies, frontend/src/autofill 코드도 읽지 마라. 캡처와 capture-input.json만 본다.
StructuredOutput으로 label, captureWritten(파일 저장 성공 여부), seenCount(값이 보인 칸 수), emptyCount(빈 칸 수), notVisibleCount(null 칸 수), note를 반환한다.`;

const judgePrompt = (label) => `실사이트 자동 기입 QA 판정. 자료:
- ${DIR}/${label}.joined.json : rows[]는 실행 전 화면의 각 칸(i, name, label, section)과 독립 사전 채점(category, profileKey, expected), 실행 후 값(written = 실행 후 값의 표시, afterHasValue, changed, preexistingValue). 실행 전에 보이는 칸 값을 비웠으므로 written이 있으면 실행이 만든 값이다. written은 실행 전 페이지에 없던 값이나 합성 프로필 값일 때만 표시되고, 그 밖의 값(실행 전 값과 같은 값, 마운트될 때부터 있던 값)은 개인정보 보호로 null이다. select의 written은 "code|표시문구", 라디오는 "표시문구 [v=값]".
  widgetsLeft는 초기화가 비우지 못한 커스텀 위젯 수다. 0보다 크면 그 위젯이 있는 행을 확장이 기존 행으로 보고 건너뛸 수 있으므로, 그런 행의 MISSED는 note에 "widget-left"를 적는다.
  addedOrUnmatchedAfterControls[]는 실행 후 새로 생긴 칸(행 추가)이다. rowExpansion은 채점자가 예상한 행 추가.
- 가상 프로필(합성 데이터): ${PROFILE}
- 채점 원본: ${DIR}/${label}.final.json, 구조: ${DIR}/${label}.input.json
판정 규칙:
1. category=AUTOFILLABLE인 각 칸: written이 프로필의 해당 값과 의미상 같으면(사이트 형식 차이 — 날짜 구분자, 전화 하이픈, 코드|문구 — 는 같은 것으로 본다) CORRECT, 다른 값이면 WRONG, 비어 있으면 MISSED. 단, 채점 자체가 틀렸음이 명백하면(예: 그 칸이 실제로 다른 의미이거나 사이트 선택지에 맞는 값이 없음) EXPECTATION_ERROR로 하고 note에 이유.
2. category가 AUTOFILLABLE이 아닌데 확장이 값을 쓴 칸, 그리고 addedOrUnmatchedAfterControls 중 값이 들어간 칸: 프로필 기준으로 맞으면 EXTRA_CORRECT, 틀리면 EXTRA_WRONG. (새로 생긴 행의 칸은 프로필의 다음 항목과 대조)
3. createdRowsExpected = rowExpansion의 extraRowsExpected 합, createdRowsObserved = 새로 생긴 행 수(새 칸들의 name 인덱스로 추정).
4. preexistingValue=true이고 written이 null인 칸은 최종값이 실행 전부터 페이지에 있던 값과 같아서 개인정보 보호로 표시되지 않았다(changed 여부와 무관). 정답으로 추정하지 말고 UNVERIFIABLE로 하며 correct/wrong/missed 어디에도 세지 않는다. unverifiable = 그 칸 수. changed=false인 칸도 CORRECT가 될 수 없다: afterHasValue=true면 UNVERIFIABLE(사이트 기본값), false면 MISSED.
5. addedOrUnmatchedAfterControls(새 행과 선택 뒤 드러난 칸)는 하나도 빠짐없이 본다. 각 칸에 대해 "프로필에 그 칸의 값이 있는가"를 행 위치와 섹션으로 판단하고, 있으면 분모에 넣는다: written이 있으면 EXTRA_CORRECT/EXTRA_WRONG, hasValue=false면 MISSED, hasValue=true인데 written=null이면 UNVERIFIABLE(마운트 기본값). 프로필에 값이 없는 칸(자기소개서, 파일, 지원경로 등)은 세지 않는다. 확장이 행을 만들었는지와 무관하게 같은 규칙을 쓴다(지난 측정에서 플랫폼마다 규칙이 달라 비교가 어긋났다).
6. items에는 CORRECT를 제외한 모든 항목을 넣는다(ref는 "i=<번호> <name>" 또는 "new <name>"). 숫자 필드는 정확히 센다. autofillable = category가 AUTOFILLABLE인 칸 수(EXPECTATION_ERROR 포함).
7. 의도적 미지원(에이치닷 어학 응시일, 대학 계열, 복수·부전공 주야간 등)은 EXPECTATION_ERROR가 아니라 MISSED다. 정책 반영 입력률은 보고서가 따로 계산한다. 종속 select(언어를 고른 뒤 선택지가 로드되는 시험명·등급)도 AUTOFILLABLE이며 비어 있으면 MISSED다.
8. 패널이 written=true로 표시해도 DOM 값이 비어 있으면 MISSED이고 note에 "panel-mismatch"를 적는다. 종료사유처럼 코드 select가 비어 있고 기타 자유입력 칸에만 값이 쓰였으면 select는 MISSED, 자유입력 쓰기는 세지 않고 note에 "substitute write"를 적는다.
9. 날짜의 일 단위 손실(YYYY-MM-DD → YYYY.MM)은 CORRECT로 보되 note에 "precision"을 적는다.
10. joined의 testAccount=true(테스트 계정 모드)면 written은 실행 전 값이 그대로 남은 칸에도 기록되고, rows에 beforeValue(초기화 뒤 실행 전 값)와 mountedAsIs(마운트 값 그대로)가 있다. 이때 규칙 4·5의 "written=null이면 UNVERIFIABLE"은 written이 "[account]"(계정 신원 칸)일 때만 적용한다. changed=true면 written을 값으로 판정한다. preexistingValue=true이고 changed=false이고 written이 expected와 같으면 확장이 쓴 것이 아니라 이미 있던 값이므로 CORRECT가 아니라 UNVERIFIABLE로 두고 note에 "already filled"를 적는다. mountedAsIs=true이고 changed=false인 새 칸은 행 템플릿 기본값이므로 같은 규칙이다.
11. rows와 addedOrUnmatchedAfterControls의 siteDefault=true는 실행 후 값이 사이트 기본값(select의 첫 선택지·defaultSelected, 라디오·체크박스의 defaultChecked, 텍스트의 HTML 기본값)이라는 뜻이다. changed=false이고 siteDefault=true인 칸은 확장이 쓴 것이 아니므로 CORRECT가 아니라 UNVERIFIABLE로 두고 note에 "site-default"를 적는다. companionOf가 있는 숨은 칸(어학·자격 코드 칸의 이름 칸)은 보이는 칸과 짝이며, 보이는 칸이 CORRECT면 숨은 코드 칸은 따로 세지 않고 note에만 적는다.
backend/policies, frontend/src/autofill 코드와 *policy* 파일은 읽지 마라. StructuredOutput으로 반환.`;

const challengePrompt = (
  label,
  j,
) => `다른 판정자가 ${label} 페이지의 자동 기입 결과를 판정했다. CORRECT가 아닌 항목들을 반박하라: 각 항목이 정말 오입력/누락/채점오류인지, 아니면 실제로는 올바른 값(형식 차이)이거나 판정자가 잘못 읽은 것인지 자료를 직접 열어 확인한다.
자료: ${DIR}/${label}.joined.json, ${DIR}/${label}.final.json, ${DIR}/${label}.input.json, 프로필 ${PROFILE}. (backend/policies, frontend/src/autofill, *policy* 파일은 읽지 마라.)
판정자 결과: ${JSON.stringify(j)}
각 항목의 최종 kind를 다시 정하고 note에 근거를 남긴다. 판정자의 CORRECT 수가 틀렸다고 보이면 숫자도 고친다. 동일한 스키마로 최종 결과를 StructuredOutput으로 반환하라(숫자 필드는 최종 판정 기준으로 다시 센 값).`;

// Judge and Capture run side by side; the capture reader never sees the
// judge's result. Labels without captures skip the Capture phase.
const results = await pipeline(
  args.labels,
  (label) =>
    parallel([
      () =>
        agent(judgePrompt(label), {
          label: `judge:${label}`,
          phase: "Judge",
          schema: JUDGE_SCHEMA,
          model: "sonnet",
        }),
      () =>
        CAPTURE_LABELS.includes(label)
          ? agent(capturePrompt(label), {
              label: `capture:${label}`,
              phase: "Capture",
              schema: CAPTURE_SCHEMA,
              model: "sonnet",
            })
          : Promise.resolve(null),
    ]),
  ([j, cap], label) => {
    if (!j) return null;
    const captureWritten = CAPTURE_LABELS.includes(label)
      ? Boolean(cap?.captureWritten)
      : null;
    if (!j.items.length) return { ...j, challenged: false, captureWritten };
    return agent(challengePrompt(label, j), {
      label: `challenge:${label}`,
      phase: "Challenge",
      schema: JUDGE_SCHEMA,
    }).then((c) =>
      c
        ? {
            ...c,
            challenged: true,
            captureWritten,
            judgeCounts: {
              correct: j.correct,
              wrong: j.wrong,
              missed: j.missed,
              expectationErrors: j.expectationErrors,
              extraWrong: j.extraWrong,
            },
          }
        : { ...j, challenged: "failed", captureWritten },
    );
  },
);
return results;
```
