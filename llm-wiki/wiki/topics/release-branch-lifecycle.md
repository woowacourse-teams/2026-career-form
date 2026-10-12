# 릴리스 브랜치 유지와 정리

> Topic: release-branch-lifecycle
> Status: Current
> Current: [CF-155 릴리스 브랜치 유지 결정](../../raw/issues/CF-155/documents/adr/155-release-branch-retention.md)
> History: [CF-155 릴리스 브랜치 유지 결정](../../raw/issues/CF-155/documents/adr/155-release-branch-retention.md)
> Updated: 2026-10-03

## 현재 상태

관리자가 저장소의 병합 후 브랜치 자동 삭제를 해제하고 release를 main 병합 후에도
유지한다. 운영 배포 성공 후 이미 develop에 포함됐으면 PR 없이 삭제하고, 미반영이면
동기화 PR을 생성해 사람의 병합 후 삭제한다. 일반 기능 브랜치는 PR 담당자가 정리한다.

삭제 직전 SHA 비교와 명시적 Git lease로 추가 커밋을 보호한다. 이미 정리된 브랜치의
재실행은 허용하되 원격 오류를 브랜치 부재로 숨기지 않는다. develop 반영 판정은
커밋 조상 관계를 사용하며 기존 Merge Commit 규약을 따른다.

## 변경 이유

main 병합 직후의 자동 삭제가 배포 후 동기화 PR 생성을 막는 충돌을 해소하고,
두 완료 경로의 정리 시점을 일치시킨다.

## 관련 지식

- [배포 Runbook](deployment-runbook.md)
