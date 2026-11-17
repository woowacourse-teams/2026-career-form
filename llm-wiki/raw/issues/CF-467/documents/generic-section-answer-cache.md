# 범용 섹션 분석 캐시: 확장 쪽과 서버 쪽

> Issue: [CF-467](https://github.com/woowacourse-teams/2026-career-form/issues/467)
> Collected: 2026-11-17
> Approval-Digest: a7717c1500566292916e09452820d384d28846d331414b2b0f719012e50a8362
> Source-Revision: 9114a7ef

범용 섹션 분석에는 캐시가 둘 있다. 확장 쪽 캐시(CF-244)는 그대로이고 CF-467이 서버 쪽 캐시를 더했다. [승인 후보 스냅샷](approved-candidates.md)의 후보 2, 3, 4를 적는다. 결정의 이유와 버린 대안은 [ADR](adr/467-generic-section-answer-cache.md)에 있다. 확장 쪽 캐시의 적용과 검증은 CF-244 payload(범용 섹션 분석 캐시의 키와 수명)의 내용이 그대로 유효하다.

## 두 캐시의 현재 상태 (후보 2)

확장 쪽 캐시(#244)는 그대로다. 섹션 지문, 제목, 상위 제목, 반복 행 여부, 칸별 visibility/disabled/readonly/inert를 키로 쓰고, 워크플로우 실행 객체별 WeakMap과 URL로 수명을 정한다. 실패와 reason이 있는 칸 응답은 저장하지 않는다.

서버 쪽 캐시(#467)를 더했다. `SectionAnswerCache`가 공급자에 보내는 내용(모델 이름, 섹션 상태, 선택 기준)을 Map 키 정렬 JSON으로 직렬화한 SHA-256을 키로, 질문 번호별 선택과 확신도를 값으로 둔다. `ChoiceFieldResolver.resolveSection`이 공급자를 부르기 전에 찾고, 모든 질문에 답을 받았을 때만 넣는다(판단 보류는 넣고, 공급자 실패, 허가 대기 초과, 토큰 한도로 답이 빠진 섹션은 넣지 않는다). 답을 `candidateId`에 붙이는 일과 후처리는 요청마다 한다. Spring이 만드는 운영 분석기에만 붙고 평가용 사본(`withModel`, `withBatching`)에는 붙지 않는다.

둘의 차이:

| | 확장 쪽(#244) | 서버 쪽(#467) |
|---|---|---|
| 사는 범위 | 한 실행, 한 URL | 백엔드 프로세스(배포나 재시작까지), 기한 7일, 섹션 5,000개 |
| 키 | 섹션 지문, 제목, 상위 제목, 반복 여부, 칸 상태 | 공급자에 보내는 내용의 해시(모델 이름, 섹션 상태, 선택 기준) |
| 나눠 쓰는 대상 | 같은 사용자의 같은 실행 | 모든 사용자, 모든 사이트 |
| 줄이는 것 | 서버 요청 | 공급자 호출 |
| 저장하는 것 | 서버 응답(분류와 매칭 결과) | 공급자의 답(선택과 확신도) |

저장 위치는 프로세스 안의 Caffeine이다. Redis를 쓰지 않은 까닭은 운영 서버가 한 대라서 서버 사이에 나눌 것이 없기 때문이다. Redis는 새 컨테이너, 접속 설정, 장애와 지연 처리, 키 버전 관리, 배포 구성 변경을 치른다. 캐시가 사라져도 다시 분석하면 되고, 배포로 비워지는 것이 옛 코드와 옛 프롬프트의 답을 지운다. MongoDB도 직렬화와 조회 왕복, 키 버전 관리가 들어 버렸다.

설정은 `career-form.analysis.jev.section-cache`의 `enabled`(true), `max-sections`(5000), `ttl`(7d)이고 배포 구성은 환경 변수를 전달하지 않는다. 지표는 카운터 `career.form.analysis.section.cache`의 `outcome`=`hit`|`miss`다. 응답 형식은 그대로이고 전부 적중한 응답은 `COMPLETE`에 `jevCalls` 0이다.

측정(`GenericSectionAnswerCacheDatasetTest`, 데이터셋 `generic-matching` v5의 칸 분석 요청 4개, 섹션 동시 수 1, 질문 묶음 5): 질문이 있는 섹션 31개 가운데 13개 적중, 공급자 호출 47회에서 29회. 요청별 적중은 같은 양식의 화면 셋이 0/8, 7/8, 6/8, 다른 사이트의 화면이 0/7이다.

한계: 배포할 때마다 처음부터 쌓는다. 글자는 그대로인데 칸의 뜻만 바뀌는 변화는 키가 잡지 못한다. 공급자의 답이 흔들린 경우 처음 저장된 답이 기한까지 모든 사이트에 쓰인다. 반복 줄을 줄 묶음(`items`)이 아니라 섹션의 칸으로 보내는 양식은 줄 수가 다르면 키가 달라진다. 재검토 조건: 서버가 두 대 이상이 되거나 배포 뒤 적중률이 떨어지는 것이 지표로 확인되면 서버 밖 저장(MongoDB, Redis)을 검토한다. 운영 문서는 `backend/docs/generic-section-answer-cache.md`다.

## 구현 중 확인한 사실 (후보 3)

- 모델 이름: `ChoiceModel`에 이미 `model()`이 있다. 분석기는 설정값을 따로 주입받지 않고 `client.model()`을 키에 넣는다.
- 답의 완결성: `JevClient.answer`는 응답의 질문 집합이 보낸 질문 집합과 다르면 예외를 던진다. 답이 빠지는 경우는 토큰 한도로 질문 하나를 끝내 묻지 못했을 때뿐이다.
- 확신도 거름: 범용 분석이 쓰는 `answer()`는 `min-confidence`로 거르지 않고 그대로 돌려준다. 거르는 곳은 캐시 뒤(서비스의 후처리)라서 저장된 답에 설정이 묻지 않는다.
- `ChoiceModel.Judgement`는 record이고 확률 Map을 `Map.copyOf`로 복사한다. 캐시는 선택과 확신도만 남긴 새 값을 넣는다.
- 선택 기준 Map은 `Map.copyOf`라 순서가 실행마다 다를 수 있다. 키는 Jackson의 `ORDER_MAP_ENTRIES_BY_KEYS`로 Map 키를 정렬해 만든다.
- Caffeine 버전은 Spring Boot BOM이 관리한다(4.1.0에서 3.2.4). `build.gradle.kts`에 버전을 적지 않는다. 실행 jar는 약 1.03MB 늘었다.
- Caffeine 3.2.4 `Cache.get(key, 함수)`의 Javadoc: 호출 전체가 원자적으로 돌아 함수는 키마다 한 번만 적용되고, 계산이 도는 동안 이 캐시의 다른 갱신 일부가 막힐 수 있으므로 계산은 짧고 단순해야 한다.
- 반복 줄의 묶음 값(`itemGroupId`)은 확장이 줄 요소의 id나 class에서 `item` 접미를 뗀 값으로 만든다(`repeatableItemGroupId`). class에서 온 값은 줄마다 같다. 서버 테스트는 묶음 값이 같은 줄 하나와 셋이 같은 키를 쓰는 것을 확인한다. 데이터셋 v5의 칸 분석 요청에는 줄 묶음(`items`)이 없어서 이 경로는 데이터셋으로 재지 못했다.
- 모니터링 수집 설정(`infra/monitoring/alloy/config.alloy`)은 컨테이너 라벨과 포트로만 거르고 지표 이름으로 거르지 않는다. 새 카운터는 설정을 고치지 않아도 수집된다.
- 힙 어림(JDK 21, 임시 프로그램으로 섹션 5,000개를 채워 GC 뒤 사용량 차이를 잼, 선택 문자열을 섹션마다 따로 둔 경우): 섹션당 질문 5개 약 5.7MB, 10개 약 10.1MB, 20개 약 18.9MB. 데이터셋 v5의 섹션당 칸 수 평균은 약 5.3개다.
- 평가 조립(`EvaluationConfiguration`)은 운영 분석기가 없을 때와 프롬프트 조각을 뽑을 때 분석기의 공개 생성자를 직접 부른다. 그래서 캐시는 `@Autowired` 생성자에만 붙이고 기존 서명의 공개 생성자는 캐시 없이 남겼다.

## 테스트를 쓸 때의 주의 (후보 4)

- JEV를 켠 `@SpringBootTest`는 설정이 같으면 Spring이 컨텍스트를 함께 쓰므로 운영 분석기의 캐시도 테스트 사이에 남는다. 공급자 호출 횟수를 단언하는 테스트는 다른 테스트와 겹치지 않는 섹션 내용(제목, 라벨)을 쓰고, 지표는 절대값이 아니라 늘어난 양으로 단언한다. 기존 `GenericFieldsApiTest`는 테스트마다 섹션 내용이 달라 그대로 통과한다.
- `new`로 만든 분석기는 캐시가 없다. 캐시를 시험하려면 패키지 전용 생성자에 `SectionAnswerCache`를 넘긴다. 기한은 가짜 `Ticker`로, 크기 상한은 `size()`(밀린 정리 뒤의 수)로 확인한다.
- 평가용 사본이 캐시를 쓰지 않는다는 테스트(`SectionAnswerCacheFingerprintTest`, `GenericSectionAnswerCacheTest.evaluationCopiesNeitherReadNorWrite`)는 `withModel`이 캐시를 넘기도록 바꾸면 둘 다 실패하는 것을 확인했다. 동작 지문은 같은 가짜 모델 이름으로 '첫 선택지'와 '판단 보류' 두 벌을 돌리므로 사본이 캐시를 함께 쓰면 둘째 벌이 첫째 벌의 답을 받아 지문이 달라진다.
- 테스트 속성에 `career-form.analysis.enabled=true`와 `career-form.llm.enabled=false`를 함께 두면 설정 충돌로 컨텍스트가 뜨지 않는다.
- 데이터셋 측정 테스트는 섹션 동시 수를 1로 둔다. 동시 수가 2 이상이면 한 요청 안의 같은 섹션이 함께 실패 처리되어 적중 수가 실행마다 달라질 수 있다.
