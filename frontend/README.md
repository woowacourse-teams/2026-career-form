# Career Form 프론트엔드

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

`build`는 생성된 Manifest가 MV3이고 popup, 새 탭 options, side panel과 필요한 로컬 저장 권한을 가리키는지 검사합니다. `zip`도 같은 세 화면과 Manifest 계약을 확인합니다.

## Chrome 로컬 로드

1. `npm run build`를 실행합니다.
2. Chrome의 `chrome://extensions`에서 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
4. `frontend/.output/chrome-mv3`를 선택합니다.
5. 확장 프로그램 아이콘에서 팝업을 열고 `프로필 관리`와 `사이드 패널 열기`를 확인합니다.
6. 비식별 예시만 입력해 A/B 레이아웃 전환, 자동 저장과 새로고침 복원을 확인합니다.
7. 사이드 패널에서 검색, 일반 값 복사, 민감 값 개별 펼침과 자동 기입 목업 흐름을 확인합니다.

프로필은 외부 서버로 전송하지 않고 `chrome.storage.local`에 저장합니다. 별도 암호화와 잠금은 없으므로 같은 Chrome 프로필이나 기기에 접근할 수 있는 사람에게 값이 보일 수 있습니다.

## Web Store 제출 전 준비

1. `npm run zip`으로 `frontend/.output/*-chrome.zip`을 생성합니다.
2. ZIP 내부에 `manifest.json`, `popup.html`, `options.html`, `sidepanel.html`이 있는지 확인합니다.
3. 개인정보, 실제 지원서 데이터, 계정 정보 및 비밀값이 포함되지 않았는지 확인합니다.
4. Web Store 등록, 심사 요청과 배포는 사람이 수행합니다.
