# Jev와 OpenAI 호출 추적

LangSmith Java SDK로 공급자 호출을 기록한다. Jev의 HTTP 호출과 OpenAI의 Spring AI 호출은 유지한다. 추적은 기본 비활성화이며 API 키가 없으면 활성화 설정이 있어도 전송하지 않는다.

## 설정

사람이 테스트 프로젝트와 자격증명을 준비하고 백엔드 프로세스 환경에 주입한다. `.env.local`은 worktree에 복사하거나 Git에 추가하지 않는다. Spring Boot가 해당 파일을 자동으로 읽는다고 가정하지 않는다.

| 환경변수 | 기본값 | 의미 |
| --- | --- | --- |
| `CAREER_FORM_LANGSMITH_ENABLED` | `false` | 추적 활성화 |
| `LANGSMITH_API_KEY` | 없음 | LangSmith API 키 |
| `LANGSMITH_ENDPOINT` | `https://api.smith.langchain.com` | 사용하는 지역의 LangSmith API 주소 |
| `LANGSMITH_PROJECT` | `career-form` | 실행 기록을 저장할 프로젝트 |
| `CAREER_FORM_LANGSMITH_TIMEOUT_MS` | `1000` | 추적 HTTP 제한 시간. 최대 2000ms |
| `CAREER_FORM_LANGSMITH_CAPACITY` | `64` | 진행 중인 추적과 대기·전송 중인 기록의 총 수 제한 |

기존 `OPENAI_API_KEY`, `TYPESAFE_API_KEY`와 공급자 활성화·개인정보 정책 확인 설정은 그대로 사용한다. 관측용 API 키와 모델 API 키는 다른 자격증명이다. 프로젝트 접근 권한과 보존 기간은 사람이 확인한다.

## 기록 경계

- 호출 이름은 `provider.stage`이다. 예: `jev.interaction`, `openai.FIELD`.
- 요청 식별자는 백엔드가 생성한 `request_id`이다. 같은 HTTP 요청 안의 호출을 연결한다. 브라우저의 전체 자동 기입 실행을 여러 HTTP 요청에 걸쳐 연결하는 식별자는 아니다.
- 원문 브라우저 식별자 대신 호출 내부 별칭을 사용한다. 개인정보·계정·세션·시크릿, HTTP 헤더, 예외 메시지와 잘못된 응답 원문은 저장하지 않는다.
- 요청 지시문, 유한한 의미 단서와 구조, 지원하는 구조화 응답만 허용 목록에 따라 투영한다. 알 수 없는 입력은 상세 본문 없이 기록한다.
- 토큰 사용량은 `outputs.usage_metadata`에 공급자가 제공한 수치만 기록한다. 없는 값을 0이나 추정 합계로 채우지 않는다.
- Jev의 공급자 선택과 신뢰도 임계값 적용 결과는 구분한다. 클라이언트 선택을 후속 의미 검증까지 통과한 최종 DOM 입력 성공으로 해석하지 않는다.

## 전송과 장애

완료된 호출을 한 번 전송한다. 전송은 단일 백그라운드 작업자에서 수행하며 SDK 자동 배치와 재시도는 사용하지 않는다. 추적 서비스에 장애가 있어도 모델 응답이나 기존 공급자 제한 시간을 바꾸지 않는다.

용량을 초과하거나 크기·깊이 제한을 초과한 추적은 버린다. 종료 시 신규 추적을 받지 않고 대기 작업을 취소한다. 전송은 최선 노력 방식이므로 장애·과부하·종료 중 기록 일부가 유실될 수 있다. 로그의 `LANGSMITH_DROPPED`는 유한한 실패 분류만 포함하며 응답 원문이나 인증 정보를 포함하지 않는다.

## 조회와 실서비스 검증

1. LangSmith에서 `LANGSMITH_PROJECT`와 같은 프로젝트를 연다.
2. 공급자와 단계별 호출 이름으로 필터링한다.
3. 상세 화면의 Inputs/Outputs와 metadata에서 모델, 소요 시간, 실제 제공된 사용량과 `request_id`를 확인한다.
4. 합성 지원서 구조로 Jev·OpenAI를 각각 호출하고 호출 식별자로 요청과 결과를 대응한다. 실제 지원자 값으로 시험하지 않는다.
5. 낮은 신뢰도와 오류 사례에서 Jev 원본 판단·클라이언트 판단 및 실패 분류를 확인한다.
6. 추적 비활성화와 관측 서버 장애 시에도 기존 분석 결과가 유지되는지 로컬 HTTP 수신기 회귀 테스트로 확인한다.

로컬 수신기 테스트는 SDK 직렬화와 실패 격리를 검증한다. 실제 공급자 호출과 LangSmith UI 확인을 대신하지 않는다. 실서비스 설정이 준비되지 않았으면 해당 검증은 미완료로 기록한다.

## SDK 계약과 결정 근거

`com.langchain.smith:langsmith-java:0.1.0-beta.23`을 사용한다. 완료된 run에는 `trace_id`와 시간·run ID를 결합한 `dotted_order`를 함께 넣는다. 이 필드가 없으면 실서비스가 HTTP 400으로 거부한다. SDK 자동 배치는 사용하지 않으며 종료 시 소유 HTTP transport를 직접 닫아 SDK close의 불필요한 배치 초기화와 서버 정보 조회를 피한다.

- [승인된 공급자 독립 추적 ADR](adr/138-langsmith-provider-tracing.md)
- [공식 LangSmith Java SDK](https://github.com/langchain-ai/langsmith-java)
- [토큰과 사용자 정의 LLM 추적 형식](https://docs.langchain.com/langsmith/log-llm-trace)

## CF-138 검증 범위

실제 SDK의 로컬 HTTP 수신기로 직렬화, 식별자 연결, 용량 제한, 장애와 종료를 검증했다. 합성 구조로 실제 Jev·OpenAI를 호출하고 LangSmith UI에서 입력·출력·사용량을 확인했다. 실제 지원자 값은 사용하지 않았으며 회사별 지원서 전체 동작이나 운영 배포를 검증한 것은 아니다.
