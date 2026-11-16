# CF-440 승인 후보 스냅샷

> Issue: [CF-440](https://github.com/woowacourse-teams/2026-career-form/issues/440)
> Collected: 2026-11-09
> Approval-Digest: f68fe8803fbce18f779131ee3c4662ffff971c5d652498fe5957105ab6048582

worktree 체크포인트에 기록한 후보 다섯 개의 원문이다. 사람이 2026-11-09 "승인"으로 확정했다. 2026-11-10에 후보 2의 메타데이터 옵션 문장을 "홉 제한 1"에서 "IMDSv2 필수, 홉 제한 2"로 고쳐 다시 승인받았고, 위 digest는 고친 후보의 것이다.

1. ADR 440 "MongoDB 논리 덤프 정기 백업과 암호화 원격 보관": Issue 본문의 ADR 제안 전문을 상태 '승인됨'으로 raw `documents/adr/440-mongodb-logical-backup.md`에 남긴다. 구현에서 더해진 점(재부팅 따라잡기 실행은 운영 컨테이너 healthy를 최대 2분 기다림, 원격 백업본은 ec2-project가 붙은 EC2에서만 받음, 공용 정책 문의 계정 ID는 저장소에 두지 않고 자리표시자로 둠)을 결과에 적는다.
2. 백업·복구 운영 기준(새 topic `mongodb-backup-recovery`): 04·10·16·22시 KST 6시간 주기, prod 전체와 dev `evaluation_*`만(staging 제외), 호스트 7일·공용 버킷 팀 경로 30일(이전 버전 1일), age 암호화(원격에는 manifest까지 암호화 파일만), 백업 계정 backup+readAnyDatabase, RPO 6시간, 복구는 네트워크 없는 임시 컨테이너 리허설로 정합을 확인한 뒤 새 볼륨으로 교체하고 계정을 다시 만든다. 공용 버킷이 공개 읽기라 경로 Deny 문(ec2-project 외 GetObject·GetObjectVersion 거부)과 IMDSv2 필수를 함께 쓴다. 홉 제한은 기본값 2로 둔다(2026-11-10 사용자 결정, 혹시 모를 기존 연결을 깨지 않으려는 선택). 그래서 브리지 네트워크 컨테이너도 IMDSv2로 역할 자격 증명을 받을 수 있고, 줄이려면 홉 제한을 1로 낮춘다. 정본은 `infra/mongodb/BACKUP.md`.
3. 백업 알림(`monitoring-system` 갱신): `career_mongo_backup_*`를 host-state textfile 폴더로 내보내고, 마지막 성공 8시간 초과 warning·14시간 초과 critical·마지막 시도 실패 warning을 `career-db-discord`로 보낸다. 메트릭이 한 번도 없으면 기대 시작 시각부터 누락으로 세므로 첫 백업이 끝난 뒤 규칙을 반영한다.
4. 근거 기록(raw evidence): 2026-11-07 Grafana 실측(세 DB 약 61MB, 압축 저장 약 19MB, 13일 +3.3MB, DB 디스크 7.8GB 남음), 덤프 크기 추정(회차당 9~13MB), 2026-11-09 합성 리허설(고정 이미지 8.0.26, 백업 4.09초, 복구 합계 3.152초 = 받기 0.008 + 기동 1.53 + 복원 0.379 + 확인 1.235, 확인 40건 통과, 변조 파일 거부).
5. MongoDB 실행 사실: 고정 이미지 8.0.26은 커널 6.19 이상에서 기동을 거부하지만 `GLIBC_TUNABLES=glibc.pthread.rseq=1`이면 TCMalloc 성능 경고와 함께 뜬다(2026-11-09 로컬 확인, 리허설 `--kernel-compat`). 8.0.26의 `backup` 역할 쓰기 권한은 `config.settings` insert·update뿐이고 `read` 역할에 `dbHash`가 있다(실측).
