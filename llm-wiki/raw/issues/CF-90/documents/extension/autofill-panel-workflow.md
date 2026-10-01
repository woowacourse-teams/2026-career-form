# 지원서 패널 안 자동 기입 흐름

근거 계약: [Issue #90](https://github.com/woowacourse-teams/2026-career-form/issues/90)

## 실행 위치와 수명

자동 기입은 content script의 in-page 지원서 패널 하나에서 목록과 workflow를 전환한다. Chrome 기본 side panel의 실행 요청도 같은 host로 합치며 실제 지원서 document와 API/repository 객체 수명을 안정적으로 유지한다.

기존 자동 기입 메시지는 호환성을 유지하지만 별도 modal/backdrop을 마운트하지 않는다. `InPageProfilePanel`은 `profile-panel-controller`의 상태를 구독하고 기존 `App`의 상태를 유지한 채 workflow 본문을 전환한다. API 클라이언트와 repository는 화면 전환마다 다시 생성하지 않는다.

## 목록 복귀와 패널 닫기

목록 복귀는 workflow 종료 후 기존 검색 상태와 시작 버튼 초점을 복원하고, 패널 닫기는 workflow 정리 후 host를 숨긴다. 반복 요청은 단일 controller와 실행 가드로 중복 시작을 막고, 이전 닫기 콜백은 새로 열린 패널을 제거하지 않도록 open generation으로 구분한다.

Escape는 workflow 영역 내부에서 처리하며 지원 페이지의 키 입력을 전역 가로채지 않는다. 목록 복귀는 이미 입력된 지원서 값을 원복하는 기능이 아니다. 종료 시 기존 abort 경계를 유지하고, 종료된 실행의 늦은 응답으로 새 화면이 덮이지 않도록 한다.

## 처리 상태와 접근성

분석 및 재분석과 실제 최종 writer 대기의 표시 상태를 분리한다. 56px 원형 스피너는 transparent 10%에서 #474bff로 이어지는 9px 마스크와 1초 선형 회전을 사용하며 reduced-motion에서는 정지한다. 상태 live region은 aria-busy 영역 밖에 두고 StrictMode effect 재실행 시 mounted 상태를 복원한다.

분석 문구는 `지원서를 분석하고 있어요`, 실제 쓰기 문구는 `지원서에 입력하고 있어요`다. 상태 표시는 매핑·승인 판단을 바꾸지 않는다. 최종 자동 writer와 명시적 writer 모두 실제 대기 구간에 writing 표시를 사용하며, 준비와 재분석은 analyzing으로 표시한다.

## 참고 코드와 회귀 확인 지점

- `frontend/entrypoints/autofill.content/index.tsx`: 단일 Shadow DOM host, 메시지 진입, 지연 닫기와 재열기 구분.
- `frontend/src/extension/InPageProfilePanel.tsx`, `profile-panel-controller.ts`: 안정적인 의존성과 목록/workflow 전환.
- `frontend/entrypoints/sidepanel/App.tsx`: 검색 상태 유지와 시작 버튼 초점 복원.
- `frontend/src/autofill/workflow/AutofillWorkflow.tsx`, `workflow-analysis.ts`: 실행 가드와 분석/쓰기 상태 전환.
- `frontend/src/autofill/workflow/WorkflowLoading.tsx`, `WorkflowLoading.module.css`: 스피너와 live region/busy 분리.
- `frontend/entrypoints/autofill.content/index.test.tsx`, `frontend/entrypoints/sidepanel/App.workflow.test.tsx`, `frontend/src/autofill/workflow/AutofillWorkflow.loading.test.tsx`: 반복 요청, 종료 후 늦은 응답, 초점, 자동 writer pending, StrictMode 회귀.

이 기록은 UI·실행 수명 경계만 정리한다. 회사 매핑 정책, 민감정보 확인 예외, 기존값 보호, 실제 채용 사이트의 저장·제출 호환성을 새로 확정하지 않는다.
