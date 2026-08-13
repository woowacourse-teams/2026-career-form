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

`build`는 생성된 Manifest가 MV3이고 action popup을 가리키는지 검사합니다. `zip`은 생성한 ZIP에 `manifest.json`과 popup 산출물이 있는지 검사합니다.

## Chrome 로컬 로드

1. `npm run build`를 실행합니다.
2. Chrome의 `chrome://extensions`에서 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
4. `frontend/.output/chrome-mv3`를 선택합니다.
5. 확장 프로그램 아이콘을 눌러 팝업 뼈대를 확인합니다.

## Web Store 제출 전 준비

1. `npm run zip`으로 `frontend/.output/*-chrome.zip`을 생성합니다.
2. ZIP 내부에 `manifest.json`과 `popup.html`이 있는지 확인합니다.
3. 개인정보, 실제 지원서 데이터, 계정 정보 및 비밀값이 포함되지 않았는지 확인합니다.
4. Web Store 등록, 심사 요청과 배포는 사람이 수행합니다.
