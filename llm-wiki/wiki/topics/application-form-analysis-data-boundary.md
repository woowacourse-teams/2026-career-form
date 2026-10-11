# 지원서 분석 데이터 경계

> Topic: application-form-analysis-data-boundary
> Status: Current
> Current: [CF-181 공급자 양식 원문 전송](../../raw/issues/CF-181/documents/adr/181-provider-form-text-raw-transmission.md)
> History: [근거 1](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md), [근거 2](../../raw/issues/CF-40/documents/adr/40-generic-form-analysis-resolver-boundary.md), [근거 3](../../raw/issues/CF-57/documents/adr/57-openai-chat-completion-storage.md), [근거 4](../../raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md), [근거 5](../../raw/issues/CF-98/documents/form-analysis-contract.md), [근거 6](../../raw/issues/CF-181/documents/adr/181-provider-form-text-raw-transmission.md)
> Updated: 2026-10-11

## 현재 상태

BE는 유효한 정적 정책을 우선하고 명시적 미등록일 때만 FieldMappingResolver, ActionResolver, InteractionDecisionProvider의 세 port 뒤에서 선택된 OpenAI/Jev 범용 공급자를 사용한다. 정책 오류·구조 불일치·정적 미지원·공급자 장애를 묵시 fallback으로 숨기지 않는다. 서버는 의미 매핑, 허용된 역할·candidate·canonical/recipe·snapshot 검증과 안전한 응답 조립을 담당한다. FE는 실제 프로필 결합, 승인, 반복 행 유일성, DOM 재검증, 원본 제어 실행과 결과 확인을 담당한다.

공급자에 전달하는 schema v2 입력은 CF-181부터 섹션명, 후보 라벨, placeholder, 선택지와 FE가 보낸 의미 문맥 라벨을 NFKC 정규화·제어/서식 문자 제거 뒤 이메일, URL, 전화번호, 주민등록번호 형식, 6자리 이상 숫자를 토큰으로 가리고 120 code point로 자른 원문으로 보낸다. `element=custom` 라벨은 현재 선택값이 섞일 수 있어 사전 정제를 유지한다. FE가 이미 사전으로 거른 `semanticContext.labels`는 BE에서 복구할 수 없다. 사전은 주소·미지원 활동 충돌 가드와 LangSmith trace 판정에만 쓰며 trace는 사전 밖 원문을 `UNRECOGNIZED_TEXT`로 남긴다. OpenAI 입력은 초기 512 KiB 상한을 넘으면 호출하지 않으며 상한은 `inputBytes` 실측으로 조정한다. 이름처럼 패턴 밖 개인화 문구는 OpenAI(`store=true`)로 전송될 수 있는 남은 위험이고 FE 프로필 값 대조 마스킹은 후속 작업이다.

실제 프로필 값, 현재 양식 값, 원문 HTML, 계정·세션·URL 상세, 실행 selector는 계속 제외한다. Jev가 OpenAI와 같은 보관 정책을 갖는다고 가정하지 않으며, Jev 실전송·보관·학습·retention 정책과 실제 외부 호출은 미검증이다.

## 변경 이유

CF-181은 닫힌 사전 치환이 사전 밖 라벨을 버리고 부분 문자열로 의미를 뒤집는 문제를 해결하려고 길이 제한·패턴 마스킹 원문 전송으로 바꿨다. 기존 두 port/OpenAI 전용 시점의 파일 개수·77-key 서술은 역사적 구현 스냅샷이다. CF-98은 공급자별 기능을 공통 port 계약으로 옮기고 검색 역할 분류를 추가하면서도 개인정보와 브라우저 실행 소유권을 유지한다. [CF-98 raw](../../raw/issues/CF-98/documents/form-analysis-contract.md)에는 제안 ADR 및 미완료 검증 범위를 함께 연결한다.
