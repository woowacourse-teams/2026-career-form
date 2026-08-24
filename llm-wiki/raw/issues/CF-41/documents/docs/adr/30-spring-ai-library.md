# Spring AI 기반의 공급자 중립 LLM 연동

## 상태

승인됨

## 날짜

2026-08-20

## 관련 Issue

- #30

## 배경

백엔드는 Java 21과 Spring Boot 4.1.0을 사용한다. 제품의 LLM 매핑은 실제 지원서 값이
아니라 비식별 데이터만 다뤄야 한다. 첫 공급자는 OpenAI 또는 Gemini 중 후속 작업에서
선택하며, 장기적으로는 Ollama 같은 로컬 모델도 별도 추론 서비스로 연결할 수 있어야
한다.

사전 spike에서 Spring AI와 LangChain4j 모두 샘플 컴파일과 OpenAI/Gemini 교체 가능성을
확인했다. 그러나 표본이 1회이고 실행 로그와 자동 단언이 보존되지 않았으며 구조화 출력
조건도 같지 않았다. 특히 LangChain4j의 OpenAI 실험은 네이티브 strict JSON Schema를
사용했지만 Gemini Boot4 starter 실험은 같은 보장을 설정만으로 활성화하지 못했다.
그러므로 spike는 가능성과 통합 마찰을 찾은 탐색 근거로만 사용하고 성공률이나 변경 줄
수를 비교 지표로 사용하지 않는다.

## 버전 선정 근거

- [Spring AI 공식 Getting Started](https://docs.spring.io/spring-ai/reference/getting-started.html)는
  Spring AI 2.0.x가 Spring Boot 4.0.x와 4.1.x를 지원한다고 명시한다. 또한 릴리스
  artifact는 Maven Central에서 제공하며, 의존성 관리 예시에서
  `spring-ai-bom:2.0.0`을 사용한다.
- [Spring AI 2.0.0 GA 발표](https://spring.io/blog/2026/06/12/spring-ai-2-0-0-GA-available-now/)는
  2.0.0이 GA로 출시되어 Maven Central에 배포됐고 Spring Boot 4.0/4.1 및 Spring
  Framework 7.0을 기준으로 설계됐다고 설명한다.
- 따라서 Spring Boot 4.1.0을 사용하는 이 프로젝트는 공식 호환 계열의 GA 버전인
  2.0.0을 선택한다. milestone, release candidate, snapshot은 기반 의존성으로 사용하지
  않는다.

## 검토한 대안

1. Spring AI 2.0.0
   - Spring Boot 4.0/4.1을 정식 지원하고 안정 버전으로 제공된다.
   - `ChatModel`과 `ChatClient`를 중심으로 공급자 중립 경계를 둘 수 있다.
   - OpenAI, Google Gemini, Ollama 연동을 같은 생태계에서 후속 추가할 수 있다.
2. LangChain4j 1.19.0 및 Boot4 starter 1.19.0-beta29
   - `AiServices`와 구조화 출력 기능이 편리하고 spike에서 공급자 교체를 확인했다.
   - 다만 현재 Boot4 starter가 beta 계열이고 Gemini starter의 구조화 출력 설정 노출이
     OpenAI starter와 비대칭이었다.
3. 공급자 공식 SDK 직접 사용
   - 공급자 고유 기능을 가장 빠르게 사용할 수 있다.
   - 공통 오류·설정·관측 경계를 직접 설계해야 하고 공급자 교체 비용이 커진다.

## 결정

- Spring AI 2.0.0 BOM과 공급자 중립 `spring-ai-client-chat`을 LLM 연동 기반으로 사용한다.
- 이 Issue에서는 공급자별 starter와 API 키·모델·base URL 같은 런타임 설정을 추가하지
  않는다.
- 후속 애플리케이션 코드는 Spring AI의 공통 `ChatModel`/`ChatClient` 경계에 의존한다.
  공급자 고유 기능이 필요하면 경계 밖 adapter로 격리한다.
- OpenAI 또는 Gemini 선택, 구조화 출력 보장, timeout/retry, 설정 검증은 실제 매핑
  구현의 후속 Issue에서 결정한다.
- 로컬 LLM은 JVM 프로세스에 내장하지 않고 Ollama 같은 별도 추론 서비스의 API로
  연결한다.

## 결과

- Spring Boot 생태계와 버전 정렬된 공통 LLM 추상화를 얻는다.
- 공급자 미선택 상태에서는 실제 LLM bean이나 외부 호출이 생기지 않는다.
- 공급자 고유 기능은 공통 추상화만으로 충분하지 않을 수 있으며 adapter와 별도 검증이
  필요하다.
- Spring AI 업그레이드와 공급자 starter 도입 시 호환성, 구조화 출력, 오류 모델을 다시
  검증해야 한다.
- 런타임 설정 테스트는 공급자 starter를 도입하는 후속 Issue에서 추가한다.
