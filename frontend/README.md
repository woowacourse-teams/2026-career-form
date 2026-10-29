# Career Form 프론트엔드

처음 설치하면 확장 내부 `onboarding.html` 안내가 새 탭에서 열립니다. 업데이트 시에는 열리지 않습니다. 설치 후에는 공고 저장 또는 자동 기입 준비 중 원하는 시작 방법을 선택합니다. 공고 저장은 사이드패널 열기·공고 정보 입력·지원 완료 순서로 안내하며 첫 단계에서 지원 공고 관리 화면을 새 탭으로 열 수 있습니다. 단계별 이미지는 브라우저 UI를 제외한 실제 패널·등록 폼·공고 카드 캡처입니다. 자동 기입 안내는 배포 사이트와 동일하게 확장 프로그램 설치·프로필 등록·지원서 사용·결과 확인의 4단계로 제공합니다. 프로필은 지원서 패널 상단의 ‘프로필 관리’에서 등록합니다. 웹에서 직접 연 사용 안내에는 설치 단계를 유지합니다. 넓은 화면에서는 안내 그림과 설명을 나란히 배치하고 좁은 화면에서는 세로로 표시합니다. 자동 기입 시 현재 입력칸만 강조하고, 결과의 확인 필요 항목에서 같은 페이지의 필드 위치로 이동할 수 있습니다.

Chrome Manifest V3 기반 Career Form 확장 프로그램의 프론트엔드입니다. Node.js 22 이상과 npm을 사용하며, `frontend/`에서 독립적으로 실행합니다.

## 개발과 검증

```powershell
npm ci
npm run dev
npm run typecheck
npm run lint
npm run format:check
npm test
npm run coverage
npm run build
npm run zip
```

`build`는 생성된 Manifest가 MV3이고 툴바 action에 중간 popup이 없으며, 툴바 action과 같은 패널 열기 단축키(`commands._execute_action`, 제안 키 `Alt+Shift+C`)가 있고, 새 탭 options, side panel, HTTP(S) 페이지의 자동 기입 content script와 필요한 로컬 저장 권한을 가리키는지 검사합니다. `zip`도 같은 화면·content script·단축키와 Manifest 계약을 확인합니다.

## Chrome 로컬 로드

1. `npm run build`를 실행합니다.
2. Chrome의 `chrome://extensions`에서 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
4. `frontend/.output/chrome-mv3`를 선택합니다.
5. HTTP(S) 테스트 페이지에서 확장 프로그램 아이콘을 눌러 페이지 안 지원서 패널이 바로 열리는지 확인합니다. Chrome 설정이나 확장 내부 페이지처럼 실행할 수 없는 화면에서는 프로필 관리가 열립니다. 설치 후 온보딩의 프로필 등록 단계에서도 ‘프로필 등록하기’로 바로 열 수 있습니다. 단축키(`Alt+Shift+C`, mac은 `⌥⇧C`)로도 아이콘 클릭과 같은 패널이 열리고, 패널 상단에 현재 할당된 키가 표시되는지 확인합니다. `chrome://extensions/shortcuts`에서 키를 지우면 패널에 단축키가 없다는 안내와 지정 위치가 나와야 합니다. 다른 확장과 키가 겹치거나 업데이트 설치에서는 키가 배정되지 않을 수 있습니다. Chrome 기본 side panel에는 이 안내를 표시하지 않습니다.
6. 기본 브라우저 자동 기입 테스트에서는 프로필 관리의 `가져오기`로 `frontend/fixtures/profile-export.example.json`을 불러옵니다. 이 파일은 13개 범주 중 11개에 비식별 값이 있고 학력 2건·어학 2건·자격증 3건·경력 1건 등을 포함합니다. 가져오기는 현재 프로필을 덮어쓰므로 별도 테스트용 브라우저 프로필에서 실행합니다. A/B 레이아웃 전환, 자동 저장과 새로고침 복원도 확인합니다. 회사별·상태별 분기를 검증할 때만 해당 전용 fixture로 바꿉니다.
7. HTTP(S) 비식별 테스트 페이지를 열고 사이드 패널에서 검색, 일반 값 복사와 민감 값 개별 펼침을 확인합니다. 주·야간, 학교 소재지, 병역, 보훈, 장애 여부처럼 선택지로 고른 값은 저장 코드(`region:seoul` 등) 대신 선택지 라벨로 보이고 라벨로 복사되는지 확인합니다. 저장값은 바뀌지 않으며 값으로는 검색되지 않습니다. 학력 2건 이상처럼 반복 항목이 여럿이면 프로필 관리 카드와 같은 소제목(예: `고등학교 1`, `대학교 2`)과 학교명 아래로 항목별로 나뉘고, `학교명` 검색 결과와 복사 버튼 이름(`대학교 2 학교명 복사`)에서도 구분되는지 확인합니다.
8. HTTP(S) 비식별 테스트 페이지에서 지원서 패널 상단의 `자동 기입`을 선택하고, 같은 패널 안에서 실제 분석/입력란 준비/주소 확인 상태와 범주별 누적 입력 수를 확인합니다. 입력 완료·확인 필요·건너뛴 항목을 각각 확인하고, 프로필에 값이 있어도 지원서에서 매핑되지 않은 항목은 미지원으로 기록합니다. 예를 들어 Greeting의 `입력 완료 2 / 확인 필요 0`은 이름·연락처 입력 결과이지 전체 프로필 입력 성공이 아닙니다. 입력 속도를 인위적으로 늦추거나 추정 퍼센트를 표시하지 않습니다. 재검증은 같은 필드의 상태를 갱신하며, 완료 요약은 사용자가 닫을 때까지 유지됩니다. 최종 입력 완료와 확인 필요는 중복 집계하지 않습니다. 자동 입력 대상으로 선택된 값이지만 입력하지 못했거나 입력 결과를 검증하지 못했으면 확인 필요로 표시하며 입력 실패도 여기에 포함합니다. 조건부 항목도 안전한 매칭과 반영을 확인하면 완료입니다. 처음부터 같은 값인 항목은 새 입력으로 세지 않습니다. 프로필 값 없음, 연결 없음, 숨겨진 필드, 기존 값 유지 항목은 `건너뛴 항목 보기`의 접힌 상세에 실제 사유와 함께 표시합니다. 자동 기입 완료는 지원서 작성이나 제출 완료를 뜻하지 않습니다.
9. `확인할 항목 보기`는 패널 안의 확인 목록으로 이동하고, 항목별 `필드로 이동`을 눌렀을 때만 해당 지원서 위치를 안내합니다. 확인 항목이 없으면 `입력한 항목 보기`로 완료 상세를 펼칩니다. 자동 입력 중 이미 보이는 필드는 화면을 다시 가운데로 이동시키지 않고 입력칸만 강조합니다.

자동 기입 content script는 사이드 패널의 명시적인 메시지를 받은 뒤에만 동작합니다. 분석에는 비식별 화면 구조만 전송하며, 프로필 값과 현재 입력값은 브라우저에만 남습니다. 최종 승인 전에는 지원서 값을 변경하지 않고, 저장·이동·미리보기·제출은 실행하지 않습니다.

## 범용 검색의 진단과 지원 경계

범용 경로는 회사 이름으로 분기하지 않고 검증된 입력 방식으로 처리합니다. 항목의 의미를 찾았다고 검색창을 안전하게 조작할 수 있는 것은 아닙니다. readonly 검색 실패는 다음 원인을 구분해 안내합니다.

| 진단 코드                   | 의미                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `SEARCH_FORM_UNVERIFIED`    | 검색 전용 폼인지 확인하지 못함                               |
| `SEARCH_NAVIGATION_UNSAFE`  | 허용된 검색 화면 이동인지 확인하지 못함                      |
| `SEARCH_RESULTS_INCOMPLETE` | 전체 결과를 확인하지 못함                                    |
| `SEARCH_ACTIVATION_UNSAFE`  | 결과 선택 동작을 확인하지 못함                               |
| `SEARCH_FOLLOWUP_HALTED`    | 앞선 검색의 미확정 부수효과 때문에 후속 입력을 실행하지 않음 |

후속 보류는 해당 항목 자체의 검색 실패가 아닙니다. 진단 추가는 기존 승인, 기존값 보호, 중단 조건을 바꾸지 않으며 사이트 오류 원문이나 프로필 값을 안내문에 넣지 않습니다.

- 기존에 검증한 검색 표면과 한국/KOR 문맥의 완전한 17개 지역 목록은 각각의 실행 계약을 적용합니다. 합성 양식 결과를 실제 사이트 성공으로 일반화하지 않습니다.
- POST/추가 hidden 제어가 있는 학교 검색 폼, form 내부 inline onclick 결과 선택의 허용 범위는 확대하지 않습니다. CJ 관측 구조는 이 경계를 재현하는 사례이지 회사 전용 분기가 아닙니다.
- native GET 검색의 결과 준비 판정에는 허용된 navigation 완료 경로가 있지만, 그 뒤에도 완료 표식, 결과 개수 또는 전체 위치 정보 중 하나를 요구합니다. 완료 근거가 전혀 없으면 선택하지 않습니다. navigation 완료만으로 이 검사가 우회된다는 초기 의심은 코드와 회귀 확인으로 정정했으며 실행 정책은 바꾸지 않았습니다.
- `value="검색"`만 있는 submit input은 현재 검색 버튼 라벨로 인식되지 않아 `search_submit_not_found`로 먼저 중단할 수 있습니다. 이 사유도 검색창 구조 확인 실패로 안내합니다. input의 지원 확대나 클릭 허용은 추가하지 않습니다.
- 실제 CJ의 최신 입력 동작, 숨은 선택 코드, 서버 저장 상태와 모든 채용 사이트 호환성은 이번 진단 개선으로 검증되지 않습니다. 저장과 제출은 자동화하지 않습니다.

합성 재현 및 독립 소재지 시나리오는 [검색 fixture 안내](fixtures/generic-search/README.md)를 참고합니다. 테스트·브라우저 실행 결과는 해당 작업의 검증 기록으로 별도 확인합니다.

## 분석 서버 설정

`VITE_API_BASE_URL`을 지정하지 않은 기본 빌드는 분석 요청을 보내지 않고 안전하게 `NOT_CONFIGURED` 상태를 표시합니다. 현재는 서버 origin이 확정되지 않았으므로 `host_permissions`를 추가하지 않습니다.

서버가 준비된 뒤에는 빌드 시 정확한 HTTP(S) origin만 지정합니다. 예를 들어 `VITE_API_BASE_URL=https://api.example.test npm run build`는 manifest에 `https://api.example.test/*`만 추가합니다. `http://*/*`, `https://*/*`, `<all_urls>` 같은 넓은 host permission은 사용하지 않습니다. base URL에는 path·query·fragment 대신 origin만 넣습니다.

프로필은 외부 서버로 전송하지 않고 `chrome.storage.local`에 저장합니다. 별도 암호화와 잠금은 없으므로 같은 Chrome 프로필이나 기기에 접근할 수 있는 사람에게 값이 보일 수 있습니다.

## 선택적 이용 계측

`VITE_POSTHOG_KEY`를 지정한 빌드에서만 PostHog 이벤트를 전송합니다. 키가 없거나 공백이면 요청을 보내지 않고 익명 식별자도 만들지 않습니다. `VITE_POSTHOG_HOST` 기본값은 `https://us.i.posthog.com`이며 수집 서버 origin을 지정합니다. 확장과 웹 사이트를 각각 빌드할 때 설정합니다.

```sh
VITE_POSTHOG_KEY=<project-key> VITE_POSTHOG_HOST=https://us.i.posthog.com npm run build
VITE_POSTHOG_KEY=<project-key> VITE_POSTHOG_HOST=https://us.i.posthog.com npm run build:site
```

SDK, 자동 페이지 수집, 세션 녹화, 사용자 프로필 생성은 사용하지 않습니다. 확장은 runtime 메시지를 통해 백그라운드에서 전송하고, 웹 사이트는 직접 전송합니다. 계측용 host permission은 추가하지 않습니다.

전송 항목은 이벤트 이름, `surface`, 무작위 `distinct_id`이며 지원서 안 패널에만 `page_host`(호스트명)를, 공고 알림 이벤트에만 서버 공고 ID `posting_id`, 표시 확인 응답 `answer`(`seen`·`not_seen`), 저장 계기 `trigger`(`button`·`open`), 알림 표시 이벤트에만 표시 지연 `delay_ms`(0 이상 정수)를 추가합니다. 키가 없는 빌드는 전송 대신 허용 속성만 `console.debug`로 기록합니다. 프로필 값, 지원서 입력값, 전체 URL, 쿠키와 Referer는 전송하지 않습니다. 익명 식별자 `analyticsDistinctId`는 확장의 `chrome.storage.local` 또는 웹 사이트의 `localStorage`에 저장합니다. 계측 실패는 사용자 작업을 막지 않습니다.

허용 이벤트의 정본은 `src/analytics/events.ts`입니다.

| 화면                   | 이벤트                                                                                                                                                                                                | 기록 시점                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 패널                   | `autofill_start_clicked`, `autofill_open_succeeded`, `autofill_open_failed`                                                                                                                           | 자동 기입 버튼 클릭과 자동 기입 화면 열기의 성공, 실패                                                                                                                         |
| 패널                   | `profile_copy_clicked`, `profile_management_clicked`                                                                                                                                                  | 복사, 프로필 관리 버튼 클릭                                                                                                                                                    |
| 지원서 안 패널         | `greeting_import_viewed`                                                                                                                                                                              | Greeting 지원서에서 가져오기 버튼으로 검토 화면을 연 시점. 읽기 성공을 뜻하지 않음                                                                                             |
| 지원서 안 패널         | `greeting_import_saved`                                                                                                                                                                               | 가져오기에서 선택한 값의 저장이 성공한 시점                                                                                                                                    |
| 옵션                   | `profile_export_clicked`, `profile_import_clicked`                                                                                                                                                    | JSON 파일 내보내기, 가져오기 버튼 클릭. 가져오기는 파일 선택 버튼을 누른 시점이며 실제 가져오기 성공을 뜻하지 않음                                                             |
| 확장 온보딩            | `onboarding_first_viewed`, `quick_profile_viewed`, `quick_profile_skipped`, `notification_test_sent`, `notification_visibility_answered`, `push_subscription_disabled`                                | 온보딩 최초 진입, 단계형 등록 진입과 값 없이 건너뛰기, 온보딩 카드의 알림 테스트·응답·알림 끄기                                                                                |
| 공통                   | `profile_first_saved`                                                                                                                                                                                 | 단계형 등록, 옵션 화면, Greeting 가져오기에서 비어 있지 않은 프로필을 처음 저장한 시점                                                                                         |
| 웹 사이트, 확장 온보딩 | `landing_viewed`, `onboarding_viewed`, `install_link_clicked`, `trial_viewed`, `trial_started`, `trial_completed`, `onboarding_autofill_selected`, `onboarding_postings_selected`                     | 소개, 온보딩 진입, 설치 링크 클릭, 체험 진입·시작·완료와 온보딩 시작 목적 선택. 확장 온보딩은 같은 화면을 `extension_onboarding`으로 기록                                      |
| 옵션                   | `push_subscription_enabled`, `push_subscription_disabled`, `posting_inbox_viewed`, `posting_inbox_saved`, `notification_test_sent`, `notification_visibility_answered`, `posting_auto_save_cancelled` | 공고 알림 구독 켜기·끄기, 공지함 목록 표시 성공, 공지함에서 마감 알림 저장 성공(`trigger`로 버튼·열기 구분), 알림 테스트 실행, 표시 확인 응답(`answer`), 공지함 자동 저장 취소 |
| OS 알림                | `posting_notification_shown`, `posting_notification_opened`, `posting_notification_saved`, `posting_auto_save_cancelled`                                                                              | 공고 푸시 알림 표시, 알림 클릭으로 공고 열기, 마감 알림 저장(`trigger`로 버튼·열기 자동 저장 구분), 후속 알림의 저장 취소. `surface`는 `notification`                          |

`onboarding_first_viewed`와 `profile_first_saved`는 백그라운드가 익명 식별자별로 한 번만 전송하며 재전송 시 최초 발생 시각을 유지합니다. 복사와 자동 기입 시작도 클릭 수이지 완료 수가 아닙니다.

`site/policies.ts`의 계측 고지는 검토용 초안입니다. 실제 운영 수집 설정, IP 등 접속 정보 처리, 보유 기간과 국외 이전 등은 사람이 검토한 뒤 확정해야 합니다.

## 공고 알림 구독(Web Push)

확장은 설치 하나를 구독 하나로 봅니다. 설치·시작·켜기 시 백엔드에서 VAPID 공개키를 받아 `pushManager.subscribe({ userVisibleOnly: false })`로 조용히 구독한 뒤 endpoint와 암호화 키를 구독 등록 API로 보냅니다. 기본값은 켜짐이며 관리 페이지 "지원 공고" 탭의 구독 설정에서 끌 수 있습니다. 끄면 서버 해지 API를 부른 뒤 브라우저 구독을 해제합니다.

- 조용한 푸시는 Chrome 121부터 가능하므로 manifest `minimum_chrome_version`은 `121`입니다. 더 낮은 Chrome에서는 구독을 시도하지 않고 안내만 보입니다.
- `VITE_API_BASE_URL`이 없는 빌드는 `NOT_CONFIGURED`, 알림 기능이 꺼졌거나 오래된 백엔드의 404는 `ENDPOINT_UNAVAILABLE`로 표시하고 재시도하지 않습니다. 네트워크·서버 오류는 `chrome.alarms`로 1·5·15·60분 간격으로 다시 등록합니다.
- 푸시 payload(공고 ID, 회사, 직무, 링크, 접수 시작, 마감)는 검증한 뒤 OS 알림으로 띄웁니다. 같은 공고 ID와 마감이 지난 공고는 띄우지 않고, 알림 본문이나 "공고 열기" 버튼의 클릭으로만 탭을 엽니다. "마감 알림 저장"은 기존 로컬 공고(`PostingService.save`)에 기본 알림 시점(24시간·2시간 전)으로 저장합니다.
- 공지함은 관리 페이지 "지원 공고" 탭에서 진행 중 공고 목록 API를 호출해 마감순으로 보여 주므로 푸시를 놓친 사용자도 같은 목록을 봅니다.
- 서버에 저장되는 값은 브라우저의 푸시 구독 주소와 암호화 키뿐이며 프로필 값은 보내지 않습니다. 구독 endpoint와 키는 계측·로그에 넣지 않습니다. 개인정보 고지 문구는 사람이 확정합니다.
- API 경로와 요청·응답 스키마의 정본은 `src/job-postings/push-api.ts`입니다. 백엔드 계약이 바뀌면 이 파일만 고칩니다.
- 알림 표시 자가 진단: 설치 온보딩 카드, "지원 공고" 탭의 질문·확인 카드, 구독 설정 패널의 "알림 테스트"로 테스트 알림 하나를 띄우고 "보였어요·안 보였어요" 응답을 로컬(`careerForm.push.visibility`)에 기록합니다. "안 보였어요"이거나 `chrome.notifications.getPermissionLevel()`이 `denied`이면 OS별 설정 경로를 글로 안내하고 "다시 테스트"를 둡니다. 설치·시작 시 자동 알림은 없고, 시스템 설정을 대신 열거나 바꾸지 않습니다. 공고 알림을 클릭하면 자동으로 "보임"으로 기록합니다.
- 미확인 공고 배지: 새 공고 알림마다 확장 아이콘 배지 숫자가 늘고(`chrome.action.setBadgeText`, 숫자만) 공지함을 열면 0이 됩니다. 알림 클릭으로 연 공고는 개별로 지우고 마감이 지난 공고는 정리하며, 서비스워커가 다시 시작되면 저장된 목록(`careerForm.push.unread`)으로 다시 그립니다. 사이드 패널의 "지원 공고 관리" 버튼에 같은 숫자를 표시합니다.
- 공고 열기 시 자동 저장: 설정 "공고를 열면 마감 알림에 자동 저장"(기본 켜짐, 구독 켜짐·꺼짐과 독립)이 켜져 있으면 알림 본문 클릭, 알림의 "공고 열기" 버튼, 공지함의 "공고 열기"에서 CF-161 공고로 저장합니다. 알림에서 열었으면 후속 알림의 "저장 취소", 공지함에서는 카드의 "취소"로 저장 공고와 예약을 함께 지웁니다(`PostingService.remove`). 이미 저장한 공고와 마감 지난 공고는 건너뛰고 알림 표시만으로는 저장하지 않습니다.
- 공지함은 3건까지 펼치고 "n건 더 보기"로 나머지를 열며, 구독 설정 패널은 저장 공고 목록 아래에 있습니다. 알림 아이콘은 `public/notification-icon.png`(128px)입니다.
- 표시 지연 계측: payload의 `sentAt`(선택, 백엔드의 FCM 요청 시각)을 받으면 알림 표시 이벤트 `posting_notification_shown`에 `delay_ms`(표시 시각 − `sentAt`, 음수는 0, 24시간 초과는 86,400,000으로 자름)를 더합니다. `sentAt`이 없거나 형식이 틀리면 속성을 생략할 뿐 공고는 버리지 않습니다. 키 없는 빌드는 전송하지 않고 허용 속성만 `console.debug`로 남깁니다.
- 직무는 선택 항목입니다. 푸시 payload와 진행 중 공고 목록에서 `role`이 없거나 비어 있으면 직무 없는 공고로 받아들이며, 알림 제목은 회사명만 쓰고 공지함·저장 공고 카드는 직무 줄을 숨깁니다. 로컬 공고 저장도 회사명만 필수이고 공고 저장 폼의 직무 칸은 비워 둘 수 있습니다. 직무 없는 공고는 이 버전의 확장에서만 보이므로 스토어 보급 전에는 팀이 직무를 비워 등록하지 않습니다.
- 온보딩 페이지(`onboarding.html`)는 백그라운드에 상태 조회, 끄기, 알림 테스트, 결과 기록만 보낼 수 있습니다. 그 밖의 페이지와 콘텐츠 스크립트의 구독 메시지는 차단합니다.

## Web Store 제출 전 준비

1. `npm run zip`으로 `frontend/.output/*-chrome.zip`을 생성합니다.
2. ZIP 내부에 `manifest.json`, `popup.html`, `options.html`, `sidepanel.html`, `content-scripts/autofill.js`와 CSS가 있는지 확인합니다.
3. 개인정보, 실제 지원서 데이터, 계정 정보 및 비밀값이 포함되지 않았는지 확인합니다.
4. Web Store 등록, 심사 요청과 배포는 사람이 수행합니다.

## 랜딩·온보딩 웹 사이트

Node.js 22 이상에서 위의 `npm ci` 후 실행합니다. 확장 프로그램과 별도의 Vite 진입점을 사용합니다.

```sh
npm run dev:site
# 정적 산출물 확인
npm run build:site
npm run preview:site
```

개발 서버와 빌드 미리보기는 `http://127.0.0.1:4175`에서 실행됩니다. 두 서버를 동시에 실행하지 않습니다. `/`는 서비스 소개, `/onboarding/`은 설치·프로필 등록·첫 실행 안내, `/try/`는 설치 없이 가상 지원서에서 패널의 자동 기입을 직접 눌러보는 체험, `/tech/`는 자동 기입 칸 연결과 공고 알림의 기술 소개, `/privacy/`와 `/terms/`는 검토용 정책 초안입니다. 기술 소개 문구는 `site/tech.tsx`에 있습니다. 체험은 `site/experiment/`의 가상 지원서·예시 프로필·입력 시나리오를 설문 없이 재사용합니다. 히어로의 버튼은 체험 하나이며(설치 버튼은 헤더에 있음), 좁은 화면에서는 체험 대신 설치 버튼과 안내만 보여줍니다. 온보딩은 실제 설치 여부를 판별하거나 프로필을 저장하지 않습니다.

`build:site`는 다섯 HTML 진입점, 로컬 자산 참조와 개인 파일 경로의 미포함을 검사합니다. 웹 산출물은 `dist-site/`이며 확장 프로그램의 `.output/` 및 ZIP과 분리됩니다. 각 경로의 `index.html`을 제공하는 정적 서버에서 확인할 수 있습니다. 배포와 정책 시행은 이 작업에 포함하지 않습니다.

`site/demo/`는 실제 사이드패널과 자동 기입 결과 UI를 재사용합니다. 고정된 가상 프로필과 로컬 분석 응답을 주입하며, `wxt/browser`는 웹 빌드에서 접근 시 오류를 내는 경계로 대체합니다. 외부 분석 요청이나 실제 확장 데이터 접근은 없습니다. `/demo/`는 웹 내부 안내용 화면입니다. 랜딩의 시뮬레이션은 커서를 올리거나 키보드로 포커스하거나 터치하면 한 번 재생됩니다. 데모는 포커스를 옮기거나 입력 위치를 따라 스크롤하지 않으며 실제 확장의 입력 위치 따라가기는 유지합니다. 동작 줄이기 설정에서는 커서 이동을 생략합니다.

웹 회귀 테스트는 `npm test -- site`로 실행합니다. 웹 변경 시 `typecheck`, `lint`, `format:check`, `test`, `build:site`와 기존 확장 프로그램의 `build`, `zip`을 함께 확인합니다.
