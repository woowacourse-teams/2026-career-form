# 초기 프론트엔드 세팅 구현 계획

## 조사 결과

- 저장소는 `frontend/`와 `backend/`를 독립 프로젝트로 두는 폴더 분리형 모노레포다.
- `frontend/`는 WXT 0.21.4, React 19.2.8, TypeScript 7.0.2, npm을 사용한다.
- WXT의 `entrypoints/popup/index.html`은 Manifest V3 action popup으로 생성된다.
- Windows에서는 하네스 Python 진입점이 확장자 없는 실행 파일을 가정해 기준 하네스 테스트 일부가 실패한다. 이 Issue에서는 하네스 코드를 변경하지 않고, 프론트엔드 및 직접 실행 가능한 하네스 검증 결과를 분리해 기록한다.

## 구현 순서

### 1. 프론트엔드 도구 체인과 popup 진입점

- `frontend/package.json`에 Node 22 이상, WXT, React, TypeScript와 `dev`, `build`, `zip`, `typecheck` 명령을 정의한다.
- `frontend/wxt.config.ts`, `tsconfig.json`, `entrypoints/popup/index.html`을 추가한다.
- build 후 `.output/chrome-mv3/manifest.json`이 manifest v3이고 `action.default_popup`을 포함하는지 검사한다.
- 커밋: `chore: WXT 기반 프론트엔드 프로젝트 구성`

### 2. 팝업 화면 뼈대와 단위 테스트

- 먼저 `frontend/entrypoints/popup/App.test.tsx`에서 접근 가능한 제목과 `header`, `main`, `footer` landmark를 요구한다.
- 테스트가 `App` 모듈 부재로 실패함을 확인한다.
- `App.tsx`, `main.tsx`, CSS Modules와 전역 스타일을 추가해 최소 popup shell을 구현한다.
- Vitest와 React Testing Library로 테스트를 통과시키고 80% 이상 V8 커버리지를 확인한다.
- 커밋: `feat: 확장 프로그램 팝업 화면 뼈대 추가`

### 3. 품질 검증과 배포 안내

- ESLint, Prettier, Vitest 설정을 추가한다.
- ZIP을 열어 `manifest.json`과 popup 파일 포함 여부를 검사하는 Node 스크립트를 추가한다.
- `frontend/README.md`와 `docs/conventions/stacks/frontend.md`에 개발·검증·Chrome 로컬 로드·Web Store 제출용 ZIP 생성 절차를 기록한다.
- 커밋: `chore: 프론트엔드 품질 검증과 배포 안내 추가`

## 검증 명령

```powershell
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend test
npm --prefix frontend run coverage
npm --prefix frontend run build
npm --prefix frontend run zip
python harness/scripts/verify.py
```

## 위험과 보류 결정

- 실제 Chrome 로드와 Chrome Web Store 업로드는 사람이 수행한다.
- background worker, content script, 권한, 저장소, API 통신은 이 Issue 범위에서 제외한다.
- Windows 하네스 실행 경로는 별도 `harness-change` 후보로만 기록하며 이 PR에는 변경하지 않는다.
