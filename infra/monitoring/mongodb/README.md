# 공용 MongoDB 관측

dev, staging, prod가 공유하는 MongoDB 호스트는 `instance=career-db`라는 논리 이름으로 한 번만 수집한다. 환경별 데이터베이스는 운영자가 지정한 이름을 dev, staging, prod로 변환한다. 앱 지표는 환경, 앱 인스턴스와 풀을 구분한다.

## 적용 위치

| 위치 | 변경 | 적용 후 수집 범위 |
|---|---|---|
| DB 호스트 | 전용 Alloy, host-state timer | 서버 자원, MongoDB 내부 지표, DB별 용량, 정제 서버 로그 |
| 백엔드 | 드라이버 listener, MongoTemplate 관측 | connection pool, 연결 대기, 명령 왕복, 전체 호출과 안전한 앱 로그 |
| 중앙 모니터링 | recording rules, Grafana dashboard와 alert provisioning | 조회, 경고, 긴급, 복구와 Discord 메시지 |

새 앱 계측은 각 환경에 배포한 뒤부터 수집된다. 적용 전 데이터는 소급 생성되지 않는다. 운영 배포와 설정, 계정 생성, 방화벽 변경, 실제 Discord 시험은 사람이 담당한다.

## 수집 계약

MongoDB 8.0.26, Alloy 1.20.1 내장 Percona exporter, Java driver 5.8.0을 기준으로 한다. exporter는 `diagnostic_data`, `db_stats`만 사용한다. profile, currentOp, collection/index 상세 통계와 쿼리 원문 수집은 활성화하지 않는다. 중앙 전송은 필요한 지표의 허용 목록으로 제한한다.

| 관측 항목 | 원본 | 단위와 의미 |
|---|---|---|
| 서버 연결 | `serverStatus.connections` → `mongodb_ss_connections` | current, active, available은 현재 건수; totalCreated는 누적 생성 건수이며 대시보드는 rate 사용 |
| 서버 연결 사용률 | current / (current + available) | %, 서버 전체 한도. 앱 풀 한도와 다름 |
| 가동 시간 | `serverStatus.uptime` → `mongodb_ss_uptime` | 초, 프로세스 재시작 시 초기화 |
| 처리량 | `serverStatus.opcounters` → `mongodb_ss_opcounters` | 연산별 누적 건수의 rate, 초당 건수 |
| 캐시 | `serverStatus.wiredTiger.cache` → `mongodb_ss_wt_cache_*` | 현재/최대/dirty bytes는 gauge; modified/unmodified pages evicted는 누적 페이지 건수의 rate |
| DB별 용량 | `dbStats` → `mongodb_dbstats_dataSize`, `indexSize`, `storageSize` | bytes, gauge; 세 환경 외 DB 통계는 중앙 전송에서 제외 |
| CPU | unix exporter `node_cpu_seconds_total` | 누적 CPU 초의 rate에서 idle 제외, % |
| 메모리 | `MemAvailable`, `MemTotal` | 사용 가능한 비율 %, 파일 캐시 사용을 곧바로 부족으로 간주하지 않음 |
| swap | `node_vmstat_pswpin`, `pswpout` | 누적 페이지 건수의 rate |
| 디스크 I/O | `node_disk_*_time_seconds_total`, 완료 건수 | 장치별 평균 요청 지연, 초. CPU iowait와 다른 지표 |
| DB 데이터 공간 | host-state의 `shutil.disk_usage(DB_DATA_DIR)` | 실제 데이터 디렉토리가 속한 파일시스템의 전체/가용 bytes와 사용률 |
| 풀 | Java driver connection pool 이벤트 | 풀별 사용 중/사용 준비 완료 후 유휴/최대 건수, available은 풀의 열림 상태 0/1 |
| 연결 대기 | checkout 이벤트 elapsed time | 초 histogram, 성공/실패/timeout을 구분 |
| timeout | checkout reason TIMEOUT | 누적 counter, 최근 5분 증가 건수로 평가 |
| 명령 왕복 | command success/failure 이벤트 elapsed time | 초 histogram, 네트워크 포함. command 시도 단위이며 재시도가 포함될 수 있음 |
| 전체 호출 | MongoTemplate 최상위 메서드 진입부터 반환/예외까지 | 초 histogram. 현재 사용하는 find, save, insert, remove, findAndReplace 등을 관측 |

전체 호출은 stream/cursor를 반환하는 시점까지만 측정한다. 반환 뒤의 소비는 getMore 명령 지표를 확인한다. MongoTemplate를 통하지 않는 별도 MongoClient와 향후 추가하는 fluent API는 관측 범위를 다시 검증해야 한다. 중첩 호출은 전체 호출로 중복 집계하지 않는다. 호출 실패율은 전체 호출 기준으로 평가하므로 명령 전 연결 획득/서버 선택 실패도 포함한다.

histogram bucket은 1, 5, 10, 50, 100, 200, 500ms 및 1, 2, 5, 10, 30, 60s를 사용한다. P95는 bucket 사이를 보간한 근삿값이며 최근 5분 측정 20건 이상일 때만 표시하고 평가한다. 원본 duration 로그와 평균, 건수를 함께 확인한다. 새 counter/histogram은 0부터 등록해 첫 실패를 관찰할 기준점을 확보한다.

## 안전한 로그와 진단

MongoDB JSON 로그에서 원본 발생 시각, event ID, severity, component, 허용한 명령 종류, duration/working 시간, 조사한 문서/키 수, 반환 건수와 COLLSCAN/IXSCAN 분류를 보존한다. collectionId는 namespace의 해시이며 원문 이름은 전송하지 않는다. msg, command, filter, pipeline, 응답 문서, planSummary 원문은 전송하지 않는다. 누락한 숫자는 0 대신 unavailable로 표시한다. JSON 파싱 실패는 원문을 보내지 않고 drop한다.

느린 쿼리 내부 시간은 서버가 기록한 이벤트만 보여준다. 로그의 slowms 및 sampling 설정에 따라 일부 호출만 남으므로 전체 명령 P95로 해석하지 않는다. 더 많은 느린 쿼리 기록이 필요하면 사람이 현재 MongoDB 설정과 수집 부하를 확인해 조정한다. 모든 쿼리 profiling은 이 작업의 범위가 아니다.

앱 로그의 DB_OPERATION은 작업명과 전체 호출 결과를, DB_COMMAND는 명령 종류, 환경별 DB 별칭, 명령 결과와 HTTP requestId를 기록한다. driver의 mongoRequestId, mongoOperationId는 HTTP requestId와 별개다. MongoDB가 제공한 server connection ID가 있으면 함께 기록한다. command 시작 때 저장한 문맥을 completion 때 사용하며 background 작업의 HTTP 요청 ID를 임의로 만들지 않는다. 커스텀 비동기 작업이 시작될 때 이미 요청 문맥이 없다면 none으로 남는다.

Discord에서 장애 시간 전 10분부터 후 20분까지 선택한 DB dashboard로 이동한다. 환경별 앱 지표와 같은 시간대의 MongoDB 서버 로그를 비교하고 앱 로그는 HTTP requestId로 좁힌다. 서버 로그와 앱 요청이 항상 일대일로 연결되는 것은 아니다. 시간 일치만으로 원인을 확정하지 않는다.

| 증상 | 확인할 지표와 로그 |
|---|---|
| 풀 대기만 증가 | 풀별 사용 중/최대, checkout 대기, 앱 실패 로그 |
| 명령 왕복과 서버 내부 시간 증가 | command와 operation P95, 서버의 느린 쿼리 event, docsExamined와 scan 분류 |
| I/O 병목 | 장치별 읽기/쓰기 지연, 캐시 eviction, DB 로그의 STORAGE component |
| 접속 실패 | mongodb_up와 scrape up 구분, 앱의 실패 타입, NETWORK/ACCESS event |
| 종료와 재시작 | host-state 사건 로그, OOM 상태, DB healthcheck와 메모리 |

## 알림 정책

규칙 파일의 임계값은 Issue #207에서 합의한 초기 값이다. 실측 뒤 사람과 조정한다.

| 항목 | 경고 | 긴급 |
|---|---|---|
| 데이터 디스크 | 80% 이상 10분 | 90% 이상 5분 |
| CPU | 80% 이상 10분 | 95% 이상 5분 |
| 가용 메모리 | 15% 미만 10분 | 5% 미만 5분 |
| 서버 연결 | 80% 이상 10분 | 95% 이상 5분 |
| 앱 풀 | 80% 이상 5분 | 95% 이상이며 대기 P95 >100ms, 5분 |
| 연결 대기 P95 | >100ms 5분 | >500ms 5분 |
| 명령 응답 P95 | >500ms 5분 | >2s 5분 |
| 연결 획득 timeout | 최근 5분 1건 이상 | 최근 5분 3건 이상 |
| 전체 호출 실패 | 최근 5분 5% 이상이며 3건 이상 | 최근 5분 20% 이상이며 5건 이상 |
| 인증 포함 DB 응답 | 없음 | 2분 연속 실패 |
| 지표/호스트 상태/앱 계측 수집 | 3분 중단 | 10분 중단 |
| 로그 전송/파싱 오류 | 오류 발생률 >0이 3분 지속 | 10분 지속 |
| OOM | 없음 | 사건 관찰 즉시 |

자원과 연결 사용률은 임계값보다 5%p 낮아지고 5분 유지되면 해제한다. 가용 메모리는 5%p 높아져야 한다. 지연과 실패는 기준 아래에서 5분, 접속과 수집은 정상 확인 2분 후 복구한다. OOM은 DB 컨테이너 healthcheck 정상과 가용 메모리 10% 이상이 5분 연속 유지되어야 한다. host-state 성공 샘플이 45초 넘게 끊기거나 호스트가 재부팅되면 정상 유지 시간을 다시 센다.

최근 호출이 없거나 표본이 부족하면 지연/실패의 정상 복구 근거로 쓰지 않는다. 수집 실패와 90초 넘게 오래된 주요 원본 값은 알림 평가에서 제외하고 별도 수집 중단 규칙으로 감지한다. 자원과 연결 사용률의 장애 상태는 Prometheus recording rule에서 유지한다. 발생 조건의 연속 시간을 충족한 사건만 활성화하고, 수집 누락이나 복구 기준 사이의 값에서는 유지한다. 정상 연속 관찰 시간이 끊기면 복구 시간을 다시 센다. Discord의 마지막 실측 값과 dashboard의 현재 수집 상태를 함께 확인한다. NoData와 실행 오류는 KeepLast를 사용한다. 일부 풀/명령 시계열만 사라지는 경우의 자동 복구도 막기 위해 missing-series 해제 대기를 1년으로 설정한다. 풀 제거나 앱 재배포로 폐기된 사건은 사람이 실제 정상 상태를 확인하고 정리해야 한다. 무기한 상태 유지나 재시작 후 알림 상태 보존까지 보장하지 않는다.

Discord는 같은 kind, 환경, 앱 인스턴스, 풀, 명령을 묶어 10분마다 반복한다. 같은 그룹에 긴급이 있으면 메시지에서 경고를 제외한다. 긴급이 해제되어도 경고가 남으면 경고를 표시하며 전체 복구로 표현하지 않는다. 알림 상태 자체는 Grafana에서 모두 확인할 수 있다. 기존 알림 contact point와 route는 유지한다.

## 사람이 수행할 설치

1. 현재 DB 경로, 컨테이너 이름, 세 DB 이름과 운영 버전을 확인한다. `HOST_INSTANCE=career-db`, 실제 내부 주소인 `MONITORING_PRIVATE_IP`, `MONGODB_DEV_DATABASE`, `MONGODB_STAGING_DATABASE`, `MONGODB_PROD_DATABASE`를 비민감 환경 파일로 관리한다. DB 이름은 영문/숫자/밑줄 식별자로 제한하고 세 이름은 서로 달라야 한다. 해당 환경을 export한 상태에서 `python3 infra/scripts/validate-mongodb-monitoring.py`로 검사한다.
2. 사람이 모니터링 전용 MongoDB 계정에 admin의 clusterMonitor와 local의 read 권한을 부여한다. 운영 root 계정을 수집기로 재사용하지 않는다. 전용 URI는 `/etc/career-form-monitoring-db/secrets/mongodb-uri`에 줄바꿈 없이 저장하고 권한을 제한한다. 중앙 ingest 암호는 같은 디렉토리의 ingest-password로 관리한다. 값은 Git, Issue, PR이나 로그에 기록하지 않는다.
3. `/var/lib/career-form/alloy-db`, `/var/lib/career-form/mongodb-observation`, `/opt/career-form/mongodb-observation`을 준비한다. host-state 스크립트를 마지막 경로에 설치하고 host-state.env에 MONGODB_CONTAINER, MONGODB_STATE_DIR, MONGODB_DATA_DIR를 설정한다. DB 경로는 실제 Docker /data/db bind source여야 한다.
4. host-state.service와 timer를 설치하고 사람이 timer를 활성화한다. 스크립트는 docker inspect에서 State와 RestartCount만 읽고 Env나 DB 인증값을 읽지 않는다. procfs의 oom_kill과 가용 메모리를 확인하며 상태와 prom 파일을 원자적으로 교체한다. Docker 소켓 접근은 강한 권한이므로 설치 계정과 파일 권한을 제한한다.
5. DB 호스트에서 전용 compose와 Alloy 설정을 검토해 사람이 적용한다. 수집기는 host network를 사용하지만 HTTP 관리 포트는 127.0.0.1:12346에만 열린다. 시크릿과 준비된 경로가 없으면 bind mount를 자동 생성하지 않는다.
6. 중앙 ingest-allow.conf와 보안 그룹에 DB 호스트 내부 IP를 사람이 추가한다. 기존 두 앱 호스트와 인증을 유지하고 공개 IP 허용으로 바꾸지 않는다. 현재 내부 HTTP 수집의 암호화 한계는 기존 구성과 같다.
7. 중앙 prometheus.yaml, mongodb-metrics.yaml 및 Compose mount를 함께 적용하고 Grafana dashboard와 alert provisioning을 반영한다. 새 규칙이 기대하는 agent/앱 계측이 준비되기 전에 적용하면 수집 중단 알림이 발생한다.
8. 각 앱 환경에 백엔드를 배포하고 단계적으로 수집과 실제 Discord 수신을 확인한다. 운영 장애를 만들기 위해 DB를 멈추거나 디스크를 채우지 않는다.

## 보존, 부하와 한계

중앙 Loki는 현재 7일 보존이다. MongoDB Docker 로그는 10MB씩 3개로 회전하고 host-state 사건은 5MB씩 3개로 회전한다. Alloy positions와 WAL은 영속 디렉토리에 둔다. 단절 중 로컬 로그가 회전하거나 재시작 시점이 겹치면 로그가 유실 또는 중복될 수 있으며 정확히 한 번 전달을 보장하지 않는다. host-state는 15초 샘플링이므로 두 샘플 사이의 OOM/종료/재시작을 모두 확인하지 못할 수 있다. 전역 host OOM 기록만으로 MongoDB가 죽었다고 단정하지 않는다.

DB Alloy는 192MiB 제한과 GOMEMLIMIT 150MiB를 사용한다. DB와 exporter는 30초마다 수집하고 MongoDB scrape timeout은 10초다. 수집기가 한도에 도달하면 원본 DB 부하와 수집 지연도 함께 확인한다. 실제 사용량에 대한 운영 검증 전에는 현재 인스턴스의 안정성을 보장하지 않는다. 전용 계정의 권한, 활성 collector, series 수, 로그량, WAL 증가량과 DB 지연의 전후 차이를 사람이 확인한다.

중앙 모니터링 서버가 중단되면 같은 Grafana의 Discord 알림도 중단된다. 독립 외부 감시는 별도 후속 작업 후보이며 이 변경은 도입하지 않는다.

## 검증

```bash
COMPOSE_PROJECT_NAME=cf207-check .venv/bin/python -m unittest discover -s infra/tests
RUN_MONGODB_INTEGRATION=1 .venv/bin/python -m unittest infra.tests.test_mongodb_monitoring_runtime infra.tests.test_mongodb_grafana_runtime
backend/gradlew -p backend check
COMPOSE_PROJECT_NAME=cf207-check .venv/bin/python harness/scripts/verify.py
```

자동 시험은 합성 계정과 격리 컨테이너를 사용한다. 실제 MongoDB 8.0.26의 연결 한도와 고정 DB 용량을 exporter와 대조하고 clusterMonitor/read 계정의 수집을 확인한다. 검증용 mongosh 자체가 연결을 추가하므로 다른 시점의 current를 동일 값이라고 주장하지 않는다. 실제 Loki 저장 로그에서 원본 진단 값과 발생 시각 및 민감 필드 제거를 확인한다. 중앙 Loki의 짧은 단절에서는 marker가 재전송되는지 검사한다. 단절 중 수집기 재시작을 겹치면 재시작 전후 marker와 중복 여부를 검사하고, 중간 marker의 전달 건수를 별도 artifact로 남긴다. 고정 버전의 격리 시험에서 이 중간 marker가 중앙에 전달되지 않고 로컬 사건 파일에만 남는 경계를 관찰했다. 따라서 단절 중 수집기 재시작 전에는 로컬 사건 로그를 보존하고 해당 구간을 대조해야 한다. 이 짧은 단절 시험이 로컬 로그 회전이나 장기간 단절에서의 무유실을 보장하지 않는다. Grafana 상태/메시지 시험은 대기와 복구 시간을 줄인 복사본으로 수행하며 운영의 실제 5분/10분 시간 경과 시험과 구분한다.

운영에서는 원본과 dashboard의 같은 시점 값을 대조하고, 합성 marker의 누락/중복과 재시작/중앙 단절 후 수집 재개, 실제 Discord 링크, 수집 부하와 보존 경계를 확인해야 한다. 이 수동 결과를 로컬 합성 검증과 분리해 PR에 기록한다.
