# CI/CD 초기 설정

이 문서는 저장소의 CI/CD workflow를 처음 활성화할 때 사람이 수행할 설정을 정리한다.
실제 credential, MongoDB URI, GitHub Actions runner registration token과 SSH용
Cloudflare Tunnel credential은 저장소, Issue, PR, 문서와 로그에 기록하지 않는다.

## 서버 구성

- development와 staging은 같은 Ubuntu ARM64 application host를 사용한다.
  Compose project와 loopback port는 환경별로 분리한다.
- production은 별도의 Ubuntu ARM64 application host를 사용한다.
- MongoDB는 application host와 분리하고 private network에서만 접근시킨다. 환경별
  database와 최소 `readWrite` 권한 계정을 분리한다.
- 모든 application port는 `127.0.0.1`에만 publish한다. 일반 HTTPS 요청은 Elastic IP의
  Nginx로 직접 받고, cloudflared는 SSH 접속에만 사용한다.

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

development와 staging runner를 서로 다른 Linux 사용자로 등록했다면 두 사용자 모두
`docker` group에 포함한다. 이 group은 Docker 접근뿐 아니라 비민감 배포 digest 상태를
공유하는 데 사용한다.

```bash
sudo usermod -aG docker <development-runner-user>
sudo usermod -aG docker <staging-runner-user>
sudo usermod -aG docker <production-runner-user>
sudo chgrp docker /var/lib/career-form/deploy
sudo chmod 0770 /var/lib/career-form/deploy
```

각 host에는 실제 존재하는 runner 사용자만 적용하고 runner 서비스를 재시작한다.

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

Ubuntu ARM64, 2 GiB swap, Docker Compose v2, Nginx, Certbot, SSH용 cloudflared, curl,
jq, git과 runner 서비스 상태를 보고한다. 설치가 필요하면 스크립트를 검토한 관리자가
명시적 확인값과 함께 실행한다.

```bash
sudo env BOOTSTRAP_CONFIRM=APPLY_APP_HOST \
  infra/scripts/bootstrap-app-host.sh --apply
```

`--apply`는 OS 패키지, Docker 공식 apt repository, Nginx, Certbot Nginx plugin,
cloudflared package, 2 GiB swap, `root:docker` 소유의
`/var/lib/career-form/deploy` state directory와 Docker/Nginx 서비스를 준비한다. runner
등록, Nginx virtual host, 인증서 발급과 SSH Tunnel 생성·credential 배치는 자동화하지
않는다.

## Public network와 DNS

각 application host에는 재시작 뒤에도 유지되는 Elastic IP를 연결한다. DNS provider에서
application hostname의 A record를 해당 Elastic IP로 지정한다. Cloudflare DNS를 사용한다면
application hostname은 Proxy가 아닌 **DNS only(회색 구름)** 로 둔다. development와
staging hostname은 같은 Elastic IP를 가리키고 production hostname은 별도 Elastic IP를
가리킨다.

application host security group은 TCP 80과 443만 public ingress로 허용한다. backend
container port 8080과 `BACKEND_PORT`, SSH 22는 public ingress에서 제거한다. SSH는 별도
Cloudflare Tunnel을 통해서만 접속한다.

## Nginx reverse proxy

development/staging host의 `/etc/nginx/sites-available/career-form`에 인증서 발급 전
HTTP server block을 다음 형태로 저장한다. `development.example.com`과
`staging.example.com`은 실제 DNS-only hostname으로, port는 GitHub Environment의
`BACKEND_PORT` 값으로 치환한다.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name development.example.com;

    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name staging.example.com;

    location / {
        proxy_pass http://127.0.0.1:18081;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

production host에는 같은 형식의 server block 하나만 두고 production hostname과 port를
사용한다. 적용 전에 placeholder가 남지 않았는지 확인하고 다음 순서로 활성화한다.

```bash
sudo ln -s /etc/nginx/sites-available/career-form /etc/nginx/sites-enabled/career-form
sudo unlink /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

해당 symlink가 실제로 존재할 때만 `ln` 또는 `unlink`를 실행한다. DNS 전파와 HTTP 접근을
확인한 뒤 실제 hostname으로 인증서를 발급한다.

```bash
sudo certbot --nginx --redirect \
  -d development.example.com \
  -d staging.example.com
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

production host는 production hostname 하나로 같은 절차를 수행한다. Certbot이 443 TLS
server block과 80에서 HTTPS로 가는 redirect를 관리한다. 앱 배포 workflow는 Nginx 설정,
인증서와 Certbot timer를 변경하지 않는다.

## SSH 전용 Cloudflare Tunnel

기존 Cloudflare Tunnel은 SSH 접속에만 사용한다. Tunnel ingress에 application HTTP/HTTPS
hostname이나 `http://127.0.0.1:80` service를 추가하지 않는다. SSH hostname과
`ssh://localhost:22` service만 유지하고, token과 credential JSON은 관리자 터미널과
host의 제한된 파일에서만 다룬다. 설정 후 다음을 확인한다.

```bash
sudo find /etc/cloudflared -maxdepth 1 -type f \
  \( -name 'config.yml' -o -name '*.json' \) \
  -exec chmod 0600 {} +
sudo cloudflared tunnel ingress validate
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

## MongoDB Docker host bootstrap

MongoDB host는 Ubuntu 26.04 ARM64 host에 MongoDB apt package를 직접 설치하지 않는다.
Docker Engine은 host OS repository에서 설치하고, MongoDB는 ARM64를 제공하는
`mongo:8.0.26-noble`의 검증된 multi-platform digest로 실행한다. host 교체 없이
container userland를 MongoDB 지원 Ubuntu release에 고정하며, application 배포
Compose와 DB Compose는 분리한다.

작업 PC의 CF-19 worktree에서 검토한 세 파일을 DB host로 전송한다. `project-db`는 로컬
SSH config의 ProxyJump alias다.

```bash
scp infra/scripts/bootstrap-mongodb-host.sh project-db:/tmp/
scp infra/scripts/mongodb-compose.sh project-db:/tmp/
scp infra/mongodb/compose.yaml project-db:/tmp/mongodb-compose.yaml
```

DB host에서 읽기 전용 검사 후 관리자 확인을 분리한다. 첫 `--check`는 Docker와 directory가
아직 없으면 exit 1을 반환하는 것이 정상이다.

```bash
sudo /tmp/bootstrap-mongodb-host.sh --check
sudo env BOOTSTRAP_CONFIRM=APPLY_MONGODB_HOST \
  /tmp/bootstrap-mongodb-host.sh --apply
sudo install -o root -g root -m 0644 /tmp/mongodb-compose.yaml \
  /opt/career-form/mongodb/compose.yaml
sudo install -o root -g root -m 0755 /tmp/mongodb-compose.sh \
  /usr/local/sbin/career-form-mongodb
```

`--apply`는 Docker 공식 apt repository, Engine, Compose plugin,
`/var/lib/career-form/mongodb`, `/etc/career-form`과 `/opt/career-form/mongodb`만 준비한다.
MongoDB package, database, 사용자와 credential은 만들지 않는다.

관리자가 password manager에서 새 root password를 만들고 host의 mode 0600 파일에 직접
입력한다. 실제 값을 shell command 인자나 history에 넣지 않는다.

```bash
sudo touch /etc/career-form/mongodb.env
sudo chown root:root /etc/career-form/mongodb.env
sudo chmod 0600 /etc/career-form/mongodb.env
sudoedit /etc/career-form/mongodb.env
```

```dotenv
MONGO_INITDB_ROOT_USERNAME=career_form_admin
MONGO_INITDB_ROOT_PASSWORD=<password-manager에서 생성한 실제 값>
```

placeholder를 실제 값으로 바꾸고 저장한다. root 계정 자동 생성은 data directory가 비어
있는 최초 기동에서만 실행된다. DB host의 private IPv4를 명시해 설정 검증, image pull과
기동을 순서대로 수행한다. `config`에는 반드시 `--quiet`을 사용한다.

```bash
sudo env MONGODB_BIND_IP=<mongodb-private-ip> \
  /usr/local/sbin/career-form-mongodb --check
sudo env MONGODB_BIND_IP=<mongodb-private-ip> \
  /usr/local/sbin/career-form-mongodb --pull
sudo env MONGODB_BIND_IP=<mongodb-private-ip> \
  /usr/local/sbin/career-form-mongodb --up
```

application host security group에서 오는 TCP 27017만 MongoDB host security group에
허용한다. public IP, `0.0.0.0/0` 또는 application 이외 security group에는 27017을
허용하지 않는다. 관리 script도 RFC1918 private IPv4가 아니면 Docker 실행 전에
거부하고, Compose는 검증된 host private IPv4에만 port를 publish한다.

root로 인증된 `mongosh`에 들어갈 때 password는 prompt에 입력한다.

```bash
sudo env MONGODB_BIND_IP=<mongodb-private-ip> \
  /usr/local/sbin/career-form-mongodb --shell
```

인증된 `mongosh`에서 환경마다 다음 블록의 database와 username만 바꿔 세 계정을 만든다.
각 계정에는 자기 database의 `readWrite`만 부여한다.

```javascript
use career_form_development
db.createUser({
  user: "career_form_development",
  pwd: passwordPrompt(),
  roles: [{ role: "readWrite", db: "career_form_development" }]
})
```

같은 방식으로 `career_form_staging`, `career_form_production`을 각각 생성한다. 비밀번호를
URI에 넣을 때는 percent-encoding하고 완성된 URI는 해당 GitHub Environment Secret에만
입력한다. 계정 격리는 각 계정으로 자기 DB의 읽기·쓰기 성공과 다른 DB의 쓰기 실패를
확인한다.

development Environment URI 형식은 다음과 같다.

```text
mongodb://career_form_development:<percent-encoded-password>@<mongodb-private-ip>:27017/career_form_development?authSource=career_form_development
```

운영 중에는 container image 갱신을 자동으로 따라가지 않는다. patch tag와 digest 변경은
별도 검토와 backup·restore rehearsal 뒤 함께 적용한다. `/var/lib/career-form/mongodb`의
backup과 restore, security group·private bind·계정 권한, 저장 공간과 경보는 별도 운영
정책으로 관리한다.

## 활성화 전 확인

- Repository Variable 1개, Repository Secrets 2개가 존재한다.
- 세 Environment에 `BACKEND_PORT`와 `SPRING_MONGODB_URI`가 존재한다.
- runner가 workflow의 정확한 환경 label로 online 상태다.
- 각 host가 pull-only 계정으로 private image를 pull할 수 있다.
- DNS-only application hostname이 각 host의 Elastic IP를 가리킨다.
- security group은 public 80/443만 허용하고 22, 8080과 `BACKEND_PORT`를 허용하지 않는다.
- Nginx HTTPS와 Certbot 자동 갱신이 정상이며 cloudflared는 SSH ingress만 갖는다.
- MongoDB container가 healthy이며 application host의 private network에서만 접근할 수 있다.
- 실제 값을 출력하지 않고 `--check`와 GitHub UI의 이름만 대조한다.

실제 실행 순서와 장애 대응은 [배포 운영 Runbook](deployment-runbook.md)을 따른다.
