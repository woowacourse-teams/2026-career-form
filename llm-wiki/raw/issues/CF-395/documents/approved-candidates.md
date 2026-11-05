# CF-395 approved candidates (2026-11-04, [FE] 공고 알림 받을 직무 선택기와 직무별 새 공고·알림 거르기 추가)

1. 확장 직무 필터(CF-395): 선택값은 chrome.storage.local careerForm.push.roles(소분류 코드 배열)에 두고 구독 등록 요청 roles로 매번 실어 보낸다(빈 배열=미선택). 꺼짐 상태 변경은 로컬에만 두었다가 켤 때 재등록으로 반영되고, 끄기는 구독 문서만 지우므로 선택값이 남는다. 받을 직무 저장은 구독 재등록 결과를 기다리지 않아 등록 실패 중에도 선택값이 바로 저장된다.
2. 직무 분류 캐시: GET /api/v1/notifications/job-categories 응답을 careerForm.push.jobCategories(version·categories·fetchedAt)에 캐시하고, 조회 실패 시 캐시+오류 코드를 함께 돌려줘 선택기가 저장된 분류로 계속 동작한다. 분류에 없는 코드는 서버 응답(오류 없음)일 때만 선택값에서 버린다. 선택기는 대분류 tablist(방향키)와 소분류 체크박스에 대분류 전체 선택 체크박스를 두고 토글 즉시 저장한다.
3. 거르기 규칙: 공고·payload의 roles가 없으면 레거시로 전원에게 보이고, roles가 있으면 선택값과 겹칠 때만 새 공고 탭과 알림에 보인다(미선택은 전부 거름, 알림·배지·계측 없이 filtered). 미선택 안내는 분류를 받았거나 직무 있는 공고가 걸러졌을 때만 보여 구 백엔드 조합에서 기존 동작을 유지한다.
4. 계측: push_roles_saved 이벤트에 role_count(0 이상 정수)만 싣고 직무 코드는 events.ts 허용 속성에서 제외한다.
5. 사이드 패널 마감 공고 탭 안내: 저장 공고가 없으면 푸시 상태별(꺼짐·등록 실패·미선택·정상) 빈 상태 안내와 한 개의 행동 버튼을, 저장 공고가 있으면 한 줄 알림 바를 보인다. 이를 위해 백그라운드 구독 메시지 허용 목록에 panel 발신자(sidepanel.html과 콘텐츠 스크립트)를 더하되 status·enable·categories만 허용한다(#369의 차단 결정을 좁게 완화). 패널에서 알림 설정 대화상자를 바로 여는 경로는 options.html#postings/settings 해시다.
6. 알림 설정 안내 목록: 데이터 사실(마감 알림·서버 전송·저장 위치·확장 삭제 시·구독 끄기) 5줄만 바로 보이고, 문제 해결 4줄은 details '알림이 안 보일 때' 안에 접는다. 온보딩 시작 화면 목록은 그대로다.
7. 검증 환경: frontend format:check는 develop에서도 fixtures·autofill 151개 파일이 실패하는 기존 상태라 변경 파일 단위로 prettier --check를 본다. 로컬 Chromium(playwright --load-extension)에 빌드 확장을 올리고 서비스워커에서 chrome.storage.local을 시드하면 옵션 페이지와 사이드 패널을 종단에 가깝게 확인할 수 있고, VITE_API_BASE_URL을 로컬 백엔드로 둔 빌드면 분류·공고 조회와 구독 등록(헤드리스 Chromium도 FCM 구독이 만들어져 서버에 등록됨)까지 실제 서버와 맞춰 볼 수 있다. 헤드리스가 만든 구독은 로컬 DB에 남으므로 확인 뒤 지운다.

승인: 2026-11-04 사람이 worktree 체크포인트의 후보 digest 06bed9b73b031ba11fd558442feb39e15b45b702740a2cf873c46a68bc574dbd로 승인했다("승인"). 그 전 후보 5개 묶음(digest 981c6ed7…)은 사이드 패널 안내와 안내 목록 접기를 이 Issue에 합치기 전의 것이라 승인받지 않고 7개로 교체했다.
