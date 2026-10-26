# 선택적 이용 계측

> Topic: usage-analytics
> Status: Current
> Current: [CF-349 공고 알림 구독·표시·공지함 계측](../../raw/issues/CF-349/documents/usage-analytics.md)
> History: [CF-147 선택적 이용 계측과 개인정보 경계](../../raw/issues/CF-147/documents/usage-analytics.md), [CF-193 첫 자동 기입 클릭률 계측](../../raw/issues/CF-193/documents/usage-analytics.md), [CF-271 Greeting 가져오기 진입과 저장 완료 계측](../../raw/issues/CF-271/documents/usage-analytics.md), [CF-349 공고 알림 구독·표시·공지함 계측](../../raw/issues/CF-349/documents/usage-analytics.md)
> Updated: 2026-10-26

## 현재 상태

핵심 지표는 확장 온보딩 최초 진입 후 24시간 이내 익명 사용자별 자동 기입 클릭률이며 7일 클릭률은 보조 지표다. 시작 목적과 클릭·열기 결과를 구분한다. 첫 저장은 단계형 등록, 전체 편집과 Greeting 가져오기의 실제 비어 있지 않은 저장 성공 스냅샷에서 기록한다. 최초 진입·첫 저장은 백그라운드가 로컬 익명 ID별로 중복 방지하며 재전송 시 최초 발생 시각을 보존한다. 프로필 값·지원서 입력값·전체 URL은 계측하지 않는다.

Greeting 가져오기는 검토 화면을 연 시점의 `greeting_import_viewed`와 저장 성공 시점의 `greeting_import_saved`를 기록한다. viewed는 읽기 성공을 뜻하지 않고, 취소, 실패, 충돌과 중복 클릭은 saved로 기록하지 않는다. 가져오기 저장은 `saveIfUnchanged` 비교 저장을 유지하도록 `useProfileSaveTracking`으로 감싸지 않고 `PageImport`가 저장 성공 스냅샷에서 직접 기록한다. reader가 지원서 안 패널에만 주입되어 가져오기 이벤트의 `surface`는 `in_page_panel`만 발생한다.

공고 알림은 옵션 화면의 `push_subscription_enabled`, `push_subscription_disabled`, `posting_inbox_viewed`, `posting_inbox_saved`와 OS 알림(surface `notification`)의 `posting_notification_shown`, `posting_notification_opened`, `posting_notification_saved`를 기록한다. 알림 테스트 실행 `notification_test_sent`, 표시 확인 응답 `notification_visibility_answered`(`answer`), 자동 저장 취소 `posting_auto_save_cancelled`도 기록하고 저장 이벤트에는 계기 `trigger`(`button`·`open`)를 붙인다. 속성은 `surface`, 서버 공고 ID `posting_id`, `answer`, `trigger`뿐이며 회사명·링크·프로필 값은 버린다. 백그라운드가 직접 만드는 알림 이벤트도 같은 핸들러를 거쳐 키 없는 빌드는 전송하지 않는다.

제품 이용 계측은 PostHog 하나만 사용하며 GA 등 다른 분석 도구나 SDK는 사용하지 않는다. PostHog는 명시 이벤트, 화면 구분과 로컬 익명 식별자를 사용한다. 지원서 안 패널에만 호스트명을 포함하고 프로필 값, 지원서 입력값과 전체 URL은 제외한다. 키 없는 빌드는 전송과 식별자 생성을 하지 않는다.

확장은 runtime 메시지 경계를 거쳐 백그라운드에서 허용 속성만 전송한다. SDK와 계측용 host permission은 추가하지 않는다. 개인정보 고지는 초안이며 운영 수집 설정과 접속 정보 처리, 보유 기간, 국외 이전은 사람이 검토한 뒤 확정한다.

## 변경 이유

공고 알림 표시 → 클릭 → 저장 깔때기를 같은 익명 식별자로 측정하면서 회사명·링크가 계측으로 새지 않도록 `posting_id`만 허용했다. Greeting 가져오기 사용자와 미사용자의 클릭률, 가져오기 진입에서 저장 완료까지의 전환을 같은 익명 식별자로 비교하기 위해 가져오기 이벤트를 추가했다. 사용 흐름을 파악하되 프로필 및 지원서 내용이 계측으로 유출되지 않도록 수집 범위를 제한하고 설정되지 않은 빌드는 계측하지 않는다.
