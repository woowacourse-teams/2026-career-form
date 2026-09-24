# OpenAI 분석 예산과 안전 진단

CF-102는 범용 준비·필드 분석의 강제 8초 제한을 없애고 실행 설정으로 제어한다. `CAREER_FORM_LLM_TIMEOUT`의 기본값은 `30s`이며, 명시된 `spring.ai.openai.timeout`이 우선한다. 선택된 OpenAI 분석의 유효 범위는 `0 < timeout < 60s`이고 잘못된 값은 원인값을 노출하지 않은 채 시작 시 거부한다. 검색 상호작용 결정은 별도 8초와 재시도 0을 유지한다. 출력 토큰 기본 한도는 8192로 유지하며 근거 없이 늘리지 않는다.

Spring AI 2.0의 `OpenAiChatModel`은 고정 SDK 클라이언트를 호출하므로 요청 `OpenAiChatOptions`의 timeout/maxRetries만 바꿔도 실제 전송 시간 제한과 재시도 정책은 바뀌지 않는다. 상호작용은 연결 및 chat 속성을 복사한 별도 OpenAI SDK 모델/`interactionChatClient`에 timeout 8초와 maxRetries 0을 구성해 전송 계층에 적용한다. 준비·필드 분석은 실행 설정으로 구성된 기본 모델을 쓴다. 별도 Bean이 누락되면 조용히 분석 모델로 돌아가지 않고 구성 실패로 처리한다.

OpenAI 응답의 구조화된 `length` 종료는 JSON 파싱 전에 실패로 처리한다. 직접 또는 중첩된 timeout, 연결·네트워크 실패, 스키마 오류, 응답 형식·역직렬화 오류와 미확인 오류를 구분한다. SDK의 `OpenAIInvalidDataException`만으로 토큰 부족을 추정하지 않는다. 로그에는 단계, 응답 타입, 경과 시간, 예외 타입, 안전한 진단 코드와 허용 목록의 종료 사유, SDK가 제공한 숫자 토큰 사용량만 남긴다. 프롬프트·응답 원문을 출력할 수 있는 SDK/모델 로깅 경로는 배제한다. 실패는 기존 안전한 부분 실패 계약으로 전달한다.

검증 범위: WSL/JDK21에서 관련 기존 테스트, backend `clean check`, `bootJar`, 하네스 검증 및 `git diff --check`가 구현 커밋 기준 통과했다. 로컬 loopback SDK 테스트는 출력 한도와 JSON schema 전송을 확인한다. CF-102 환경파일이 없어 Docker/health는 차단됐고, 실제 공급자 호출과 CJ 설치 확장 검증은 승인 없이 수행하지 않았다. 따라서 과거 실제 필드 실패의 원인이나 현재 실제 입력 성공을 확정하지 않는다.

근거: [Issue #102](https://github.com/woowacourse-teams/2026-career-form/issues/102), `backend/src/main/java/com/careerform/formanalysis/infrastructure/AnalysisProviderEnvironment.java`, `backend/src/main/java/com/careerform/formanalysis/infrastructure/adapter/openai/OpenAiInteractionChatClientConfiguration.java`, `backend/src/main/java/com/careerform/formanalysis/infrastructure/adapter/openai/OpenAiClient.java`, 관련 테스트 및 `backend/src/main/resources/application.yml` (Source-Revision 참조).
