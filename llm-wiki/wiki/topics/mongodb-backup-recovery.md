# MongoDB 백업과 복구

> Topic: mongodb-backup-recovery
> Status: Current
> Current: [CF-440 MongoDB 백업과 복구 운영 기준](../../raw/issues/CF-440/documents/mongodb-backup-recovery.md)
> History: [CF-440 MongoDB 백업과 복구 운영 기준](../../raw/issues/CF-440/documents/mongodb-backup-recovery.md)
> Updated: 2026-11-09

## 현재 상태

DB 호스트의 systemd timer가 매일 04·10·16·22시 KST에 prod DB 전체와 dev의 `evaluation_*` 컬렉션을 mongodump archive로 덤프하고 age로 암호화한다. staging은 담지 않는다. 호스트에 7일, 공용 버킷 `techcourse-project-2026`의 `career-form/mongodb-backups/`에 30일(이전 버전 1일) 둔다. 원격에는 manifest까지 암호화한 파일만 올리고, 우리 경로에는 `ec2-project` 외 주체의 읽기를 막는 정책 문과 수명 주기 규칙을 더한다. 백업 계정은 `backup`, `readAnyDatabase`만 갖고 RPO는 6시간이다.

복구는 네트워크 없는 임시 컨테이너 리허설로 건수, `dbHash`, prod 확인값의 정합을 확인한 뒤 검증한 데이터 폴더를 새 볼륨으로 교체하고 계정을 다시 만든다. 2026-11-09 합성 리허설의 복구 합계는 3.152초였다. 호스트 적용, 공용 버킷 설정과 역할 연결, 운영 백업본 리허설과 그 기록은 사람이 한다. 설치와 복구 명령의 정본은 `infra/mongodb/BACKUP.md`이고, 누락 알림은 [공용 모니터링 시스템](monitoring-system.md)을 따른다.

고정 이미지 8.0.26은 커널 6.19 이상에서 기동을 거부하지만 `GLIBC_TUNABLES=glibc.pthread.rseq=1`이면 성능 경고와 함께 뜬다. 리허설 스크립트의 `--kernel-compat`와 로컬 통합 시험이 이 우회를 쓴다.

## 변경 이유

CF-440 전에는 저장소와 DB 호스트 어디에도 백업과 복구 수단이 없었다. 스프린트 4 백엔드 요구사항 "데이터 백업과 복구"로 무인 주기 백업과 복구 1회 기록이 필요해 논리 덤프 방식을 골랐다. EBS 스냅샷, 데이터 폴더 복사, replica set 시점 복구, 관리형 서비스를 대안으로 검토했으며 근거는 Current 문서가 연결한 ADR과 근거 기록을 따른다. 우테코 공용 AWS라 팀 전용 버킷과 역할을 만들 수 없어 공용 버킷의 팀 경로와 공용 역할을 쓰고, 버킷이 공개 읽기라 원격 파일을 모두 암호화한다.
