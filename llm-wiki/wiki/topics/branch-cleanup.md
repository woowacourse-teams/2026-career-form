# 작업 브랜치 정리

> Topic: branch-cleanup
> Status: Current
> Current: [CF-330 병합된 작업 브랜치의 워크플로 정리](../../raw/issues/CF-330/documents/adr/330-work-branch-cleanup.md)
> History: [CF-330 병합된 작업 브랜치의 워크플로 정리](../../raw/issues/CF-330/documents/adr/330-work-branch-cleanup.md)
> Updated: 2026-10-23

## 현재 상태

같은 저장소의 PR이 병합되면 별도 워크플로가 head 브랜치를 삭제한다. 대상은
`CF-*` → `develop`·`release/<버전>`, `hotfix/CF-*` → `main`, `revert/<SHA>` → `main`
네 경로뿐이다. `main`, `develop`, `release/*` head는 이 경로에서 삭제하지 않고 release
정리는 기존 릴리스 흐름이 맡는다.

병합 없이 닫힌 PR, fork head, 허용 밖 쌍, 같은 head로 열린 PR이 있는 경우는 삭제 없이
건너뛴다. 열린 PR 조회 실패, 삭제 직전 원격 SHA 변경, 원격·push 오류는 브랜치를 보존한 채
실패로 드러낸다. 이미 없는 브랜치의 재실행은 성공한다. 삭제는 release와 같은 SHA 확인과
명시적 lease를 사용한다.

병합 없이 닫힌 PR, fork, PR 없는 브랜치는 사람이 정리한다. 병합된 PR의 head는 PR
페이지의 Restore branch로 복원한다. 저장소의 Automatically delete head branches는 계속
해제해 둔다.

## 변경 이유

release 유지를 위해 저장소 자동 삭제를 끈 뒤 생긴 작업 브랜치 수동 정리 비용을, 기존
release 정리와 같은 안전 조건으로 자동화한다.

## 관련 지식

- [릴리스 브랜치 유지와 정리](release-branch-lifecycle.md)
- [배포 Runbook](deployment-runbook.md)
