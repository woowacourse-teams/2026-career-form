# 비회원 설치 자격과 AI 호출 제어

Issue: https://github.com/woowacourse-teams/2026-career-form/issues/359

## 적용 범위

지원 정보는 기존처럼 브라우저 로컬에 남는다. 설치 UUID와 토큰은 실제 사람 인증이 아닌 익명 설치의 API 자격이다. 분석 자격은 통계 ID, 품질 관찰 자격과 Push 구독으로부터 분리한다. 프로필 편집과 알림 구독 흐름을 분석 자격에 연결하지 않는다.

등록 결과의 암호화 사본은 완료 후 10분만 재전달한다. 이 시각은 토큰 만료가 아니다. 활성 토큰은 서버의 revoked 상태가 바뀔 때까지 검증 가능하다. 완료 등록 키는 24시간 뒤 정리하며 그 이후의 영구 멱등성은 보장하지 않는다. 원문 토큰, 키, 등록 키, IP와 지원 정보는 로그나 지표에 남기지 않는다.

## 활성화와 전환

기능은 기본 비활성이다. 코드와 테스트 완료가 운영 활성화를 뜻하지 않는다.

1. 사람이 TLS 종단과 Nginx의 X-Real-IP 및 X-Forwarded-Proto 덮어쓰기를 확인한다. 백엔드 직접 접근을 막고 실제 프록시 원격 주소만 명시적으로 신뢰한다. 사용자 입력 X-Forwarded-For의 첫 값을 신뢰하지 않는다.
2. 사람이 32바이트의 별도 암호화 키를 Base64로 제공한다. 키 생성, 실제 키 조회와 교체 및 배포는 AI의 실행 범위가 아니다. 키는 DB와 분리하고 모든 API 인스턴스에서 일관되게 제공한다.
3. 아래 서버 설정을 준비하고 registration-enabled=true, enabled=false로 등록 API만 먼저 제공한다. 이 전환 단계는 기존 분석을 강제 인증하지 않으며 전체 AI 보호도 활성화하지 않는다. 키 또는 프록시 목록이 없거나 잘못되면 시작을 실패시킨다.
4. VITE_AI_ADMISSION_ENABLED=true를 적용한 확장을 배포하고 설치 등록 성공률을 확인한다. 기존 서버에 등록 API가 없는 상태에서 확장만 먼저 활성화하지 않는다.
5. 사람이 설치 등록, 재시작, 다중 탭과 한도 안내를 확인한 뒤 enabled=true로 자격 강제와 호출 보호를 활성화하고 등록 전용 전환 단계를 끝낸다. 구버전 클라이언트의 인증 없는 분석은 그 시점부터 허용하지 않는다. 운영 rollout의 무중단 호환성은 이 변경만으로 자동 보장하지 않는다.

| 서버 속성 | 초기값 또는 조건 |
|---|---|
| career-form.admission.enabled | false, 활성 시 필수 설정 검증 |
| career-form.admission.registration-enabled | false, true면 등록 API를 먼저 제공하는 배포 전환 단계 |
| career-form.admission.encryption-key | Base64로 표현한 32바이트, 실제 값 기록 금지 |
| career-form.admission.trusted-proxies | 쉼표로 구분한 신뢰 프록시의 리터럴 IP, 필수 |
| career-form.admission.user-hourly | 100 |
| career-form.admission.install-minute | 60 |
| career-form.admission.global-hourly | 10000 |
| career-form.admission.concurrency | 프로세스당 20 |
| career-form.admission.waiting | 프로세스당 100 |
| career-form.admission.install-active | 설치당 공유 진행 중 승인 10 |
| career-form.admission.queue-wait-ms | 5000 |
| career-form.admission.request-timeout-ms | 55000 |
| career-form.admission.reservation-timeout-ms | 120000 |
| career-form.admission.maintenance-ms | 30000 |
| career-form.admission.registration-ten-minutes | 20 |
| career-form.admission.registration-hourly | 100 |

인프라의 환경 변수 이름과 위 속성의 연결은 배포 담당자가 명시적으로 구성한다. 프록시를 포함한 실제 운영 설정을 확인했다고 주장하지 않는다. 로컬 HTTP 개발에서 운영 자격을 사용하지 않으며, 테스트는 MockMvc의 합성 프록시와 별도 로컬 MongoDB로 수행한다.

## 이용량과 보호용 승인

- 사용자 이용량은 서버가 검증한 성공 결과를 시간당 계산한다. 기존 분석 API는 응답 형식뿐 아니라 snapshot과 후보 관계 검증까지 완료한 뒤 예약을 확정한다. 해당 API의 검증이 실패하면 확정 대기 예약을 반환하고 이전 API에서 이미 확정한 이용량은 유지한다. 내부 재시도는 한 예약에 묶고, 토큰 초과 배치 분할의 자식 호출은 별도 예약으로 처리한다.
- 설치별 분당 보호와 전체 시간당 보호는 전송 전에 허용량을 확보한다. 실제 전송 여부가 불명인 경우 유지하며, 확실한 미전송일 때만 반환한다. 보호용 승인 수와 실제 HTTP 전송 시도 관측은 구분한다.
- 모든 외부 AI 전송이 공통 실행 자리를 사용한다. 섹션 요청의 병렬 처리 3개는 유지한다. 기능 활성 시 기존 필드 전용 세마포어는 적용하지 않는다.
- 대기 수와 시간은 제한한다. 내부 백오프 동안 실행 자리는 반환하되 설치별 점유는 유지한다. 외부 호출의 취소가 공급자의 처리 취소나 미과금을 보장하지 않는다.
- 사용자 이용량과 예약 상태는 같은 시간 구간 문서에서 조건부 변경한다. 여러 서버의 중복 정산도 한 번만 적용하며 이전 구간 정산으로 새 구간을 늘리지 않는다.
- 미정산 예약 반환 작업은 AI 요청을 재실행하지 않는다. DB에서 기한이 지난 진행 중 예약을 찾아 해제한다. 전체 서버가 꺼져 있으면 작업도 실행되지 않는다.
- TTL은 완료 기록 정리용이다. 반환 작업의 대체 수단으로 쓰지 않는다. 기록 개수 상한은 반복 실패도 포함하며 문서가 무한히 커지지 않게 한다.

## 검증 실행

Node 24와 Java 21을 사용한다. 로컬 전용 MongoDB의 URI를 ANALYSIS_TEST_MONGO_URI로 제공한다. 테스트 URI는 127.0.0.1의 포트만 허용하며 기존 데이터베이스 대신 매번 별도 cf359_test 접두어의 DB를 사용한다.

```bash
ANALYSIS_TEST_MONGO_URI=mongodb://127.0.0.1:27017 ./backend/gradlew -p backend test --tests 'com.careerform.admission.*'
npm --prefix frontend run test:unit -- src/autofill/api
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test:browser
npm --prefix frontend run coverage
npm --prefix frontend run build
.venv/bin/python harness/scripts/verify.py
```

## 합성 비교 실험의 해석

AdmissionComparisonTest는 실제 로컬 MongoDB의 승인 구현을 호출한다. 정상 시나리오는 12개 작업이며 작업마다 정책 전용 요청 4개, 논리 AI 호출 4개와 내부 재전송 1개를 가정한다. 요청당 횟수 제한은 분당 API 60회, 설계 정책은 초기값을 사용한다. 폭주 시나리오는 별도 설치에서 한 분에 180개 호출을 시도한다.

정책 전용 요청 4개와 재전송 패턴은 실제 제품에서 관측한 분포가 아닌 통제된 합성 조건이다. 동일 입력에서 무제한, API 횟수 제한, 설계 정책을 비교해 차감 단위와 보호 동작을 검증한다. 순차 실행이므로 동시 수용량, 큐 포화 지연이나 실제 사용자 완료율의 증거로 쓰지 않는다.

원자료는 backend/build/reports/admission-comparison.json에 생성된다. elapsed 값은 해당 로컬 실행의 DB 처리와 테스트 오버헤드를 포함하며 외부 AI 응답 시간이나 운영 P99가 아니다. 실험 결과를 이력서의 운영 개선 수치로 그대로 사용하지 않는다.
