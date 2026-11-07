# 공고 알림 미선택 구독 상시 발송과 전환 설정 제거

> Issue: [CF-432](https://github.com/woowacourse-teams/2026-career-form/issues/432)
> Collected: 2026-11-07
> Approval-Digest: 7fa81d649c3847946c61720c258533e9dd42172144711304010e08025c5d43df
> Source-Revision: da17fde3

서버의 공고 알림 대상 산정에서 받을 직무를 고르지 않은 구독을 빼던 전환 설정을 없앤 결정과, 알림 저장소를 검증하는 방법이다. [승인 후보 스냅샷](approved-candidates.md)의 후보 1과 3을 적는다. 직무 분류 정본, 공고 직무 필수, 구독의 받을 직무 저장 규칙, 발송기의 선점과 재시도, 로그와 메트릭 경계는 CF-394와 CF-348 payload의 내용이 그대로 유효하다. 설정 키, API 응답 모양, 상태 전이 표의 정본은 `backend/docs/job-posting-notifications.md`다.

## 대상 산정 (후보 1)

- 서버는 받을 직무를 고르지 않은(`roles`가 없거나 빈 배열) 구독을 항상 발송 대상에 넣는다.
- 공고 등록 때 `NotificationStore.subscriptionIdsForRoles(roles)`가 공고 직무와 겹치는 선택 구독과 미선택 구독을 함께 돌려준다. Mongo 구현은 `roles` `$in`, `roles` 없음, 빈 배열을 `$or`로 묶는다.
- 발송 시점 재검사 `PushDispatcher.receives`는 미선택 구독을 늘 통과시킨다.
- 직무를 고른 구독은 공고 직무와 겹칠 때만 받고, `roles`가 없는 레거시 공고는 모두가 받는다.
- #394의 전환 설정 `career-form.notification.role-filter.enforced`(환경변수 `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED`), `RoleFilterPolicy`, 기동 로그 `NOTIFICATION_ROLE_FILTER`와 "확장 보급 뒤 켜기" 절차 설명을 #431의 "직무를 고르지 않으면 모든 공고를 받는다" 정책에 맞춰 지웠다. 미선택 구독 제외로 되돌리려면 코드 변경이 필요하다.

## 저장소 검증 (후보 3)

- `MongoNotificationStoreTest`는 환경변수 `NOTIFICATION_TEST_MONGO_URI`(`mongodb://127.0.0.1:<포트>` 형식)가 있을 때만 돈다. CI workflow에는 이 변수가 없어 CI에서는 건너뛴다.
- 테스트마다 무작위 이름의 DB를 만들고 지우므로 로컬 Mongo에 `NOTIFICATION_TEST_MONGO_URI=mongodb://127.0.0.1:27017`로 돌려도 기존 DB를 건드리지 않는다.
- `MongoNotificationStore`의 조회 조건을 바꾸면 이렇게 직접 돌려 확인한다.
