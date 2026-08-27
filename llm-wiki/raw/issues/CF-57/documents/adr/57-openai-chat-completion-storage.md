# OpenAI Chat Completion 응답 저장

## 상태

승인됨

## 날짜

2026-08-27

## 관련 Issue

- #57

## 배경

지원서 분석의 OpenAI 호출은 Spring AI 2.0의 Chat Completions 경로를 사용한다. 기존에는 공통 `application.yml`과 `OpenAiClient`의 요청별 옵션이 모두 `store=false`여서 저장된 completion을 조회할 수 없었다.

Spring AI의 요청별 `OpenAiChatOptions`는 공통 chat 설정을 덮어쓸 수 있다. 따라서 YAML 값만 `true`로 바꾸면 요청별 `false`가 계속 적용될 수 있다. `ChatResponse`는 Spring AI 내부 응답 표현일 뿐 OpenAI Platform 저장 여부를 정하지 않으며, Responses API 전환은 이 Issue의 범위를 벗어난다.

저장 활성화로 시스템 지시문, 비식별 candidate 구조와 구조화된 모델 output이 외부에 보관될 수 있다. 실제 프로필 값, HTML, URL 상세, 계정·세션·인증 정보와 실행 정보는 기존 payload 경계에서 계속 제외해야 한다.

## 검토한 대안

- `store=false`를 유지한다: 외부 보관 위험은 줄지만 저장된 completion을 조회할 수 없다.
- 공통 YAML만 `store=true`로 바꾼다: 요청별 옵션이 기본값을 덮어쓰면 실제 호출은 저장되지 않을 수 있다.
- 공통 YAML과 요청별 옵션을 모두 `store=true`로 둔다: 모든 runtime profile에 일관된 저장 기본값을 제공하면서 기존 structured output 변환을 유지한다.
- Responses API 또는 `ChatResponse`로 전환한다: API와 응답 형식 전환의 검증 범위가 커져 단순 저장 정책 변경과 분리한다.

## 결정

`ChatClient` 및 Chat Completions 호출 흐름은 유지한다. 공통 `application.yml`의 `spring.ai.openai.chat.store`와 `OpenAiClient`의 요청별 `OpenAiChatOptions.store`를 모두 `true`로 둔다. `local`, `development`, `staging`, `production` profile overlay는 이 공통값을 덮어쓰지 않는다.

`ChatResponse` 또는 Responses API로의 전환은 수행하지 않는다. 저장 활성화에도 기존의 비식별 payload 경계와 실제 API key를 사용하지 않는 자동 테스트 원칙을 유지한다.

## 결과

네 runtime profile에서 생성되는 Chat Completions는 저장을 요청한다. OpenAI Platform에서 저장된 completion의 확인은 사람이 비식별 합성 snapshot으로 수행한다. 응답 보관 범위에는 시스템 지시문, 비식별 candidate 구조와 구조화된 output이 포함될 수 있으므로 실제 지원자 값과 인증·세션 정보는 계속 보내지 않는다.
