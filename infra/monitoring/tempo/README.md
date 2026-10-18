# 요청 트레이스와 Grafana Explore

## 경로

Java agent 2.32.0 → 내부 Nginx:4318 `/v1/traces` (기존 Basic 인증·IP 제한)
→ 중앙 Alloy:4318 (정제) → Tempo:4318 → Grafana Tempo 데이터소스.
Tempo 조회 API 3200과 직접 OTLP 수신 포트는 호스트에 공개하지 않는다.
기존 Prometheus/Loki 경로는 유지하며 agent의 metrics/logs exporter는 꺼 둔다.

## 적용 전 자원 확인

중앙 호스트는 기존 문서상 t4g.micro(메모리 1GiB)다. 기존 서비스 제한 합계가
704MiB인 상태에서 Tempo 256MiB를 추가하면 OS 여유가 부족할 수 있다.
Tempo의 `tracing` profile은 기본으로 꺼져 있다. 운영자가 실제 RSS·디스크 여유와
부하를 확인하고 필요하면 호스트 용량을 늘린 뒤 활성화한다. 256MiB 한도와
24h 보존은 초기 검증값이며 처리량 보장이 아니다. 대용량 trace는 수집 실패할 수 있다.
보존 시간은 디스크 최대 사용량 제한이 아니다. 디스크 여유와 WAL 증가도 확인한다.

## 중앙 호스트 준비 (운영자 수행)

기존 모니터링 설정 복사 절차에 이 디렉터리와 Alloy·Nginx·datasource 설정을 포함한다.
신규 데이터 경로만 생성한다. 고정한 Tempo 이미지의 실행 UID/GID는 10001이다.
기존 데이터에 재귀 chown이나 삭제를 수행하지 않는다.

```bash
sudo install -d -m 0700 -o 10001 -g 10001 /srv/career-form-monitoring/tempo
# 기존 모니터링 env와 자격 파일을 준비한 디렉터리에서 수행
sudo docker compose --profile tracing config --quiet
sudo docker compose --profile tracing up -d
```

4318은 중앙 private IP에 bind하며 기존 허용 IP 목록과 ingest.htpasswd를 사용한다.
보안 그룹의 허용 출발지는 앱 호스트로 한정한다. private bind만으로 외부 접근 차단을
보장하지 않는다. 현재 수집 구간은 신뢰된 VPC 내부 HTTP다. Basic 인증은 암호화가
아니므로 다른 네트워크를 통과해야 한다면 TLS 경로를 먼저 마련한다.

## 앱 환경별 활성화 (운영자 수행)

배포 Compose는 `/etc/career-form/otel/<Spring profile>.env`를 선택적으로 읽는다.
파일이 없으면 agent는 로딩하지 않으므로 기존 배포도 동작한다. `dev.env`,
`staging.env`, `prod.env`를 각각 구성한다. 테스트에서는 `CAREER_FORM_OTEL_ENV_FILE`로
경로를 바꿀 수 있다. 배포 runner가 읽을 수 있는 최소 권한(예: root:docker 0640)을
설정한다. 기존 JVM 옵션이 있다면 같은 파일의 JAVA_TOOL_OPTIONS에 보존한다.
워크플로의 보호 영역을 바꾸지 않고 호스트의 환경별 파일로 설정을 전달한다.

```dotenv
CAREER_FORM_OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://10.0.0.72:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<운영자가 생성한 base64 사용자:암호>
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

자격값을 저장소·채팅·로그에 남기지 않는다. 전체 `docker compose config`나
컨테이너 환경 출력을 공유하지 않는다. endpoint에는 `/v1/traces`를 붙이지 않는다.
agent가 http/protobuf 경로를 추가한다. service.name은 career-form-backend,
환경은 SPRING_PROFILES_ACTIVE에서 지정한다.

기본 신규 trace 표본율은 10%다. parent 기반이므로 sampled 상위 요청은 이 비율보다
더 많이 수집될 수 있다. 비율을 트래픽 상한으로 해석하지 않는다. 합성 검증에서만
`always_on`으로 전량 수집한다. HTTP·MongoDB·HTTP client 자동 계측에 더해
agent.properties의 제한된 서비스·라우터·DNS·매핑 메서드를 계측한다.
라이브러리나 메서드가 바뀌면 실제 span을 다시 검증한다.

## 저장되는 정보와 한계

Alloy는 서비스·환경, HTTP method/status/route 패턴, DB 시스템·명령 종류,
코드 함수 이름, 오류 타입만 허용한다. 원본 span 이름은 허용된 속성으로 재구성한다.
URL·쿼리·본문·헤더·DB statement·예외 메시지/스택과 span event는 저장하지 않는다.
span link가 있는 span은 초기 범위에서 통째로 제외한다. 비동기 link 기반 작업은
누락될 수 있으며 HTTP 부모·자식 관계와 동일하게 해석하지 않는다.
trace ID·span ID·부모 ID·시간·종류·오류 상태는 유지한다.
변환 오류는 원본을 통과시키지 않고 수집 실패로 처리한다.

정제는 중앙 Alloy에서 실행된다. agent가 생성한 원본 속성은 내부 전송 구간과
Alloy 메모리에 도달할 수 있다. 원본이 호스트 밖으로 나가는 것까지 금지하는
환경에는 이 구성을 그대로 켜지 말고 송신 전 정제를 추가 검토한다.
민감한 HTTP header 캡처나 MongoDB command 캡처를 활성화하지 않는다.
검증에는 합성 데이터만 사용한다. source URL 대신 HTTP client span의 시간과 상태로
외부 호출을 확인하며 로그 requestId와 trace ID의 자동 연결은 제공하지 않는다.

## Explore 사용

Grafana → Explore → Tempo를 선택하고 최근 15분 등 요청 발생 시간으로 맞춘다.
TraceQL 예:

```traceql
{ resource.service.name = "career-form-backend" && resource.deployment.environment.name = "dev" }
{ resource.service.name = "career-form-backend" && duration > 100ms }
{ resource.service.name = "career-form-backend" && status = error }
```

검색 결과를 열어 waterfall에서 HTTP 진입과 DB·내부 함수·HTTP client span을 비교한다.
알고 있는 trace ID를 검색해 같은 요청으로 진입할 수도 있다. parent span이 표본
미수집·전송 실패·link 제거로 누락될 수 있으므로 모든 호출이 보인다고 가정하지 않는다.
검색이 비어 있으면 시간 범위 → 환경 → 표본율 → agent 로딩 → 인증/네트워크 →
Alloy 정제 오류 → Tempo 저장 순으로 확인한다. 운영 자격을 담은 디버그 출력을 켜지 않는다.

## 비활성화와 복구

환경 파일의 CAREER_FORM_OTEL_ENABLED를 false로 바꾸고 기존 배포 절차로 해당
백엔드를 재생성한다. 같은 이미지에서 agent 없이 실행되며 기존 JVM 옵션은 유지된다.
단순 컨테이너 restart는 변경한 환경 파일을 반영하지 않으므로 recreate가 필요하다.
모든 앱 송신을 끈 뒤 필요하면 운영자가 Tempo만 stop한다. profile을 생략하는 것만으로
이미 실행 중인 Tempo가 중지되지는 않는다. 데이터 볼륨은 유지한다.
수집기 장애 시 비동기 전송은 제한된 큐·재시도 뒤 trace를 버리며 앱 요청을 차단하지 않는다.

## 로컬 검증

JDK 21, Docker, 저장소 Python 환경이 필요하다. 실제 자격과 서버를 사용하지 않는다.

```bash
(cd backend && ./gradlew bootJar --console=plain)
docker build -t career-form-backend:cf-213 backend
.venv/bin/python -m unittest infra.tests.test_tracing infra.tests.test_monitoring_compose -v
RUN_TRACING_INTEGRATION=1 .venv/bin/python -m unittest infra.tests.test_tracing_runtime -v
.venv/bin/python harness/scripts/verify.py --base-ref origin/develop
```

통합 검증은 임시 디렉터리, 별도 Compose 프로젝트와 동적 loopback 포트를 사용하며
종료 시 자신이 만든 스택만 정리한다. trace 검증 fixture는 기존 MongoDB alert UID가
Grafana의 40자 제한을 초과하는 별도 문제 때문에 alert provisioning을 제외한다.
따라서 이 검증 성공이 중앙 스택 전체의 배포 성공을 뜻하지 않는다.
