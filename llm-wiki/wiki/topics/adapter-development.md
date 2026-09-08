# 회사 어댑터 개발

> Topic: adapter-development
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-46/documents/adapter-development.md)
> History: [근거 1](../../raw/issues/CF-41/documents/indexes/location-dependent-policies.md); [근거 2](../../raw/issues/CF-46/documents/adapter-development.md)
> Updated: 2026-09-08

## 현재 상태

백엔드는 의미 매핑과 허용 명령을, 프론트 회사 어댑터는 DOM 수집·조건부 처리·특수 입력을 소유한다. 공통 프론트의 승인·로컬 값 결합·실행 검사는 유지한다. 구조를 검증할 수 없으면 추정하지 않는다. 기존 schemaVersion 2 클라이언트 응답은 유지하며, SK 주소 검색의 새 명령은 preparation API에서 지원을 명시한 클라이언트에만 반환한다.

## 변경 이유

현대·SK 프론트 분리 결과와 LG 검색의 후속 설계 경계를 승인된 CF-46 근거로 기록했다.
