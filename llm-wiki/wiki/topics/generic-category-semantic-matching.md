# 범용 범주 안 JEV 매칭 누락 원인과 의미 근거 보강

> Topic: generic-category-semantic-matching
> Status: Current
> Current: [CF-281 범용 범주 안 JEV 매칭 누락 원인과 의미 근거 보강](../../raw/issues/CF-281/documents/generic-category-semantic-matching.md)
> History: [CF-281 범용 범주 안 JEV 매칭 누락 원인과 의미 근거 보강](../../raw/issues/CF-281/documents/generic-category-semantic-matching.md)
> Updated: 2026-10-19

## 현재 상태

범용 경력·자격·어학 섹션의 업무내용, 자격 종류·발급기관, 시험명·등급·점수 칸은 공유 정제기의 유한 어휘가 일부 라벨의 의미를 잃게 만들던 것이 오프라인 재현으로 확인된 원인이다. 공유 정제기는 바꾸지 않고, 범용 패키지의 `GenericProfileSemantics`가 확정된 세 범주에서만 구조 어휘를 보완하고 기존 다섯 키에 값 없는 의미 설명을 붙인다. 기존 `languages.languageTest.grade`는 숫자 점수와 등급 문자열을 모두 지원한다. 점수 전용 또는 등급 전용 칸은 기존 키로 전달하고, 별도 점수·등급 칸이 경쟁하며 구조만으로 해소할 수 없으면 기권한다. 공급자 관측은 구조 필드를 더 전달하고 `repeat.rowCount`는 보내지 않는다.

승인 NAVER 정제 원본에 프로젝트 상세 칸은 없다. 원본 요청은 보존하고 별도 합성 변이로
업무내용/프로젝트 상세 반례를 추가해 독립 합성 구조와 함께 검사한다. 수집된 필드라고
주장하지 않으며, 출처와 단독 점수·등급 ablation 범위를 fixture provenance 문서에 명시한다.

## 변경 이유

범주 한정, 기권과 정적 경로 계약을 유지한 채 라벨 손실을 줄이기 위해서다. 검증은 mock JEV 기반이라 실제 모델 개선과 실사이트 성공률은 후속 재평가 범위다. 범주 경계는 [범용 전용 API 분리와 섹션 범주별 칸 매칭](generic-api-section-category-matching.md)을 따른다.
