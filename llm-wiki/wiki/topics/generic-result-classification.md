# 범용 결과 화면 분류

> Topic: generic-result-classification
> Status: Current
> Current: [CF-412 범용 결과 화면 분류와 수집 제외](../../raw/issues/CF-412/documents/generic-result-classification.md)
> History: [CF-412 범용 결과 화면 분류와 수집 제외](../../raw/issues/CF-412/documents/generic-result-classification.md)
> Updated: 2026-11-05

## 현재 상태

범용 결과 화면의 확인 필요에는 프로필 값이 있는 칸만 둔다. 값이 없는 칸은 "프로필에 없는 항목"과 "프로필 미입력" 회색 접힘 묶음으로 보낸다. 빨간 테두리는 범용에서 확인 필요 칸에만 그린다. 필수 칸은 따로 표시하지 않는다. 정적 경로는 바뀌지 않는다.

범용 수집은 페이지 수준 contentinfo 랜드마크 안에 있으면서 form 밖에 있는 입력칸을 세지 않는다. 범용 health 키를 NONE 구역으로 두어 매핑에서 빼는 정책을 유지한다.

## 변경 이유

프로필과 상관없는 칸까지 "입력 못함"으로 세어서 기입이 많이 실패한 것처럼 보였다. 근거와 실측 범위는 raw 문서를 따른다.
