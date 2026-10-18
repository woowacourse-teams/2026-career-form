# Policy-driven component execution

The backend returns `executionPolicy.componentPolicy` after site/DNS classification.
This module executes the ARIA/Zag component protocol; it contains no host list or
Greeting field names. Field paths, section identities, labels, search scope,
direct-entry rules, date precision, driver order, failure scopes, and display
comparison rules come from the installed document-scoped policy.

The browser retains DOM ownership checks, native input events, popup interaction,
React node rebinding, and read-only result checks. Those are execution mechanics.
Changing site rules belongs in a new DB policy version, not in this module.

Local migration: `backend/scripts/migrate-greeting-browser-policy.mjs` preserves earlier versions,
adds v3, and activates its DB pointer. Startup is insert-only. The JSON resource is
an initial seed, not a file reloaded over the database on every server start.

Validation for this migration: TypeScript and production builds; automated tests
were not run at the user's request. Existing tests now reference this engine;
policy fixtures and browser behavior still need their deferred regression run.

## 로컬 실행 조건 정책 (2026-10-14)

`POST /api/v1/execution-policy`의 `componentPolicy.runtimeRules`가 사이트별 입력 제한, 구조, 선택/성공 판정 조건을 제공한다. 프론트 `runtime-rules.ts`는 데이터 스키마를 검증하고 공통 실행기에 전달한다. 사이트 기본값으로 우회하지 않는다.

명시적 로컬 이관은 `backend/scripts/migrate-execution-policy-behavior.mjs`를 사용한다. SK 35→36, 현대 19→20, 그리팅 13→14이며 이전 문서와 필드/준비 규칙을 보존한다. 서버 시작 시 기존 정책을 seed로 덮어쓰지 않는다. 타입 검사·빌드·세 사이트 실제 API와 저장 문서의 일치는 확인한다. 자동 테스트와 새 빌드의 실사이트 재기입 검증은 수행하지 않았다.
