# CF-213 검증 기록

2026-10-14, macOS ARM64 + Docker Desktop Linux ARM64, JDK 21.
운영 서버·자격·실제 지원서 데이터를 사용하지 않았다.

- `./gradlew bootJar --console=plain`: 성공.
- `docker build -t career-form-backend:cf-213 backend`: 공식 agent 2.32.0 다운로드 및 SHA256 검증 성공.
- unit/Compose: agent on/off, JVM 옵션 보존, 잘못된 toggle·endpoint, 환경별 env 파일,
  Tempo 선택 profile과 포트 비공개를 검증.
- `RUN_TRACING_INTEGRATION=1 ... test_tracing_runtime -v`: 5개 통과.
  실제 백엔드 HTTP·MongoDB·FieldsAnalysisService span과 서비스/환경 검색,
  합성 Java HTTP client→지연/503 stub의 부모 관계, 민감 속성/이벤트/link 제거,
  미인증 OTLP 거부, trace ID 조회, agent 비활성화 후 미수집, 수집기 장애 시 정상 응답.
- Grafana Explore UI: Tempo 선택, TraceQL 서비스 검색과 실제 trace 목록 표시 확인.
  상세 payload와 부모 관계는 API에서 검증했다. UI waterfall 상세 확인은 남아 있다.
- 전체 `harness/scripts/verify.py --base-ref origin/develop`: 통과.
  macOS 실행 결과이며 저장소 공식 WSL/Linux 검증을 대체하지 않는다.

## 작은 비용 표본

10회 예열 뒤 `/actuator/health`를 60회 순차 호출했다. agent는 always_on으로 검증했고
운영 기본 10%와 다르다. 다른 로컬 작업과 브라우저가 함께 실행된 단회 표본이다.
용량 산정·SLO나 회귀 기준으로 사용하지 않는다. CPU는 구간 평균이 아닌 Docker stats
시점값, 메모리는 컨테이너 사용량이다.

| agent | median | P95 | 메모리 | CPU 시점값 |
| --- | --- | --- | --- | --- |
| on | 11.80ms | 33.52ms | 447.2MiB | 0.69% |
| off | 7.13ms | 13.91ms | 307.9MiB | 0.47% |

짧은 관찰 구간의 Tempo 파일 크기 증분은 양쪽 모두 0B였다. 버퍼·블록 flush 전
측정이므로 trace 저장 비용이 0이라는 뜻이 아니다. 장시간 동일 부하에서 flush 이후
WAL/블록 증가량과 운영 호스트 여유를 측정해야 보존 기간·용량을 확정할 수 있다.

## 기존 중앙 스택의 배포 선행 문제

기존 MongoDB alert provisioning에 Grafana 40자 제한을 넘는 UID가 있어 중앙 전체
구성으로는 Grafana 시작이 실패했다(예: `cf-db-staging-db-checkout-timeout-warning`).
#207 범위의 기존 문제로 이번 변경에서 수정하지 않았다. trace 전용 통합 fixture는
임시 복사본에서 alert provisioning만 제외한다. 전체 중앙 스택의 정상 기동을 검증한
것으로 해석하면 안 된다. 이 문제와 중앙 t4g.micro의 자원 여유를 해결·확인한 뒤
운영자가 배포해야 한다.
