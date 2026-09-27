# Greeting 공통 어댑터

> Topic: adapter-greeting
> Status: Current
> Current: [Greeting 공통 어댑터 계약과 검증](../../raw/issues/CF-94/documents/adapter-greeting.md)
> History: [CF-94 근거](../../raw/issues/CF-94/documents/adapter-greeting.md)
> Updated: 2026-09-27

## 현재 상태

BE가 연결 근거·공통 정책·fingerprint를 확인해 `greeting-v1`을 지정하고 FE는 새 snapshot에서 Greeting 제어를 실행한다. 카카오모빌리티 기본정보·병역/보훈/장애·대학교/대학원 대응 항목은 정확한 DOM·행·선택 코드·기존 값과 조건부 노출을 검증한다. 이름 없는 이메일 combobox의 `이메일주소`와 `이메일` 표시명은 각각 유일한 칸일 때만 연결한다. 국적은 해당 칸이 있는 양식에서 유일한 표시명과 코드·선택 상태를 검증한다. 인증·기업 질문·파일·동의·저장·제출은 실행하지 않는다.

## 검증과 제한

카카오모빌리티의 비식별 전체 프로필 48개 입력·재실행 새 입력 0개, 현대오토에버·무신사 각 공통 3개, 당근서비스 국적 포함 4개, 메디퀴터스 짧은 이메일 표시명 포함 3개는 화면별 설치 확장 관측이다. 현대오토에버의 별도 공개 공고에서도 재실행 새 입력 0개와 공통 세 값 유지를 확인했다. 영문이름 한 칸의 조합은 확인 필요로 남겼다. 다른 Greeting 기업의 전체 항목과 저장·제출 호환성은 입증하지 않았다. 상세 항목과 증거는 [불변 근거](../../raw/issues/CF-94/documents/adapter-greeting.md)를 따른다.

## 변경 이유

도메인과 양식별 차이를 공통 정책으로 처리하되 FE의 공급업체 독자 판정과 모호한 필드 추정을 막기 위해 별도 어댑터 경계를 기록했다.
