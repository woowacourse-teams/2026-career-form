# Career Form 프론트엔드

처음 설치하면 확장 내부 `onboarding.html` 안내가 새 탭에서 열립니다. 업데이트 시에는 열리지 않습니다. 설치 후에는 프로필 등록과 지원서에서 사용의 두 단계로 안내합니다. 첫 화면의 ‘프로필 등록하기’는 프로필 관리를 새 탭으로 열며, 등록 후 온보딩으로 돌아와 ‘지원서에서 사용하기’를 누릅니다. 웹에서 직접 연 사용 안내에는 설치 단계를 유지합니다. 넓은 화면에서는 안내 그림과 설명을 나란히 배치하고 좁은 화면에서는 세로로 표시합니다. 자동 기입 시 현재 입력칸만 강조하고, 결과의 확인 필요 항목에서 같은 페이지의 필드 위치로 이동할 수 있습니다.

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

`build`는 생성된 Manifest가 MV3이고 툴바 action에 중간 popup이 없으며, 새 탭 options, side panel, HTTP(S) 페이지의 자동 기입 content script와 필요한 로컬 저장 권한을 가리키는지 검사합니다. `zip`도 같은 화면·content script와 Manifest 계약을 확인합니다.

## Chrome 로컬 로드

1. `npm run build`를 실행합니다.
2. Chrome의 `chrome://extensions`에서 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
4. `frontend/.output/chrome-mv3`를 선택합니다.
5. HTTP(S) 테스트 페이지에서 확장 프로그램 아이콘을 눌러 페이지 안 지원서 패널이 바로 열리는지 확인합니다. Chrome 설정이나 확장 내부 페이지처럼 실행할 수 없는 화면에서는 프로필 관리가 열립니다. 설치 후 온보딩의 프로필 등록 단계에서도 ‘프로필 등록하기’로 바로 열 수 있습니다.
6. 비식별 예시만 입력해 A/B 레이아웃 전환, 자동 저장과 새로고침 복원을 확인합니다.
7. HTTP(S) 비식별 테스트 페이지를 열고 사이드 패널에서 검색, 일반 값 복사와 민감 값 개별 펼침을 확인합니다.
8. HTTP(S) 비식별 테스트 페이지에서 지원서 패널 상단의 `자동 기입`을 선택하고, 같은 패널 안에서 분석, 필요한 승인, 최근 입력 결과와 완료 화면을 확인합니다. 확인 필요는 저장된 값이 있지만 입력하지 못했거나 조건부 입력을 확인해야 하는 항목입니다. 프로필 값 없음, 연결 없음, 숨겨진 필드, 이미 같은 값인 항목은 확인 필요로 세지 않고 제외 상세에 남깁니다.

자동 기입 content script는 사이드 패널의 명시적인 메시지를 받은 뒤에만 동작합니다. 분석에는 비식별 화면 구조만 전송하며, 프로필 값과 현재 입력값은 브라우저에만 남습니다. 최종 승인 전에는 지원서 값을 변경하지 않고, 저장·이동·미리보기·제출은 실행하지 않습니다.

## 분석 서버 설정

`VITE_API_BASE_URL`을 지정하지 않은 기본 빌드는 분석 요청을 보내지 않고 안전하게 `NOT_CONFIGURED` 상태를 표시합니다. 현재는 서버 origin이 확정되지 않았으므로 `host_permissions`를 추가하지 않습니다.

서버가 준비된 뒤에는 빌드 시 정확한 HTTP(S) origin만 지정합니다. 예를 들어 `VITE_API_BASE_URL=https://api.example.test npm run build`는 manifest에 `https://api.example.test/*`만 추가합니다. `http://*/*`, `https://*/*`, `<all_urls>` 같은 넓은 host permission은 사용하지 않습니다. base URL에는 path·query·fragment 대신 origin만 넣습니다.

프로필은 외부 서버로 전송하지 않고 `chrome.storage.local`에 저장합니다. 별도 암호화와 잠금은 없으므로 같은 Chrome 프로필이나 기기에 접근할 수 있는 사람에게 값이 보일 수 있습니다.

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

개발 서버와 빌드 미리보기는 `http://127.0.0.1:4175`에서 실행됩니다. 두 서버를 동시에 실행하지 않습니다. `/`는 서비스 소개, `/onboarding/`은 설치·프로필 등록·첫 실행 안내, `/privacy/`와 `/terms/`는 검토용 정책 초안입니다. 온보딩은 실제 설치 여부를 판별하거나 프로필을 저장하지 않습니다.

`build:site`는 다섯 HTML 진입점, 로컬 자산 참조와 개인 파일 경로의 미포함을 검사합니다. 웹 산출물은 `dist-site/`이며 확장 프로그램의 `.output/` 및 ZIP과 분리됩니다. 각 경로의 `index.html`을 제공하는 정적 서버에서 확인할 수 있습니다. 배포와 정책 시행은 이 작업에 포함하지 않습니다.

`site/demo/`는 실제 사이드패널과 자동 기입 결과 UI를 재사용합니다. 고정된 가상 프로필과 로컬 분석 응답을 주입하며, `wxt/browser`는 웹 빌드에서 접근 시 오류를 내는 경계로 대체합니다. 외부 분석 요청이나 실제 확장 데이터 접근은 없습니다. `/demo/`는 웹 내부 안내용 화면입니다. 랜딩의 시뮬레이션은 커서를 올리거나 키보드로 포커스하거나 터치하면 한 번 재생됩니다. 데모는 포커스를 옮기거나 입력 위치를 따라 스크롤하지 않으며 실제 확장의 입력 위치 따라가기는 유지합니다. 동작 줄이기 설정에서는 커서 이동을 생략합니다.

웹 회귀 테스트는 `npm test -- site`로 실행합니다. 웹 변경 시 `typecheck`, `lint`, `format:check`, `test`, `build:site`와 기존 확장 프로그램의 `build`, `zip`을 함께 확인합니다.
