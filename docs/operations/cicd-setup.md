# CI/CD 초기 설정

이 문서는 저장소의 CI/CD workflow를 처음 활성화할 때 사람이 수행할 설정을 정리한다.
실제 credential, MongoDB URI, GitHub Actions runner registration token과 Cloudflare
Tunnel credential은 저장소, Issue, PR, 문서와 로그에 기록하지 않는다.

## 서버 구성

- development와 staging은 같은 Ubuntu ARM64 application host를 사용한다.
  Compose project와 loopback port는 환경별로 분리한다.
- production은 별도의 Ubuntu ARM64 application host를 사용한다.
- MongoDB는 application host와 분리하고 private network에서만 접근시킨다. 환경별
  database와 최소 `readWrite` 권한 계정을 분리한다.
- 모든 application port는 `127.0.0.1`에만 publish하고 외부 연결은 Nginx와
  cloudflared를 통과시킨다.

## GitHub Repository 설정

### Repository Variables

| 이름 | 값의 형식 | 용도 |
|---|---|---|
| `DOCKERHUB_IMAGE` | `namespace/repository` | tag나 digest가 없는 private image repository |

### Repository Secrets

| 이름 | 권한 | 용도 |
|---|---|---|
| `DOCKERHUB_USERNAME` | Docker Hub push 전용 계정 | GitHub-hosted build job의 registry login |
| `DOCKERHUB_TOKEN` | 대상 repository read/write만 허용 | 이미지 push와 release digest 조회 |

GitHub가 각 workflow에 자동 발급하는 `GITHUB_TOKEN`은 별도로 만들지 않는다. workflow에
선언된 job별 `contents`와 `pull-requests` 권한만 사용한다.

### GitHub Environments

`development`, `staging`, `production` Environment를 만들고 각각 다음 항목을 둔다.

| 구분 | 이름 | 용도 |
|---|---|---|
| Environment Variable | `BACKEND_PORT` | host의 환경별 loopback publish port |
| Environment Secret | `SPRING_MONGODB_URI` | 환경 전용 database와 계정을 포함한 연결 URI |

development와 staging은 같은 host이므로 `BACKEND_PORT`가 겹치면 안 된다. production은
별도 host이므로 독립적으로 정한다. production은 main 병합 직후 자동 배포한다는 정책에
따라 required reviewer를 추가하지 않는다. Environment deployment branch 제한은 각각
`develop`, `release/*`, `main`으로 설정한다.

Repository의 Actions 설정에서 workflow의 read/write 권한과 GitHub Actions의 PR 생성
허용을 켠다. Start release, Draft revert, release/hotfix 동기화 PR과 release tag 생성에
필요하다. release 동기화 완료 workflow가 `release/*` 브랜치를 삭제할 수 있도록 실제
Ruleset의 GitHub Actions bypass 범위도 사람이 확인한다.

## Self-hosted runner

GitHub-hosted job만 PR 코드를 실행한다. public repository의 PR이 application host에서
실행되지 않도록 self-hosted runner label을 가진 job은 신뢰된 branch의 `push`에서만
호출한다.

| host | runner label 집합 |
|---|---|
| development/staging host | `self-hosted`, `linux`, `ARM64`, `development` 또는 `staging` |
| production host | `self-hosted`, `linux`, `ARM64`, `production` |

같은 host에 development와 staging runner를 따로 등록하면 runner 작업 디렉터리와
서비스를 분리한다. GitHub의 `Settings → Actions → Runners → New self-hosted runner`가
보여 주는 최신 ARM64 설치 명령을 사용한다. registration token은 단시간만 유효한
일회성 값이므로 파일, 셸 history, 문서에 저장하지 않는다. runner는 서비스로 설치하고
자동 업데이트를 유지한다.

runner 서비스 사용자를 Docker group에 추가한 뒤 다시 로그인하고 다음을 확인한다.

```bash
docker version
docker compose version
systemctl list-units 'actions.runner.*.service'
```

각 application host에서 Docker Hub pull-only 계정으로 한 번 로그인한다. 이 계정은
image push나 repository 설정 변경 권한을 갖지 않으며 credential은 runner 사용자 전용
Docker config에 저장한다. pull credential을 GitHub Secrets에 중복 저장하지 않는다.

## Application host bootstrap

먼저 읽기 전용 검사를 실행한다.

```bash
sudo infra/scripts/bootstrap-app-host.sh --check
```

Ubuntu ARM64, 2 GiB swap, Docker Compose v2, Nginx, cloudflared, curl, jq, git과 runner
서비스 상태를 보고한다. 설치가 필요하면 스크립트를 검토한 관리자가 명시적 확인값과
함께 실행한다.

```bash
sudo env BOOTSTRAP_CONFIRM=APPLY_APP_HOST \
  infra/scripts/bootstrap-app-host.sh --apply
```

`--apply`는 OS 패키지, Docker 공식 apt repository, cloudflared package, 2 GiB swap,
`/var/lib/career-form/deploy` state directory와 Docker/Nginx 서비스를 준비한다. runner
등록, Nginx virtual host, Cloudflare Tunnel 생성과 credential 배치는 자동화하지 않는다.

## MongoDB host bootstrap

MongoDB host에서도 검사 후 관리자 확인을 분리한다.

```bash
sudo infra/scripts/bootstrap-mongodb-host.sh --check
sudo env BOOTSTRAP_CONFIRM=APPLY_MONGODB_HOST \
  infra/scripts/bootstrap-mongodb-host.sh --apply
```

`--apply`는 MongoDB 8.0 공식 apt repository, MongoDB systemd service와 2 GiB swap만
준비한다. 다음 항목은 사람이 private network에서 수행한다.

- private interface만 허용하는 bind 설정과 security group
- 인증 활성화와 관리자 계정
- development, staging, production database 및 환경별 `readWrite` 계정
- TLS, backup, restore rehearsal, 저장 공간과 경보
- 생성한 환경별 URI를 해당 GitHub Environment의 `SPRING_MONGODB_URI`에 입력

## 활성화 전 확인

- Repository Variable 1개, Repository Secrets 2개가 존재한다.
- 세 Environment에 `BACKEND_PORT`와 `SPRING_MONGODB_URI`가 존재한다.
- runner가 workflow의 정확한 환경 label로 online 상태다.
- 각 host가 pull-only 계정으로 private image를 pull할 수 있다.
- application port는 loopback에만 열리고 Nginx/cloudflared 경로만 외부에 노출된다.
- MongoDB는 application host의 private network에서만 접근할 수 있다.
- 실제 값을 출력하지 않고 `--check`와 GitHub UI의 이름만 대조한다.

실제 실행 순서와 장애 대응은 [배포 운영 Runbook](deployment-runbook.md)을 따른다.
