# 현대자동차 지원서의 Map·Set 재정의

> Issue: CF-310
> Collected: 2026-10-21
> Approval-Digest: 613b4acd5fd87f8d2186b4ac401715fbed539b93eea1421f11163fb5591ee258
> Source-Revision: 149b350a7ed85aefcb65448f816c6901d30f2b12

이 문서는 2026-10-21에 승인된 CF-310 후보 5를 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 어댑터 계약은 바꾸지 않는 새 운영 지식이며, 바꾸지 않은 내용은 Supersedes가 가리키는 CF-169 근거를 따른다. 실제 지원값·계정·세션·URL 쿼리·대화 전문은 포함하지 않는다.

## 승인 후보

현대자동차 페이지는 `Map`과 `Set`을 재정의한다. 그래서 페이지에 주입하는 함수에서는 이 둘을 쓰면 안 된다.

## 근거

- 2026-10-21 `talent.hyundai.com` 지원서(`/apply/applyWrite.hc`) 탭 세 개에서 `window.Map`과 `window.Set`을 확인했다. 둘 다 native 함수가 아니었고, 새 iframe의 생성자와도 달랐다. 생성자 소스는 `new` 없이 부르면 `Constructor Map requires "new"`(Set은 `Constructor Set requires "new"`) 오류를 던지는 polyfill 함수였다. `Map.prototype.get`과 `Set.prototype.has`도 native가 아니었다.
- 같은 날 실사이트 QA의 일회성 스크립트에서 `Map`을 `for...of`로 순회하던 입력 비우기 함수(`clearForm`)가 현대 지원서에서 `TypeError: radios is not iterable`을 던지며 멈췄고, 객체와 배열로 바꾼 뒤 동작했다. 같은 페이지에서 `Map`의 `get`·`set`과 `Set`의 `has`·`add`만 쓰던 수집 함수는 동작했다. 그래서 확인된 실패는 순회이고, 둘을 아예 쓰지 않는 규칙은 polyfill의 다른 동작까지 피하는 보수적 제약이다.

## 쓰임

`frontend/scripts/live-qa`가 `page.evaluate`로 페이지 world에 넣는 함수는 `Map`·`Set`을 쓰지 않는다. 이 하네스는 처음부터 둘을 쓰지 않았다. `page/page-functions.test.mjs`가 이름 있는 페이지 함수 열 개(`page/*.mjs`의 일곱 개와 `keepalive.mjs`의 세 개)의 소스에서 이를 고정한다. `driver.mjs`와 `cli.mjs`의 인라인 `evaluate` 콜백은 현재 둘을 쓰지 않지만 테스트 대상은 아니다.
