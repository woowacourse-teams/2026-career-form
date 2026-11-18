# MongoDB 백업과 복구 운영 기준

> Issue: [CF-440](https://github.com/woowacourse-teams/2026-career-form/issues/440)
> Collected: 2026-11-09
> Approval-Digest: f68fe8803fbce18f779131ee3c4662ffff971c5d652498fe5957105ab6048582
> Source-Revision: ba6e178b

[승인 후보 스냅샷](approved-candidates.md)의 후보 2와 5를 적는다. 결정과 검토한 대안은 [ADR 440](adr/440-mongodb-logical-backup.md), 용량과 합성 리허설 수치는 [근거 기록](backup-evidence.md)을 따른다. 설치, 확인, 복구 명령의 정본은 `infra/mongodb/BACKUP.md`다.

## 백업 (후보 2)

- 주기: 매일 04·10·16·22시 KST(6시간 주기). systemd timer가 `Persistent=true`로 깨운다.
- 범위: prod DB 전체와 dev의 `evaluation_*` 컬렉션만 담고 staging은 담지 않는다. dev는 덤프 직전 컬렉션 목록에서 평가 외 컬렉션을 `--excludeCollection`으로 뺀다.
- 보관: 호스트 7일(성공한 실행 뒤 시각 형식 폴더만 정리하고 마지막 성공 실행은 남긴다), 공용 버킷 `techcourse-project-2026`의 팀 경로 `career-form/mongodb-backups/` 30일(이전 버전 1일).
- 암호화: 덤프 출력을 디스크에 쓰지 않고 age로 바로 암호화한다. 원격에는 manifest까지 암호화한 파일만 올리고 평문 manifest는 호스트에만 둔다. 복호화 키는 호스트 밖 팀 비밀 저장소에 둔다.
- 계정: admin DB의 전용 계정에 `backup`, `readAnyDatabase`만 준다.
- RPO: 6시간.

## 공용 AWS에서의 보호 (후보 2)

- 공용 버킷은 객체 공개 읽기가 허용돼 있고 모든 팀 EC2가 공용 역할 `ec2-project`를 쓴다. 그래서 우리 경로에 `ec2-project` 외 주체의 GetObject·GetObjectVersion을 거부하는 정책 문과 30일 수명 주기 규칙을 더하고, 암호화와 버킷 버전 관리로 노출과 덮어쓰기에 대비한다.
- DB 호스트는 IMDSv2를 필수로 두고 홉 제한은 기본값 2로 둔다(2026-11-10 사용자 결정, 혹시 모를 기존 연결을 깨지 않으려는 선택). 그래서 브리지 네트워크 컨테이너도 IMDSv2로 역할 자격 증명을 받을 수 있고, 줄이려면 홉 제한을 1로 낮춘다.

## 복구 (후보 2)

- 네트워크 없는 임시 컨테이너에 복원하는 리허설로 건수, `dbHash`, prod 확인값(활성 정책 버전과 정책 문서, 구독 수, 영구 품질 기록 수)의 정합을 먼저 확인한다.
- 실제 복구는 검증한 데이터 폴더를 새 볼륨으로 교체하고 기존 폴더는 보존한다. admin DB와 계정은 백업하지 않으므로 복구 뒤 계정을 다시 만든다.

## MongoDB 실행 사실 (후보 5)

- 고정 이미지 8.0.26은 리눅스 커널 6.19 이상에서 기동을 거부한다(SERVER-121912). 이미지 기본값 `GLIBC_TUNABLES=glibc.pthread.rseq=0`을 `rseq=1`로 바꾸면 TCMalloc 성능 경고와 함께 뜬다(2026-11-09 로컬 확인). 복구 리허설 스크립트는 `--kernel-compat`로 이 우회를 쓴다. 운영 mongod도 같은 영향을 받으므로 호스트 커널을 올리기 전에 확인한다.
- 8.0.26에서 `backup` 역할의 쓰기 권한은 `config.settings`의 insert, update뿐이고, `read` 역할(`readAnyDatabase`)에 `dbHash`가 들어 있다(실측).
