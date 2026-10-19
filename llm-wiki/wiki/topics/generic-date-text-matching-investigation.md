# 범용 전체 날짜 텍스트 칸 JEV 매칭 조사

> Topic: generic-date-text-matching-investigation
> Status: Current
> Current: [CF-280 범용 전체 날짜 텍스트 칸 JEV 매칭 조사](../../raw/issues/CF-280/documents/date-text-matching-investigation.md)
> History: [CF-280 범용 전체 날짜 텍스트 칸 JEV 매칭 조사](../../raw/issues/CF-280/documents/date-text-matching-investigation.md)
> Updated: 2026-10-19

## 현재 상태

fixture에서 읽은 편집 가능 TEXT와 독립 합성 table의 readonly TEXT를 실제 분류 서비스·JEV 분류기부터 매칭 응답까지 연결한다. 분류·매칭 공급자 HTTP 응답만 mock이며 반환된 범주를 다음 요청으로 전달한다. 원본 SHA-256, 관측 라벨과 control, 두 공급자 요청과 선택, null을 포함한 결과를 `GenericDateTextMatchingTest`의 40개 JSON trace로 남긴다. FE collector 실행이 아니고 visibility는 VISIBLE로 모델링한다.

PERSONAL·MIXED·ABSTAIN 분류 응답 뒤 DIRECT `birthDate`는 유지되고 전체 날짜 TEXT의 DATE_PART는 안전하게 거부된다. EDUCATION 분류 응답 뒤 날짜 후보가 없는 것도 추적한다. 제품 코드는 바꾸지 않았다. 실제 JEV 응답, 실사이트 섹션 분류와 CSS·달력 위젯 상태는 미확인이다. 모의 응답은 코드 경로만 증명하므로 E3 원인은 확정되지 않았고 사람의 실사이트 재평가가 필요하다.

## 변경 이유

입증되지 않은 원인에 맞춰 범용 규칙을 바꾸면 안전 거부를 약화시킨다. 원인 후보와 미확인 범위를 남겨 후속 재평가가 같은 경로를 반복하지 않게 한다.
