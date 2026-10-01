# 지원서 분석 API

> Topic: application-form-analysis-api
> Status: Current
> Current: [CF-98 범용 분석과 공급자 계약](../../raw/issues/CF-98/documents/form-analysis-contract.md)
> History: [근거 1](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md), [근거 2](../../raw/issues/CF-40/documents/api/application-form-analysis-api.md), [근거 3](../../raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md), [근거 4](../../raw/issues/CF-98/documents/form-analysis-contract.md)
> Updated: 2026-09-23

## 현재 상태

schemaVersion 2의 비식별 section snapshot으로 preparation과 fields 분석을 요청한다. CF-98은 별도의 제한된 interaction decision 계약을 더하고, 세 application port에 OpenAI 또는 Jev 중 한 공급자만 연결한다. 정적 정책이 유효한 페이지는 계속 정적 경로를 사용하고 명시적 미등록에서만 범용 분석을 실행한다. 정책 오류·구조 불일치·정적 미지원은 모델로 우회하지 않는다.

입력의 선택적 의미 문맥은 라벨 출처·입력 종류·반복 관계처럼 유한 어휘와 길이로 제한한다. 서버는 candidate ID exact-set, canonical/recipe allowlist, action·interaction의 허용 역할과 snapshot을 검증한다. 모델이 임의 selector, 브라우저 명령 또는 프로필 값을 생성하지 않는다. 공급자 장애·unknown 응답·구성 충돌에는 다른 공급자로 묵시 fallback하지 않는다. 로컬 프로필 결합, 사용자 승인, DOM 실행 및 결과 확인은 Frontend에 남는다.

Jev typed question/Choice의 NoMatch/ABSTAINED와 응답 ID 검증은 구현됐지만 실제 외부 호출과 보관 정책 검증은 아직 완료되지 않았다. 이전 raw에 기록된 77-key·두 port 구조 등은 당시 구현의 역사적 근거이며 현재 계약의 고정된 개수로 사용하지 않는다.

## 변경 이유

CF-61의 안전한 omission/계약 위반 구분을 보존하면서 검색 제어와 공급자 교체를 추가했다. 공급자 분류 성공과 실제 지원서 입력 성공은 분리하고, 미검증 공급자·사이트 범위는 [CF-98 raw](../../raw/issues/CF-98/documents/form-analysis-contract.md)에 명시한다.
