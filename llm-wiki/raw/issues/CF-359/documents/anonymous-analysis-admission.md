# 익명 설치 자격과 AI 호출 승인 및 정산

- Issue: #359
- Source-Revision: ec983c749ee312b182eea0e06ab716858123f6f2
- 상태: 구현과 로컬 자동 검증 완료. 기능 기본 비활성, 운영 배포와 실제 사용자 성과 미확인.

## 장기 결정

[비회원 설치 자격과 AI 호출 승인 및 정산 분리 ADR](adr/359-anonymous-install-ai-admission.md)은 계정 도입과 클라이언트 UUID만 신뢰하는 대안을 제외한 이유, 성공 이용량과 서버 보호용 승인의 분리 및 한계를 기록한다.

## 등록 자격과 재전달의 수명

등록 완료 결과 재전달은 10분, 완료 키 기록은 24시간이며 활성 API 토큰의 정기 만료와 별개다. 통계 ID와 Push 구독은 분석 자격과 분리한다. 등록 API 선행 제공과 분석 자격 강제는 별도 활성화 단계이고 TLS, 명시적 신뢰 프록시와 서버 암호화 키를 전제로 한다. 현재 코드는 기본 비활성이며 운영 적용을 확인한 것은 아니다.

구현 근거는 `InstallService.register`, `InstallService.authenticate`, `MongoInstallStore.clearRecoveryCopies`, `AdmissionAvailableCondition`, `AdmissionConfiguration` 및 `frontend/src/autofill/api/installation-client.ts`다. 운영 전환 절차는 `backend/docs/359-anonymous-admission.md`에 있다.

## 정산과 검증의 경계

사용자 이용량은 JSON 형식뿐 아니라 해당 분석 API의 snapshot과 후보 관계 검증까지 통과한 뒤 확정한다. 실제 MongoDB 조건부 갱신에서 동시 예약, 중복 반환, 미정산 예약 반환 및 쓰기 적용 후 응답 유실을 검증했다. 순차 합성 비교는 차감 단위와 보호 동작의 근거이며 실제 사용자 완료율, 운영 지연, 청구 비용이나 동시 수용량의 증거가 아니다.

실행 경계는 `AiAdmission.logical`, `AiAdmission.validatedResults`, `AiAdmission.transmit`이다. `UsageBucket`의 상태 변경과 이용량은 `MongoUsageStore.change`의 revision 조건부 변경으로 반영한다. DB 변경과 외부 HTTP 전송의 일괄 원자성을 주장하지 않는다.

실제 MongoDB 검증 근거는 `MongoAdmissionTest`의 동시 마지막 한도 승인, 등록 경합, 다른 인스턴스의 기한 초과 반환, 적용 후 쓰기 응답 유실 테스트다. `SemanticSettlementTest`는 형식상 유효하지만 snapshot이 다른 결과를 사용자 이용량에서 차감하지 않는 것을 검증한다. `JevAdmissionTest`, `OpenAiAdmissionTest`, `ExecutionGateTest`는 공급자 호출 경계와 공통 실행 제어를 검증한다.

`AdmissionComparisonTest`와 `backend/docs/359-admission-comparison.json`은 동일 합성 시나리오의 원자료와 조건을 제공한다. 실제 외부 AI, 실제 사용자 요청 분포, 운영 P99, 청구 비용과 대규모 동시 수용량은 이 실험으로 확인하지 않았다. 합성 비율을 운영 개선 수치로 전환하지 않는다.
