# 백엔드 품질 해석 사례

이 사례는 BQ 규칙을 해석하기 위한 예시다. 모든 기능에 같은 단계와 파일 수를
강제하지 않으며 실제 제품 기능을 추가하라는 요구가 아니다.

## 짧은 조회 Service

입력이 없고 별도 업무 정책도 없는 목록 조회는 짧을 수 있다. Application Result를
반환하고 Controller가 API Response로 변환하면 된다. 빈 Input, 형식용 검증 메서드,
구현체가 하나라는 이유만의 Service 인터페이스를 추가하지 않는다. Service가 한 줄이라는
이유로 Controller가 저장소를 직접 호출하게 만드는 것도 허용하지 않는다.

## 상태 변경

Service는 Application Port로 현재 Domain을 조회하고 Domain 행위로 새 상태를 만든 뒤
저장 결과를 사용한다. 업무 검증이 필요한 Document라면 Adapter에서 Domain으로 변환한
뒤 Service에 전달한다. 저장 객체를 쓴다는 이유만으로 항상 Domain과 Document를 나누거나,
반대로 구조가 같다는 이유만으로 검증 전 Document를 업무 규칙에 넘기지 않는다.

## 외부 분석

외부 분석은 입력 검증, Port 호출, 공급자 결과 수용 검증, Result 생성 단계를 가질 수
있다. 이 흐름은 외부 결과를 신뢰할 수 없는 기능의 필요에서 나온다. 단순 조회까지 같은
네 단계를 만들거나 각 private 메서드를 별도 Validator와 Builder로 옮기지 않는다.

## 표현 선택

부수 효과 없는 `map`, `filter`, `toList`는 Stream으로 표현할 수 있다. 람다 안에 저장,
네트워크 호출, 공유 상태 변경과 예외 처리가 숨으면 명시적인 흐름을 우선한다. 짧은 두 값
선택은 삼항 연산자를 쓸 수 있지만 여러 업무 분기를 한 줄에 압축하지 않는다.

## 중첩 타입

한 endpoint에서만 쓰는 작은 응답 항목은 Response record 안에 둘 수 있다. 그 중첩
타입을 Application Input이나 Port 계약에서 재사용하면 API 소유 타입이 내부로 침투하므로
BQ-05 위반이다. 중첩 여부가 아니라 소유 경계를 판단한다.

## 자동 검사에서 찾아야 하는 사례

- Controller가 구체 Adapter나 Spring Data Repository를 직접 사용한다.
- Application Input이 API Request의 중첩 타입을 필드로 가진다.
- Port가 공급자 SDK 응답이나 공급자 전용 DTO를 반환한다.
- Adapter가 Service를 호출해 업무 흐름을 역으로 시작한다.
- 기능 또는 계층 사이에 순환 의존이 생긴다.
- API Response 필드가 Application Result, Domain, Document, 공급자 DTO를 노출한다.

## 허용 사례

- `config`가 Service와 구체 Adapter를 생성하고 연결한다. 기능 로직은 두지 않는다.
- Adapter가 provider schema 생성을 위해 `SupportedProfileFields.keys()`를 읽는다.
- API Response 팩터리가 Application Result를 인자로 받아 API 소유 값으로 변환한다.
- 아직 Domain 패키지가 없는 규칙은 이유와 대상 수를 붙인 NOT_APPLICABLE로 보고한다.

## 사람 리뷰에서 확인할 사례

책임 없이 전달만 하는 Manager나 Helper, 외부 변경과 함께 바뀌는 파일, 변경 가능한
컬렉션 노출, 조용한 fallback, 누락된 개인정보 제거와 관측 정보는 이름이나 정규식만으로
판정하지 않는다. 위치, 실제 영향, 최소 수정안을 BQ 규칙 ID와 함께 설명한다.
