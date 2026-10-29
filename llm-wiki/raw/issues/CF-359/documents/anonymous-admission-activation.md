# 익명 설치 자격의 환경별 활성화와 API 이용 절차

작성 기준: CF-359, 코드 0861dd1. 이 문서는 확정 요청된 환경 정책과 운영 절차 초안이다. 배포 설정 연결과 실제 환경 활성화를 완료했다는 기록이 아니다.

## 목표 환경 정책

| 서비스 환경 | GitHub Environment | 서버 enabled | registration-enabled | 확장 VITE_AI_ADMISSION_ENABLED |
|---|---|---|---|---|
| dev | development | false | false | false |
| staging | staging | true | true | true |
| prod | production | true | true | true |

dev는 이번 설치 자격 검사와 AI 호출 제한을 적용하지 않는다. 기존의 다른 제한이나 검증까지 제거하지 않는다. staging과 prod는 전환 검증 후 활성화하는 최종 목표다. 등록 API만 선행 제공하는 동안은 registration-enabled=true, enabled=false다.

## 현재 구현과 남은 저장소 작업

서버는 career-form.admission.enabled와 registration-enabled를 읽는다. 확장은 빌드 시 VITE_AI_ADMISSION_ENABLED를 읽는다. 기본값은 비활성이며 현재 배포 워크플로우와 Compose에 이 설정의 전달 경로가 없다. GitHub에 값만 등록해도 자동 적용되는 상태는 아니다.

다음 연결은 아직 구현하지 않았다.

1. backend/src/main/resources/application.yml의 기존 career-form 아래에 admission 설정을 추가하고 환경 변수와 명시적으로 연결한다.
2. 개발, 스테이징, 운영 배포 워크플로우에서 환경별 변수를 전달한다. dev의 두 활성화 값은 false로 유지한다.
3. infra/compose.deploy.yaml에서 해당 값을 백엔드 컨테이너로 전달한다.
4. 확장 빌드에 환경별 API 주소와 활성화 플래그를 전달한다. 서버 설정이 확장 빌드 플래그를 자동으로 바꾸지는 않는다.

환경 변수와 Spring 속성의 제안 연결은 다음과 같다. 새 전달 경로이며 적용 완료한 사실로 해석하지 않는다.

| 환경 변수 | Spring 속성 |
|---|---|
| CAREER_FORM_ADMISSION_ENABLED | career-form.admission.enabled |
| CAREER_FORM_ADMISSION_REGISTRATION_ENABLED | career-form.admission.registration-enabled |
| CAREER_FORM_ADMISSION_TRUSTED_PROXIES | career-form.admission.trusted-proxies |
| CAREER_FORM_ADMISSION_ENCRYPTION_KEY | career-form.admission.encryption-key |

배포 설정은 Infra 변경이다. 저장소가 요구하는 별도 Issue 계약과 보호 영역 규칙을 확인하고 구현한다. 이 문서 작성으로 워크플로우, 인프라 또는 운영 설정을 변경하지 않는다.

## 사람이 입력하거나 확인할 것

GitHub 저장소 Settings > Environments에서 development, staging, production을 구분한다.

- development: enabled와 registration-enabled를 false로 유지한다. 활성화를 위한 암호화 키는 필요하지 않다.
- staging과 production Variables: 위 활성화 값과 신뢰 프록시의 실제 원격 IP 목록을 등록한다. 최초 전환에서는 enabled를 false로 둔다.
- staging과 production Secrets: CAREER_FORM_ADMISSION_ENCRYPTION_KEY를 등록한다. 32바이트 무작위 값을 Base64로 표현한 값이다. 사람이 로컬에서 openssl rand -base64 32로 생성할 수 있다. 실제 값은 문서, 대화나 로그에 넣지 않는다.
- staging과 production은 별도 키와 분리된 데이터 저장 환경을 사용한다. 실제 DB 분리는 배포 담당자가 확인한다. 같은 환경의 여러 서버는 같은 키를 사용하고 배포마다 새로 생성하지 않는다. 키 교체는 등록 결과 재전달과 IP 및 등록 키의 HMAC에 영향을 주므로 별도 절차 없이 바꾸지 않는다.
- HTTPS 종단 프록시가 X-Real-IP와 X-Forwarded-Proto를 덮어쓰는지, 백엔드가 직접 외부에 노출되지 않는지 확인한다. trusted-proxies는 도메인이나 사용자 IP가 아니라 앱이 보는 실제 프록시 원격 주소다. 현재 서버에서 충족한 것으로 확인하지 않았다.
- 환경별 확장을 빌드하고 배포 또는 테스트용으로 설치한다. staging과 prod 자격은 환경을 넘어 재사용하지 않는다.

## 활성화 순서

staging에서 먼저 검증하고 같은 절차를 prod에 적용한다. dev는 비활성을 유지한다.

1. 위 저장소 설정 전달 경로를 구현하고 검증한다.
2. 사람이 해당 환경의 키와 프록시 값을 제공한다. registration-enabled=true, enabled=false로 서버를 배포한다.
3. HTTPS 등록 API가 자격을 발급하는지 확인한다.
4. 해당 환경의 HTTPS API 주소와 VITE_AI_ADMISSION_ENABLED=true로 빌드한 확장을 배포한다. 자격 발급과 저장 및 재사용을 확인한다.
5. 정상 사용자 전환을 확인한 뒤 enabled=true로 서버를 다시 배포한다. 값 수정만으로 이미 실행 중인 컨테이너 설정이 갱신되지는 않는다.
6. 아래 인증 거절 요청과 정상 분석, 한도 안내를 확인해 시각과 코드 버전 및 비식별 응답을 기록한다.

확장의 자격 저장 키는 현재 analysisInstallation 하나이며 서버 주소별로 나뉘어 있지 않다. 같은 확장 설치의 API 주소를 staging에서 prod로 바꿔도 자격이 자동 교체되지 않는다. 환경별 테스트는 별도 브라우저 프로필을 사용한다. 기존 프로필 전체 초기화는 민감한 로컬 지원 정보를 잃을 수 있으므로 전환 방법으로 사용하지 않는다.

## 토큰 발급과 분석 요청

확장 설치 시점이 아니라 첫 분석 요청 직전에 발급한다. 로컬에 자격이 있으면 재사용한다. 없으면 임시 등록 키를 로컬에 먼저 저장하고 POST /api/v1/analysis-installations로 요청한다. 서버는 installationId와 token을 반환한다. 토큰에는 정기 만료가 없으며 서버 폐기 상태를 확인한다. 등록 결과 재전달의 10분은 토큰 만료가 아니다.

분석 API를 직접 테스트할 때도 해당 환경의 HTTPS 등록 API에 임의 생성 UUID를 key로 보내고 응답 자격을 사용한다. 등록 재시도에는 같은 key를 사용한다. 등록 API 자체에는 아직 발급받지 않은 설치 자격을 요구하지 않으며 신뢰 프록시, HTTPS와 발급 제한을 검사한다.

분석 요청에는 X-Career-Form-Installation: <installationId> 및 Authorization: Bearer <token> 헤더를 보낸다. UUID만으로는 인증되지 않는다. 쿠키 로그인은 요구하지 않는다.

## UUID와 토큰을 요구하는 API

아래는 모두 POST이며 서버 enabled=true일 때 공통 경계에서 검사한다.

| 작업 | API |
|---|---|
| 준비 분석 | /api/v1/preparation/analyze |
| 필드 분석 | /api/v1/fields/analyze |
| 범용 섹션 분류 | /api/v1/generic/sections/classify |
| 범용 필드 분석 | /api/v1/generic/fields/analyze |
| 범용 상호작용 판단 | /api/v1/generic/interaction-decisions |

정상 프록시 및 HTTPS 조건을 만족한 요청에서 자격 누락, 잘못된 조합, 미등록 또는 폐기 자격은 401 INVALID_INSTALLATION으로 거절한다. 프록시나 HTTPS 조건이 먼저 실패하면 403이 발생할 수 있다. 올바른 자격도 요청 본문 오류나 이용량 제한으로 거절될 수 있으므로 인증 성공이 무조건 HTTP 200을 뜻하지 않는다.

분석 API 자격 검사와 AI 이용량 차감은 별개다. 정책만으로 처리한 경로는 자격을 검사해도 AI 이용량을 차감하지 않는다. 알림의 기존 구독 검증, 로컬 프로필 편집과 브라우저의 실제 필드 입력은 이번 분석 자격 검사에 연결하지 않는다.

## 검증하고 남길 기록

| 대상 | 확인 내용 |
|---|---|
| dev | 유효한 분석 본문을 자격 없이 전송해 기존 처리 유지 확인 |
| staging과 prod | A UUID + A 토큰으로 정상 분석 확인 |
| staging과 prod | 자격 누락, UUID만 전달, A UUID + B 토큰 및 B UUID + A 토큰의 401 확인 |
| staging과 prod | 등록 실패와 자격 저장 실패가 분석 요청으로 이어지지 않는지 확인 |
| 확장 | 브라우저 재시작 후 자격 재사용, 다중 탭 초기 등록 경합 확인 |
| 전환 | 구버전 확장의 자격 없는 분석이 활성화 뒤 거절됨을 확인 |

실행 일시, 환경, 배포 커밋과 확장 빌드 버전, 테스트 구분, HTTP 상태와 비식별 결과를 기록한다. 실제 토큰과 인증 헤더 원문은 기록하지 않는다. Actions 성공은 배포 성공의 근거이며 활성화 자체는 정상 및 거절 요청으로 확인한다. 현재 위 운영 검증 결과는 미수집이다.

## 코드 근거

- backend/src/main/java/com/careerform/admission/AdmissionAvailableCondition.java
- backend/src/main/java/com/careerform/admission/AdmissionConfiguration.java
- backend/src/main/java/com/careerform/admission/AdmissionFilter.java
- backend/src/main/java/com/careerform/admission/InstallController.java
- backend/src/main/java/com/careerform/admission/InstallService.java
- backend/src/main/java/com/careerform/admission/TrustedClientAddress.java
- frontend/entrypoints/background.ts
- frontend/src/autofill/api/installation-client.ts
- frontend/src/autofill/api/background-handler.ts
- .github/workflows/deploy-development.yml, deploy-staging.yml, deploy-production.yml
- infra/compose.deploy.yaml
