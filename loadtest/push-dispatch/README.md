# 공고 알림 발송 시험 도구

공고 알림 발송 구조를 SQS로 바꾸기 전과 후를 같은 숫자로 비교하는 도구다. 시험 구독을 만들고, 같은 예정 시각의 공고를 등록하고, 백엔드가 보낸 Web Push 요청을 모의 푸시 서버가 받아 기록한다. 끝나면 모의 서버 기록, MongoDB, 자원 기록을 합쳐 요약을 낸다.

시험 트래픽은 모의 푸시 서버로만 간다. 실제 FCM과 실제 구독에는 닿지 않는다.

## 비교 원칙

전과 후에서 달라지는 것은 발송 구조와 거기에 딸린 실제 SQS 왕복뿐이어야 한다. 공식 측정은 운영과 같은 리전의 임시 EC2 한 대에서, 전환 직전 커밋과 전환 커밋을 같은 날 같은 시험 스택으로 연달아 잰다. 후는 실제 SQS를 쓴다. 노트북은 SQS까지의 거리가 운영과 달라 도구 개발과 리허설에만 쓴다.

같게 두는 것:

- 기계: 같은 EC2 인스턴스 하나
- 백엔드 자원 제한: `LOADTEST_BACKEND_CPUS`, `LOADTEST_BACKEND_MEMORY`(운영 앱 호스트 사양에 맞춘다)
- MongoDB: 같은 이미지, 운영과 같은 단일 노드(replica set 아님), 시험 전용
- 모의 서버 설정: 응답 지연(`MOCK_DELAY_MS`), 상태 비율(`MOCK_STATUSES`), `Retry-After`
- 시험 데이터: 구독 수, 공고 수, 미선택 비율, 직무 배정 시드(`--seed`), endpoint 길이
- 동시 발송 수 20(전 발송기 기본값. 후는 모든 발송 워커를 합쳐 20)
- tracing 끔(`CAREER_FORM_OTEL_ENABLED=false`)

다른 것: 발송 구조(전: 백엔드 안의 발송기, 후: 릴레이와 발송 워커)와 실제 SQS 왕복. 후 측정에 필요한 워커와 SQS 연결은 전환 Issue가 `compose.yaml`에 더한다.

## 구성

| 파일 | 하는 일 |
|---|---|
| `compose.yaml` | 시험 스택: 백엔드(재려는 커밋의 jar), MongoDB, 모의 푸시 서버. 포트는 모두 `127.0.0.1`에만 연다 |
| `make-test-env.py` | 시험용 VAPID 키 쌍, 임시 관리 비밀번호와 그 PBKDF2 검증 문자열을 `.env.loadtest`(권한 600)에 쓴다. 값은 출력하지 않는다 |
| `mock-push-server.py` | 정한 지연 뒤 비율로 고른 상태 코드를 돌려주고 요청마다 시각, 경로, 상태, 동시 요청 수, 암호문을 JSONL로 남긴다. 표준 라이브러리만 쓴다 |
| `generate-subscriptions.py` | 구독마다 P-256 키 쌍과 auth를 만들어 `push_subscriptions`에 넣는다. 비공개키는 실행 폴더에만 남긴다 |
| `register-postings.py` | 같은 예정 시각의 공고 N건을 관리 API로 등록하고 실행 기록에 남긴다 |
| `record-resources.py` | 컨테이너별 CPU·메모리(`docker stats`)와 백엔드 actuator 지표를 일정 간격으로 남긴다 |
| `summarize-run.py` | 암호문을 풀어 공고 id를 읽고, 유실·중복·버스트·지연·재시도·저장 용량·자원을 요약한다 |
| `cleanup-test-data.py` | 시험 표지가 있는 구독·공고와 그 발송 문서만 지운다. `--yes`가 없으면 건수만 보여 준다 |

실행 하나의 기록은 `runs/<실행 id>/`에 모인다. 폴더 이름이 실행 id이고, endpoint와 공고 링크에 들어가므로 영문, 숫자, 하이픈만 쓴다.

| 파일 | 내용 |
|---|---|
| `run.json` | 구독 생성과 공고 등록 결과, 메모(커밋 SHA, 발송 설정값) |
| `subscriber-keys.jsonl` | 시험 구독의 비공개키(권한 600) |
| `requests.jsonl` | 모의 서버가 받은 요청 |
| `resources.jsonl` | 자원 기록 |
| `summary.json` | 요약 |

`runs/`와 `.env.loadtest`는 Git이 무시한다. 시험용 값이지만 저장소, Issue, PR, 공유 문서에 옮기지 않는다.

종료 코드는 모든 스크립트가 같다: 0 성공, 1 실행 실패(등록 실패 등), 2 입력 오류, 3 안전장치로 멈춤.

## 안전장치

- 시험 표지: 구독 endpoint는 `http://<모의 서버>/fcm/send/loadtest-<실행 id>-…`, 공고 링크는 `https://loadtest.invalid/<실행 id>/<번호>`다.
- `generate-subscriptions.py`와 `register-postings.py`는 대상 DB에 시험 표지가 없는 구독(https endpoint 전부 포함)이 하나라도 있으면 아무것도 쓰지 않고 종료 코드 3으로 멈춘다. 건수만 출력한다.
- 이 안전장치는 실제 구독이 있는 DB만 막는다. 대상 DB는 사람이 고른다. dev, staging, prod가 함께 쓰는 MongoDB 호스트를 대상으로 돌리지 않는다.
- MongoDB URI(`LOADTEST_MONGODB_URI`)와 관리 비밀번호(`LOADTEST_ADMIN_PASSWORD`)는 환경변수로만 받는다.

`allowed-endpoint-hosts`는 바꾸지 않는다. 이 값은 구독 등록 API(`PushSubscriptionService`)에서만 검사하고, 발송기는 저장된 endpoint로 그대로 POST한다. 시험 구독은 MongoDB에 직접 넣으므로 이 값과 상관없이 모의 서버로 간다. 반대로 말하면 시험 DB에 실제 구독이 남아 있으면 시험 공고가 실제 FCM으로 나간다(안전장치가 막는 경우). prod의 `allowed-endpoint-hosts`에는 모의 서버 주소를 넣지 않는다.

## EC2 준비 (사람)

1. 운영과 같은 리전에 임시 EC2를 만든다. 리눅스 커널은 6.19 미만이어야 한다. 운영 고정 MongoDB 이미지(8.0.26)가 6.19 이상에서 기동을 거부한다.
2. Docker와 Compose v2 이상, Python 3.12, Git, JDK 21을 설치한다. `.env.loadtest`의 작은따옴표 값은 Compose v2 규칙으로 읽는다.
3. 저장소를 clone하고 이 폴더에서 가상환경을 만든다.

   ```bash
   cd loadtest/push-dispatch
   python3.12 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   .venv/bin/python make-test-env.py
   ```

4. 운영 앱 호스트 사양에 맞춰 `LOADTEST_BACKEND_CPUS`, `LOADTEST_BACKEND_MEMORY`를 정한다(기본 2, `2g`). 운영 compose에는 자원 제한이 없다.
5. 후 측정용 SQS 큐 생성과 삭제, EC2 삭제와 비용은 사람이 맡는다.

## 실행 한 번

모든 명령은 `loadtest/push-dispatch/`에서 실행한다.

```bash
set -a; . ./.env.loadtest; set +a           # 스크립트가 LOADTEST_* 값을 읽도록
(cd ../../backend && ./gradlew bootJar)      # 재려는 커밋의 jar (이미지는 build/libs/*.jar를 복사한다)

export LOADTEST_RUN_DIR=runs/$(date -u +%Y%m%dT%H%M%SZ)-s1-3
mkdir -p "$LOADTEST_RUN_DIR"                 # compose보다 먼저 만든다(리눅스에서 root 소유가 되지 않게)
docker compose --env-file .env.loadtest up -d --build --wait

.venv/bin/python generate-subscriptions.py --run-dir "$LOADTEST_RUN_DIR" --count 1000
.venv/bin/python record-resources.py --run-dir "$LOADTEST_RUN_DIR" --duration-seconds 0 &
.venv/bin/python register-postings.py --run-dir "$LOADTEST_RUN_DIR" --count 30 \
  --note commit=$(git rev-parse --short HEAD) --note host=<인스턴스 유형> \
  --note dispatch-interval=60s --note concurrency=20 --note max-per-cycle=20000 --note lease=120s --note timeout=10s \
  --note mock=${MOCK_DELAY_MS:-100}ms/${MOCK_STATUSES:-201=1}
```

`register-postings.py`는 기본으로 지금부터 2분 뒤를 예정 시각으로 잡는다. 공고를 등록할 때마다 관리 API가 PBKDF2(60만 회)로 비밀번호를 검사하므로 등록 CPU가 버스트에 섞이지 않게 여유를 둔다. 등록이 예정 시각 전에 끝나지 않으면 경고하고 실행 기록에 남긴다.

끝났는지는 모의 서버 집계와 발송기 로그로 본다.

```bash
curl -s http://127.0.0.1:18081/__mock/stats
docker compose --env-file .env.loadtest logs backend | grep PUSH_DISPATCH_CYCLE | tail -3
```

발송이 끝나면 자원 기록을 멈추고 요약한다. `summarize-run.py`는 여러 번 돌려도 되므로, 재시도가 남는 시나리오는 유실이 0이 될 때까지 몇 분 간격으로 다시 돌린다.

```bash
kill -INT %1
.venv/bin/python summarize-run.py --run-dir "$LOADTEST_RUN_DIR"
```

다음 실행 전에는 시험 데이터를 지우고, 새 실행 폴더로 모의 서버를 다시 띄운다. 모의 서버만 다시 만들어지고 백엔드는 그대로라 JVM이 데워진 상태를 유지한다.

```bash
.venv/bin/python cleanup-test-data.py          # 지울 건수 확인
.venv/bin/python cleanup-test-data.py --yes
export LOADTEST_RUN_DIR=runs/$(date -u +%Y%m%dT%H%M%SZ)-s3
mkdir -p "$LOADTEST_RUN_DIR"
docker compose --env-file .env.loadtest up -d mock-push
```

모의 서버 설정은 실행 중에도 바꿀 수 있다.

```bash
curl -s -X POST http://127.0.0.1:18081/__mock/config -d '{"delayMs": 300, "statuses": "201=1"}'
```

## 측정 순서

커밋 하나(전환 직전 커밋 또는 전환 커밋)마다 아래를 한 번에 한다. 그다음 같은 EC2에서 다른 커밋으로 바꿔 똑같이 한다. 각 시나리오는 세 번 돌리고 가운데 값을 적는다.

1. 시험 스택을 띄우고 워밍업으로 구독 1,000개 × 공고 1건을 한 번 보낸다. 결과는 버리고 시험 데이터를 지운다.
2. 아래 시나리오를 차례로 돌린다. 실행 사이마다 시험 데이터를 지운다.
3. S9는 새 스택(`docker compose --env-file .env.loadtest down -v` 뒤 다시 `up`)에서 S1③을 한 번 돌린 요약의 저장 용량 행을 쓴다. 지운 문서의 공간이 남아 있으면 크기가 부풀기 때문이다.

| 시나리오 | 데이터 | 절차 | 볼 값 |
|---|---|---|---|
| S1③ 버스트 | 구독 1,000 × 공고 30 = 30,000건 | 위 "실행 한 번" 그대로 | 버스트 완료 시간, 전파 지연, 초당 수락 최댓값, 발송기 주기, 자원 |
| S3 발송 중 재시작 | S1③과 같음 | 첫 요청 30초 뒤 `docker compose --env-file .env.loadtest restart backend`(전) 또는 발송 워커 재시작(후) | 유실, 중복, 수락이 끊긴 가장 긴 구간, 전파 지연 |
| S4 강제 종료 | S1③과 같음 | 발송 중 `docker compose --env-file .env.loadtest kill -s SIGKILL backend` 뒤 `up -d backend`(전) 또는 발송 워커 강제 종료(후) | 유실, 중복, 수락이 끊긴 가장 긴 구간 |
| S5 오류 응답 | 구독 1,000 × 공고 1 | `MOCK_STATUSES=201=0.9,429=0.05,503=0.03,410=0.01,400=0.01`, `MOCK_RETRY_AFTER_SECONDS=30`으로 모의 서버를 띄운다. 재시도가 끝날 때까지 기다린다 | 재시도 정확성, 상태·사유별 건수, 404·410을 받고도 남은 구독 |
| S9 저장 용량 | S1③ | 새 스택에서 S1③ 한 번 | `push_deliveries` 크기, 인덱스 크기, 공고 1건당 바이트 |

S3을 팀 측정 계획의 "S1② 5,000건 시작 30초 뒤"로 하지 않는 이유: 5,000건은 동시성 20, 응답 100ms에서 약 25초에 끝나서 30초 뒤에는 보낼 것이 없다.

S5의 재시도는 다음 주기에 나간다. 429와 `Retry-After`가 있는 503은 그 시각 뒤, 나머지 오류는 1·2·4분… 백오프라서 분 단위로 걸린다.

S8(등록 중 종료)은 장애 주입 장치가 필요해 이 도구에 넣지 않았다. 나중에 잴 때는 기준선 커밋에 등록 빈틈 수정(같은 링크로 다시 등록하면 빠진 발송 문서를 채움)이 들어 있는지 함께 적는다. 들어 있는지에 따라 전의 결과가 달라진다. 팀 측정 계획의 S2(느린 FCM)는 S1③을 `MOCK_DELAY_MS=300`으로 다시 돌리면 된다.

## 모의 서버 지연 맞추기

기본 지연 100ms는 ADR의 가정이다. 측정 전에 운영 지표에서 실제 FCM 호출 시간을 읽어 맞춘다.

- 지표: `career_form_push_send_seconds{outcome="accepted",quantile="0.5"}`(백엔드 `career.form.push.send` 타이머의 p50)
- 발송이 있었던 구간의 값을 Grafana나 Prometheus에서 읽어 밀리초로 `MOCK_DELAY_MS`에 넣는다. 읽은 값과 구간을 `--note`로 남긴다.
- 전과 후에 같은 값을 쓴다.

## 결과 읽기

`summarize-run.py`가 내는 표의 주요 행:

| 행 | 뜻 |
|---|---|
| 수락 | 모의 서버가 2xx로 답한 요청 수(이번 실행 공고만) |
| 유실 | 시험이 끝난 뒤 ACCEPTED도 ABANDONED도 아닌 발송 문서 수. 0이어야 한다 |
| 중복 쌍 / 초과 건수 | 같은 구독에 같은 공고가 두 번 이상 수락된 쌍의 수와, 넘친 수락 건수 |
| 예정 시각→마지막 수락 | 사용자가 체감하는 버스트 완료 시간. 발송 주기 위상이 들어간다 |
| 첫 요청→마지막 수락 | 발송 구조의 처리 시간. 주기 위상이 빠진다 |
| 전파 지연 p50 / p95 / p99 | 공고 예정 시각부터 쌍별 첫 수락까지 |
| 최대 동시 요청 | 모의 서버가 동시에 처리한 요청 수의 최댓값. 동시성 20을 넘으면 안 된다 |
| 수락이 끊긴 가장 긴 구간 | S3·S4에서 멈춘 발송이 다시 수락될 때까지 걸린 시간 |
| Retry-After 전 재요청 | 429의 `Retry-After`보다 먼저 다시 보낸 요청 수. 0이어야 한다 |
| 404·410 뒤 같은 구독 재요청 | 구독이 없어졌다는 응답 뒤에도 그 구독으로 보낸 요청 수 |
| 400·403·413 뒤 같은 쌍 재요청 | 포기해야 하는 응답 뒤에도 다시 보낸 요청 수. 0이어야 한다 |
| 공고 1건당 바이트 | `push_deliveries`의 (데이터 + 인덱스) ÷ 시험 DB의 공고 수 |
| CPU 평균 / 최대 | `docker stats` 기준. 100%가 CPU 한 개다 |

팀 측정 계획의 합격 기준(30,000건 5분 이하, 모든 시나리오 유실 0, S3·S4 장애 한 번에 구독 하나당 중복 1건 이하, S5 사유별 건수 전후 같음)에 이 값을 대어 본다.

## 정리

```bash
.venv/bin/python cleanup-test-data.py            # 건수 확인
.venv/bin/python cleanup-test-data.py --yes      # 시험 표지가 있는 문서만 지운다
docker compose --env-file .env.loadtest down -v
```

`runs/`에는 시험 구독의 비공개키와 모의 서버가 받은 암호문이 있다. 요약 표만 옮겨 적고 EC2와 함께 지운다.

## 한계

- 모의 서버는 평문 HTTP/1.1이다. 실제 FCM은 TLS와 HTTP/2라서 연결 수립 비용과 다중화가 다르다. JDK HttpClient가 첫 요청에 `Upgrade: h2c`를 붙이지만 모의 서버는 HTTP/1.1로 답한다. 절대 처리량은 운영과 다르고, 전후 비교에만 쓴다.
- 모의 서버 지연은 고정값이다. 실제 FCM 응답 시간의 분산과 꼬리는 없다.
- 전 발송기는 60초 주기(`fixedDelay`, 기동 10초 뒤 첫 실행)로 돈다. 예정 시각과 주기의 위상에 따라 "예정 시각→마지막 수락"이 0~60초 흔들린다. 한 주기 상한이 20,000건이라 30,000건은 두 주기와 그 사이 60초가 걸린다. 이것도 비교할 구조의 일부다.
- 세 번 반복으로는 작은 차이를 가리지 못한다. 전과 후의 세 값 범위(최솟값~최댓값)가 겹치면 차이가 있다고 쓰지 않는다.
- MongoDB가 백엔드와 같은 기계에 있다. 운영의 DB 왕복과 별도 DB 호스트가 빠지고, CPU를 함께 쓴다.
- 노트북에서는 SQS까지 거리가 운영과 달라 공식 측정을 하지 않는다.

## 후속 후보

- 발송 시점에 endpoint host를 다시 검사하기(BE). 지금은 구독 등록 API에서만 검사한다.
- S6 API 간섭(k6, 팀 자동입력 시나리오 재사용), S7·S8 장애 주입 장치(BE).

## 개발

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -t . -v
```

로직은 `pushload/`에, 인자 해석과 입출력은 진입 스크립트에 둔다. 모의 서버 경로(`mock-push-server.py`, `pushload/mock_server.py`)는 표준 라이브러리만 import한다. 로컬 리허설은 이 맥 Docker 커널에서 운영 고정 MongoDB 이미지가 뜨지 않으므로 `LOADTEST_MONGODB_IMAGE=mongo:8.0.4-noble`로 한다.
