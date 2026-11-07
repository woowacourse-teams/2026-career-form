# CF-432 승인 후보 스냅샷

> Issue: [CF-432](https://github.com/woowacourse-teams/2026-career-form/issues/432)
> Collected: 2026-11-07
> Approval-Digest: 7fa81d649c3847946c61720c258533e9dd42172144711304010e08025c5d43df

worktree 체크포인트에 기록한 후보 세 개의 원문이다. 사람이 2026-11-07 "승인"으로 확정했다.

1. 공고 알림 미선택 구독 상시 발송(CF-432): 서버는 받을 직무를 고르지 않은(roles가 없거나 빈 배열) 구독을 항상 발송 대상에 넣는다. 공고 등록 때 NotificationStore.subscriptionIdsForRoles(roles)가 공고 직무와 겹치는 선택 구독과 미선택 구독을 함께 돌려주고(Mongo는 roles $in, roles 없음, 빈 배열의 $or), 발송 시점 재검사 PushDispatcher.receives는 미선택 구독을 늘 통과시킨다. 직무를 고른 구독은 공고 직무와 겹칠 때만 받고 roles가 없는 레거시 공고는 모두가 받는다. #394의 전환 설정 career-form.notification.role-filter.enforced(환경변수 CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED), RoleFilterPolicy, 기동 로그 NOTIFICATION_ROLE_FILTER와 '확장 보급 뒤 켜기' 절차 설명을 #431의 '직무를 고르지 않으면 모든 공고를 받는다' 정책에 맞춰 지웠으므로, 미선택 구독 제외로 되돌리려면 코드 변경이 필요하다.
2. 직무 필터 전환 변수의 배포 경로 잔존(CF-432): infra/compose.deploy.yaml, 배포 workflow 3개, infra/tests/test_notification_deployment.py, infra/WEB_PUSH_VAPID.md는 아직 CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED를 전달하거나 켜는 절차를 설명하지만 서버가 읽지 않아 동작에 영향이 없다. 정리는 별도 Infra 후보이고 GitHub Environment 변수 삭제 여부는 사람이 정한다. 2026-11-07 확인 때 staging·production Environment에는 이 변수가 없었다.
3. 알림 저장소 Mongo 계약 검증(CF-432): MongoNotificationStoreTest는 환경변수 NOTIFICATION_TEST_MONGO_URI(mongodb://127.0.0.1:<포트> 형식)가 있을 때만 돌고 CI workflow에는 이 변수가 없어 CI에서는 건너뛴다. 테스트마다 무작위 이름의 DB를 만들고 지우므로 로컬 Mongo에 NOTIFICATION_TEST_MONGO_URI=mongodb://127.0.0.1:27017로 돌려도 기존 DB를 건드리지 않는다. MongoNotificationStore의 조회 조건을 바꾸면 이렇게 직접 돌려 확인한다.
