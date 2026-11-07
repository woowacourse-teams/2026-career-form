# 공고 구독 알림

CF-348은 팀이 등록한 채용 공고를 접수 가능 시점(등록 시각과 접수 시작 중 늦은 쪽)에 Web Push(FCM)로 한 번 알린다. CF-394부터 공고는 직무 분류의 소분류 코드를 필수로 가지며 알림은 그 직무를 받기로 한 구독자에게 간다. 받을 직무를 고르지 않은 구독은 모든 공고를 받는다. 서버 책임은 FCM 수락 응답을 받을 때까지 재시도하는 것이며 기기 도착과 열람은 확인하지 않는다. 그 빈틈은 확장의 새 공고 탭(진행 중 공고 목록 조회)이 메운다. 기능은 기본으로 꺼져 있고 VAPID 키 발급·배포 설정(#350)은 별도 작업이며, 확장 쪽 받을 직무 선택과 새 공고 탭 거르기는 #395가 맡는다.

## 설정

| Spring property (`career-form.notification.` 접두사) | 환경변수 | 기본값 | 범위와 의미 |
|---|---|---|---|
| `enabled` | `CAREER_FORM_NOTIFICATION_ENABLED` | `false` | 꺼지면 발송기와 확장용·관리용 API bean이 모두 없어 404로 응답한다 |
| `push.vapid.public-key` | `CAREER_FORM_PUSH_VAPID_PUBLIC_KEY` | 없음 | base64url 65바이트 비압축 P-256 공개키. 확장에 그대로 내려준다 |
| `push.vapid.private-key` | `CAREER_FORM_PUSH_VAPID_PRIVATE_KEY` | 없음 | base64url 32바이트 스칼라 또는 PKCS#8. 공개키와 쌍인지 서명 자가검증으로 확인한다 |
| `push.vapid.subject` | `CAREER_FORM_PUSH_VAPID_SUBJECT` | 없음 | `mailto:` 또는 `https://` URI |
| `push.dispatch-interval` | `CAREER_FORM_PUSH_DISPATCH_INTERVAL` | `60s` | fixedDelay 주기. 시연용 `10s`부터 `1h`까지 |
| `push.concurrency` | `CAREER_FORM_PUSH_CONCURRENCY` | `20` | 한 주기 안의 동시 FCM 호출 수(1~200) |
| `push.max-attempts` | `CAREER_FORM_PUSH_MAX_ATTEMPTS` | `8` | 발송 한 건의 최대 FCM 호출 횟수(1~20) |
| `push.lease` | `CAREER_FORM_PUSH_LEASE` | `120s` | 선점 리스. 호출 시간 초과보다 길어야 하며 만료되면 다른 주기가 이어 보낸다 |
| `push.timeout` | `CAREER_FORM_PUSH_TIMEOUT` | `10s` | FCM 요청 시간 초과(1~60초) |
| `push.allowed-endpoint-hosts` | `CAREER_FORM_PUSH_ALLOWED_ENDPOINT_HOSTS` | `fcm.googleapis.com,jmt17.google.com` | 구독 endpoint로 허용하는 푸시 서비스 호스트(쉼표 구분). Chrome 계열은 구독마다 두 FCM 호스트 중 하나를 돌려주므로 둘 다 기본값이다. 다른 호스트의 endpoint는 400으로 거절한다 |
| `push.batch-size`, `push.max-per-cycle` | 없음 | `500`, `20000` | 한 조회의 대기 건 수와 한 주기의 처리 상한 |

토글이 켜졌는데 VAPID 값이 비어 있거나 쌍이 맞지 않으면 기동에 실패한다. 미설정 환경은 토글 기본값으로 안전하게 뜬다. 관리 API와 화면은 품질 관리(`career-form.quality.*`)의 공용 비밀번호 로그인이 설정돼 있어야 열린다.

## 저장

| 컬렉션 | 내용 | 인덱스 |
|---|---|---|
| `job_postings` | 회사, 직무 코드 배열 `roles`(소분류 코드 1개 이상, 상한은 분류 전체), 직무 라벨 `role`(소분류 라벨을 가운뎃점으로 이은 문자열, 120자 이하), 링크, 접수 시작, 마감, 등록 시각. `roles` 도입 전 레거시 문서는 `roles`가 없고 `role`도 없을 수 있으며 재분류하지 않는다 | `link` 유일, `(opensAt, closesAt)` |
| `push_subscriptions` | endpoint, p256dh, auth, 등록 시각, 받을 직무 코드 배열 `roles`(없으면 미선택), `rolesUpdatedAt`(마지막으로 `roles`를 받은 시각, 없을 수 있음) | `endpoint` 유일, `roles`(멀티키) |
| `push_deliveries` | 공고 ID × 구독 ID, 상태(PENDING·SENDING·ACCEPTED·ABANDONED), 예정 시각, 시도 횟수, 다음 시도 시각, 리스 만료 시각, 마지막 시도 시각·응답 코드·이유 | `(postingId, subscriptionId)` 유일, `(status, nextAttemptAt)`, `(status, leaseUntil)`, `(postingId, status)`, `scheduledAt` |

인덱스는 기동 시 `createIndex`로 보장하며 기존 컬렉션은 건드리지 않는다. 발송 문서 보존 정리는 후속 범위다.

## 직무 분류

정본은 `backend/src/main/resources/notification/job-categories-v1.json`이다. `version`(1 이상 정수), 대분류(`code`, `label`, `roles`), 소분류(`code`, `label`)를 담고 기동 시 `JobCategories.load()`가 읽어 검증한다. 대분류 코드는 `[A-Z][A-Z0-9_]{0,31}`, 소분류 코드는 `<대분류 코드>.<같은 형식>`이고 파일 전체에서 유일해야 하며, 대분류마다 소분류가 1개 이상, 라벨은 공백 아닌 문자를 포함한 1~40자다. 소분류 총수는 `JobCategories.MAX_ROLES`(30)까지다. 공고가 대기업 공채처럼 분류 전체를 한 번에 고를 수 있어야 하므로 공고 직무 상한을 따로 두지 않고 이 값이 상한이 되며, 65자 코드 30개를 실은 payload가 평문 상한 안에 드는 것을 `PushPayloadTest`가 보장하므로 값을 올릴 때는 그 테스트를 함께 본다. 검증에 실패하면 bean 생성 시점에 `IllegalStateException`으로 기동을 막는다.

코드는 추가만 하고 삭제·변경하지 않는다. 저장된 공고와 구독이 코드를 참조하므로 바꾸면 거르기가 조용히 틀어진다. 목록 변경은 화면이 아니라 파일 버전을 올리고 배포하는 것으로 한다. 공고와 구독의 코드 배열은 같은 규칙으로 정규화한다(null 요소 제거, 앞뒤 공백 제거, 입력 순서를 유지한 중복 제거). 모르는 코드가 하나라도 있으면 거절한다. 분류에서 사라진 코드가 저장돼 있으면 관리 목록은 코드를 라벨 자리에 그대로 보여 준다.

## 확장용 API

인증이 없고 토글이 꺼지면 404라서 확장은 `ENDPOINT_UNAVAILABLE`로 처리한다.

| 요청 | 응답 |
|---|---|
| `GET /api/v1/notifications/vapid-public-key` | 200 `{"publicKey"}` |
| `POST /api/v1/notifications/subscriptions` `{"endpoint","expirationTime"?,"keys":{"p256dh","auth"},"roles"?}` | 201 신규 / 200 기존 `{"subscriptionId","created"}`. 같은 endpoint는 새로 만들지 않는다. `roles`는 받을 소분류 코드 배열로 선택 필드다. 재등록 때 `roles`가 있으면 덮어쓰고(`rolesUpdatedAt` 갱신), 빈 배열은 미선택으로 저장하며, 필드가 없으면 기존 선택을 유지한다. 키(p256dh·auth)는 재등록해도 바꾸지 않는다. 별도 필터 저장 API는 없고 확장이 시작·켜기마다 재등록하며 선택값을 싣는다. 검증 순서는 ENDPOINT → KEYS → ROLES. 400 `INVALID_SUBSCRIPTION`(허용 호스트 `fcm.googleapis.com`·`jmt17.google.com`의 HTTPS가 아니거나 키 길이가 다르거나 분류에 없는 코드가 있음), 400 `INVALID_INPUT`(본문 해석 실패) |
| `POST /api/v1/notifications/subscriptions/unsubscribe` `{"endpoint"}` | 204. 없는 endpoint도 204 |
| `GET /api/v1/notifications/postings` | 200 `{"postings":[{"id","company","role"?,"roles"?,"link","opensAt","closesAt"}]}`. 접수 시작 ≤ 현재 < 마감인 공고를 마감순으로. `roles`는 소분류 코드 배열, `role`은 파생 라벨이다. 레거시 공고는 `roles`를 생략하고 기존 자유 글자 `role`이 있으면 그대로 유지하며 `role`도 없을 때만 생략한다 |
| `GET /api/v1/notifications/job-categories` | 200 `{"version","categories":[{"code","label","roles":[{"code","label"}]}]}`. 직무 분류 정본 `backend/src/main/resources/notification/job-categories-v1.json`의 버전과 대분류·소분류. 코드는 `IT.BACKEND`처럼 대분류와 소분류를 점으로 이은 안정 문자열(`[A-Z][A-Z0-9_]{0,31}`)이고 라벨은 한글 1~40자다. 기동 시 코드 형식·유일성과 라벨을 검증해 실패하면 기동을 막는다. 코드는 추가만 하고 삭제·변경하지 않는다 |

푸시 payload는 목록 항목에 `sentAt`(FCM 요청 시각, ISO-8601)을 더한 UTF-8 JSON `{"id","company","role"?,"roles"?,"link","opensAt","closesAt","sentAt"}`이며 레거시 공고는 `roles` 필드를 생략하고 기존 자유 글자 `role`이 있으면 그대로 유지하며 `role`도 없을 때만 생략한다(확장은 없음과 빈 문자열을 모두 직무 없음으로 다루고 `sentAt`으로 표시 지연을 계측한다). 회사 80자, 직무 라벨 120자, 링크 1024자에 65자 소분류 코드를 분류 상한인 30개 더한 상한에서 평문 3,900바이트 이하이며 aes128gcm 암호화 뒤에도 4,096바이트 한도 안에 든다(테스트로 보장).

## 관리 API와 화면

경로 `/api/v1/notifications/admin/**`과 화면 `/notifications/`는 기존 `QualityApiFilter`가 보호한다. 요청마다 `Authorization: Basic quality:<공용 비밀번호>`를 확인하고 다른 Origin을 거부하며 본문 128KiB를 넘지 않게 한다. 품질 기능이 꺼져 있으면 404, 비밀번호 설정이 없으면 503이다. 화면은 `/quality`의 로그인 틀, 스타일, 접근 모듈을 재사용하고 삭제는 확인 대화상자를 거친다. 등록 폼의 직무는 분류 API로 대분류 `<select>`를 채우고 고른 대분류의 소분류를 체크박스로 보여 주는 다중 선택기다. 다른 대분류로 옮겨도 선택은 누적되고, 고른 소분류는 라벨 칩과 제거 버튼으로 보여 준다. 1개 이상이면 등록되고(상한은 분류 전체) 비어 있으면 요청 없이 안내하며, "이 대분류 전체 선택"·"전체 직무 선택"·"모두 해제" 버튼으로 공채처럼 직무가 많은 공고를 한 번에 고른다. 분류 전체를 골랐으면 칩 대신 라벨이 "전체 직무"로 표시된다고 한 줄로 알린다. 분류를 불러오지 못하면(토글 꺼짐 404) 등록과 일괄 선택 버튼을 막고 안내한다. 선택기는 기본 폼 요소(`<select>`, 체크박스, 버튼)만 쓰므로 키보드 기본 포커스 순서로 조작된다. 목록 카드 제목은 서버가 파생한 `role` 라벨이고 `roles`가 없는 레거시 공고에만 "직무 없음"을 표시한다. 화면 위쪽의 발송 요약 표는 요약 API로 최근 7일·30일을 보여 주며 구독 수 옆에 직무 선택 구독 수를 둔다.

| 요청 | 응답 |
|---|---|
| `GET /api/v1/notifications/admin/postings` | 200 `{"postings":[{id, company, role?, roles?:[{code, label}], link, opensAt, closesAt, registeredAt, scheduledAt, progress:{pending, sending, accepted, abandoned, lastAttemptAt}}]}` 최근 등록 순. `roles`는 저장된 소분류 코드에 현재 분류의 라벨을 붙인 목록이다. 레거시 공고는 `roles`를 생략하고 기존 자유 글자 `role`이 있으면 그대로 유지하며 `role`도 없을 때만 생략한다 |
| `POST /api/v1/notifications/admin/postings` `{company, roles, link, opensAt, closesAt}` | 201 `{"id","scheduledAt","deliveries"}`. `roles`는 분류의 소분류 코드 배열로 필수이며 null 요소 제거·공백 제거·순서 유지 중복 제거 뒤 1개 이상이고(상한은 분류 전체, 분류의 소분류 총수는 30 이하) 분류에 없는 코드가 하나라도 있으면 거절한다. `role` 라벨은 서버가 소분류 라벨을 가운뎃점(`·`)으로 이어 만들고 120자를 넘으면 앞 라벨 몇 개에 ` 외 n개`를 붙여 줄이며, 분류 전체를 고른 공고는 길이와 무관하게 `전체 직무`다. 요청의 `role` 자유 글자는 무시된다. 검증 순서는 COMPANY → ROLE → LINK → PERIOD → CLOSED. 저장과 대상 구독(공고 직무와 겹치는 직무를 고른 구독과 받을 직무를 고르지 않은 구독)의 대기 발송 생성이 끝났다는 뜻이며 `deliveries`는 그 건수다. FCM 수락을 기다리지 않는다. 409 `{"error":"DUPLICATE_LINK","postingId"}`, 400 `{"error":"INVALID_POSTING","reason": COMPANY·ROLE·LINK·PERIOD·CLOSED}` |
| `DELETE /api/v1/notifications/admin/postings/{id}` | 204. 대기 발송만 삭제하고 수락·포기·발송 중 기록은 남긴다. 404 `POSTING_NOT_FOUND` |
| `GET /api/v1/notifications/admin/summary?from=<ISO>&to=<ISO>` | 200 `{from, to, postings, deliveries:{pending, sending, accepted, abandoned, total, averageAttempts}, acceptanceRate, abandonRate, latencyMillis:{p50, p95}, subscriptions, roleSelectedSubscriptions}`. 예정 시각이 `[from, to)`인 발송 문서를 집계한다. `postings`는 기간 안 등록 공고 수, 수락률·포기율은 끝난 발송(수락+포기) 기준, 평균 시도는 기간 안 전체 발송 기준, 지연은 `lastAttemptAt - scheduledAt`(MongoDB `$percentile`, 7.0 이상)이며 분모가 없으면 null이다. `subscriptions`는 현재 구독 수, `roleSelectedSubscriptions`는 받을 직무를 1개 이상 고른 현재 구독 수다. 400 `INVALID_RANGE`(시작 ≥ 끝, 400일 초과), 400 `INVALID_INPUT`(매개변수 누락). 집계값만 돌려주고 endpoint·키·링크는 내지 않는다 |

수정 API는 없다. 삭제 후 재등록하면 대상 구독에 한 번 더 간다.

## 발송기

대기 발송은 등록 시점에 대상 구독에만 만든다. 대상은 공고 `roles`와 겹치는 직무를 고른 구독과 받을 직무를 고르지 않은(`roles`가 없거나 빈) 구독이다(`roles` 멀티키 인덱스 조회). 발송기는 `@Scheduled` fixedDelay(설정 주기, 첫 실행은 기동 10초 뒤)로 한 주기에 다음을 한다.

1. 예정 시각이 지난 PENDING과 리스가 만료된 SENDING을 `nextAttemptAt` 순으로 조회한다.
2. 건마다 `findAndModify`로 같은 상태와 기한 조건일 때만 SENDING, 시도 횟수 +1, 리스 만료 시각을 찍는다(선점). 실패한 건은 건너뛴다. 발송기가 둘이어도 같은 건의 FCM 호출은 한 번만 나간다.
3. 공고와 구독을 다시 읽어 삭제·마감·직무 필터를 재검사한 뒤 가상 스레드와 Semaphore로 동시성 한도 안에서 Web Push를 보낸다. 요청은 VAPID 서명(JWT 12시간), aes128gcm 암호화, `TTL`=마감까지 남은 초, `Urgency: normal`이다.
4. 응답에 따라 선점한 리스와 시도 횟수가 그대로일 때만 상태를 바꾼다(`findAndReplace`). 다른 발송기가 리스 만료 뒤 가져간 건은 `stale`로 세고 덮어쓰지 않는다.

| 응답 | 전이 |
|---|---|
| 2xx | ACCEPTED |
| 404, 410 | ABANDONED(`GONE`), 구독 삭제. 같은 구독의 다른 대기 건은 호출 없이 `SUBSCRIPTION_MISSING` |
| 429, Retry-After 있는 503 | Retry-After 뒤 PENDING(없으면 1분, 상한 1시간), 이유 `RETRY_AFTER` |
| 400, 403, 413 | ABANDONED(`INVALID_REQUEST`), `PUSH_INVALID_REQUEST` 운영 로그 |
| 그 밖의 상태, 시간 초과, IO 오류 | 1·2·4·8·16·32·64분 지수 백오프로 PENDING(`SERVER_ERROR`·`UNEXPECTED_STATUS`·`TIMEOUT`·`IO_ERROR`) |
| 시도 횟수가 상한(기본 8)에 이른 실패 | ABANDONED(`MAX_ATTEMPTS`) |
| 선점 시점에 마감 경과 / 공고 삭제됨 | 호출 없이 ABANDONED(`DEADLINE_PASSED` / `POSTING_MISSING`) |
| 선점 뒤 직무를 고른 구독의 현재 `roles`가 공고와 겹치지 않음 | 호출 없이 ABANDONED(`FILTER_MISMATCH`). `roles`가 없는 레거시 공고와 받을 직무를 고르지 않은 구독은 재검사하지 않는다 |
| 호출 중 인터럽트 | SENDING 유지. 리스 만료 뒤 다음 주기가 다시 보낸다 |

백오프 합은 127분이라 8회째 시도는 첫 시도 뒤 약 2시간 7분에 일어난다. 장애당 중복 알림은 최대 1건이며 외부 표시까지의 exactly-once는 보장하지 않는다.

## 관측

로그에는 공고 ID, 발송 ID, 시도 횟수, 결과, 이유, 응답 코드, 소요 시간만 남긴다. endpoint, p256dh, auth, 공고 링크는 어디에도 기록하지 않고, 공고의 직무 코드와 사용자의 직무 선택(구독 `roles`)은 건수만 남긴다.

| 로그 | 뜻 |
|---|---|
| `PUSH_RESULT` | 발송 한 건의 전이 결과. 이유는 `ACCEPTED`·`RETRY_AFTER`·`SERVER_ERROR`·`TIMEOUT`·`IO_ERROR`·`UNEXPECTED_STATUS`·`INTERNAL_ERROR`·`GONE`·`INVALID_REQUEST`·`MAX_ATTEMPTS`·`DEADLINE_PASSED`·`SUBSCRIPTION_MISSING`·`POSTING_MISSING`·`FILTER_MISMATCH` |
| `PUSH_RESULT_STALE` | 리스를 잃어 반영하지 않은 완료 |
| `PUSH_INVALID_REQUEST` | 400·403·413으로 포기한 건(설정 점검 대상) |
| `PUSH_DISPATCH_CYCLE` | 주기별 due·claimed·accepted·retried·abandoned·skipped·stale 건수와 소요 시간 |
| `POSTING_REGISTERED` | 공고 등록 한 건의 공고 ID, 직무 코드 건수, 만든 대기 발송 건수 |
| `EXTERNAL_RESULT provider=fcm operation=push` | 기존 외부 호출 로그 계약 |

| 메트릭 | 라벨 | 뜻 |
|---|---|---|
| `career.form.push.send` (timer, p50·p99·히스토그램) | `outcome`=accepted·gone·retry_after·invalid·failure·timeout·error | FCM 호출 소요 시간 |
| `career.form.push.delivery` (counter) | `outcome`=accepted·retry·abandoned, `reason`(포기 이유에 `FILTER_MISMATCH` 포함) | 전이 결과별 건수(수락률·포기율) |
| `career.form.push.dispatch.cycle` (timer), `career.form.push.dispatch.claimed` (summary) | 없음 | 한 주기 소요와 처리 건수 |
| `career.form.push.delivery.latency` (timer, p50·p95·p99·히스토그램) | 없음 | 수락된 발송의 예정 시각→FCM 수락 지연 |
| `career.form.push.backlog` (gauge) | `status`=pending·sending | 주기 끝마다 갱신하는 대기·발송 중 건수 |
| `career.form.push.subscriptions` (gauge) | 없음 | 주기 끝마다 갱신하는 현재 구독 수 |
| `career.form.external.call`, `career.form.external.timeouts` | `provider=fcm`, `operation=push` | 기존 외부 호출 대시보드에 함께 표시 |

메트릭 라벨에는 공고 ID·링크·endpoint·직무 선택을 넣지 않는다. 이 숫자가 2차(큐·별도 워커) 검토의 비교 기준이다. 재검토 조건은 ADR을 따른다.

## 기준 수치 측정 절차

전달 경로나 큐(FCM 토픽, SQS 등)를 바꾸기 전에 지금 버전의 수치를 남기고, 바꾼 뒤 같은 지표를 같은 기간으로 다시 재서 비교한다.

| 지표 | 출처 | 뜻 |
|---|---|---|
| 예정→수락 지연 p50·p95·p99 | `career.form.push.delivery.latency`(Prometheus), 요약 API `latencyMillis` | 접수 가능 시점부터 FCM 수락까지. 목표는 등록 후 10분 안에 99% |
| FCM 호출 소요 p50·p99 | `career.form.push.send` | 한 호출의 왕복. 동시성·큐 전환 전후 비교 |
| 한 주기 처리 건수·소요 | `career.form.push.dispatch.claimed`, `career.form.push.dispatch.cycle`, `PUSH_DISPATCH_CYCLE` 로그 | 이용률(소요 ÷ 주기)이 70%를 넘으면 큐 검토 |
| 백로그 | `career.form.push.backlog{status}` | 주기 끝에 남은 대기·발송 중 건수. 계속 늘면 처리량 부족 |
| 결과별 건수, 수락률, 포기율, 평균 시도 | `career.form.push.delivery{outcome,reason}`, 요약 API | 포기 이유 분포는 메트릭, 기간 비율은 요약 API |
| 구독 수, 직무 선택 구독 수 | `career.form.push.subscriptions`, 요약 API `subscriptions`·`roleSelectedSubscriptions` | 규모 가정(1,000명) 대비 실제 |
| 기기 표시 지연 | 확장이 payload `sentAt`으로 계측(PostHog) | 서버가 관측할 수 없는 구간 |

조회 위치: 앱 컨테이너의 관리 포트 9091 `/actuator/prometheus`(외부 비공개, 호스트 안에서만), 중앙 Prometheus(보존 14일)·Loki(7일)·Grafana(`monitoring-system` topic), 그리고 보존 기간과 무관한 요약 API(MongoDB 발송 문서, 관리 로그인 필요).

주간 스냅샷: 매주 같은 요일에 요약 API를 `from`=7일 전, `to`=지금으로 호출해 응답을 그대로 표(주차, 등록 공고, 결과별 건수, 수락률, 포기율, 평균 시도, 지연 p50·p95, 구독 수, 직무 선택 구독 수)에 적고, Prometheus에서 다음을 같은 구간으로 기록한다. 자동화는 후속 범위다.

```promql
histogram_quantile(0.99, sum(rate(career_form_push_delivery_latency_seconds_bucket[7d])) by (le))
histogram_quantile(0.99, sum(rate(career_form_push_send_seconds_bucket[7d])) by (le))
sum(increase(career_form_push_delivery_total[7d])) by (outcome, reason)
max_over_time(career_form_push_backlog{status="pending"}[7d])
```

비교 규칙: 전환 전 최소 2주를 기준 구간으로 두고, 전환 뒤 같은 길이의 구간을 같은 지표로 잰다. 전환 사유(장애 격리, 채널 확장)와 대가는 ADR 재검토 조건과 함께 적는다.

## Web Push 라이브러리

`com.zerodeplibs:zerodep-web-push-java` 2.1.5(2025-12 배포)를 쓴다. 기준은 VAPID(RFC 8292)와 aes128gcm(RFC 8291) 지원, Java 21 호환, 유지보수 상태, 의존성 크기였다.

| 후보 | 판단 |
|---|---|
| `nl.martijndwars:web-push` 5.1.2 | BouncyCastle과 JWT 라이브러리가 필수 의존성이고 Java 8 기준 설계라 의존성이 크다 |
| `dev.blanke.webpush:webpush` 6.1.3 | Java 17 이상, 의존성이 작지만 JWT 어댑터(jose4j·nimbus 등)를 따로 골라 넣어야 한다 |
| `com.zerodeplibs:zerodep-web-push-java` 2.1.5 | 필수 전이 의존성 0, JDK 암호 공급자로 VAPID·aes128gcm 처리, `java.net.http.HttpRequest`를 바로 만들어 준다. 2025년 11~12월에도 릴리스가 이어진다 |

테스트는 생성한 합성 키로 요청을 만들어 수신기 쪽 RFC 8291 복호화가 원문과 같은지, 암호화 본문이 4,096바이트 이하인지 확인한다. 실제 FCM 수락은 스테이징 시크릿이 들어간 뒤 사람이 확인한다.

## 범위 밖과 한계

공고 수정·재알림, 수신 확인, 계정, 메시지 큐·별도 워커·2중화, 다른 채널, 자동 수집은 범위 밖이다. 직무 필터는 변경 뒤 등록되는 공고부터 적용되며, 필터 변경 전 등록된 공고의 발송 보충, 관심 기업 필터, 구독을 식별하는 서버 쪽 공지함 필터(목록은 익명 조회이고 거르기는 확장이 한다)는 후속이다. 기존 공고의 재분류는 하지 않으며 필요하면 팀이 삭제 후 재등록한다. 서버 한 대라 배포마다 발송이 최대 2분 멈추고, Chrome 종료 중이거나 OS 알림이 차단되면 표시되지 않는다. 발송 문서 보존 정리와 Grafana 대시보드·포기율 알림은 후속 Infra 범위다.
