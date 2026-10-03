# 모니터링 운영

## 구성과 현재 상태

Issue #131의 중앙 스택과 백엔드 계측 구현이다. 서버 기반 준비는 사람이
확인했다. 로컬 ARM64 Docker에서 합성 데이터로 수집과 조회를 검증하며,
실제 AWS 배포, Discord 수신, 장기 보존과 메모리 측정은 아직 별도 확인이 필요하다.

| 역할 | 주소 | 실행 구성 |
|---|---|---|
| 중앙 모니터링 | 10.0.0.72 | Grafana, Loki, Prometheus, Nginx, 호스트 Alloy |
| dev/staging 공용 앱 호스트 | 10.0.0.64 | 기존 backend 두 개, 수집 Alloy 하나 |
| prod 앱 호스트 | 10.0.0.84 | 기존 backend, 수집 Alloy 하나 |

중앙 서버는 Ubuntu 26.04 ARM64, t4g.micro, project-public-a,
gp3 루트 EBS 16GiB다. 새 AWS 리소스는 필요하지 않다. 공유 보안 그룹은 임의로
수정하지 않고 운영자가 대상과 영향 범위를 확인한다.
Nginx는 HTTP 80을 공개하고 Compose 내부의 grafana:3000으로 전달한다.
Grafana의 호스트 3000은 loopback 진단용으로 유지하며 수집 proxy는 중앙 private IP의
3100/9090에 bind한다. UI 로그인은 Grafana가 처리하고 수집용 Basic 인증과 IP 제한은
3100/9090에만 적용한다.
Loki와 Prometheus의 조회 포트는 호스트에 publish하지 않는다.
EC2 public IP는 private IP로 매핑되므로 private bind만으로 외부 차단을
보장하지 않는다. 보안 그룹에 3100/9090의 공개 규칙을 추가하지 않고,
proxy는 두 앱 호스트 IP와 Basic 인증을 함께 확인한다.
수집 구간은 VPC 내부 HTTP이며 TLS 암호화는 적용하지 않았다. Basic 인증이
전송 내용의 암호화를 제공하지 않으므로 신뢰한 내부 네트워크에서만 사용한다.

## 수집하는 데이터

- backend 컨테이너 stdout/stderr: 시작, API 결과, 외부 호출 결과와 기존 운영 로그.
- API_RESULT: 서버 생성 request ID, 환경, HTTP method, route pattern, 상태, 소요 시간, 예외 타입.
- EXTERNAL_RESULT: OpenAI/Jev provider, operation, 성공/실패/timeout, 소요 시간, request ID.
- DB_RESULT: MongoDB Greeting 정책 조회 결과, 소요 시간, 실패 타입. 쿼리와 문서는 기록하지 않는다.
- Actuator: 요청 수, 5xx, 평균과 p95 응답 시간, JVM heap과 GC.
- 별도 외부 호출 지표: latency histogram과 timeout counter.
- 호스트 지표: CPU, 메모리, 루트 파일시스템, load. dev/staging 공용 호스트는 한 번만 수집한다.

로그는 env=dev/staging/prod, service, 컨테이너 instance로 구분한다.
Docker label career-form.monitoring=true, env와 service가 있는 9091 노출
컨테이너만 자동 발견한다. 배포 label은 infra/compose.deploy.yaml에서 설정한다.
기존 실행 컨테이너에는 label과 관리 포트가 자동 추가되지 않는다.
백엔드 변경과 환경별 컨테이너 재배포가 끝나야 실제 수집이 시작된다.

새 관측 로그에는 raw URL, query, body, 지원서 내용, 토큰과 예외 메시지를
넣지 않는다. 기존 stdout/stderr도 수집하므로 기존 코드가 민감값을 출력하는지는
배포 전에 확인해야 한다. 모든 기존 로그의 비식별화를 보장하는 필터는 아니다.
기존 안전한 오류 로그에도 MDC request ID를 붙인다. DB_RESULT는 애플리케이션의
정책 조회 경로만 대상으로 하며 DB 서버 로그와 모든 DB command 수집은 아니다.
LLM timeout 알림은 코드가 timeout 예외를 인식한 경우에만 동작한다.

## 서버 기반 준비

중앙 서버에서 bootstrap-monitoring-host.sh --check의 모든 항목이 ready,
Docker daemon과 Compose가 정상인지 확인한다. 신규 설치가 필요할 때만
스크립트를 검토하고 사람이 승인한 다음 실행한다.

```bash
scp infra/scripts/bootstrap-monitoring-host.sh career-monitor:~/bootstrap-monitoring-host.sh
ssh career-monitor
less ~/bootstrap-monitoring-host.sh
sudo bash ~/bootstrap-monitoring-host.sh --check
sudo env BOOTSTRAP_CONFIRM=APPLY_MONITORING_HOST bash ~/bootstrap-monitoring-host.sh --apply
```

bootstrap은 Ubuntu 24.04/26.04 ARM64만 허용한다. 공식 Docker apt 저장소를
사용하고 기존 Docker/containerd/runc 충돌 패키지는 자동 삭제하지 않는다.
디스크 포맷, EBS mount, swap, 방화벽, SSH 변경과 컨테이너 배포는 하지 않는다.
사용자는 AMI의 Canonical 소유자와 ARM64 여부, 필수 Service/Role/ProjectTeam
태그를 확인한다.

## 중앙 설정 복사와 영속 경로

이후 명령은 검토한 브랜치에서 사람이 수행한다. AI는 배포하지 않는다.
시크릿을 저장소, 채팅, 명령 인자, 전체 docker inspect/config 출력에 넣지 않는다.
중앙 디렉터리에 이미 다른 버전이 있다면 먼저 차이를 검토한다.

로컬에서 설정을 복사한다.

```bash
scp -r infra/monitoring career-monitor:~/monitoring-config
ssh career-monitor
sudo cp -a ~/monitoring-config/. /opt/career-form/monitoring/
sudo install -d -m 0700 /srv/career-form-monitoring
sudo install -d -m 0700 -o 10001 -g 10001 /srv/career-form-monitoring/loki
sudo install -d -m 0700 -o 65534 -g 65534 /srv/career-form-monitoring/prometheus
sudo install -d -m 0700 -o 472 -g 472 /srv/career-form-monitoring/grafana
sudo install -d -m 0700 -o 0 -g 0 /srv/career-form-monitoring/host-metrics
sudo install -d -m 0700 /etc/career-form-monitoring/secrets
```

UID는 고정한 이미지의 Loki=10001, Prometheus=nobody(65534),
Grafana=472, Alloy=root 기준이다. 기존 데이터의 소유권을 재귀 변경하거나
삭제하지 않는다. 파일 mount는 create_host_path=false이므로 누락되면 시작에 실패한다.

## 사람이 준비하는 비밀 설정

첫 설치에서만 암호를 생성한다. 기존 파일이 있으면 유지한다.

```bash
sudo sh -c 'umask 077; test -e /etc/career-form-monitoring/secrets/grafana-password || openssl rand -hex 32 > /etc/career-form-monitoring/secrets/grafana-password'
sudo sh -c 'umask 077; test -e /etc/career-form-monitoring/secrets/ingest-password || openssl rand -hex 32 > /etc/career-form-monitoring/secrets/ingest-password'
sudo sh -c 'umask 077; test -e /etc/career-form-monitoring/secrets/ingest.htpasswd || printf "alloy:%s\\n" "$(openssl passwd -apr1 -stdin < /etc/career-form-monitoring/secrets/ingest-password)" > /etc/career-form-monitoring/secrets/ingest.htpasswd'
sudo chmod 0644 /etc/career-form-monitoring/secrets/grafana-password /etc/career-form-monitoring/secrets/ingest.htpasswd
sudo test -e /etc/career-form-monitoring/secrets/grafana.env || sudo install -m 0600 /dev/null /etc/career-form-monitoring/secrets/grafana.env
sudoedit /etc/career-form-monitoring/secrets/grafana.env
```

grafana.env에는 DISCORD_WEBHOOK_URL=실제_웹훅_URL 한 줄만 넣는다.
Grafana 암호와 htpasswd는 개별 read-only bind 파일을 비-root 프로세스가
읽을 수 있도록 0644로 두되 부모 secrets 디렉터리는 root 0700이다.
ingest-password와 grafana.env는 0600을 유지한다.
웹훅은 Grafana 환경에 주입되므로 Docker 관리자에게는 노출될 수 있다.
Docker 권한을 일반 사용자에게 추가하지 않는다.

```bash
sudoedit /etc/career-form-monitoring/config.env
```

config.env에는 아래 값을 저장한다. 시크릿은 넣지 않는다.

```dotenv
MONITORING_PRIVATE_IP=10.0.0.72
MONITORING_PUBLIC_URL=http://실제_모니터링_서버_주소/
```

MONITORING_PUBLIC_URL은 브라우저에서 사용할 실제 HTTP 주소이며 끝에 `/`를 붙인다.
서브 경로 없이 서버의 루트 주소를 사용한다. 미지정 또는 빈 값이면 Compose가 시작을
거부한다. 서버의 공개 주소가 바뀌면 이 값과 공유한 접속 URL을 함께 갱신한다.

## 중앙 스택 시작과 브라우저 접속

```bash
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml config --quiet
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml up -d
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml ps
curl --fail --max-time 10 http://127.0.0.1:3000/api/health
```

브라우저에서 MONITORING_PUBLIC_URL에 지정한 주소를 연다. 운영자는 초기 관리자
암호를 서버에서 직접 확인하고 조회 사용자에게는 별도의 일반 사용자 계정을 생성해 조직
역할을 Viewer로 지정한다. Server Admin 권한은 주지 않는다. 계정과 암호는 승인된
비공개 경로로 전달하고 저장소, Issue, PR에 기록하지 않는다. 조회 사용자는 해당 계정으로
로그인해 `career-form-monitoring` 대시보드를 조회한다. 익명 접근과 자체 회원 가입은
계속 비활성화한다. Viewer도 허용된 데이터 소스를 조회할 수 있으므로 신뢰할 수 있는
팀 구성원에게만 제공한다.

외부 HTTP는 로그인 정보와 세션을 암호화하지 않는다. 운영자가 허용할 접속 원본
범위를 결정하고 서버의 80 포트에 적용한다. 공유 보안 그룹이면 다른 인스턴스에 대한
영향과 변경 권한을 확인한다. 3000, 3100, 9090의 공개 인바운드 규칙은 추가하지 않는다.
HTTPS와 인증서 도입은 별도 후속 작업이다.

### 기존 모니터링 서버에 CF-154 적용

`develop` 또는 `main` 머지만으로 이 서버가 갱신되지는 않는다. 다음은 운영자가
실행한다. 머지된 커밋의 설정을 준비하고 현재 서버 파일과 비교한다. 이 변경에는
`compose.yaml`, `proxy.conf` 두 파일만 복사하여 기존 알림 provisioning을 덮어쓰지 않는다.

서버에서 먼저 80 포트 점유와 현재 스택 상태를 확인하고 백업한다. 아래 명령은 같은
서버 셸에서 순서대로 실행한다. 백업 경로를 기록해 롤백 때 사용한다.

```bash
ssh career-monitor
sudo ss -ltnp 'sport = :80'
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml ps
monitoring_backup="/opt/career-form/monitoring-backup-$(date +%Y%m%d%H%M%S)"
sudo install -d -m 0700 "$monitoring_backup"
sudo cp -a /opt/career-form/monitoring/compose.yaml /opt/career-form/monitoring/proxy.conf /etc/career-form-monitoring/config.env "$monitoring_backup/"
printf '%s\n' "$monitoring_backup"
```

80을 다른 서비스가 사용한다면 적용을 중단하고 충돌을 해결한다. 로컬의 머지된
체크아웃에서 아래 파일을 임시 경로로 전송한다.

```bash
scp infra/monitoring/compose.yaml career-monitor:~/cf154-compose.yaml
scp infra/monitoring/proxy.conf career-monitor:~/cf154-proxy.conf
```

서버에서 config.env의 기존 값을 유지하면서 MONITORING_PUBLIC_URL을 추가한다.
Nginx 구문 검사 전후까지 외부 80 접근은 제한하고, 검사와 적용이 끝난 후 승인한
원본만 접근하도록 설정한다.

```bash
sudo install -m 0644 ~/cf154-compose.yaml /opt/career-form/monitoring/compose.yaml
sudo install -m 0644 ~/cf154-proxy.conf /opt/career-form/monitoring/proxy.conf
sudoedit /etc/career-form-monitoring/config.env
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml config --quiet
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml run --rm --no-deps ingest nginx -t
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml up -d --no-deps --force-recreate grafana ingest
curl --fail --retry 12 --retry-all-errors --retry-delay 2 --max-time 10 http://127.0.0.1/api/health
```

Grafana와 Nginx 재생성 중 UI·수집·알림 평가가 잠시 중단될 수 있다. Loki, Prometheus,
Alloy와 영속 데이터 경로는 변경하지 않는다. 전체 Compose config나 환경변수를 출력해
시크릿을 노출하지 않는다.

SSH 터널을 끈 다른 컴퓨터에서 URL을 열어 로그인, 정적 자원 로딩, 환경별 데이터 조회와
Grafana Live 연결을 확인한다. Viewer 계정의 관리 기능 접근 제한, 실제 Discord 링크의
외부 주소, 기존 로그·메트릭 수집도 확인한다.

실패하면 외부 80 접근을 다시 제한하고 기록한 백업 경로로 복구한다.

```bash
sudo cp -a "$monitoring_backup/compose.yaml" "$monitoring_backup/proxy.conf" /opt/career-form/monitoring/
sudo cp -a "$monitoring_backup/config.env" /etc/career-form-monitoring/config.env
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml config --quiet
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml up -d --no-deps --force-recreate grafana ingest
curl --fail --retry 12 --retry-all-errors --retry-delay 2 --max-time 10 http://127.0.0.1:3000/api/health
```

기존 영속 데이터나 계정을 삭제하지 않는다. 이전 설정으로 복구하면 기존 SSH 터널로
접속한다. 정상 구성에서도 loopback 3000은 진단용으로 남아 있지만 Live와 링크는
MONITORING_PUBLIC_URL 기준이므로 외부 URL을 통한 확인이 최종 접속 검증이다.

```bash
ssh -N -L 13000:127.0.0.1:3000 career-monitor
```

## 앱 호스트 수집기 설치

두 앱 호스트에 같은 수집 파일을 복사하고 HOST_INSTANCE만 구분한다.
앱의 관리 포트 9091을 EC2 public 포트로 publish하지 않는다.

```bash
scp -r infra/monitoring/alloy career-dev:~/monitoring-alloy
scp -r infra/monitoring/alloy career-prod:~/monitoring-alloy
```

각 앱 호스트에서 사람이 실행한다.

```bash
sudo install -d -m 0755 /opt/career-form/monitoring-alloy
sudo cp -a ~/monitoring-alloy/. /opt/career-form/monitoring-alloy/
sudo install -d -m 0700 /var/lib/career-form/alloy /etc/career-form-monitoring/secrets
sudoedit /etc/career-form-monitoring/alloy.env
```

dev/staging 호스트에는 아래 값, prod에는 HOST_INSTANCE=career-prod를 저장한다.

```dotenv
MONITORING_PRIVATE_IP=10.0.0.72
HOST_INSTANCE=career-dev-staging
```

동일 ingest 암호를 두 앱 호스트로 전달한다. 로컬 터미널에서 파이프로
전달하면 화면과 로컬 파일에 암호를 출력하지 않는다. 세 서버의 sudo 사용 권한이 필요하다.
sudo 암호 입력이나 비대화형 sudo 제한이 있으면 사람이 별도 보안 경로로 전달한다.

```bash
ssh career-monitor 'sudo cat /etc/career-form-monitoring/secrets/ingest-password' | ssh career-dev "sudo sh -c 'IFS= read -r monitoring_password && test \"\${#monitoring_password}\" -eq 64 && test ! -e /etc/career-form-monitoring/secrets/ingest-password && umask 077 && printf \"%s\\n\" \"\$monitoring_password\" > /etc/career-form-monitoring/secrets/ingest-password'"
ssh career-monitor 'sudo cat /etc/career-form-monitoring/secrets/ingest-password' | ssh career-prod "sudo sh -c 'IFS= read -r monitoring_password && test \"\${#monitoring_password}\" -eq 64 && test ! -e /etc/career-form-monitoring/secrets/ingest-password && umask 077 && printf \"%s\\n\" \"\$monitoring_password\" > /etc/career-form-monitoring/secrets/ingest-password'"
```

위 전달은 64자리 입력만 저장하고 기존 파일이 있으면 중단한다. 중앙 읽기가
실패했을 때 앱 암호 파일을 빈 파일로 만들지 않는다. 암호 교체는 별도 승인과
중앙 및 두 앱 호스트의 일괄 갱신이 필요하다.
암호 파일의 존재와 0600 권한을 확인한 뒤 각 호스트에서 시작한다.

```bash
sudo docker compose -p career-form-alloy --env-file /etc/career-form-monitoring/alloy.env -f /opt/career-form/monitoring-alloy/compose.yaml config --quiet
sudo docker compose -p career-form-alloy --env-file /etc/career-form-monitoring/alloy.env -f /opt/career-form/monitoring-alloy/compose.yaml up -d
sudo docker compose -p career-form-alloy --env-file /etc/career-form-monitoring/alloy.env -f /opt/career-form/monitoring-alloy/compose.yaml ps
```

Alloy는 Docker socket과 host filesystem을 읽는다. socket의 :ro는 Docker API의
쓰기 호출을 막는 권한 경계가 아니다. root 수준 접근으로 취급하고 이미지와
설정을 신뢰한 경우에만 설치한다. host network는 Linux 실제 호스트에서 검증한다.
관리 포트는 host localhost에 publish하지 않아도 host network Alloy가
Docker bridge 컨테이너 IP로 scrape한다. 이 경로의 실제 서버 방화벽은 수동 확인한다.

## 대시보드와 알림

Career Form dashboard에서 env를 선택하면 로그와 backend 지표가 바뀐다.
host 선택은 독립이며 dev와 staging의 같은 호스트를 중복 표시하지 않는다.
알림은 dashboard 선택과 무관하게 세 환경별 고정 쿼리로 평가한다.

| 조건 | 초기값 |
|---|---|
| backend scrape 실패 | 2분 지속 |
| 환경 수집 데이터 소실 | 30초 lookback 후 90초 지속 |
| 모니터링 루트 디스크 사용량 | 80% 이상 5분 지속 |
| dev/staging 공용 호스트 루트 디스크 사용량 | 95% 이상 5분 지속 |
| prod 호스트 루트 디스크 사용량 | 90% 이상 5분 지속 |
| HTTP 5xx | 최근 5분 증가량 3 이상 |
| LLM timeout | 최근 5분 증가량 1 이상 |
| 일반 API 2초 초과 | 최근 5분 증가량 3 이상, 분석 API 제외 |
| OpenAI 분석 20초 초과 | 최근 5분 증가량 3 이상 |
| 8초 timeout 외부 호출 5초 초과 | 최근 5분 증가량 3 이상 |

메트릭 increase는 scrape 간격에 따라 보간되므로 요청 원시 개수와 완전히 같지 않다.
timeout도 첫 scrape 전에 발생하면 증가량을 놓칠 수 있다. 전용 counter는 시작 시
0으로 등록하지만 첫 기준점 이전 사건을 복구하지는 않는다.
정상 무트래픽을 장애로 보지 않으며 datasource 실행 오류는 Alerting으로 취급한다.
기본 반복은 10분이고 복구 알림을 보낸다. 배포 억제는 아직 없다.
애플리케이션 정지가 2분을 넘으면 배포 중에도 장애 알림이 올 수 있다.

실제 Discord에서 contact point Test를 실행하고 환경별 규칙과 메시지를 확인한다.
dev에서만 안전한 합성 timeout/5xx 시험을 승인해 수행한다.
prod는 서비스 중단이나 부하 없이 test notification과 정상 조회만 확인한다.
공용 모니터링 서버 자체가 죽으면 그 서버의 Grafana도 알림을 보낼 수 없다.

### 호스트 디스크 알림

`rules-hosts.json`은 `career-dev-staging`과 `career-prod`를 각각 고정 쿼리로
평가한다. `job="host"`, `mountpoint="/"`만 사용하며 호스트 지표와 규칙에
애플리케이션 `env`를 붙이지 않는다. dev와 staging은 하나의 EC2이므로
규칙도 하나다. 대시보드의 env, host 선택은 규칙 평가에 영향을 주지 않는다.
기존 `rules.json`의 `career-monitor` 80% 규칙과 오류 처리 정책은 유지한다.

두 호스트 규칙의 평가 간격은 30초다. dev/staging은 사용률 95% 이상,
prod는 90% 이상이 5분 지속되면 장애다. 실측 사용률이 각 호스트의
임계값 미만으로 돌아오면 복구한다. `career-discord`를 사용하며
호스트 route는 `instance`별로 그룹을 분리한다. 첫 통지는 기본 30초 대기,
그룹 갱신은 1분, 반복 통지는 10분이므로 평가 시점과 수신 시점은 다르다.
메시지에는 호스트, 사용률, 호스트별 임계값과 루트 디스크 패널 링크가 포함된다.
dev/staging은 기존 90% 규칙의 UID를 유지해 95%로 조정하므로 중복 규칙을
추가하지 않는다. 95% 알림은 남은 공간이 적어 이미지 다운로드와 로그 증가에
대응할 여유가 줄어든다.

두 호스트 규칙은 No Data와 datasource error를 `KeepLast`로 처리한다.
측정 실패를 사용률 초과나 복구로 취급하지 않고 직전 Normal, Pending,
Alerting 상태를 유지한다. Pending의 시작 시각도 유지하므로 데이터가
돌아온 뒤 임계값 이상이면 누락 구간을 포함한 경과 시간으로 장애가 될 수 있다.
직전 상태가 장애면 데이터가 없는 동안에도 10분 반복 통지가 이어질 수 있고,
측정값이 없는 메시지는 사용률을 `측정 불가`로 표시한다. 이 정책은 수집 실패
자체를 별도 Discord 알림으로 보내지 않는다. Grafana에서 alert instance의
`NoData, KeepLast`, `Error, KeepLast` 상태 사유와 Prometheus의 호스트 시계열
최신 시각을 함께 확인해야 한다. rule health가 `ok`여도 상태 사유를 확인한다.

설정 반영과 아래 운영 확인은 사람이 수행한다.

1. 모니터링 서버의 provisioning에 `rules-hosts.json`과 `policies.json`을 반영한 뒤
   Grafana의 `career-form-hosts` 그룹에서 dev/staging은 95%, prod는 90%이고
   두 규칙 모두 Pending 5분인지 확인한다.
2. dev/staging의 규칙이 하나이고 각 규칙의 `instance`, 루트 mountpoint, 대시보드
   연결을 확인한다. env와 host 선택을 바꿔도 두 규칙의 대상이 유지되는지 확인한다.
3. 기존 `career-monitor`의 80%, 5분 조건을 확인하고 실제 host 시계열의 수집 상태,
   정상 사용률과 alert instance의 No Data/Error 상태 사유를 조회한다.
4. 승인된 contact point Test로 실제 Discord 수신 경로를 확인한다. 로컬 통합 시험은
   합성 exporter로 장애와 복구를 검증하므로 실제 서버 디스크를 채우지 않는다.
   웹훅, 인증값, 실제 세션은 기록하지 않는다.

로컬 시험은 실제 provisioning 쿼리의 dev/staging 94%, 95%, 96%, prod 89%,
90%, 91%, 모니터링 서버 79%, 80%, 81%와 5분 미만 초과, 5분 지속,
복구를 promtool로 검증한다. 격리된 Grafana와 mock receiver로
호스트별 장애, 복구 메시지와 KeepLast 동작을 확인하며 실제 Discord 검증은 별도다.

## 보존, 용량과 복구

Loki filesystem 데이터는 7일 retention과 compactor 삭제를 사용한다.
삭제는 비동기이며 삭제 지연도 있으므로 168시간에 모든 파일이 즉시 사라지지는 않는다.
Prometheus는 14일 retention을 사용한다. S3, cron, 별도 볼륨과 HA는 적용하지 않는다.
중앙 데이터는 /srv/career-form-monitoring 하위 루트 EBS에 남고
Alloy의 positions/WAL은 앱 호스트 /var/lib/career-form/alloy에 남는다.

중앙 memory limit 합계는 704MiB다. t4g.micro의 실측 RAM 903MiB에서
OS와 Docker 메모리가 추가되므로 실제 부하의 안정성을 보장하지 않는다.
앱 호스트 Alloy에도 128MiB limit이 추가되며 backend와의 경쟁을 측정한다.
OOM 발생 시 limit만 올리지 말고 사용량을 확인한 뒤 설정 축소나
승인 가능한 인스턴스 증설을 함께 검토한다.

```bash
sudo docker stats --no-stream
free -h
df -h /
sudo du -sh /srv/career-form-monitoring/* /var/lib/docker
sudo docker compose -p career-form-monitoring --env-file /etc/career-form-monitoring/config.env -f /opt/career-form/monitoring/compose.yaml ps -q | xargs -r sudo docker inspect --format '{{.Name}} OOM={{.State.OOMKilled}} restarts={{.RestartCount}}'
```

첫날과 다음날 같은 시각에 Loki, Prometheus, Alloy WAL과 Docker 저장량의 증가를
비교한다. 현재 여유 공간에서 로그 7일, 메트릭 14일 증가량과 안전 여유를 계산한다.
16GiB만으로 해당 보존 기간을 달성한다고 확정하지 않는다.
80% 알림 전에 용량을 검토하며 기간을 몰래 줄이는 크기 제한은 적용하지 않는다.

문제가 있으면 같은 compose와 env-file로 restart 또는 up -d를 실행한다.
정지가 필요하면 down으로 컨테이너만 내리고 bind data와 secrets를 유지한다.
-v, data 삭제, docker system prune, EBS 삭제와 포맷은 수행하지 않는다.
backend 배포와 Alloy 배포는 분리하며 기존 /actuator/health와 rollback 계약을 유지한다.

Docker 로컬 로그는 10MiB 파일 3개로 회전한다. 이 제한은 7일 보관이 아니다.
수집 proxy는 Docker DNS를 재조회하여 중앙 컨테이너 교체 뒤 바뀐 IP를 따라간다.
수집 단절 시 WAL/positions와 남아 있는 Docker 로그 범위에서 복구되며,
회전으로 사라진 로그, 첫 수집 이전 로그, 디스크 고갈 구간은 유실될 수 있다.
중앙 WAL도 디스크 제한이 없으므로 단절이 길면 앱 호스트 디스크를 확인한다.

## 검증

```bash
bash -n infra/scripts/bootstrap-monitoring-host.sh
COMPOSE_PROJECT_NAME=career-form-tests .venv/bin/python -m unittest discover -s infra/tests -p 'test_*.py'
RUN_MONITORING_INTEGRATION=1 .venv/bin/python -m unittest infra.tests.test_monitoring_runtime infra.tests.test_monitoring_alert_expressions -v
RUN_MONITORING_INTEGRATION=1 .venv/bin/python -m unittest infra.tests.test_monitoring_host_disk infra.tests.test_monitoring_disk_runtime -v
(cd backend && ./gradlew clean check bootJar)
COMPOSE_PROJECT_NAME=career-form-tests .venv/bin/python harness/scripts/verify.py
```

런타임 시험은 임시 프로젝트, 합성 secrets와 데이터를 사용하며 다른 컨테이너는
수집하지 않는다. Docker Desktop 호스트 exporter와 agent network는 fixture 경로로
바꾸므로 AWS host filesystem/방화벽 검증을 대체하지 않는다.
모의 Discord 수신은 실제 웹훅 성공을 뜻하지 않는다.
7일/14일 만료, 실제 부하, 장기 단절 복구와 10분 반복 실시간 시험은 별도 남아 있다.

- [작업 계약 Issue #131](https://github.com/woowacourse-teams/2026-career-form/issues/131)
- [Docker Ubuntu 설치](https://docs.docker.com/engine/install/ubuntu/)
- [Alloy Docker 로그 수집](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/)
- [Loki 보존 정책](https://grafana.com/docs/loki/latest/operations/storage/retention/)
- [Nginx proxy_pass와 resolver](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
