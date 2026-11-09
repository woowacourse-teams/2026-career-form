# MongoDB 백업 누락 알림

> Issue: [CF-440](https://github.com/woowacourse-teams/2026-career-form/issues/440)
> Collected: 2026-11-09
> Approval-Digest: f68fe8803fbce18f779131ee3c4662ffff971c5d652498fe5957105ab6048582
> Source-Revision: ba6e178b

[승인 후보 스냅샷](approved-candidates.md)의 후보 3이다. CF-207의 공용 MongoDB 관측, 수집 신뢰성, 알림 경로는 그대로 유효하고 이 문서는 백업 알림만 더한다.

- 백업 스크립트가 `career_mongo_backup_*`(마지막 시도·성공 시각, 결과, 소요 시간, 크기, 실패 단계)를 host-state textfile 폴더의 `mongodb-backup.prom`에 원자적으로 쓴다. 기존 DB 호스트 Alloy가 이 폴더를 `job=mongodb-host`로 중앙에 보내므로 수집 설정은 바꾸지 않았다.
- 규칙 `rules-mongodb-backup.json`은 마지막 성공 8시간 초과 warning, 14시간 초과 critical(한 주기와 두 주기에 2시간씩 여유), 마지막 시도 실패 warning이다. `service=mongodb-observation`, `kind=db-backup`이라 `career-db-discord`로 간다. NoData와 실행 오류는 KeepLast다.
- 경과는 24시간 안의 마지막 보고값으로 계산해 수집이 잠깐 끊겨도 유지된다. 메트릭이 한 번도 없으면 기대 시작 시각부터 누락으로 세므로, 백업 timer의 첫 실행이 끝난 뒤 규칙을 반영한다.
- 대시보드 `Career Form MongoDB`에 "MongoDB 백업 상태" 패널을 더했다.
