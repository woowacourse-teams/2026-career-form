# 범용 분할 이메일 오입력 차단

## 결정

범용 매핑이 이메일 전체 주소를 아이디 전용 칸에 쓰지 않도록 차단한다. 이메일을 아이디와 도메인으로 나누어 채우는 기능은 포함하지 않는다.

`isSplitEmailTarget`은 제한된 상위 필드 그룹 안에서 하나의 input 뒤에 리터럴 `@`와 도메인 옵션이 있는 native select가 이어지는 구조를 확인한다. 공백과 단순 wrapper를 허용하지만 form/body 전체에서 관계없는 요소를 조합하지 않는다. 구조가 모호한 일반 입력칸을 분할 이메일이라고 단정하지 않는다.

## 실행 경계

- `review-plan.ts`의 `itemForAnalysis`는 범용 이메일 매핑의 분할 구조를 확인하면 항목을 입력 불가로 만든다.
- `native-executor.ts`의 `resultForItem`은 쓰기 직전에 같은 구조를 다시 검사한다. 리뷰 이후 분할 구조가 생겨도 전체 주소를 쓰지 않는다.
- `SPLIT_EMAIL_UNSUPPORTED`를 결과 모델과 안내에 전달하여 확인 필요 목록에서 직접 입력할 이유를 보여준다.
- 차단 시 input/change 이벤트나 도메인 선택을 발생시키지 않는다. 기존 값 보호와 단일 이메일 전체 주소 입력, 어댑터 검증 경로는 유지한다.

## 근거와 검증 범위

구현 근거는 `frontend/src/autofill/dom/split-email.ts`와 리뷰·쓰기·결과 경로이다. 회귀 검증은 `frontend/src/autofill/workflow/split-email.integration.test.tsx`에 있다.

합성 실제 content-script 번들에서 분할 칸 미입력, 단일 이메일 정상 입력, 도메인 유지와 차단 사유 표시를 데스크톱·모바일 화면으로 확인했다. 차단 판정을 무효화한 검증에서는 오입력을 포함한 회귀 테스트 6개가 실패했다. 이 기록은 합성 구조의 검증이며 특정 회사 페이지 전체 지원을 의미하지 않는다.
