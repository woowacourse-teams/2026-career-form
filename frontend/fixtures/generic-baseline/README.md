# 범용 기준선 측정 드라이버

하네스 합성 페이지
[`large-generic-form.html`](../../../harness/fixtures/generic-autofill/pages/large-generic-form.html)에서
운영 `AutofillWorkflow`를 실행한다. 결과로 평가 계약 1.1 observations와 실행별 소요 시간을 만든다.
Issue #236에서 추가했고, generic-autofill-jev-agent 계획의 Task 15가 같은 명령으로 다시 측정한다.

## 구성

- `index.html`, `mount-workflow.tsx`: Vite 페이지다. 하네스 페이지를 `?raw` import로 사본 없이 불러온다.
  페이지의 인라인 스크립트도 그대로 실행한다. 운영 `AutofillWorkflow`는 open shadow root에 마운트하고
  예시 프로필 [`profile-export.example.json`](../profile-export.example.json)을 쓴다.
  분석 요청은 운영 `RuntimeAnalysisApiClient`와 `createAnalysisMessageHandler`를 거쳐 `/api`로 보낸다.
- `vite.config.ts`: `/api`를 이미 실행 중인 로컬 백엔드로 proxy한다. 기본 백엔드는
  `http://127.0.0.1:18080`이고 `CF_BASELINE_BACKEND_URL`로 바꾼다.
- `run-baseline.mjs`: Playwright headless Chromium 러너다. 실행마다 새 browser context를 만든다.
- `collector.mjs`: 기존 로컬 quality snapshot/review 콜백을 관찰한다. snapshot별 candidate와 DOM id,
  클라이언트에서 병합한 최종 review 바인딩을 수집하며 원래 콜백도 그대로 실행한다. 별도 API 호출은 없다.
- `combine-timing.mjs`: provider별 timing 파일을 공통 메타데이터와 함께 하나로 합친다.

드라이버는 provider 키를 읽거나 전달하거나 기록하지 않는다. 키는 사람이 승인한 방식으로 백엔드 프로세스
환경에만 둔다.

## 백엔드 기동 조건

측정 revision에서 만든 백엔드 jar를 실행한다. 아래 환경을 백엔드 프로세스에만 둔다.

| 변수 | 값 |
| --- | --- |
| `SERVER_PORT`, `MANAGEMENT_SERVER_PORT` | `18080`, `19091` |
| `SPRING_MONGODB_URI` | 일회용 Mongo 컨테이너(`--rm`) |
| `CAREER_FORM_ANALYSIS_ENABLED`, `CAREER_FORM_LLM_ENABLED` | `true` |
| `CAREER_FORM_ANALYSIS_PROVIDER`, `CAREER_FORM_SEARCH_PROVIDER`, `CAREER_FORM_CALENDAR_PROVIDER` | 측정 provider(`jev` 또는 `openai`) |
| `CAREER_FORM_LANGSMITH_ENABLED`, `LANGSMITH_TRACING`, `CAREER_FORM_QUALITY_ENABLED` | `false` |
| `CAREER_FORM_JEV_DATA_POLICY_REVIEWED` | jev일 때만 `true` |
| `TYPESAFE_API_KEY` 또는 `OPENAI_API_KEY` | 측정 provider의 키 하나 |

나머지는 측정 revision의 `application.yml` 기본값을 쓴다. provider를 바꿀 때는 백엔드를 다시 기동한다.

## 실행

`frontend`에서 `npm ci`를 마친 뒤 Vite를 띄운다.

```sh
CF_BASELINE_BACKEND_URL=http://127.0.0.1:18080 npx vite --config fixtures/generic-baseline/vite.config.ts
```

다른 터미널의 `frontend`에서 provider별로 5회 실행한다. 백엔드 provider와 `--provider`가 같아야 한다.
`--model`, `--timeout-ms`는 백엔드 설정값을 그대로 적는다.

```sh
node fixtures/generic-baseline/run-baseline.mjs --provider jev --model jev-latest --timeout-ms 8000 \
  --runs 5 --metrics-url http://127.0.0.1:19091/actuator/prometheus --out /tmp/cf-baseline
node fixtures/generic-baseline/run-baseline.mjs --provider openai --model gpt-5.6-luna --timeout-ms 30000 \
  --runs 5 --metrics-url http://127.0.0.1:19091/actuator/prometheus --out /tmp/cf-baseline
node fixtures/generic-baseline/combine-timing.mjs --meta <meta.json> \
  --out /tmp/cf-baseline/timing-generic-baseline-v1.json \
  /tmp/cf-baseline/timing-jev.json /tmp/cf-baseline/timing-openai.json
```

`--diagnose`를 붙이면 준비 분석 응답 직후 `ADD_REPEATABLE_GROUP` 계획별 `localItemCount`,
`currentGroupCount`, 필요 추가 수, 인식된 행의 입력란 이름을 기록한다. observations는 만들지 않는다.
`--screenshot`은 출력 디렉터리에 화면을 저장한다. 스크린샷은 커밋하지 않는다.

`--check-only`는 실행 절차 1단계의 추가 버튼 점검만 실행한다. 백엔드, `--provider`, `--model`,
`--timeout-ms` 없이 Vite만 띄우고 실행하며 결과는 exit code로 판정한다. 측정 run과 출력 파일은 만들지 않는다.

```sh
node fixtures/generic-baseline/run-baseline.mjs --check-only --out /tmp/cf-driver-check; echo "check=$?"
```

브라우저로 직접 확인하려면 Vite 실행 중에
`http://127.0.0.1:4173/fixtures/generic-baseline/index.html`을 연다.

## 실행 절차

1. 새 context에서 `?check=add-buttons`로 페이지를 연다. 이 query에서는 하네스 페이지와 인라인 스크립트만
   불러오고 운영 워크플로우를 마운트하지 않는다. `학력 추가`를 3회, `경력 추가`를 2회 누른다. 행 수,
   고정 `id`(c132~c159), 비활성화, 기존 값 보존, 새 행이 비어 있는지를 `add_button_check`에 기록한다.
   이 context의 `/api/` 요청이 1건이라도 있거나 `career-form-profile-panel`이 있으면 측정 run 전에 실패한다.
   `--check-only`는 기록 값까지 기대값과 비교해 다르면 실패한다.
2. 실행마다 새 context에서 페이지를 연다. 워크플로우 기본값으로 진행하며, `준비하고 계속`과
   기입 버튼이 나오면 누른다. 결과 화면 또는 예외 화면에서 멈춘다.
3. 결과 화면에서 입력란 값을 읽고, 2초 뒤 다시 읽어 유지 여부를 판정한다.
4. 실행마다 network에서 본 `/api/v1/**` 분석 요청 수(실행 정책 조회 제외)를 기록한 `AUTOFILL_*` event 수와
   비교한다. 다르면 그 run의 `failure_reasons`에 `analysis request count mismatch`를 남긴다.

## 출력 형식

- `observations-<provider>.json`: 계약 1.1이다. 1회차 실행의 candidate를 `FIXTURE` run에 담는다.
  입력란 `cNNN`은 `fNNN`으로 대응한다. `LIVE_SITE`는 `PAGE_UNAVAILABLE` INCONCLUSIVE다.
- `timing-<provider>.json`: 실행별 기록과 측정 조건이다. 실행별 기록에는 다음을 담는다.
  - 소요 시간(첫 분석 요청 시작부터 마지막 분석 응답까지)과 nearest-rank p95
  - 준비·칸·상호작용 분석 요청 수, 칸 분석 응답 상태와 경고
    (범용 응답의 필드별 `LLM_UNAVAILABLE`도 포함), 요청 실패 코드
  - 범용 섹션 분류 요청 수(`section_classification_requests`). 칸 요청 수에는 기존 및 범용 칸 분석이
    모두 포함되며, 섹션 분류는 칸 요청 수에 포함하지 않는다.
  - 그룹별 추가 전후 행 수, provider 호출 수(백엔드 지표 차이)
  - 판정 요약과 매핑된 프로필 필드 키, 실패 이유
- `combine-timing.mjs` 출력은 측정 revision, 수집 파일 sha256, 페이지·정답·프로필 sha256과
  마지막 커밋, 드라이버 파일 sha256을 공통 메타데이터로 둔다. 여기에 `--meta` 파일의 백엔드·provider
  설정, 키 변수 이름, 원인 조사 finding을 더한다.

판정 규칙은 다음과 같다. 매핑은 `AUTOFILLABLE` 입력란의 바인딩 키가 페이지 구성과 예시 프로필로 정한 키와
같을 때만 `CORRECT`다. 쓰기는 최종 DOM 값(선택 상자는 선택한 option 문구)이 기대값과 같을 때만
`CORRECT`다. 미매핑 종결 사유는 정답이 `PROFILE_VALUE_MISSING`이면 같은 사유, 아니면
`MAPPING_NO_MATCH`다. 바르게 매핑했으나 쓰지 않은 입력란의 사유는 다음과 같다.
`READY`이면서 `ALLOWED`면 `WRITE_FAILED`, `READY`이면서 확인이 필요한 정책이면
`USER_NOT_APPROVED`, 그 밖은 `WRITE_BLOCKED`다. token과 비용은 관측하지 않아 0과 `null`로 둔다.

범용 응답의 원시 binding이 아니라 운영 workflow의 quality review에 전달된 최종 analysis로 매핑을
판정한다. candidate id는 snapshot마다 달라지거나 재사용될 수 있어 snapshot의 registry에서 얻은
DOM id로 합친다. review 전 실패해도 snapshot에서 발견한 입력란은 미매핑으로 남는다. 기존 정적
칸 분석 응답 수집도 유지한다. 정답·프로필과 AUTOFILLABLE 분모는 바꾸지 않는다.

## 측정 뒤 정답 보정과 재채점

Issue #242에서 정답의 학력 2행(대학) `전공`(f035)과 `학점`(f036)을 예시 프로필 `education[1]`에 맞춰
`AUTOFILLABLE`로 보정했다. AUTOFILLABLE은 65칸에서 67칸이 됐고 `EXPECTED`에 `c035`, `c036`을 더했다.
커밋된 JEV·OpenAI 기준선은 provider를 다시 호출하지 않고 보정된 정답으로 다시 채점한 값이다.
관측에서는 기록된 매핑 키로 위 판정 규칙을 다시 적용해 미매핑 f035/f036의 `reason_code`만 바꿨다.
result 파일은 평가 CLI로 다시 만들었다. timing 파일의 `rescore`에 보정 내용과 새 sha256을 기록했고,
측정 당시 `meta.inputs`, `meta.driver_files`와 실행별 `summary`는 그대로 보존했다.
측정 원본은 Issue #236 시점의 Git 이력과 `.worktrees-evidence/CF-236/measure/`에 남아 있다.

## 증거 경계

- 합성 페이지와 예시 프로필만 사용한다. 실제 지원서 값, 계정, 세션, 사용자 브라우저 프로필은 쓰지 않는다.
- 출력에는 프로필 필드 키, 입력란 번호, 상태와 수치만 남긴다. 요청·응답 원문과 키는 남기지 않는다.
- 소요 시간은 네트워크와 공급자 상태에 따라 흔들리므로 통과 기준으로 쓰지 않는다.
- 이 드라이버의 결과는 합성 fixture 측정이다. 실사이트 성공을 뜻하지 않는다.
