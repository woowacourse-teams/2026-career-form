# 공고 알림 발송 시험

> Topic: push-dispatch-load-test
> Status: Current
> Current: [CF-448 발송 시험 스택의 고정 기록 확인과 시험 자원 정리 절차](../../raw/issues/CF-448/documents/push-dispatch-load-test-pinning-and-cleanup.md)
> History: [CF-441 공고 알림 발송 비교 측정 방식과 전 구조 재시작 동작](../../raw/issues/CF-441/documents/push-dispatch-load-test.md), [CF-448 발송 시험 스택의 고정 기록 확인과 시험 자원 정리 절차](../../raw/issues/CF-448/documents/push-dispatch-load-test-pinning-and-cleanup.md)
> Updated: 2026-11-10

## 현재 상태

SQS 전환 전후 발송 비교는 운영 리전 임시 EC2 한 대에서 전환 직전 커밋과 전환 커밋을 같은 날 같은 시험 스택(`loadtest/push-dispatch/`)으로 연달아 잰다. 전후에 달라지는 것은 발송 구조와 실제 SQS 왕복뿐이어야 하므로 다음을 같게 둔다.

- MongoDB는 운영과 같은 standalone이다.
- 동시 발송은 20이다.
- 모의 서버 지연은 운영 FCM 호출 p50에 맞춘다.
- 모의 서버 상태 추첨 시드는 고정한다.
- tracing은 끈다.

노트북은 도구 개발과 리허설에만 쓰고, dev·staging·공용 MongoDB에서는 재지 않는다.

발송기는 저장된 endpoint로 그대로 POST한다. `allowed-endpoint-hosts`는 구독 등록 API에서만 검사한다. 그래서 시험 도구는 시험 표지가 없는 구독이 있거나, 관리 API가 보는 구독 수가 검사한 DB와 다르면 아무것도 쓰지 않고 멈춘다. 구독 수 대조는 관리 API에 공고를 보내는 등록 스크립트가 한다.

전 구조의 백엔드는 SIGTERM을 받으면 진행 중인 주기를 끝까지 보낸다. 종료 유예 30초를 넘기면 강제 종료되고, 보내던 발송 문서는 lease 120초 뒤 다시 나가며 중복이 생긴다. S3은 첫 주기가 유예보다 긴 30,000건으로 잰다.

팀 측정 계획과는 다음을 다르게 한다.

- S5의 Retry-After는 90초로 준다.
- 수락 공백은 시각과 함께 읽는다.
- 자원 요약은 발송 구간으로 자른다.
- S9는 새 스택에서 세 번 잰다.
- 기본 포트는 팀 관리 터널을 피한다.

SQS 전환은 CF-448에서 보류했다. 위 전후 비교 측정은 전환을 다시 볼 때 쓴다.

가상 스레드의 고정(pinned)은 시험 스택의 백엔드를 `-Djdk.tracePinnedThreads=full`로 띄워 확인한다. compose override 파일로 백엔드 서비스에 `JAVA_TOOL_OPTIONS`를 넣고, 발송이 끝난 뒤 백엔드 로그의 `reason:MONITOR` 줄 수와 `<== monitors`가 붙은 줄을 본다. 2026-11-10 로컬 리허설(CPU 2개, 구독 1,000개 × 공고 1건)에서 수정 전 발송기는 고정 기록 2건, 수정 후 발송기는 0건이었다.

공용 AWS 계정에서 임시 EC2와 큐를 쓰면 정리 절차를 계획에 넣는다.

- 팀 계정으로 SQS 큐 생성, EC2 실행과 중지, 탄력적 IP 릴리스는 된다.
- EC2 종료와 SQS 큐 삭제는 권한이 없어 운영진 Slack 채널에 자원 ID와 이름을 적어 요청한다.
- 측정이 끝나면 EC2를 먼저 중지해 요금을 멈추고 삭제를 요청한다. 쉬는 큐는 요금이 없다.
- 처리 표시를 받은 뒤에도 콘솔에서 실제로 사라졌는지 확인한다.

## 변경 이유

CF-441에서 SQS 전환 전후를 같은 숫자로 비교할 측정 방식과 시험 도구의 조건을 정했다. 근거와 수치는 연결된 raw를 따른다.

CF-448에서 발송기의 고정 문제를 같은 시험 스택으로 수정 전후에 확인했다. CF-445 실측에 쓴 임시 자원을 지우면서 공용 계정의 삭제 절차도 확인했다.
