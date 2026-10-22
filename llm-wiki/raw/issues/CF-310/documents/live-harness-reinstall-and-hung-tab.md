# 확장 재설치 뒤 탭 재진입과 응답 없는 탭의 CDP 차단

> Issue: CF-310
> Collected: 2026-10-22
> Approval-Digest: 9fd9bbce11f926e2cc6027742160d7265ecdcdc034a816df189c47238a86477c
> Source-Revision: c5d703f411b7220829268ddf260a289e6cf48814

이 문서는 2026-10-22 결함 수정에서 승인된 CF-310 후보 5를 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates-3.md) 전체 UTF-8 바이트의 SHA-256이다. 평가 계약을 바꾸지 않는 하네스 운영 지식이며, 바꾸지 않은 내용은 Supersedes가 가리키는 [원복 재키·표시 규칙 근거](live-harness-residue-and-display.md)를 따른다. 실제 지원값·계정·세션·URL 쿼리·대화 전문은 포함하지 않는다.

## 승인 후보

확장을 다시 설치하면 열린 탭을 다시 열어야 콘텐츠 스크립트가 붙고, 응답 없는 탭 하나가 CDP 접속 전체를 막는다.

## 근거

### 재설치 뒤 탭 재진입

- 하네스 `start`는 확장 복사본을 바꾸고 reload한다. 이미 열려 있던 탭에는 새 콘텐츠 스크립트가 붙지 않아, 2026-10-22 재설치 직후 네 실행이 모두 `panel-trigger-missing`으로 실패했고 콘솔 기록은 비어 있었다.
- 같은 주소로 다시 이동(`goto`, 에이치닷은 `step`)하면 새 콘텐츠 스크립트가 붙는다. 원복과 같은 방식이라 입력값 복원 문제가 없다.

### 응답 없는 탭

- 재진입 뒤에도 실행이 같은 오류로 실패했고 `stepinfo`·`step`은 `TimeoutError`, Playwright `connectOverCDP`는 30초 시간 초과였다. 원인은 Greeting 지원서 탭 하나의 렌더러가 멈춘 것이다. CDP `/json/list`로 페이지 target을 모두 꺼내 target마다 WebSocket으로 `Runtime.evaluate`를 보내면, 15개는 10ms 안에 답했고 그 탭만 5초를 넘겼다.
- Playwright는 붙을 때 모든 페이지 target에 attach하므로 멈춘 탭 하나가 접속 전체를 막는다. 그 탭 세션과 브라우저 세션 양쪽의 `Page.navigate`도 답하지 않았다.
- 브라우저 세션에서 `Target.createTarget`으로 같은 주소의 새 탭을 만들고 `Target.closeTarget`으로 멈춘 탭을 닫으면 접속이 바로 복구됐다. 같은 브라우저라 로그인 쿠키는 유지되고, 브라우저 자체는 재시작하지 않는다.
- 같은 시각 에이치닷 두 테넌트 탭은 사이트가 "지원서 수정" 목록 화면으로 이동시켜 `/mrs2` 주소와 맞지 않았다. 하네스는 `tab-not-unique`(0개 일치)로 거부하며, 작성 화면 재진입은 사람이 한다.

## 쓰임

- 재설치 뒤에는 측정 대상 탭을 같은 주소로 다시 연 뒤 실행한다.
- 실행이 연달아 `TimeoutError`나 `panel-trigger-missing`으로 끝나면 target별 `Runtime.evaluate` 응답 시간으로 멈춘 탭을 찾고, 그 탭만 같은 주소의 새 탭으로 바꾼다.
