# 범용 폼 컨텍스트 수집

> Topic: generic-form-context
> Status: Current
> Current: [CF-198 범용 폼 컨텍스트 수집 경계와 전후 비교](../../raw/issues/CF-198/documents/generic-form-context.md)
> History: [CF-198 범용 폼 컨텍스트 수집 경계와 전후 비교](../../raw/issues/CF-198/documents/generic-form-context.md)
> Updated: 2026-10-15

## 현재 상태

범용 텍스트 수집은 `resolveDocumentCompany(document)`로 선택하며 기본 수집 어댑터의 식별에 의존하지 않는다. label과 context 옵션이 생략된 경우의 동작과 `semanticText`의 내부 판정을 보존한다. 구조적 행 탐색 결과는 동기 DOM 읽기 단계 안에서만 캐시하고 쓰기나 await를 넘어 재사용하지 않는다.

실사이트 두 곳의 mapping-only 전후 비교(셀당 5회, 호출 20회, 채점 질문 14개)는 전체 59/70에서 52/70, 한 사이트는 0/10에서 6/10, 다른 사이트는 59/60에서 46/60이었다. 잘못된 key와 수집 누락은 0건이다. 결과는 혼합이며 분산이 크므로 개선이 입증된 것이 아니다. 설치된 확장 프로그램 revision은 `UNVERIFIED`이고 범위는 보이는 native control에 한정한다.

후보 개수가 전후 같았으므로 한 사이트의 하락은 수집 누락이 아니라 모델 측 NO_MATCH다.

## 변경 이유

수집 helper를 정책과 컴포넌트 실행이 공유하므로 수집 방식 선택 기준과 캐시 범위를 고정해 이후 변경에서 기존 동작이 달라지지 않게 한다. 전후 비교는 개선 주장이 아니라 수집 누락과 모델 측 변동을 구분하기 위한 근거로만 기록한다.

## 관련 주제

- [범용 자동 기입 평가 기준선](generic-autofill-evaluation-baselines.md)
- [범용 자동 기입 검색 표면](generic-autofill-search.md)
