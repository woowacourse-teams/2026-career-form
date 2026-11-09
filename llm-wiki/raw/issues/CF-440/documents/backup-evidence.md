# MongoDB 백업 용량 실측과 합성 복구 리허설 결과

> Issue: [CF-440](https://github.com/woowacourse-teams/2026-career-form/issues/440)
> Collected: 2026-11-09
> Approval-Digest: f68fe8803fbce18f779131ee3c4662ffff971c5d652498fe5957105ab6048582
> Source-Revision: ba6e178b

[승인 후보 스냅샷](approved-candidates.md)의 후보 4다. 주기와 보관 기간을 정한 용량 근거와, 복구 스크립트를 합성 데이터로 처음 돌린 결과를 적는다. 운영 백업본으로 한 복구 리허설은 사람이 `infra/mongodb/BACKUP.md`의 기록 양식에 적는다.

## 용량 실측 (2026-11-07, 운영 Grafana)

- 세 DB 데이터 합계 약 61MB(dev 35.0MB, staging 13.0MB, prod 12.6MB), 압축 저장 크기 약 19MB.
- 13일 동안 약 3.3MB 늘었다.
- DB 호스트 데이터 디스크는 15.5GB 중 7.8GB가 남아 있었다.
- 덤프 파일은 세 DB를 모두 담는다고 보고 회차당 약 9~13MB로 추정했다. 실제 범위(prod 전체, dev 평가 컬렉션)는 이보다 작다.
- 이 크기에서는 6시간 주기, 호스트 7일, 원격 30일 보관이 용량 제약을 받지 않는다.

## 합성 복구 리허설 (2026-11-09, AI, 로컬)

- 환경: macOS Docker Desktop(커널 7.0.14), 운영 compose와 같은 고정 이미지 `mongo:8.0.26-noble`, mongodump·mongorestore 100.17.0, age 1.3.2. 원격 저장소는 로컬 폴더로 흉내 낸 aws를 썼다. 커널이 6.19 이상이라 합성 운영 mongod와 임시 mongod 모두 `GLIBC_TUNABLES=glibc.pthread.rseq=1`로 띄웠다.
- 데이터: 합성 DB 세 개. prod는 앱 컬렉션 8개 126건(공고 20, 구독 20, 품질 기록 40건 중 `expiresAt` 없는 기록 20), dev는 앱 컬렉션 8개와 `evaluation_` 컬렉션 7개(28건), staging은 앱 컬렉션 8개.
- 백업: 4.09초(스크립트 시작부터 끝까지, 도구 컨테이너 기동 포함). 파일 크기는 prod 2,178바이트, dev 1,135바이트, 암호화 manifest 5,468바이트. dev archive에는 평가 컬렉션만, staging은 어느 파일에도 없었다.
- 호스트 실행 폴더 복구: 받기 0.008초, 기동 1.53초, 복원 0.379초, 확인 1.235초, 합계 3.152초. 확인 40건(크기·sha256, 건수, `dbHash`, 정책 버전, 정책 문서, 구독 수, 영구 품질 기록 수)이 모두 통과했다.
- 원격(흉내) 경로에서 받은 복구도 통과했다. archive 한 바이트를 바꾸면 받기 단계에서 거부하고 임시 컨테이너를 띄우지 않았다. teardown 뒤 임시 컨테이너와 작업 폴더가 남지 않았다.
- 실행: `RUN_MONGODB_INTEGRATION=1 .venv/bin/python -m unittest infra.tests.test_mongodb_backup_runtime`.
- 한계: 운영 데이터 크기, DB 호스트 자원(t4g.micro 메모리), 실제 S3와 IMDS 역할은 쓰지 않았다. RTO 목표는 운영 리허설 측정값으로 정한다.
