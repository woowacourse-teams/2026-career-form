# 공고 알림 직무 필터: 분류 정본, 공고 직무 필수, 구독별 받을 직무와 대상 발송

> Issue: [CF-394](https://github.com/woowacourse-teams/2026-career-form/issues/394)
> Collected: 2026-11-04
> Approval-Digest: 86a77363cc4d6108f80d087edea3caf55ae7260cc2c2cb98ebb251ec1ce0b667
> Source-Revision: 667fc9d4

공고 알림을 사용자가 고른 직무로 좁히는 서버 쪽 결정이다. 2026-11-02 검토에서 정한 범위를 #386에서 서버 #394와 확장 #395로 나눴고, 이 문서는 #394 구현(브랜치 CF-394)에서 확정한 계약을 적는다. 2026-11-04 같은 날 대기업 공채가 전 직무를 한 번에 고를 수 있도록 공고 직무 상한을 Issue의 10개에서 분류 전체로 넓혀 다시 승인했다(아래 '공고의 직무'와 '직무 분류 정본'). 전달 경로와 발송 보장은 CF-348 ADR을 그대로 따르며 여기서는 거르기 규칙만 더한다. 설정 키, API 응답 모양, 상태 전이 표의 정본은 `backend/docs/job-posting-notifications.md`다.

## 직무 분류 정본

직무 분류 정본(CF-394): backend/src/main/resources/notification/job-categories-v1.json에 version과 대분류(code, label)·소분류(code, label)를 둔다. 코드는 [A-Z][A-Z0-9_]{0,31}이고 소분류는 <대분류>.<소분류>(예: IT.BACKEND), 라벨은 한글 1~40자다. 기동 시 JobCategories.load()가 형식·유일성·라벨·소분류 총수(JobCategories.MAX_ROLES=30 이하, 공고 직무 상한과 payload 상한에 묶임)를 검증해 실패하면 기동을 막는다. 코드는 추가만 하고 삭제·변경하지 않으며 변경은 파일 버전 올리기와 배포로 한다. GET /api/v1/notifications/job-categories가 version과 categories[].roles[]를 돌려주고 알림 토글이 꺼지면 404다. 2026-11-04 목록(대분류 7·소분류 23)은 Issue #394 예시를 그대로 옮긴 가안이라 사람 확정이 남아 있다.

## 공고의 직무

공고 직무 필터 계약(CF-394): 공고는 분류 소분류 코드 roles가 1개 이상 필수이고 상한은 분류 전체다(null 제거·strip·순서 유지 중복 제거, 분류에 없는 코드는 400 INVALID_POSTING/ROLE). Issue 본문의 10개 상한은 대기업 공채가 전 직무를 한 번에 고를 수 있도록 구현에서 분류 전체로 넓혔고, 대신 분류 파일의 소분류 총수를 JobCategories.MAX_ROLES=30으로 막는다(65자 코드 30개를 실은 payload가 평문 3,900바이트 안에 드는 것을 테스트로 보장). role 라벨은 서버가 소분류 라벨을 가운뎃점(·)으로 이어 만들며 120자를 넘으면 앞 라벨 몇 개와 " 외 n개"로 줄이고, 분류 전체를 고른 공고는 길이와 무관하게 "전체 직무"다. 관리 화면은 "이 대분류 전체 선택"·"전체 직무 선택"·"모두 해제" 버튼을 둔다. roles 없는 레거시 공고는 재분류하지 않고 목록·payload·관리 행에서 roles만 생략하며 기존 자유 글자 role은 그대로 유지한다.

## 구독의 받을 직무

구독 받을 직무 규칙(CF-394): push_subscriptions.roles는 소분류 코드 배열이고 없으면 미선택이다. 구독 등록 요청의 roles는 값이 있으면 덮어쓰고(rolesUpdatedAt 갱신), 빈 배열은 미선택으로 저장하며, 필드가 없으면 기존 선택을 유지한다. 분류에 없는 코드는 400 INVALID_SUBSCRIPTION/ROLES이고 검증 순서는 ENDPOINT → KEYS → ROLES다. 별도 필터 저장 API는 두지 않으며(확장이 시작·켜기마다 재등록) 재등록은 p256dh·auth 키를 바꾸지 않는다.

## 대상 산정과 전환 설정

직무 필터 대상 산정과 전환 설정(CF-394): 공고 등록 시 전체 구독 대신 NotificationStore.subscriptionIdsForRoles(roles, includeUnselected)로 roles가 겹치는 구독에만 대기 발송을 만든다(Mongo는 roles $in에 $or로 roles 없음·빈 배열을 더하고 push_subscriptions.roles 멀티키 인덱스를 둔다). 전환 설정 career-form.notification.role-filter.enforced(환경변수 CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED, 기본 false)가 꺼져 있으면 미선택 구독도 받고 켜면 제외한다. 기동 로그 NOTIFICATION_ROLE_FILTER enforced=…로 모드를 남기고, 배포 순서는 백엔드(꺼짐) → 확장 게시 → 보급 확인(요약 roleSelectedSubscriptions) → 켜기이며 compose·GitHub Environment 전달은 Infra 후속이다.

## 발송기 재검사와 관측

발송기 직무 재검사(CF-394): 발송기는 선점 뒤 구독을 읽을 때 구독의 현재 roles가 공고 roles와 겹치지 않으면 FCM 호출 없이 ABANDONED(FILTER_MISMATCH)로 끝낸다. roles 없는 레거시 공고와 전환 설정이 꺼진 상태의 미선택 구독은 재검사하지 않는다. 포기 이유 목록과 메트릭 career.form.push.delivery의 reason 라벨에 FILTER_MISMATCH가 있고, 로그 POSTING_REGISTERED는 공고 ID·직무 코드 건수·대기 발송 건수만 남기며 endpoint·키·링크·사용자의 직무 선택은 로그와 메트릭 라벨에 넣지 않는다.

## 검증 환경

검증 환경 메모(CF-394): MongoNotificationStoreTest는 NOTIFICATION_TEST_MONGO_URI가 없으면 12건이 skip되므로 docker run -d --rm --name cf394-mongo -p 127.0.0.1:27094:27017 mongo:8.0-noble 뒤 URI를 주고 돌려야 실제 실행된다(하네스 tool guard가 docker rm을 막으므로 --rm과 docker stop으로 정리). backend clean check의 skipped 16 가운데 12가 이 테스트이고 4는 알림 패키지 밖 기존 skip이다.

## 범위 밖과 후속

확장 쪽 선택기·새 공고 탭 거르기·미선택 안내는 #395가 맡는다. 관심 기업 필터, 필터 변경 뒤 기존 공고의 발송 보충, 분류 관리 화면, compose·GitHub Environment의 전환 변수 전달은 별도 후속이다. 기존 공고의 재분류와 데이터 마이그레이션은 하지 않는다.
