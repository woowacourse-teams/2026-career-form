# 지원서 분석 데이터 경계

> Topic: application-form-analysis-data-boundary
> Status: Current
> Current: [CF-98 범용 분석과 공급자 계약](../../raw/issues/CF-98/documents/form-analysis-contract.md)
> History: [근거 1](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md), [근거 2](../../raw/issues/CF-40/documents/adr/40-generic-form-analysis-resolver-boundary.md), [근거 3](../../raw/issues/CF-57/documents/adr/57-openai-chat-completion-storage.md), [근거 4](../../raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md), [근거 5](../../raw/issues/CF-98/documents/form-analysis-contract.md)
> Updated: 2026-09-23

## 현재 상태

BE는 유효한 정적 정책을 우선하고 명시적 미등록일 때만 FieldMappingResolver, ActionResolver, InteractionDecisionProvider의 세 port 뒤에서 선택된 OpenAI/Jev 범용 공급자를 사용한다. 정책 오류·구조 불일치·정적 미지원·공급자 장애를 묵시 fallback으로 숨기지 않는다. 서버는 의미 매핑, 허용된 역할·candidate·canonical/recipe·snapshot 검증과 안전한 응답 조립을 담당한다. FE는 실제 프로필 결합, 승인, 반복 행 유일성, DOM 재검증, 원본 제어 실행과 결과 확인을 담당한다.

공급자에 전달하는 schema v2 의미 문맥은 제한된 라벨 출처, 입력 종류, 반복 관계 등 비식별 구조로만 구성한다. 실제 프로필 값, 현재 양식 값, 원문 HTML, 계정·세션·URL 상세, 실행 selector는 제외한다. OpenAI의 기존 저장 설정은 별도 과거 근거의 범위로 남지만 Jev가 같은 보관 정책을 갖는다고 가정하지 않는다. Jev 실전송·보관·학습·retention 정책과 실제 외부 호출은 CF-98 기록 시점에 미검증이다.

## 변경 이유

기존 두 port/OpenAI 전용 시점의 파일 개수·77-key 서술은 역사적 구현 스냅샷이다. CF-98은 공급자별 기능을 공통 port 계약으로 옮기고 검색 역할 분류를 추가하면서도 개인정보와 브라우저 실행 소유권을 유지한다. [CF-98 raw](../../raw/issues/CF-98/documents/form-analysis-contract.md)에는 제안 ADR 및 미완료 검증 범위를 함께 연결한다.
