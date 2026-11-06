# CF-431 승인 후보 스냅샷

> Issue: [CF-431](https://github.com/woowacourse-teams/2026-career-form/issues/431)
> Collected: 2026-11-06
> Approval-Digest: 85cc2205e1bd8d944112de84ef4e184451b0db59582f1e65b8c9442accc63cb7

worktree 체크포인트에 기록한 후보 세 개의 원문이다. 사람이 2026-11-06 "승인"으로 확정했다.

1. 공고 알림 직무 미선택 정책(CF-431): 받을 직무를 하나도 고르지 않은 구독은 모든 공고를 받는다. 확장의 matchesSelectedRoles가 빈 선택이면 직무가 붙은 공고도 통과시켜 푸시 표시, 배지, 새 공고 탭에 함께 적용된다. #394·#395의 '미선택이면 받지 않는다'를 뒤집은 것이며 알림 설정에는 '선택 없음 · 모든 공고 받는 중'과 '하나도 고르지 않으면 모든 공고를 받아요'를 보이고 새 공고 탭과 사이드 패널의 직무 유도 안내는 없앴다. 서버 전환 설정 CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED를 켜면 이 동작이 다시 막히므로 #432가 설정을 없애기 전에는 켜지 않는다. 이미 배포된 1.5.0은 자동 업데이트 전까지 미선택이면 계속 거른다.
2. 확장 첫 설치 온보딩 여섯 단계(CF-431): onboarding.html 기본 경로는 선택 화면 없이 이름, 이메일, 직무 선택, 알림 안내, Greeting, 사용법 순서의 한 줄 흐름(entrypoints/onboarding/flow)이고 ?page= 경로의 소개·체험·정책 페이지와 웹 /onboarding 4단계 사용 안내는 그대로다. 현재 단계 이름만 careerForm.onboarding.step에 저장해 다시 열면 이어지고 끝내지 않았으면 관리 페이지 머리글에 '시작 안내 이어하기'가 보인다. 온보딩 페이지의 구독 메시지 허용은 status, enable, disable, test, record, categories, roles이고 inbox, later는 차단한다. Greeting 단계는 가져오기를 실행하지 않고 프로필 저장 키의 변경만 감지하며 예시 회사는 표시용 상수다. 단계형 등록(QuickStart)은 사용법 단계의 '추가 정보 더 등록하기'에서 '저장한 정보' 화면으로 열고 넘어가는 버튼은 하나(빈 칸이면 건너뛰기), 날짜는 입력 중 대시를 넣는다. 흐름은 랜딩의 하늘색 값을 Flow.module.css 범위에 literal로 두고 theme.css와 extension-theme.css는 바꾸지 않는다. 계측은 onboarding_step_viewed(step)와 onboarding_completed를 더하고 onboarding_autofill_selected, onboarding_postings_selected, quick_profile_skipped를 뺐다.
3. 온보딩 화면 검증 방법과 함정(CF-431): 빌드한 확장을 Playwright Chromium에 --load-extension으로 새로 설치하면 onInstalled가 onboarding.html을 스스로 열어 여섯 단계를 실제로 조작할 수 있고, 직무 분류는 VITE_API_BASE_URL을 로컬 대역 서버로 두고 빌드해 받는다. 헤드리스에서는 OS 알림 표시를 확인할 수 없다. 이 방식과 설계를 모르는 독립 검토자의 처음 설치한 사용자 역할 점검으로 두 결함을 찾았다. CSS 모듈에서 상태 문구의 수식 클래스가 반복 장면의 클래스 이름과 같으면 장면 애니메이션이 문구까지 숨기고, 범위 루트의 '.flow p { padding: 0 }' 같은 reset은 컴포넌트 클래스보다 특이도가 높아 안쪽 여백을 지운다(reset은 margin만 둔다). 사용자가 헷갈린 낱말은 Greeting(설명 없음), 패널·톱니, 새 탭과 새 공고 탭의 혼용, 명령형 제목이었다.
