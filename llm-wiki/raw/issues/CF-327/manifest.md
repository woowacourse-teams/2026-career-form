# CF-327 Knowledge Bundle

> Issue: CF-327
> Collected: 2026-10-23
> Approval-Digest: 460019c1c58c3248f460202a9b0e81f8fa783ffef0981abc96f7bccb2ae237f0
> Approval-Response: Wiki 지식 후보 6개 모두 승인합니다. CF-327 raw와 topic Wiki에 반영해 같은 PR에 올려 주세요.
> Approval-Date: 2026-10-23
> Source-Revision: 82bcb5cd7e384096ee9b6f70e7f71803ed561af6
> Checkpoint-Candidate-Digest: 622364906e534adb237d99c1418eb417b09d276ceb86bca335bf7fdc0cc3e042

승인 digest는 사람이 위 응답으로 승인한 [후보 여섯 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. Checkpoint-Candidate-Digest는 같은 후보 여섯 개를 worktree 체크포인트가 JSON으로 직렬화해 계산한 값이다.

다섯 payload는 후보 1(deployment-runbook), 2(extension-release), 3(release-compatibility), 4(adapter-hplace), 5(cicd-setup)를 담고, 후보 6(Wiki 밖 정본 연결)은 별도 payload 없이 각 topic의 관련 지식 링크로 반영한다. 모든 서술은 `origin/develop`의 Source-Revision 시점 workflow, 스크립트, 코드가 근거이며 운영 host 주소, 포트 값, 시크릿 값은 기록하지 않는다. 각 payload의 승인 후보 절은 어미만 한다체로 바꿔 옮겼다.

## deployment-runbook

> Payload: [운영 배포 파이프라인의 workflow 구현 기준](documents/deployment-pipeline.md)
> Supersedes: [CF-41 배포 운영 Runbook](../CF-41/documents/docs/operations/deployment-runbook.md)

## extension-release

> Payload: [확장 프로그램 수동 릴리스 절차](documents/extension-release.md)
> Supersedes: None

## release-compatibility

> Payload: [확장·백엔드 호환 배포 순서와 API 호환 규칙](documents/release-compatibility.md)
> Supersedes: None

## adapter-hplace

> Payload: [Hplace 활성 정책 버전은 설정값이다](documents/hplace-active-policy-version.md)
> Supersedes: [CF-310 빈 단계 분석 생략 근거](../CF-310/documents/hplace-empty-step-analysis-skip.md)

## cicd-setup

> Payload: [배포 설정 레버 전체와 운영 LLM 비활성 이력](documents/deployment-config-levers.md)
> Supersedes: [CF-146 범용 기입 활성 여부 배포 설정](../CF-146/documents/operations/llm-deployment-toggle.md)
