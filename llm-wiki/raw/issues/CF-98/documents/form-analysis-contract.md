# CF-98 범용 분석과 공급자 계약

> 근거: [Issue #98](https://github.com/woowacourse-teams/2026-career-form/issues/98), CF-98 구현 및 비식별 검증 기록. 이 문서는 당시 구현 계약과 미검증 범위를 함께 고정한다.

## 정적 정책과 공급자 선택

정적 정책이 유효하면 그 정책을 우선한다. 명시적으로 미등록된 페이지에만 범용 분석을 적용하며 정책 조회 오류, 구조 불일치, 정적 미지원 필드를 범용 OpenAI/Jev로 보완하지 않는다. FieldMappingResolver, ActionResolver, InteractionDecisionProvider 세 application port에 OpenAI/Jev adapter를 연결한다. `career-form.analysis.enabled/provider`는 하나의 공급자를 선택하며 구 `career-form.llm.enabled` 기본 경로와 충돌 검증을 유지한다. 비활성, 불완전 구성, unknown provider, 공급자 장애는 다른 공급자로 조용히 전환하지 않는다. 공급자 선택은 Frontend의 실행 API와 DOM 안전 경계를 바꾸지 않는다.

## 입력·출력의 비식별 계약

schema v2의 선택적 의미 문맥에는 라벨 출처, 입력 종류, 반복 행 관계 등 제한된 어휘와 길이만 사용한다. 실제 프로필 값, 현재 양식 입력값, 원문 HTML, 세션 URL, 계정 정보와 실행 selector는 모델 요청이나 저장 문서에 넣지 않는다. 모델은 canonical 필드, 허용된 준비 후보, 검색 opener/query/submit의 제한된 역할을 분류하며 임의 실행 명령을 만들지 않는다. 서버는 후보 ID exact-set, canonical/recipe allowlist, 출력 구조와 스냅샷을 검증한다. 중복·미등록 후보와 불일치·장애는 보류/실패 경계로 처리한다. Jev의 typed question과 NoMatch/ABSTAINED, 응답 ID 대응도 같은 공통 계약을 따른다.

## 로컬 실행과 한계

프로필 값 결합, 사용자 승인, 기존 값 충돌, 반복 행의 유일 연결과 필요한 추가 횟수, DOM 재수집, native/custom 선택, 조건부 필드, 입력 후 실제 제어 상태의 확인은 Frontend의 로컬 책임이다. 모델 분석이나 API 200, UI의 성공 집계만으로 실제 입력 성공을 인정하지 않는다. 모호한 대상과 stale 제어는 쓰지 않고 이유를 남긴다.

자동화 테스트의 통과는 공급자별 외부 API 연결과 실제 사이트의 기입 성공을 대체하지 않는다. CF-98의 Jev 실호출, 실제 전송·보관·학습·retention 정책, Greeting 작성 화면과 일부 고급 제어는 이 기록 시점에 미검증이다. API 키는 사람이 준비하며 이 지식 묶음에는 키 값이나 실제 지원 정보가 없다.

## 결정 문맥

같은 Issue의 [제안 ADR 전문](adr/98-generic-classification-and-execution-boundary.md)에 대안, 역할 경계와 미완료 조건을 원문대로 보존한다. ADR 상태는 원문처럼 `제안됨`이며, 이 문서가 임의로 이를 확정 상태로 변경하지 않는다.
