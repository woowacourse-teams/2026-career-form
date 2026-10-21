# 범용 범주 안 JEV 매칭 누락 원인과 의미 근거 보강

> Topic: generic-category-semantic-matching
> Status: Current
> Current: [CF-307 취득 자격증 날짜의 결정적 의미 연결](../../raw/issues/CF-307/documents/generic-category-semantic-matching.md)
> History: [CF-281 범용 범주 안 JEV 매칭 누락 원인과 의미 근거 보강](../../raw/issues/CF-281/documents/generic-category-semantic-matching.md); [CF-307 취득 자격증 날짜의 결정적 의미 연결](../../raw/issues/CF-307/documents/generic-category-semantic-matching.md)
> Updated: 2026-10-21

## 현재 상태

CF-307은 취득 자격증만 저장하는 프로필 계약에 따라 CERTIFICATE 범주의 전체 날짜 구조와
대상 자체의 취득일·취득/응시일 문구가 확인되면 서버에서
`certifications.certificate.acquisitionDate`를 공급자 호출 전에 결정한다.
`GenericFieldsService`는 공급자 결과를 `putIfAbsent`로 합쳐 이 결정을 덮어쓰지 못하게 하며,
이후 기존 쓰기·상호작용 정책은 유지한다. 섹션 제목만으로 추정하거나 프론트엔드에서 null을
임의 승격하지 않는다. [현재 근거](../../raw/issues/CF-307/documents/generic-category-semantic-matching.md)는
적용 조건과 기존 NAVER 세 실행의 자격증 날짜 세 칸 동일성을 기록한다. 전체 매핑 동일성이나
실제 지원서 기입 성공을 의미하지 않는다.

범용 경력·자격·어학 섹션의 업무내용, 자격 종류·발급기관, 시험명·등급·점수 칸은 공유 정제기의 유한 어휘가 일부 라벨의 의미를 잃게 만들던 것이 오프라인 재현으로 확인된 원인이다. 공유 정제기는 바꾸지 않고, 범용 패키지의 `GenericProfileSemantics`가 확정된 세 범주에서만 구조 어휘를 보완하고 기존 다섯 키에 값 없는 의미 설명을 붙인다. 기존 `languages.languageTest.grade`는 숫자 점수와 등급 문자열을 모두 지원한다. 점수 전용 또는 등급 전용 칸은 기존 키로 전달하고, 별도 점수·등급 칸이 경쟁하며 구조만으로 해소할 수 없으면 기권한다. 공급자 관측은 구조 필드를 더 전달하고 `repeat.rowCount`는 보내지 않는다.

승인 NAVER 정제 원본에 프로젝트 상세 칸은 없다. 원본 요청은 보존하고 별도 합성 변이로
업무내용/프로젝트 상세 반례를 추가해 독립 합성 구조와 함께 검사한다. 수집된 필드라고
주장하지 않으며, 출처와 단독 점수·등급 ablation 범위를 fixture provenance 문서에 명시한다.

## 변경 이유

범주 한정, 기권과 정적 경로 계약을 유지한 채 라벨 손실을 줄이기 위해서다. CF-281 검증은 mock JEV 기반이라 실제 모델 개선과 실사이트 성공률은 후속 재평가 범위다. CF-307은 취득 자격증 날짜에 한해 공급자 변동과 독립적인 결정 규칙을 보완한다. 범주 경계는 [범용 전용 API 분리와 섹션 범주별 칸 매칭](generic-api-section-category-matching.md)을 따른다.

## 관련 주제

- [범용 달력 선택과 반복 열 날짜 단위 근거](generic-calendar-selection.md)
