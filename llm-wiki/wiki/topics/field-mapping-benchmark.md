# 필드 매핑 공급자 벤치마크

> Topic: field-mapping-benchmark
> Status: Current
> Current: [CF-206 필드 매핑 공급자 벤치마크](../../raw/issues/CF-206/documents/field-mapping-benchmark.md)
> History: [근거 1](../../raw/issues/CF-206/documents/field-mapping-benchmark.md)
> Updated: 2026-10-13

## 현재 상태

범용 fields 분석 공급자는 네 사이트의 고정 비식별 요청과 칸별 정답 라벨로 채점한다. 정확도, 재현율, 틀린 매핑 비율을 공급자·사이트별로 내고 Jev는 기준 적용 전 1순위를 confidence 기준값별로 다시 채점한다. Jev의 칸별 판단은 백엔드 `[JEV]` 로그에서 requestId로 묶어 수집한다. 정답 라벨은 초안이며 검수가 필요한 후보가 남아 있다. 같은 요청도 실행마다 결과가 달라지므로 반복 수집으로 비교한다.

## 변경 이유

공급자 결과를 표로 훑는 방식으로는 Jev의 state, question, confidence 변경 효과를 같은 입력에서 반복 비교할 수 없었다.
