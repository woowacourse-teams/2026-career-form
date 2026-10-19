# 범용 전체 날짜 텍스트 칸 JEV 매칭 조사

> Topic: generic-date-text-matching-investigation
> Status: Current
> Current: [CF-280 범용 전체 날짜 텍스트 칸 JEV 매칭 조사](../../raw/issues/CF-280/documents/date-text-matching-investigation.md)
> History: [CF-280 범용 전체 날짜 텍스트 칸 JEV 매칭 조사](../../raw/issues/CF-280/documents/date-text-matching-investigation.md)
> Updated: 2026-10-19

## 현재 상태

두 합성 구조(편집 가능 TEXT, 읽기 전용 달력 TEXT)의 오프라인 추적에서 BE 결함은 재현되지 않았다. PERSONAL·MIXED·ABSTAIN 섹션은 DIRECT `birthDate`와 DATE_PART 3종을 선택지로 받고, DIRECT는 그대로 반환된다. 전체 날짜 TEXT에 고른 DATE_PART는 키와 binding이 없는 안전한 미연결이 되며 날짜 부분 SELECT의 DATE_PART는 유지된다. 다른 확정 범주에는 `birthDate`가 선택지에 없다. 이 동작은 `GenericDateTextMatchingTest`로 고정했다.

실제 JEV 응답, 섹션 분류 결과, 실사이트 CSS·달력 위젯 상태는 관측하지 못했다. 모의 응답은 코드 경로만 증명하므로 E3 원인은 확정되지 않았고 사람의 실사이트 재평가가 필요하다.

## 변경 이유

입증되지 않은 원인에 맞춰 범용 규칙을 바꾸면 안전 거부를 약화시킨다. 원인 후보와 미확인 범위를 남겨 후속 재평가가 같은 경로를 반복하지 않게 한다.
