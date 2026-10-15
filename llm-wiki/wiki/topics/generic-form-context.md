# 범용 폼 컨텍스트 수집

> Topic: generic-form-context
> Status: Current
> Current: [CF-198 범용 폼 컨텍스트 수집 경계와 전후 비교](../../raw/issues/CF-198/documents/generic-form-context.md)
> History: [CF-198 범용 폼 컨텍스트 수집 경계와 전후 비교](../../raw/issues/CF-198/documents/generic-form-context.md)
> Updated: 2026-10-15

## 현재 상태

범용 텍스트 수집은 `resolveDocumentCompany(document)`로 선택하며 기본 수집 어댑터의 식별에 의존하지 않는다. label과 context 옵션이 생략된 경우의 동작과 `semanticText`의 내부 판정을 보존한다. 구조적 행 탐색 결과는 동기 DOM 읽기 단계 안에서만 캐시하고 쓰기나 await를 넘어 재사용하지 않는다.

실사이트 두 곳의 mapping-only 전후 비교(셀당 5회, 호출 20회, 채점 질문 14개)는 전체 59/70에서 52/70, 한 사이트는 0/10에서 6/10, 다른 사이트는 59/60에서 46/60이었다. 채점 대상 14문항에서는 잘못된 key 0건, 수집 누락 0건이며 이는 보이는 native control 범위의 결과다. 다만 금지·지원불가 문항의 잘못된 제안이 전 5건, 후 4건(certificate.issuer)이었고 모호 문항 1개가 grade에서 registrationNo로 3/5 이동했다. 전후 점수는 혼재·고분산이며 개선이 입증되지 않았다. 설치된 확장 프로그램 revision은 `UNVERIFIED`이다.

평가 주의사항: 점수 대상 사이트에서 전후 후보 수는 같았지만, 이것이 악화의 원인을 확정하지는 않는다. 악화는 전 문항이 NO_MATCH로 돌아온 단일 호출에 집중됐고, 그 원인이 수집된 의미 문맥인지 일시적인 백엔드·모델 실패인지는 확인하지 못했다. 전후 필드별 label·그룹 문맥 차이는 기록되지 않았다. 원인은 미확인이다.

## 변경 이유

수집 helper를 정책과 컴포넌트 실행이 공유하므로 수집 방식 선택 기준과 캐시 범위를 고정해 이후 변경에서 기존 동작이 달라지지 않게 한다. 전후 비교는 개선 주장이 아니라 측정 결과와 그 한계를 기록하기 위한 근거로만 남긴다.

## 관련 주제

- [범용 자동 기입 평가 기준선](generic-autofill-evaluation-baselines.md)
- [범용 자동 기입 검색 표면](generic-autofill-search.md)
