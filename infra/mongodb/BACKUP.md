# MongoDB 백업과 복구 runbook

DB 호스트의 MongoDB(standalone 컨테이너 하나, `infra/mongodb/compose.yaml`)를 6시간마다 암호화 덤프로 남기고, 그 덤프로 복구하는 방법이다. 설계 결정은 Issue #440과 ADR(`llm-wiki/raw/issues/CF-440/`)에 있다. 이 문서의 명령은 모두 사람이 실행한다. 실제 계정, 키, 구독 값은 이 문서와 저장소 어디에도 적지 않는다.

## 주기, 위치, 보관

| 항목 | 값 |
|---|---|
| 주기 | 매일 04, 10, 16, 22시(Asia/Seoul). `mongodb-backup.timer`가 `Persistent=true`로 깨워, 꺼져 있던 동안 놓친 회차는 켜진 뒤 바로 한 번 돈다 |
| 호스트 위치 | `/var/lib/career-form/mongodb-backups/<UTC 시각>/`(0700). 파일은 `prod.archive.gz.age`, `dev.archive.gz.age`, `manifest.json`, `manifest.json.age`(모두 0600) |
| 원격 위치 | 공용 버킷 `s3://techcourse-project-2026/career-form/mongodb-backups/<UTC 시각>/`. 암호화한 세 파일만 올리고 평문 `manifest.json`은 호스트에만 둔다 |
| 호스트 보관 | 7일. 성공한 실행 뒤에 백업 루트 바로 아래의 시각 형식 폴더만 지우고, 마지막 성공 실행은 남긴다 |
| 원격 보관 | 30일. 수명 주기 규칙이 현재 버전을 30일 뒤 만료하고 이전 버전은 1일 뒤 지운다. 스크립트는 원격 파일을 지우지 않는다 |
| 결과 지표 | `/var/lib/career-form/mongodb-observation/mongodb-backup.prom`의 `career_mongo_backup_*`. Grafana `Career Form MongoDB` 대시보드의 "MongoDB 백업 상태" 패널과 `rules-mongodb-backup.json` 알림 |

한 회차 덤프는 몇 초 걸린다. 2026-11-07 세 DB 데이터는 합계 약 61MB(압축 저장 약 19MB)였고, 덤프 파일은 회차당 약 9~13MB로 추정한다. 호스트 7일 보관분은 기존 데이터 디스크 알림과 DB별 용량 패널로 본다.

## 백업 범위와 이유

| 대상 | 범위 | 이유 |
|---|---|---|
| prod(`career_form_production`) | DB 전체 | 팀이 등록한 공고, 사람이 확인·선정한 품질 기록, 사용자 기기에서만 다시 얻는 푸시 구독과 발송 이력이 seed로 되살릴 수 있는 데이터와 같은 컬렉션, 같은 ID 참조 안에 섞여 있어 골라 담을 수 없다 |
| dev(`career_form_development`) | `evaluation_`으로 시작하는 컬렉션만 | 저장소에 없는 평가 실행·점수·메모다. 다시 만들려면 모델 호출 비용이 들고 결과도 같지 않다. 나머지 dev 컬렉션은 재배포 seed와 재등록으로 다시 만든다 |
| staging(`career_form_staging`) | 담지 않음 | 다시 만들 수 있는 시험 데이터뿐이다. 설정 키도 없다 |

dev는 덤프 직전에 컬렉션 목록을 읽어 `evaluation_`이 아닌 컬렉션을 `--excludeCollection`으로 뺀다. 목록을 읽은 뒤 생긴 평가 외 컬렉션이 덤프 보고에 나오면 그 회차는 실패로 끝난다. dev에 평가 외의 지킬 데이터가 생기면 `evaluation_` 접두사를 따르거나 범위를 다시 정한다.

## 계정과 권한

백업은 admin DB의 전용 계정으로 하고 root 계정(`career_form_admin`)은 쓰지 않는다.

```bash
infra/scripts/mongodb-compose.sh --shell
```

```javascript
db.getSiblingDB("admin").createUser({
  user: "career_form_backup",
  pwd: passwordPrompt(),
  roles: [{ role: "backup", db: "admin" }, { role: "readAnyDatabase", db: "admin" }]
})
```

- `backup`은 mongodump에 필요한 읽기 권한을 준다.
- `readAnyDatabase`는 모든 DB의 `read` 역할이고, 정합 확인에 쓰는 `dbHash`, `listCollections`, `countDocuments`가 여기에 들어 있다.
- 앱 DB에 쓰는 권한은 없다. MongoDB 8.0.26에서 `backup` 역할의 쓰기 권한은 `config.settings` 컬렉션의 insert, update뿐이다.

## 복구에 필요한 키와 비밀값

설치 담당자가 보관 위치와 책임자를 아래 표에 채운다. 값 자체는 적지 않는다.

| 이름 | 쓰임 | 보관 위치 | 보관 책임자 |
|---|---|---|---|
| age identity(복호화 키) | 모든 백업 파일 복호화. 잃으면 어떤 백업도 읽을 수 없다 | 팀 비밀 저장소. DB 호스트에 두지 않는다 | (설치 때 채움) |
| age 수신자 공개키 | 백업 암호화. 공개값이다 | DB 호스트 `/etc/career-form/mongodb-backup-recipients.txt`, 팀 비밀 저장소 | (설치 때 채움) |
| 백업 계정 비밀번호 | 덤프 | DB 호스트 `/etc/career-form/mongodb-backup.env`(0600), 팀 비밀 저장소 | (설치 때 채움) |
| root 계정 비밀번호 | 복구 뒤 계정 재생성, 운영 접속 | DB 호스트 `/etc/career-form/mongodb.env`(0600) | 기존 운영 담당 |
| 모니터링 계정 URI | 복구 뒤 계정 재생성 | DB 호스트 `/etc/career-form-monitoring-db/secrets/mongodb-uri` | 기존 운영 담당 |
| VAPID 키 | 푸시 발송 서명 | GitHub Environment 시크릿(`infra/WEB_PUSH_VAPID.md`). DB에 없다 | 기존 운영 담당 |

## 호스트 설치

사람이 DB 호스트(Ubuntu 24.04 arm64)에서 한다. 공용 버킷 설정과 역할 연결(다음 절)을 먼저 끝낸다.

1. 도구를 설치한다. `sudo apt-get install -y age`, AWS CLI v2는 AWS 공식 설치 파일(arm64)로 설치한다.
2. age 키 쌍은 DB 호스트 밖에서 만든다. `age-keygen -o mongodb-backup-identity.txt`로 만들고 `age-keygen -y mongodb-backup-identity.txt > mongodb-backup-recipients.txt`로 공개키를 뽑는다. identity는 팀 비밀 저장소에 넣은 뒤 로컬 사본을 지운다. 공개키 파일만 호스트로 옮긴다.
3. 위 "계정과 권한"의 명령으로 백업 계정을 만든다.
4. 파일과 폴더를 둔다.

   ```bash
   sudo install -d -m 0755 /opt/career-form/mongodb-backup
   sudo install -m 0644 infra/scripts/mongodb-backup.py infra/scripts/mongodb-restore-rehearsal.py /opt/career-form/mongodb-backup/
   sudo install -d -m 0700 /var/lib/career-form/mongodb-backups
   sudo install -m 0644 mongodb-backup-recipients.txt /etc/career-form/mongodb-backup-recipients.txt
   sudo install -m 0600 /dev/null /etc/career-form/mongodb-backup.env
   sudoedit /etc/career-form/mongodb-backup.env
   ```

5. env 파일에 다음을 채운다. 비밀번호에 URI 예약 문자가 있으면 퍼센트 인코딩한다. 백업 도구 컨테이너는 운영 컨테이너의 네트워크를 함께 써서 `127.0.0.1:27017`로 붙으므로 호스트 포트나 내부 IP를 쓰지 않는다.

   ```bash
   MONGODB_BACKUP_URI=mongodb://career_form_backup:<비밀번호>@127.0.0.1:27017/?authSource=admin
   MONGODB_BACKUP_CONTAINER=career-form-mongodb-mongodb-1
   MONGODB_BACKUP_PROD_DATABASE=career_form_production
   MONGODB_BACKUP_DEV_DATABASE=career_form_development
   MONGODB_BACKUP_RECIPIENTS_FILE=/etc/career-form/mongodb-backup-recipients.txt
   MONGODB_BACKUP_ROOT=/var/lib/career-form/mongodb-backups
   MONGODB_BACKUP_S3_URI=s3://techcourse-project-2026/career-form/mongodb-backups
   MONGODB_BACKUP_S3_REGION=ap-northeast-2
   MONGODB_BACKUP_RETENTION_DAYS=7
   MONGODB_STATE_DIR=/var/lib/career-form/mongodb-observation
   ```

6. 점검하고 단위를 켠다. `--check`가 모두 `ok`여야 한다. env 파일 권한이 0600이 아니면 백업은 덤프하지 않고 실패로 기록한다.

   ```bash
   sudo python3 /opt/career-form/mongodb-backup/mongodb-backup.py --check
   sudo install -m 0644 infra/mongodb/mongodb-backup.service infra/mongodb/mongodb-backup.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl start mongodb-backup.service
   sudo journalctl -u mongodb-backup.service -n 50
   sudo systemctl enable --now mongodb-backup.timer
   systemctl list-timers mongodb-backup.timer
   ```

7. 첫 실행이 성공한 뒤 모니터링 서버에 `rules-mongodb-backup.json`과 대시보드를 반영한다. 메트릭이 한 번도 없으면 규칙이 기대 시작 시각부터 누락으로 세므로, 먼저 반영하면 바로 누락 알림이 간다.
8. 사람 손을 대지 않은 자동 실행이 두 번 이상 끝나면 확인한다.

   ```bash
   sudo ls -l /var/lib/career-form/mongodb-backups/
   sudo aws s3 ls s3://techcourse-project-2026/career-form/mongodb-backups/ --region ap-northeast-2
   curl -s -o /dev/null -w '%{http_code}\n' https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/career-form/mongodb-backups/<UTC 시각>/manifest.json.age
   ```

   마지막 익명 요청은 403이어야 한다. Grafana 패널에서 마지막 성공 시각, 첫 실행 소요 시간, 파일 크기를 보고, 업무 시간 회차의 DB 명령 P95가 크게 늘지 않았는지 본다.

재부팅 직후의 따라잡기 실행은 운영 컨테이너가 healthy가 될 때까지 최대 2분 기다린 뒤 덤프한다. 그 안에 healthy가 되지 않으면 그 회차는 `inspect` 단계 실패로 남는다.

## 공용 버킷과 역할 설정

우테코 공용 AWS 계정에서는 팀 전용 버킷과 IAM 역할을 만들지 않는다. 공용 버킷 `techcourse-project-2026`의 팀 경로와 공용 역할 `ec2-project`를 쓰고, 다른 팀이 하듯 우리 경로에 정책 문 하나와 수명 주기 규칙 하나를 더한다. 이 버킷은 객체 공개 읽기가 허용돼 있고 모든 팀 EC2가 같은 역할을 쓰므로, 원격에는 암호화한 파일만 둔다.

1. S3 콘솔 → `techcourse-project-2026` → 권한 → 버킷 정책 → 편집. 바꾸기 전 정책 JSON 전체를 공개되지 않는 곳에 날짜를 붙여 보관한다. Issue, PR, 저장소에는 올리지 않는다.
2. `Statement` 배열 끝에 `infra/mongodb/backup-bucket-policy-statement.json`을 붙이고, `<AWS_ACCOUNT_ID>`를 같은 정책의 다른 문에 적힌 12자리 계정 ID로 바꾼다. 다른 문은 고치지 않는다. 저장한 뒤 다시 열어 문이 하나만 늘었고 Sid `CareerFormMongoBackupDenyRead`가 있는지 본다. 자리표시자를 그대로 두면 `ec2-project`도 읽기가 막혀 업로드 뒤 크기 확인이 실패하고, 마지막 시도 실패 알림이 간다.
3. 관리 → 수명 주기 규칙 생성. 이름 `career-form-mongodb-backups-expire-30d`, 접두사 `career-form/mongodb-backups/`, 현재 버전 만료 30일, 이전 버전 영구 삭제 1일. 값은 `infra/mongodb/backup-lifecycle-rule.json`과 같아야 한다. 다른 규칙은 고치지 않는다. 만료로 생긴 삭제 마커는 남지만 비용이 거의 없다.
4. EC2 콘솔 → `career-form-db` → 작업 → 보안 → IAM 역할 수정 → `ec2-project`.
5. 같은 인스턴스의 메타데이터 옵션에서 IMDSv2 "필수"와 응답 홉 제한 1을 확인한다. 홉 제한 1이면 Docker 브리지 네트워크의 컨테이너는 인스턴스 자격 증명을 받지 못한다. 백업 도구 컨테이너는 운영 컨테이너의 브리지 네트워크를 쓰고 AWS 호출은 호스트의 AWS CLI만 한다.
6. 저장이나 연결이 권한 문제로 거부되면 Slack `#8기-기술-검토`에 요청한다.

되돌리기:

- 정책 문: 버킷 정책 편집에서 Sid `CareerFormMongoBackupDenyRead` 문만 지우고, 보관한 원본과 나머지가 같은지 비교한다.
- 수명 주기 규칙: 규칙을 지운다. 삭제 권한이 없으면 `#8기-기술-검토`에 요청한다.
- 역할: IAM 역할 수정에서 역할을 뗀다.
- 백업 중지: `sudo systemctl disable --now mongodb-backup.timer`. 이미 올린 원격 객체는 30일 뒤 만료되고, 더 빨리 지워야 하면 운영진에 요청한다.

원격 백업본은 `ec2-project`가 붙은 EC2에서만 받을 수 있다. DB 호스트를 잃었으면 같은 역할을 붙인 새 EC2에서 받는다.

## 복구가 필요한 상황

| 상황 | 판단 | 할 일 |
|---|---|---|
| 컨테이너만 멈춤, 데이터 폴더 정상 | 복구하지 않는다 | `infra/scripts/mongodb-compose.sh --up`, host-state 알림 확인 |
| 잘못된 수동 작업이나 코드 변경으로 일부 문서가 바뀌거나 지워짐 | 운영 DB 전체를 되돌리면 그 뒤의 쓰기를 잃는다. 사람이 정한다 | 최신 백업을 리허설로 임시 컨테이너에 복원해 차이를 확인한다. 컬렉션 단위 부분 복구 도구는 없다 |
| dev 평가 기록만 잃음 | dev 대상만 다룬다 | 임시 컨테이너에 복원해 확인한 뒤, 사람이 `mongorestore --nsInclude 'career_form_development.evaluation_*'`로 빠진 문서만 다시 넣을지 정한다. `--drop`은 쓰지 않는다 |
| 데이터 폴더나 볼륨 손상, 디스크 고장, 볼륨 삭제 | 전체 복구 | 아래 "운영 복구 절차" |
| DB 호스트를 잃음 | 전체 복구 | 새 호스트를 부트스트랩하고 `ec2-project`를 붙인 뒤 원격 백업본으로 "운영 복구 절차" |

## 운영 복구 절차

판단과 실행은 사람이 한다. 기존 데이터 폴더는 지우지 않는다.

1. 복구를 정하고 팀에 알린다. 세 환경 백엔드를 멈춰 복구 중의 쓰기를 막는다.
2. 마지막 성공 실행을 고른다(Grafana 패널, 호스트 폴더 목록, 원격 목록).
3. 리허설 스크립트로 운영 데이터 폴더와 같은 파일시스템의 새 폴더에 복원하고 정합을 확인한다. 결과가 `success`여야 다음으로 간다.

   ```bash
   sudo python3 /opt/career-form/mongodb-backup/mongodb-restore-rehearsal.py \
     --source /var/lib/career-form/mongodb-backups/<UTC 시각> \
     --identity /root/mongodb-backup-identity.txt \
     --work-dir /var/lib/career-form/restore-<KST 시각> --memory 384m
   ```

4. 운영 컨테이너를 멈추고 기존 폴더는 이름만 바꿔 보존한 뒤, 검증한 데이터 폴더를 그 자리로 옮긴다. 리허설 컨테이너는 스크립트가 끝에서 이미 멈춰 둔다.

   ```bash
   docker stop career-form-mongodb-mongodb-1
   sudo mv /var/lib/career-form/mongodb /var/lib/career-form/mongodb.before-restore-<KST 시각>
   sudo mv /var/lib/career-form/restore-<KST 시각>/data /var/lib/career-form/mongodb
   infra/scripts/mongodb-compose.sh --up
   ```

5. 계정을 다시 만든다. admin DB와 계정은 백업하지 않으므로 복원한 폴더에는 사용자가 없다. 그래서 compose healthcheck가 실패하고 `--up`이 대기 시간 초과로 끝날 수 있지만 컨테이너는 떠 있다. 사용자가 없을 때만 열리는 localhost 예외로 root 계정부터 만든다. 비밀번호는 `/etc/career-form/mongodb.env`의 값을 쓴다.

   ```bash
   docker exec -it career-form-mongodb-mongodb-1 mongosh --quiet
   ```

   ```javascript
   db.getSiblingDB("admin").createUser({ user: "career_form_admin", pwd: passwordPrompt(), roles: ["root"] })
   ```

   그다음 `infra/scripts/mongodb-compose.sh --shell`로 root 접속해 모니터링 계정과 백업 계정을 이전 비밀번호 그대로 다시 만든다. 비밀번호는 각각 모니터링 URI 파일과 백업 env 파일에 있다. 모니터링 계정에는 admin의 `clusterMonitor`와 local의 `read`를 준다(`infra/monitoring/mongodb/README.md`). 백업 계정은 위 "계정과 권한"대로 만든다. 끝나면 healthcheck가 healthy가 되는지 본다.
6. 백엔드를 다시 띄우고 API 상태, 공고 목록, 관리 화면, 발송 로그를 확인한다.
7. `sudo systemctl start mongodb-backup.service`로 복구 직후의 기준 백업을 남긴다.
8. 보존한 이전 폴더와 리허설 작업 폴더(`--teardown`)는 원인 확인이 끝난 뒤 사람이 정리한다.

## 정합 확인

`mongodb-restore-rehearsal.py`가 단계마다 하는 일이다. 하나라도 `fail`이면 실패로 끝난다.

| 단계 | 확인 |
|---|---|
| fetch(받기) | 원격이면 새 폴더로 받는다. 암호화 manifest를 복호화하고 대상 파일의 크기와 sha256을 manifest와 대조한다. 다르면 임시 컨테이너를 띄우지 않는다 |
| start(기동) | manifest의 고정 이미지로 `--network none`, 새 데이터 폴더, 메모리 제한, WiredTiger 캐시 0.25GB, `ttlMonitorEnabled=false`인 임시 mongod를 띄운다. 운영 컨테이너, 운영 데이터 폴더와 그 하위, 스크립트가 만들지 않은 컨테이너와 폴더는 거부한다 |
| restore(복원) | 복호화 출력을 바로 `mongorestore --archive --gzip --stopOnError`에 넘긴다. `--drop`은 없다 |
| verify(확인) | 컬렉션별 건수가 mongodump 보고값과 같고 manifest에 없는 컬렉션이 없다. "덤프 중 변경"이 아닌 컬렉션은 `dbHash`가 덤프 전 값과 같다. prod는 회사별 활성 정책 버전, 그 정책 문서의 존재, 구독 수, `expiresAt`이 없는 품질 기록 수가 같다 |

덤프 전후 `dbHash`가 다른 컬렉션은 "덤프 중 변경"으로 표시되고 건수로만 확인한다. 정책 버전과 구독 수 같은 prod 확인값이 덤프 전후에 달라졌으면 같은 이유로 건너뛴다. 정책 문서의 존재는 늘 확인한다. 스크립트는 결과를 표와 JSON으로 출력하고 작업 폴더의 `report.json`(0600)에도 남긴다. 끝나면 `--teardown --work-dir <폴더>`가 스크립트가 만든 임시 컨테이너와 폴더만 지운다.

DB 호스트에서 리허설할 때:

- 임시 mongod가 운영 mongod와 메모리, 디스크를 나눠 쓴다. `free -m`의 available이 600MB 이상인지 보고 `--memory 384m`으로 띄운다. 모자라면 `ec2-project`를 붙인 임시 EC2에서 원격 백업본으로 한다.
- 백업 회차(04, 10, 16, 22시)와 부하 시험을 피하고 Grafana 가용 메모리 알림을 본다.
- identity는 팀 비밀 저장소에서 `/root` 아래로 0600으로 잠시 가져오고, 끝나면 `shred -u`로 지운다.
- 호스트 커널이 6.19 이상이면 고정 이미지 mongod가 기동을 거부한다(SERVER-121912). 리허설은 `--kernel-compat`로 glibc rseq를 켜 띄울 수 있다. 할당기 성능은 떨어지지만 확인에는 충분하다. 운영 mongod도 같은 영향을 받으므로 커널을 올리기 전에 `uname -r`과 MongoDB의 수정 버전을 확인한다.

## RPO와 RTO

- RPO: 최대 6시간. 회차 사이에 쓴 데이터를 잃을 수 있다. 백업이 실패하면 그만큼 늘어나므로 마지막 성공 8시간 초과 warning, 14시간 초과 critical, 마지막 시도 실패 warning으로 알린다.
- RTO: 복구 판단과 백엔드 정지를 뺀 기술 시간. 리허설 합계(받기, 기동, 복원, 확인)에 폴더 교체, 계정 재생성, 백엔드 재시작 시간을 더한다. 목표값은 운영 리허설 측정값으로 정한다.

| 측정 | 일시 | 데이터 | 받기 | 기동 | 복원 | 확인 | 합계 |
|---|---|---|---|---|---|---|---|
| 합성 리허설(AI, 로컬 Docker, 고정 이미지 8.0.26) | 2026-11-09 | 합성 DB 세 개 중 prod 126건, dev 평가 컬렉션 28건 | 0.008초 | 1.53초 | 0.379초 | 1.235초 | 3.152초 |
| 운영 리허설(사람, DB 호스트) | | | | | | | |

합성 리허설은 `RUN_MONGODB_INTEGRATION=1 .venv/bin/python -m unittest infra.tests.test_mongodb_backup_runtime`의 결과다. 로컬 Docker 커널이 6.19 이상이라 `--kernel-compat`를 썼다.

## 복구 기록 양식

운영 백업본으로 한 복구 리허설을 여기에 적는다. `report.json`의 값을 옮긴다.

| 항목 | 값 |
|---|---|
| 일시(KST), 수행자 | |
| 원본 실행 폴더와 위치(호스트 폴더 또는 원격) | |
| 명령 | |
| fetch 시작, 종료, 소요 | |
| start 시작, 종료, 소요 | |
| restore 시작, 종료, 소요 | |
| verify 시작, 종료, 소요 | |
| 합계 | |
| 확인 결과(확인, 실패, 건너뜀 건수와 건너뛴 이유) | |
| 리허설 중 가용 메모리 최저값, DB 명령 P95 | |
| 문제와 조치 | |
| `report.json` 보관 위치 | |

## 완료 조건 근거

| 완료 조건 | 근거 위치 |
|---|---|
| 사람 손 없이 주기적으로 DB 백업이 떠지고, 주기, 저장 위치, 보관 기간이 문서에 있다 | 이 문서 "주기, 위치, 보관", `infra/mongodb/mongodb-backup.timer`, "호스트 설치" 8단계의 자동 실행 두 번 확인 결과, Grafana "MongoDB 백업 상태" 패널 |
| 백업본으로 복구를 1회 해보고, 걸린 시간과 데이터가 맞는지 확인한 방법을 기록했다 | 이 문서 "복구 기록 양식"의 운영 리허설 기록과 `report.json`, 확인 방법은 "정합 확인" |

## 주의 사항

- VAPID 키는 GitHub Environment 시크릿에 있고 DB에 없다. 키가 바뀌었으면 구독을 복원해도 발송에 쓸 수 없고, 확장이 새 키로 다시 등록한다.
- 사용자의 지원서 값은 서버에 없어 백업 대상이 아니다.
- admin DB와 계정은 백업하지 않는다. 복구 뒤 계정을 다시 만든다.
- standalone이라 컬렉션 사이의 시점이 완전히 같지 않다. 공고는 있는데 발송 문서가 빠진 상태가 생길 수 있다. 복원 뒤 그런 공고가 있으면 `backend/docs/job-posting-notifications.md`의 재등록 안내를 따른다.
- 평일 09:20(KST) 품질 선정 전에 복원을 끝내지 못하면 선정 Discord 메시지가 다시 갈 수 있다.
- 복원된 PENDING 발송은 열린 공고에 한해 다시 나갈 수 있다.
- 백업 파일에는 푸시 구독 endpoint와 키, 품질 기록이 들어 있다. 평문을 호스트 밖으로 옮기지 않는다.
- 발송 구조가 SQS로 바뀌면 이 문서의 복원 주의 사항을 그 작업에서 갱신한다.
