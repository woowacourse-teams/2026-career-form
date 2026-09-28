# 실사이트 자동 입력 평가 워크플로우

> Topic: live-autofill-evaluation
> Status: Current
> Current: [CF-124 AI 운영 실사이트 자동 입력 평가 워크플로우](../../raw/issues/CF-124/documents/adr/124-ai-operated-live-autofill-evaluation.md)
> History: [CF-124 최초 공용 실행 계약](../../raw/issues/CF-124/documents/adr/124-ai-operated-live-autofill-evaluation.md)
> Updated: 2026-09-28

## 현재 상태

사용자가 외부 Chrome에 평가 탭을 열고 `평가 시작해줘`라고 요청하면 저장소 소유 스킬이 환경과 프로필을 점검하고 AI 사전 판정, 비민감 입력, 실제 DOM 재검증과 비식별 보고를 수행한다.

비민감 기존 값은 회원가입 기본값과 사용자 입력을 구분하지 않고 현재 평가 실행에서 덮어쓴다. 민감값과 입력 불가 항목은 `DEFERRED`로 남기며 저장, 이동, 미리보기와 제출은 실행하지 않는다.

Console의 `[CareerForm]` 로그는 수집, 분석, 리뷰, 기입과 검색 실패의 현장 진단에 사용한다. 값, 요청과 응답 원문, 스크린샷을 보관하지 않고 최종 결과는 실제 DOM으로 판정한다.

## 변경 이유

기존 값 보호로 평가를 중단하면 회원가입 기본값이 있는 사이트의 자동 입력 결과를 측정할 수 없다. 값의 출처를 신뢰성 있게 판별할 수도 없으므로, 제출로 이어지지 않는 평가 탭과 현재 실행에 한정해 비민감 기존 값을 덮어쓰는 공통 계약을 선택했다.
