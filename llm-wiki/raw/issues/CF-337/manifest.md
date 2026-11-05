# CF-337 Knowledge Bundle

> Issue: CF-337
> Collected: 2026-10-24
> Approval-Digest: 6c29dfc9ca6d0ca7fea721df4041a85987539e910dbf6c16e0678d96f4e27af0
> Approval-Response: 승인
> Approval-Date: 2026-10-24
> Source-Revision: 7fd5b6880e7725ee903a16dd0d2c38f2b486d792

승인 digest는 사람이 위 응답으로 승인한 [후보 두 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. payload 하나가 후보 1·2(배포 runbook)를 담는다. payload는 같은 topic의 앞선 근거를 대체하되, 바꾸지 않은 내용은 Supersedes가 가리키는 문서를 따른다. 호스트 주소, 계정, 시크릿은 포함하지 않는다.

## deployment-runbook

> Payload: [정책 활성 버전은 배포 커밋의 seed를 따른다: 환경별 흐름과 4값 대조](documents/policy-active-version-follows-seed.md)
> Supersedes: [CF-333 정책 활성 버전과 배포 뒤 전환](../CF-333/documents/policy-active-version-and-deploy.md)
