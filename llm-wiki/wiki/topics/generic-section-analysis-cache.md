# 범용 섹션 분석 캐시의 키와 수명

> Topic: generic-section-analysis-cache
> Status: Current
> Current: [CF-244 섹션 분석 캐시](../../raw/issues/CF-244/documents/generic-section-analysis-cache.md)
> History: [CF-244 섹션 분석 캐시](../../raw/issues/CF-244/documents/generic-section-analysis-cache.md)
> Updated: 2026-10-17

## 현재 상태

범용 분석 캐시는 섹션 지문·제목·상위 제목·반복 여부와 칸별 visibility/disabled/readonly/inert 상태를 키로 쓴다. 실행 객체별 WeakMap과 URL로 수명을 제한하며, 같은 키는 한 실행 안에서도 대표 하나만 요청한다. 분류·매칭 호출 실패와 reason이 있는 칸 응답은 성공 캐시로 저장하지 않는다.

같은 DOM과 같은 구조의 반복 행은 결과를 재사용하고, 변경된 섹션만 요청한다. 요청에는 프로필 값이나 항목 개수를 추가하지 않는다.

## 변경 이유

검토나 재분석 진입 때 페이지 전체를 다시 보내지 않으면서 구조 또는 칸 상태가 바뀐 섹션은 다시 분석하기 위해서다.
