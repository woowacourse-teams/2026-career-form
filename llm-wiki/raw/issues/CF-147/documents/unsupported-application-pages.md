# 미지원 지원서 페이지 중단 계약

> Issue: [CF-147](https://github.com/woowacourse-teams/2026-career-form/issues/147)
> Collected: 2026-10-02
> Approval-Digest: 6e01ddd1fe145b97cfe572a34fa01dac1efb3844d81c27ffca19eb3354086e65
> Source-Revision: 02cae24217a2ab02e3b65b5d32492b8a8c3f3421

## 결정과 이유

준비 분석의 모드가 `GENERIC`이고 `warningCodes`에 `LLM_UNAVAILABLE`이 있으면
미지원 안내 단계에서 자동 기입 흐름을 종료한다. 범용 기입을 끈 환경에서 필드
분석을 계속 요청하지 않고 사용자가 수동 복사를 선택할 수 있도록 안내한다.

필드 분석과 지원서 DOM 변경을 수행하지 않는다. 경고 없는 `GENERIC`과 `ADAPTER`
흐름은 기존대로 유지한다. 화면은 "아직 지원하지 않아요" 문구를 표시하며 그림이
제공되면 대체 텍스트와 함께 표시하고, 그림 없이도 문구만으로 완성된다.

## 근거와 검증 경계

자동 테스트로 안내 분기, 필드 분석 미호출, 입력값 불변 및 그림 없는 경로를 확인했다.
실제 빌드 확장과 합성 지원서에서 안내와 그림, 준비 분석 1건 및 필드 분석 0건을 확인했다.
이는 실제 채용 사이트의 자동 입력 성공률을 검증한 결과가 아니다.

## 참고 코드

- `frontend/src/autofill/workflow/AutofillWorkflow.tsx`
- `frontend/src/autofill/workflow/WorkflowScreens.tsx`
- `frontend/src/autofill-demo/AutofillOverlay.unsupported.test.tsx`
