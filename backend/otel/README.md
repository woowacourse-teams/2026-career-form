# OpenTelemetry Java agent

2.32.0 release의 JAR을 이미지 빌드 단계에서 받아 SHA256 검증 후 runtime에 복사한다.
다운로드 또는 체크섬 검증 실패 시 이미지 빌드도 실패한다. JAR 자체는 Git에 저장하지 않는다.

- 배포와 검증: [트레이스 운영](../../infra/monitoring/tempo/README.md)
- 원본: https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/tag/v2.32.0
- 설정: https://opentelemetry.io/docs/zero-code/java/agent/configuration/
- 선택 계측: https://opentelemetry.io/docs/zero-code/java/agent/instrumentation/
- 수집 정제: https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.processor.transform/

버전 변경 시 checksum, 실제 MongoDB/HTTP/메서드 span 생성, 정제 후 속성과
오류/지연 탐색을 함께 재검증한다. 기본 disabled, 활성화 후 기본 신규 trace 표본율 10%다.
