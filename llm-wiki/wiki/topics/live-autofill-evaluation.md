# 실사이트 자동 입력 평가 워크플로우

> Topic: live-autofill-evaluation
> Status: Current
> Current: [CF-346 정확 일치 없음 전수 조사와 로컬 스택 정책 검증](../../raw/issues/CF-346/documents/live-harness-no-exact-match-survey-and-local-policy-stack.md)
> History: [CF-124 최초 공용 실행 계약](../../raw/issues/CF-124/documents/adr/124-ai-operated-live-autofill-evaluation.md); [CF-124 사전 판정 분모와 평가 보고서](../../raw/issues/CF-124/documents/reports/2026-09-28-live-autofill-evaluation.md); [CF-173 평가 계약 1.1](../../raw/issues/CF-173/documents/evaluation-contract-1.1.md); [CF-310 원복·대화상자 근거](../../raw/issues/CF-310/documents/live-browser-pitfalls.md); [CF-310 원복 재키·표시 규칙 근거](../../raw/issues/CF-310/documents/live-harness-residue-and-display.md); [CF-310 재설치·응답 없는 탭 근거](../../raw/issues/CF-310/documents/live-harness-reinstall-and-hung-tab.md); [CF-314 실사이트 기입 정확도 재평가와 측정 절차](../../raw/issues/CF-314/documents/live-autofill-recheck-2026-10-22.md); [CF-333 테스트 계정 모드·설치본 잠금·채점 재사용 근거](../../raw/issues/CF-333/documents/live-harness-test-account-mode.md); [CF-336 합성 프로필 학교 검색 한계와 reset의 버튼형 위젯 잔여](../../raw/issues/CF-336/documents/live-harness-synthetic-identity-and-reset-widgets.md); [CF-334 반복 관찰 루프와 서비스 워커 API 관찰](../../raw/issues/CF-334/documents/live-harness-service-worker-observation-and-repeat-loop.md); [CF-346 정확 일치 없음 전수 조사와 로컬 스택 정책 검증](../../raw/issues/CF-346/documents/live-harness-no-exact-match-survey-and-local-policy-stack.md)
> Updated: 2026-10-25

## 현재 상태

사용자가 외부 Chrome에 평가 탭을 열고 `평가 시작해줘`라고 요청하면 저장소 소유 스킬이 환경과 프로필을 점검하고 평가 에이전트 사전 판정, 비민감 입력, 실제 DOM 재검증과 비식별 보고를 수행한다. 평가 에이전트는 스킬을 실행하는 에이전트이며 제품이 API로 호출하는 AI가 아니다.

평가 에이전트는 확장 프로그램 UI를 열기 전에 페이지 전체 필드를 다섯 분류로 판정하고 `AUTOFILLABLE` 수를 고정한다. 매핑 정확도는 확장 프로그램 제안 수, 매핑 재현율과 정답 입력률은 `AUTOFILLABLE` 수를 분모로 계산한다. 대화 출력만으로 끝내지 않고 승인된 raw 보고서와 topic Wiki가 기록돼야 평가를 완료한다.

비민감 기존 값은 회원가입 기본값과 사용자 입력을 구분하지 않고 현재 평가 실행에서 덮어쓴다. 민감값과 입력 불가 항목은 `DEFERRED`로 남기며 저장, 이동, 미리보기와 제출은 실행하지 않는다.

Console의 `[CareerForm]` 로그는 수집, 분석, 리뷰, 기입과 검색 실패의 현장 진단에 사용한다. 값, 요청과 응답 원문, 스크린샷을 보관하지 않고 최종 결과는 실제 DOM으로 판정한다.

계약 `1.1`의 실사이트 보고서는 익명 후보 관측과 개수 요약을 함께 받으며 재계산한 개수가 다르면 거부한다. CLI와 동일한 FAILED/DEFERRED 원인 집계, 익명 근거 및 미발견 AUTOFILLABLE 개수를 출력한다.

계약 `1.1`의 측정 절차는 [CF-314 재평가](../../raw/issues/CF-314/documents/live-autofill-recheck-2026-10-22.md)에서 세 가지로 보정한다. 기입 직후 세는 값은 상한이며 40분 keepalive 재로드가 값을 지우므로, +0.5초와 재렌더 이후 두 번 가시 칸만 센다. 매핑 정확도와 최종 정답 입력률은 단계가 다른 지표로 분리한다. 같은 행의 숨은 중복 칸은 가시 필드 판정과 실제 기입 대상을 가르므로 성공은 가시 칸으로만 판정한다. 2026-10-22 `naver-careers`와 `woowahan-recruitment` 재측정에서 매핑 정확도 35/35, 매핑 재현율 35/57, 재렌더 후 가시 칸 유지 6/48과 0/16을 확인했고, 원인별 후속으로 #318, #319, #320을 승격했다.

평가 전 설치본의 background service worker 컨텍스트에서 `globalThis.__careerFormBuildInfo()`를 조회한다. 이는 지원서 값이나 DOM을 읽지 않는 빌드 메타데이터 조회다. 빌드 시 삽입된 불변 snapshot이므로 unpacked 파일이 재빌드로 덮어써져도 재로드 전에는 기존 설치본 revision을 반환한다. CLEAN·전체 SHA·canonical digest·설치본 확인 방법이 맞을 때만 VERIFIED이며 DIRTY/UNKNOWN 또는 조회 불가는 UNVERIFIED로 남긴다. 상세 판정은 [CF-173 ADR](../../raw/issues/CF-173/documents/adr/173-installed-build-revision-evidence.md)을 따른다.

## 실사이트 브라우저 운영 함정 (2026-10-21)

이 절은 2026-10-21 실사이트 QA에서 확인한 함정이다. 새로고침 원복의 잔존 값은 당시 일회성 스크립트 실행에서 나왔고 대화상자 자동 처리는 Playwright 1.64.0 소스에서 확인했으며, `frontend/scripts/live-qa` 실사이트 QA 하네스(CF-177 live-eval 도구에서 일부를 옮김)가 둘을 막는다. 원복은 하네스가 실행 뒤 합성 값을 버리려고 같은 지원서를 저장 없이 다시 여는 동작이며 평가 계약 1.1을 바꾸지 않는다.

- **새로고침 원복 금지:** Chrome은 새로고침 때 입력값을 복원한다. 2026-10-21 Greeting 지원서 두 곳에서 `reload` 뒤 합성 값이 남았다. 원복은 일반 페이지에서 `#`을 뗀 주소로 새로 이동하고 marker로 새 문서인지 확인하며(에이치닷은 저장 없이 같은 단계를 다시 연다), 이어서 같은 주소·단계인지, 칸 수가 실행 전의 80% 이상인지, 값이 남은 칸이 실행 전 값과 같은지 검증한다.
- **대화상자 자동 처리:** Playwright(1.64.0)는 context와 page 어디에도 `dialog` listener가 없으면 `beforeunload`는 수락하고 나머지는 닫는다(확인창은 취소로 답한다). CDP로 평가 브라우저에 붙으면 사람이 그 브라우저에서 쓰는 탭까지 적용되므로, 하네스의 모든 명령은 붙을 때 context 전체에 listener를 먼저 걸어, 사람이 쓰는 탭에서는 로그인 연장 확인창만 수락하고 나머지는 사람에게 남긴다. 하네스가 구동하는 탭은 따로 맡아 사이트 대화상자를 취소하고, 페이지 이탈 확인은 원복하는 동안에만 수락한다.
- 근거는 [CF-310 원복·대화상자](../../raw/issues/CF-310/documents/live-browser-pitfalls.md)를 따른다.

## 원복 재키 대조와 표시 규칙의 한계 (2026-10-22)

- **원복 재키 대조:** SK는 숨은 행 템플릿 입력의 `name`에 붙는 GUID 접미사를 페이지를 열 때마다 새로 만든다. 이름으로만 대조하면 값이 같아도 원복 검증이 실패하므로(2026-10-22 R262303 첫 실행 46칸), 하네스는 같은 이름끼리 비교한 뒤 실행 전에 없던 이름의 칸을 실행 전 값 지문 풀과 대조해 `rekeyed`로 센다.
- **표시 규칙의 한계:** 실행 후 값의 지문이 페이지 전체의 실행 전 지문 중 하나와 같으면 같은 칸이 아니어도 실행 전 값으로 보고 표시하지 않으며, 판정은 `UNVERIFIABLE`이 된다. 숫자 표기 차이(`3.650`/`3.65`)도 같은 값으로 보지 않는다. 2026-10-22 한국타이어 2단계에서 실행 중 생긴 값 12칸이 이렇게 가려졌다. 정답을 부풀리지 않는 방향의 한계이며, 같은 칸끼리 대조와 숫자 정규화가 개선 후보다.
- 근거는 [CF-310 원복 재키·표시 규칙 근거](../../raw/issues/CF-310/documents/live-harness-residue-and-display.md)를 따른다.

## 확장 재설치 뒤 탭 재진입과 응답 없는 탭 (2026-10-22)

- **재설치 뒤 재진입:** `start`로 확장을 바꾸면 열려 있던 탭에는 새 콘텐츠 스크립트가 붙지 않아 실행이 `panel-trigger-missing`으로 실패한다. 같은 주소로 다시 이동(`goto`, 에이치닷은 `step`)한 뒤 실행한다.
- **응답 없는 탭:** 렌더러가 멈춘 탭 하나가 Playwright의 CDP 접속 전체를 30초 시간 초과로 막고 `step`·`stepinfo`도 `TimeoutError`로 끝난다. `/json/list`의 페이지 target마다 WebSocket으로 `Runtime.evaluate`를 보내 응답 시간으로 멈춘 탭을 찾고, 브라우저 세션의 `Target.createTarget`으로 같은 주소의 새 탭을 만든 뒤 `Target.closeTarget`으로 멈춘 탭만 닫는다. 브라우저는 재시작하지 않는다.
- 근거는 [CF-310 재설치·응답 없는 탭 근거](../../raw/issues/CF-310/documents/live-harness-reinstall-and-hung-tab.md)를 따른다.

## 테스트 계정 모드, 설치본 잠금, 채점 재사용 (2026-10-24)

CF-333(#333)은 `frontend/scripts/live-qa` 하네스에 테스트 계정 모드를 넣었다. 평가 계약 1.1의 분모·판정 규칙은 그대로다.

- **테스트 계정 모드:** 하네스는 확장을 시험하는 도구이지 지원서를 쓰는 도구가 아니다. 사람이 상태 디렉터리의 allowlist 파일에 적은 호스트의 탭에서만 실행 전·후 값을 기록하고(계정 신원 칸만 가림), `reset`이 화면을 비운 뒤 사이트 자체의 임시저장으로 빈 양식을 저장해 서버 저장값을 지운다. 섹션 캡처와 차단된 임시저장 본문도 이 탭에서만 남긴다. 제출·동의·본인 인증·파일은 테스트 계정에서도 막는다. 2026-10-23 실험(5페이지)에서 확인 불가 68칸 → 12칸, 정답 229/274(83.6%) → 285/330(86.4%), 오입력 0이었고, 남은 12칸은 사이트 기본값 7칸과 어학·자격 코드 칸 5칸이라 CF-333은 사이트 기본값(`siteDefault`)을 저장값과 구분하고 코드 칸의 숨은 이름 칸을 함께 수집한다.
- **측정 범위와 품질 지표:** 측정 전에 `scope`로 플랫폼별 몇 곳을 돌릴지 사람이 정하고, 보고서는 "확인 불가 비율"을 측정 품질 지표로 첫 줄에 적는다. 캡처 판정(캡처와 기대값만 보고 DOM 판정은 보지 않음)과 DOM 판정의 일치율을 코드로 대조한다.
- **설치본 잠금:** 평가 브라우저와 설치본은 같은 기기의 모든 세션이 공유한다. 2026-10-22에는 측정 직후 다른 세션이 다른 빌드를 설치했고, 유효성은 `run.json`의 `build.revision`으로 검증했다. `start`는 설치한 세션의 프로세스 계보(pid·부모·조부모)를 `extension.lock.json`에 적고, 다른 세션의 잠금이 살아 있으면 `install-locked`로 재설치를 거부한다(`--force`만 예외). revision이 같아도 manifest의 API 호스트가 다르면 재설치한다. 멈춘 탭은 `health`·`replace`로 Playwright 없이 처리한다.
- **채점 재사용과 합계 재계산:** 2026-10-22 측정에서 사전 채점 93개 에이전트(약 710만 토큰)와 판정 57개(약 590만 토큰)가 회차마다 반복됐고 채점자가 바뀌면 분모도 바뀌었다. 값 없는 구조의 해시가 같으면 이전 `final.json`을 재사용한다. 판정 2건의 합계가 자기 항목과 어긋났으므로 보고서는 판정 파일의 숫자 필드를 믿지 않고 항목과 joined 행에서 다시 세며, 다르면 `verdict-mismatch`로 표시한다.
- **새 정책 검증 환경:** 기동 seeder는 기존 DB의 활성 버전을 바꾸지 않으므로 새 정책 버전은 새 볼륨 로컬 스택에서 검증하거나 dev DB의 활성 버전을 사람이 바꾼 뒤 확인한다. 배포 관점은 [배포 Runbook](deployment-runbook.md)을 따른다.
- 근거는 [CF-333 테스트 계정 모드·설치본 잠금·채점 재사용](../../raw/issues/CF-333/documents/live-harness-test-account-mode.md)을 따른다.

## 합성 프로필의 학교 검색 한계와 reset의 버튼형 위젯 잔여 (2026-10-25)

- 합성 프로필의 학교 항목에는 검증된 카탈로그 신원이 없어 확장의 검색이 이름만 비교한다. 동명 학교가 여러 지역에 있으면(현대 '대진고' 서울·대구·강원) "일치하는 검색 결과가 여러 개"로 남는다. 판정에서는 이 칸을 오입력이 아니라 합성 프로필의 한계로 다루고, 동명이 없는 학교는 영향이 없다.
- 테스트 계정 `reset`은 텍스트 칸을 지우고 빈 양식을 임시저장하지만 버튼형 위젯(학력선택·졸업여부·주야간·고용형태)과 그 hidden 값은 비우지 못한다(`saved`·`reset`의 `widgetsLeft`). 그 잔여가 있으면 현대 학력 준비가 "학력 종류와 입력 행을 안전하게 준비하지 못했습니다"로 멈추고 기입 0이 된다. 재측정 전에 사람이 사이트에서 해당 행을 지운다. 확장이 추가한 행과 선택은 `discard` 뒤에도 남는다.
- 실행 중 DOM 상태를 0.2초 간격으로 읽는 읽기 전용 관찰(CDP, 클릭·입력 없음)은 `run`과 같은 세션에서 돌릴 수 있고, 하네스 기록만으로 좁히지 못한 "확정 뒤 소실" 시점을 잡았다. 근거는 [CF-336 근거](../../raw/issues/CF-336/documents/live-harness-synthetic-identity-and-reset-widgets.md)를 따른다.

## 간헐 결함의 반복 관찰 루프와 서비스 워커 API 관찰 (2026-10-25)

- **서비스 워커 API 관찰:** 확장의 `preparation/analyze`·`fields/analyze` 호출은 background service worker에서 나가므로 탭 단위 Playwright 리스너에는 잡히지 않는다. `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`로 붙고 context 단위 `request`/`response` 리스너를 걸어야 요청·응답 본문이 보인다. 회차별 수집 후보는 디버그 빌드의 `console.log("request", …)` 객체를 `jsonValue`로 받아 회차 간 diff로 대조하고, 숨김의 정체는 감지 순간에 `aria-hidden` 조상·`[data-scope][data-state="open"]`·포커스 요소를 읽기 전용으로 덤프해 확정한다. 관찰 기록은 회차마다 즉시 쓴다.
- **반복 관찰 루프:** 재현율이 낮은 간헐 결함(컬리 1/15 안팎)은 같은 탭에서 `run`을 자동 반복하며 회차마다 `run.json`의 마지막 분석 요약과 패널 수를 읽고 첫 재현에서 멈추는 루프로 잡는다. Greeting은 사이트 서버 임시저장이 없어 `reset` 없이 연속 실행이 가능하다. `run.json`의 콘솔 기록은 문자열 요약만 담아 디버그 로그 한 줄(`dismissed leftover popups`, `fields-resettled`)을 값 없이 수정 개입의 증거로 쓸 수 있다.
- **컬리 0/81의 정정:** Issue #334 최초 보고(2026-10-22 CF-333 측정)의 "마지막 분석 응답이 `MATCH 0/81`"은 백엔드 응답이 아니라 프론트 재결합 요약이며, 원인은 드라이버가 열어 둔 Ark UI 팝오버의 `aria-hidden`이다. 상세는 [Greeting 공통 어댑터](adapter-greeting.md)를 따른다.
- 근거는 [CF-334 근거](../../raw/issues/CF-334/documents/live-harness-service-worker-observation-and-repeat-loop.md)를 따른다.

## 검색 종류별 정확 일치 없음 전수 조사와 새 정책 버전의 로컬 스택 검증 (2026-10-25)

- **전수 조사 절차:** 정확히 같은 항목이 없는 합성값 프로필을 `start --profile`로 심고, 읽기 전용 관찰기(CDP, 클릭·입력 없음)로 검색 칸의 목록(항목 수, 마지막 항목, `data-value`)을 기록해 종류별 직접 입력 선택지 제공 여부를 표로 확정한 뒤 기본 프로필을 다시 심는다. 한 양식에 없는 종류는 그 칸이 있는 다른 공고에서 같은 절차로 관측한다.
- **새 정책 버전 검증:** 올린 시드는 dev 배포 전에는 dev API에 없으므로 worktree별 compose 프로젝트의 새 볼륨 로컬 스택을 띄워 `GET /api/v1/policy-versions`로 seed·DB 활성 버전을 확인하고, `localhost:8080`을 보는 로컬 API 빌드를 `--reinstall`로 설치해 검증한다. 끝나면 dev API 빌드로 되돌리고 컨테이너만 내린다. 설치본 잠금의 `revision`·`apiHosts`로 설치된 빌드를 확인한다.
- **드라이버 진단:** 로컬 빌드에 `VITE_LOCAL_WORKFLOW_DIAGNOSTICS=1`을 켜면 드라이버 단계 진단이 콘솔로 나오고, 디버그 빌드의 `console.table` 행은 관찰기가 JSON으로 받을 수 있어 `run.json`의 문자열 요약으로 좁히지 못한 원인(반복 기입 등)을 값 없이 재구성한다.
- 근거는 [CF-346 정확 일치 없음 전수 조사와 로컬 스택 정책 검증](../../raw/issues/CF-346/documents/live-harness-no-exact-match-survey-and-local-policy-stack.md)를 따른다.

## 과거 실행 근거

2026-09-28 최초 실행에서는 CF-115 `ground-truth-v1` 분모를 재사용해 `neowiz-lever`와 `lg-ai-research`의 `AUTOFILLABLE` 17개 중 올바른 매핑 7개, DOM 유지 6개를 확인했다. 매핑 정확도는 7/9, 77.8%, 매핑 재현율은 7/17, 41.2%, 정답 입력률은 6/17, 35.3%였다.

같은 날 `neowiz-lever`를 재실행해 확장 프로그램 UI를 열기 전에 평가 에이전트가 전체 30개 필드를 분류하고 `AUTOFILLABLE` 10개를 동결했다. 확장 프로그램은 5개를 제안하고 썼으며 올바른 매핑과 DOM 유지가 4개여서 매핑 정확도 80.0%, 매핑 재현율 40.0%, 정답 입력률 40.0%, 오입력률 20.0%였다. 이 실행으로 새 사전 판정 게이트를 한 사이트에서 E2E 검증했다. `lg-ai-research`는 이전 분모를 재사용한 결과로 남는다. 설치된 제품 revision은 `UNVERIFIED`이므로 저장소 변경에 따른 개선 또는 회귀는 판정하지 않는다.

## 변경 이유

기존 값 보호로 평가를 중단하면 회원가입 기본값이 있는 사이트의 자동 입력 결과를 측정할 수 없다. 값의 출처를 신뢰성 있게 판별할 수도 없으므로, 제출로 이어지지 않는 평가 탭과 현재 실행에 한정해 비민감 기존 값을 덮어쓰는 공통 계약을 선택했다.

확장 프로그램이 발견한 필드만 분모로 사용하면 미발견 필드를 제외해 실제 커버리지를 부풀린다. 제품 실행과 독립적인 사전 판정 분모를 먼저 동결하고 정확도와 재현율을 분리했다.

CF-173은 집계 요약과 후보 관측의 일치 검증, 원인별 집계 및 설치본 revision 근거를 추가했다. 기존 사용자 승인·입력·DOM 검증 경계는 바꾸지 않았으며 새 실사이트 자동 입력 결과를 측정한 작업은 아니다.

기입 시점 값과 사용자가 보는 값을 같은 성공으로 세면 재렌더로 사라진 값을 성공에 포함해 정확도를 과대평가한다. 매핑 정확도 100%와 최종 가시 유지 0/16이 같은 사이트에서 나올 수 있으므로 두 단계를 분리하고, 성공 판정을 재렌더 이후 가시 칸으로 고정했다. 숨은 중복 칸은 그룹 가시성 판정과 실제 기입 대상이 달라질 수 있어 가시 칸 기준 판정을 유지한다.
