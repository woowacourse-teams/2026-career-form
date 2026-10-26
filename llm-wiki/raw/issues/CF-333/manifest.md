# CF-333 Knowledge Bundle

> Issue: CF-333
> Collected: 2026-10-24
> Approval-Digest: e3220900fa34d5fd1ee3718f11713ef2c78fa8bbdb93741c0fa6e1be570f8e41
> Approval-Response: 응 위키 승인할게
> Approval-Date: 2026-10-24
> Source-Revision: fe786252f656a3e551a55bfa1825032e2366a086

승인 digest는 사람이 위 응답으로 승인한 [후보 일곱 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. 세 payload는 후보 2·3·6·7(실사이트 평가), 후보 1·4·5(현대 어댑터), 후보 3(배포 runbook)을 담는다. 각 payload는 같은 topic의 앞선 근거를 대체하되, 바꾸지 않은 내용은 Supersedes가 가리키는 문서를 따른다. 실제 지원값·계정·세션·URL 쿼리·시크릿은 포함하지 않는다.

## live-autofill-evaluation

> Payload: [실사이트 QA 하네스의 테스트 계정 모드, 설치본 잠금, 채점 재사용과 합계 재계산](documents/live-harness-test-account-mode.md)
> Supersedes: [CF-310 재설치·응답 없는 탭 근거](../CF-310/documents/live-harness-reinstall-and-hung-tab.md)

## adapter-hyundai

> Payload: [현대 작성 화면의 재진입 불가와 경력 칸 결함 관측](documents/hyundai-applywrite-reentry-and-career-fields.md)
> Supersedes: [CF-310 버튼형 선택지 코드 근거](../CF-310/documents/hyundai-button-select-codes.md)

## deployment-runbook

> Payload: [정책 활성 버전은 seeder가 바꾸지 않는다: 검증 환경과 배포 뒤 전환](documents/policy-active-version-and-deploy.md)
> Supersedes: [CF-323 릴리스 시작 기준 커밋 선택](../CF-323/documents/start-release-base-commit.md)
