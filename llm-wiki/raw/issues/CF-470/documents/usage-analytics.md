# 이력서 가져오기 계측과 Greeting 가져오기 진입 시점

> Issue: [CF-470](https://github.com/woowacourse-teams/2026-career-form/issues/470)
> Collected: 2026-11-17
> Approval-Digest: 102f649b7554e03c10a1f9639801231e7738df4302b109d0015a44049c931c54
> Source-Revision: ddb3ee8f

계측 topic에서 본 CF-470의 의미다. [승인 후보 스냅샷](approved-candidates.md)의 후보 4 가운데 계측 부분을 옮겼다. 그 밖의 이벤트와 개인정보 경계는 CF-463까지의 payload가 그대로 유효하다.

- 이력서 가져오기 이벤트는 `resume_import_viewed`, `resume_import_saved`, `resume_import_failed`다.
- `greeting_import_viewed`는 출처 고르기에서 지원서 화면을 고른 시점으로 옮겼다.
