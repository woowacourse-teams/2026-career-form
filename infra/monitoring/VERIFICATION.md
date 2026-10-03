# CF-131 검증 기록

2026-09-30 로컬 macOS ARM64에서 수행했다. 서버 변경과 실제 Discord 전송은
실행하지 않았다. Linux ARM64 이미지는 격리한 Docker 컨테이너에서 실행했으며
공식 하네스 운영 환경인 WSL/Linux와 실제 AWS 호스트 검증을 대체하지 않는다.

## 확인한 자동 검증

| 명령 | 결과 |
|---|---|
| backend에서 ./gradlew clean check bootJar | 테스트 392개, 실패 0, LINE coverage 88.16%, 80% 기준 통과 |
| COMPOSE_PROJECT_NAME=career-form-tests .venv/bin/python harness/scripts/verify.py | infra 79개 중 66개 실행, Docker opt-in 13개 skip, 셸 9개와 Wiki/execpolicy 검증 통과 |
| RUN_MONITORING_INTEGRATION=1 .venv/bin/python -m unittest infra.tests.test_monitoring_runtime infra.tests.test_monitoring_alert_expressions -v | opt-in 시험 13개 통과 |
| git diff --check, README의 bash 블록 bash -n | 통과 |

실제 Alloy의 합성 컨테이너 발견, 세 환경별 로그와 메트릭 전송, Grafana 조회,
비인증 차단, source IP 차단, Loki 재생성 후 로그 조회를 확인했다.
Prometheus는 재생성 이전 시점의 샘플을 재조회했고, Grafana는 시험에서 만든
비-provisioned dashboard가 재생성 뒤 남는 것을 확인했다.
staging 컨테이너 교체와 Alloy 재시작, 수집 proxy 단절 뒤 합성 로그 재수집을 확인했다.
Loki의 기존 IP를 합성 컨테이너로 점유하여 교체 컨테이너에 다른 IP를 할당했다.
이때 기존 proxy는 502를 반환하는 회귀 실패를 확인했고, Docker DNS 재조회 적용
뒤 proxy 재시작 없이 인증된 로그 전송 204 복구를 확인했다.

실제 Grafana Discord notifier에서 세 환경의 firing/resolved 메시지를 로컬
모의 HTTP receiver로 전달했다. 실제 Discord webhook이나 팀 채널은 사용하지 않았다.
Promtool은 실제 provisioned 쿼리의 임계값 전후, 무트래픽, 환경 소실과
한 provider만 존재하는 입력을 평가했다. 반복 10분과 No Data/error 처리는
provisioning API의 설정을 확인한 것이며 모든 운영 상태 전환의 실시간 시험은 아니다.

## Standards

변경은 CF-131 관측 범위에 한정하고 기존 health와 오류 응답 계약을 보존했다.
원문 대신 타입과 경로 패턴을 기록하고 이미지 digest와 영속 경로를 고정했다.
치명적인 코드 문제는 발견하지 않았다. 테스트 fixture의 host exporter 경로,
network와 allowlist 대체는 합성 프로젝트에만 적용한다.

## Spec

다음 항목은 전체 Issue 완료 근거로 사용하지 않는다.

- 실제 dev/staging/prod 배포와 각 환경의 실제 Discord 장애/복구 수신.
- Linux AWS host-network scrape, public 경로 차단과 서비스별 UID 쓰기 권한의 서버 확인.
- t4g.micro OOM/재시작/추가 부하, 루트 EBS 16GiB 저장 증가량과 7일/14일 용량 적합성.
- 보존 기간 경과 뒤 실제 만료 삭제와 10분 반복 통지의 실시간 시험.
- 모든 규칙의 pending 지속 시간, datasource error 알림 상태 전환과 장기 수집 단절.
- 실제 Docker 로그 회전 뒤 재수집. 회전 설정과 유실 가능 구간은 운영 문서에 기록했다.

이 상태는 배포 완료나 모든 인수 조건 통과가 아니다. 사람 수동 검증과
남은 운영 시나리오의 근거를 추가한 뒤 Issue 완료 여부를 판단한다.

## CF-154 HTTP 진입점 검증

2026-10-03 로컬 macOS ARM64에서 수행했다. 실제 Nginx·Grafana·Loki·Prometheus·Alloy는
격리한 Linux ARM64 Docker 컨테이너로 실행했으며, 임시 포트·데이터·합성 계정을 사용했다.
공식 WSL/Linux 하네스 실행과 AWS 서버 검증을 대체하지 않는다.

- `.venv/bin/python -m unittest infra.tests.test_monitoring_compose -v`: 7개 통과.
  변경 전에는 80 포트 미노출과 외부 URL 필수 설정 부재로 신규 검증 2개가 실패했다.
- `RUN_MONITORING_INTEGRATION=1 .venv/bin/python -m unittest infra.tests.test_monitoring_runtime -v`:
  최종 15개 통과, 174.908초. 변경 전 UI 포트 부재 실패를 확인했다.
- `COMPOSE_PROJECT_NAME=career-form-tests .venv/bin/python harness/scripts/verify.py`:
  하네스 349개, coverage 85%, 인프라 91개 중 71개 통과·opt-in 20개 skip.
  이 중 중앙 스택 통합 시험 15개는 위 명령으로 별도 실행했다.
- `git diff --check`, README bash 블록의 `bash -n`: 통과.

HTTP 로그인 화면과 실제 JavaScript 자원, 익명 API 401, Viewer 세션의 대시보드·
Prometheus 조회, 관리자 API 403, 외부 appUrl과 Live WebSocket 101을 확인했다.
모의 Discord 수신 내용의 외부 URL도 확인했다. 수집 source IP를 모두 차단한 동안
인증된 수집 요청은 403이고 Grafana 로그인 화면은 200이었다. 기존 수집 인증,
Loki DNS 주소 변경 복구, 데이터 영속성과 수집기 재시작 회귀도 통과했다.

Docker가 저장소 경로를 직접 bind mount할 때 생성이 멈추는 로컬 제약을 확인해,
fixture는 운영 설정을 임시 디렉터리에 복사해 마운트한다. 설정 내용은 바꾸지 않고
테스트용 포트·데이터 경로·수집 allowlist만 기존 방식대로 격리한다.

실제 서버 배포, 보안 그룹 변경, 조회 사용자 계정 생성·브라우저 접속 및 실제 Discord 링크
확인은 미실행이다. 운영자는 README의 CF-154 적용·복구 절차로 별도 확인한다.
