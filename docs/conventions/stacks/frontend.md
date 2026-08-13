# 프론트엔드 스택 컨벤션

- `frontend/`는 backend 및 저장소 루트와 독립된 npm 프로젝트로 관리한다.
- Node.js는 22 이상, 패키지 관리자는 npm을 사용한다.
- Chrome 확장 프로그램은 WXT와 Chrome Manifest V3를 사용한다.
- 화면은 React와 TypeScript로 구현하고, 컴포넌트 스타일은 CSS Modules로 격리한다.
- 단위 테스트는 Vitest와 React Testing Library를 사용하며, 커버리지는 80% 이상을 유지한다.
- 변경 전 `typecheck`, `lint`, `format:check`, `test`, `coverage`, `build`, `zip`을 실행한다.
- 실제 지원서 값, 계정 정보, 브라우저 세션과 비밀값은 소스, 테스트 fixture, 로그에 넣지 않는다.
