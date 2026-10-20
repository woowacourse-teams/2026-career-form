# 분석 응답과 품질 관측의 비동기 분리

> Topic: async-quality-observation
> Status: Current
> Current: [CF-288 비동기 품질 관측](../../raw/issues/CF-288/documents/async-quality-observation.md)
> History: [CF-288 비동기 품질 관측](../../raw/issues/CF-288/documents/async-quality-observation.md)
> Updated: 2026-10-20

## 현재 상태

분석 응답과 자동 기입 완료는 품질 DB 저장과 집계를 기다리지 않는다. 실행별 메모리 등록과 보고 접수를 분리하고 번호, 토큰은 확장 background에 보관한다. 등록 대기는 최대 30초이며 기존 보고 시점과 300 필드 분할은 유지한다. 서버는 연결 키와 토큰의 해시를 사용하며 문맥 소실을 DB 동기 조회로 복구하지 않는다.

하나의 품질 작업자가 제한된 큐에서 원본 저장, 집계와 보정을 처리한다. 선행 정보 준비 여부는 메모리에서 확인한다. 집계는 약 60초마다 변경된 원본의 최신 상태로 갱신한다. 포화, 만료와 재시작으로 일부 기록이 유실될 수 있다. 접수 응답은 저장 보장이 아니다.

초기 용량과 시간 제한은 Current 원문을 따른다. 직렬화 바이트 제한은 JVM 힙/RSS 상한이 아니며 실제 절감량과 143 RPS 안전성은 아직 측정하지 않았다. 실제 배포, 자원 경합과 trace 전파 검증은 사람이 수행한다.

## 변경 이유

별도 스레드에 맡긴 품질 작업의 결과까지 분석 응답이 기다리던 결합을 제거한다. 번호와 토큰을 별도 등록으로 전달해 후속 보고 연결을 유지하며 품질 실패를 사용자 입력 흐름에서 분리한다.

## 관련 주제

- [자동 입력 품질 관측과 사람 확인 요청](autofill-quality-observation.md)
- [자동 기입 품질 report의 전송 시점](quality-report-lifecycle.md)
- [이전 품질 실행기의 인터럽트 계약](quality-observation-interruption.md)
