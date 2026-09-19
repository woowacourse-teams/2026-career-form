# 백엔드 품질 해석 사례

> Topic: backend-code-quality-examples
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-91/documents/conventions/backend-code-quality-examples.md)
> History: [근거 1](../../raw/issues/CF-91/documents/conventions/backend-code-quality-examples.md)
> Updated: 2026-09-17

## 역할

이 문서는 [백엔드 코드 품질 기준](backend-code-quality.md)을 해석할 때 정상 코드의
여러 모양과 오탐 경계를 보여준다. 규칙에 없는 단계, 파일과 추상화를 추가하지 않는다.

## 주요 사례

- 입력과 추가 정책이 없는 조회 Service는 짧을 수 있다. 빈 Input과 형식용 단계를 만들지 않는다.
- 상태 변경은 Domain이 규칙을 검사하고 Service가 저장 결과를 사용한다. Domain과 Document
  분리는 구조 차이나 업무 전 검증 필요성으로 결정한다.
- 외부 분석의 검증 단계는 공급자 결과를 신뢰할 수 없기 때문에 존재하며 모든 기능의
  공통 템플릿이 아니다.
- 순수 변환 Stream과 짧은 두 값 선택은 허용한다. 부수 효과와 실패를 표현 안에 숨기지 않는다.
- endpoint 하나에 속한 작은 중첩 타입은 허용하지만 API 소유 타입을 Application이나
  Port에서 재사용하지 않는다.

## 자동 검사 경계

Controller의 구체 Adapter 접근, API DTO의 Application 침투, Port의 공급자 타입 누출,
Adapter의 Service 역호출, 기능과 계층 순환, API 응답의 내부 타입 노출은 자동 검사한다.
config의 조립, `SupportedProfileFields.keys()` 읽기, Result를 API 값으로 바꾸는 Response
팩터리와 이유 있는 NOT_APPLICABLE은 허용한다.

## 리뷰 경계

책임 없는 중간 객체, 변경 가능한 상태 노출, 조용한 fallback, 개인정보와 관측 누락은
사람과 AI가 주변 흐름을 읽고 판단한다. 세부 사례와 검토 문장은
[불변 raw](../../raw/issues/CF-91/documents/conventions/backend-code-quality-examples.md)에 보존한다.
