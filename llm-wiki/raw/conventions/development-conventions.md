# 개발 컨벤션

> Source: docs/conventions/common.md; docs/conventions/commit.md; AGENTS.md
> Collected: 2026-08-18
> Published: Unknown

입력과 외부 응답은 경계에서 검증하고 실패 이유를 드러낸다. 기존 객체를 직접 바꾸지 않고 새 값을 만들어 반환한다. 개인정보와 시크릿을 코드, 로그, Fixture에 넣지 않는다.

동작 변경 전 실패하는 테스트를 먼저 추가하고, 정상 흐름·실패 흐름·경계값을 검증한다. 완료 전 운영체제에 맞는 가상환경 Python으로 harness/scripts/verify.py를 실행한다.

커밋은 `<type>: <한글 설명>` 형식을 사용하고, 작업 PR은 Issue와 같은 제목·하나의 종료 Issue를 사용한다.
