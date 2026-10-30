# 범용 매칭 모델 평가

범용 자동기입이 서버로 보내는 AI 호출(준비 단계 버튼 결정, 섹션 분류, 필드 매핑)을 고정 입력과 사람이 검토한 정답으로
반복 측정한다. 관련 Issue: #356.

## 구성

| 부분 | 위치 | 역할 |
| --- | --- | --- |
| 화면 fixture | `frontend/fixtures/dom-snapshots/woowahan-r2605009-*` | 사람이 준비한 지원서 화면의 비식별 정제본 |
| 요청 기록 | `frontend/src/evaluation/capture/` | 제품 범용 흐름을 fixture에 실행해 제품 요청을 호출 순서대로 기록. 후속 요청은 정답으로 만든다 |
| 데이터셋 | `src/main/resources/evaluation/datasets/<id>/v<N>/` | manifest(파일 sha256, 검토 상태), 사례(요청과 정답), 정답 원본 |
| 합성 프로필 | `src/main/resources/evaluation/profiles/v1/` | 가상 인물 3명. 실제 지원자 자료가 아니다 |
| 등록 검사 | `evaluation/dataset/DatasetLoader` | 해시, 사람 검토, 입력 동일성, 형식, 분할을 통과한 데이터셋만 실행에 쓴다 |
| 실행 | `evaluation/run/` | 등록(`RunService`), 작업자(`EvaluationWorker`), 제품 서비스 호출(`ServiceProductCallGateway`), 결과·재채점 저장 |
| 채점 | `evaluation/scoring/` | 항목 채점(`CallScorer`), 호출 단위 집계(`RunAggregator`) |
| 모델 호출 기록 | `monitoring/ModelCallRecording`, `JevClient` | 평가 실행 범위 안의 모델 HTTP 시도별 시간·상태·토큰 |
| 프롬프트 버전 | `formanalysis/application/PromptSource`, `evaluation/prompt/` | 프롬프트 고정 문구 조각과 sha256 해시, 버전별 전문 |
| 화면 | `src/main/resources/static/evaluations/` (`/evaluations/`) | 결과 비교, 데이터셋·정답 기준·프롬프트 보기, 실행 등록, 수집 지침 내려받기 |

## 켜는 방법

development 서버에서만 켠다. 평가 호출은 사용자 요청과 서버 동시 호출 상한(`career-form.analysis.jev.max-concurrent`)을
나눠 쓴다. 운영 환경에서는 켜지 않는다.

| 키 | 기본값 | 의미 |
| --- | --- | --- |
| `CAREER_FORM_EVALUATION_ENABLED` | false | 평가 API·작업자·화면 |
| `CAREER_FORM_EVALUATION_MAX_MODEL_CALLS` | 500 | 실행당 모델 호출 한도. 등록 때 예상치로, 실행 중 관측치로 확인 |
| `CAREER_FORM_EVALUATION_MAX_REPETITIONS` | 20 | 반복 수 상한 |
| `CAREER_FORM_EVALUATION_POLL_INTERVAL` | 10s | 작업자 확인 주기 |
| `CAREER_FORM_EVALUATION_LEASE` | 5m | 실행 임대. 끝나면 다른 작업자가 이어받는다 |

API와 화면은 품질 확인 공용 비밀번호(`CAREER_FORM_QUALITY_PASSWORD_HASH`)로 보호한다. 실행자는
`X-Evaluation-Requester` 헤더(영문·숫자·한글 32자)로 기록하고 없으면 `quality-admin`이다.

## API

| 요청 | 결과 |
| --- | --- |
| `POST /api/v1/evaluations/runs` | 202 `{runId}`. 진행 중 실행이 있으면 409와 기존 실행 ID, 같은 조건인지 여부 |
| `GET /api/v1/evaluations/runs` | 최근 실행과 보고 |
| `GET /api/v1/evaluations/runs/{id}` | 상태, 처리 건수, 원자료에서 다시 계산한 보고(진행 중이면 부분 결과) |
| `GET /api/v1/evaluations/runs/{id}/results` | 호출별 답, 점수, 실패 원인, 시간, 모델 시도 |
| `POST /api/v1/evaluations/runs/{id}/cancel` | 대기 중이면 즉시 취소, 실행 중이면 다음 호출 경계에서 취소 |
| `POST /api/v1/evaluations/runs/{id}/scorings` | 재채점. 새 기록을 추가하고 이전 기록과 호출 결과는 그대로 둔다 |
| `GET /api/v1/evaluations/datasets/{id}/v{N}` | 데이터셋 사례, 화면 칸, 준비 동작, 검토 상태, 합성 프로필 |
| `GET /api/v1/evaluations/prompts/{digest}` | 프롬프트 버전 전문 |

등록 본문: `datasetId`, `datasetVersion`, `split`(tuning|final), `repetitions`, `promptVersion`(선택),
`overrides`(`field-batch-size` 1~128, `section-concurrency` 1~16만 허용).

상태: `QUEUED → RUNNING → COMPLETED | PARTIAL | FAILED | CANCELLED`. 모든 호출을 채점했으면 COMPLETED, 실패 호출이 있거나
예산에 닿아 멈추면 PARTIAL, 등록 뒤 데이터셋·프롬프트가 바뀌었거나 예외가 나면 FAILED다.

## 채점

- 채점 단위는 제품 API 호출 1건이다. 서버가 그 안에서 모델을 몇 번 불렀는지는 비중에 쓰지 않는다.
- 호출 점수 = 맞힌 항목 수 ÷ 정답 항목 수. 정답에는 매핑 불가·기권도 들어간다. 누락, 다른 키, 불필요 제안은 그 항목의 오답이다.
- 공급자 사용 불가 항목은 채점에서 빼고, 모든 항목이 빠진 호출은 채점 불가 실패다.
- 모델 시도가 있었는데 하나도 성공하지 못한 호출은 응답 내용과 관계없이 실패(타임아웃, API 오류, 응답 형식 오류)다.
- 최종 정확도 = 채점 가능한 호출 점수의 평균. 준비·매핑 정확도는 호출이 일어난 단계로 나눈다(준비 루프 안의 섹션 분류는 준비).
- 채점식을 바꾸면 `RunService.SCORING_VERSION`을 올리고 재채점으로 새 기록을 만든다.

## 측정 범위

| 값 | 시작 | 끝 | 포함 | 제외 |
| --- | --- | --- | --- | --- |
| 제품 호출 시간 | 작업자가 제품 서비스 호출 | 서비스 반환 | 서버 내부 배치, 동시 호출 상한 대기, 모델 대기, 429 재시도 대기 | HTTP 전송, 확장·페이지 조작 |
| 모델 시도 시간 | 모델 HTTP 전송 직전 | 전체 응답 수신 | 네트워크, 공급자 대기 | 응답 해석 |
| 흐름 시간 | 반복 하나에서 사례 하나의 호출 시간 합 | | 준비·매핑 호출 | 호출 사이 작업자 처리 |
| 처리량 | 완료 호출 수 ÷ 실행 경과 초 | | | |
| 큐 대기 | 등록 | 작업자 시작 | | |

토큰은 공급자가 응답에 준 값이다. 응답을 받지 못한 시도는 `null`이며 평균에서 빼고 미관측 수로 따로 센다. 비용은 서버가
계산하지 않는다. 화면에서 사용자가 넣은 단가로만 계산한다. 첫 반복과 나머지 반복의 평균 호출 시간을 따로 보고해 공급자 쪽
캐시 영향을 구분한다. 동시 호출 상한을 사용자 요청과 나눠 쓰므로 그 시간대의 사용자 요청이 대기 시간에 섞일 수 있다.

## 입력 동일성과 한계

- `SOURCE_PIPELINE_VERIFIED`: `woowahan-dataset.test.ts`가 현재 제품 코드로 fixture에서 요청을 다시 만들어 저장본의
  정규화 digest(생성 ID 제외)와 같은지 확인한다. 제품 요청 코드가 바뀌면 이 테스트가 실패한다.
- 백엔드 컨텍스트 테스트가 저장본의 모든 요청을 엄격 JSON 매퍼와 Bean Validation으로 읽어 제품 서비스에 넣는다.
- 설치 확장이 실사이트에서 보낸 요청과는 대조하지 않았다. 기본정보 섹션 제목(인사말)은 `[비식별]`이라 실제 입력과 다르다.
- 검색 팝업(주소·학교·전공)의 SEARCH_* 결정 호출과 기입 성공은 평가하지 않는다.
- 이번 평가는 JEV 범용 경로만 대상으로 한다. 공급자 간 비교는 하지 않는다.
- 공고 하나(화면 상태 3개)와 합성 프로필 하나라 일반화 성능을 주장하지 않는다.

## 새 데이터 추가

평가 화면의 "수집 지침 내려받기"(`static/evaluations/collection-skill.md`)를 따른다.
