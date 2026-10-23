# 범용 칸 라벨 문맥과 형식 등급 검사

> Topic: generic-field-context-safety
> Status: Current
> Current: [CF-252 범용 칸 문맥과 형식 검사](../../raw/issues/CF-252/documents/generic-field-context-safety.md)
> History: [CF-252 범용 칸 문맥과 형식 검사](../../raw/issues/CF-252/documents/generic-field-context-safety.md)
> Updated: 2026-10-18

## 현재 상태

끊긴 라벨은 범용 수집 선택 인자를 켠 경로에서만 같은 소유 그룹에 복원한다.
기본 수집과 정책 경로, select 자체 표시명은 유지한다.

이름·라벨·구조 문맥이 모두 없으면 고신뢰 매칭도 REVIEW다. 우편번호형 칸과 주소 키,
email/tel 입력과 다른 형식의 키는 BLOCKED다. 우편번호형 근거에는 기존 형식 힌트와
기존 registry가 해석한 요소 자체의 title/placeholder 문구를 사용한다.
자체 속성의 로컬 읽기는 2026-10-18 사용자 승인 사항이며 공유 수집·정적 타입·API는
확장하지 않는다. 기존 신뢰도 경계와 기존 사유 우선순위도 유지한다.

## 변경 이유

끊긴 라벨 때문에 문맥을 잃는 칸과 이름 없는 칸의 오매칭을 범용 경로 안에서
보수적으로 처리한다. 실제 우편번호 칸에 없는 형식 힌트를 HTML에 합성해 문제를
가리지 않고 자체 속성을 로컬에서 검사한다.

## 관련 주제

- [범용 폼 컨텍스트 수집](generic-form-context.md)
- [DOM fixture 검토와 재현 경계](dom-snapshot-review-boundaries.md)
