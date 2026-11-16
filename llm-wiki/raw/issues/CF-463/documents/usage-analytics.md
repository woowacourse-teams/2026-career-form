# 공고 저장 계기 계측 정정

> Issue: [CF-463](https://github.com/woowacourse-teams/2026-career-form/issues/463)
> Collected: 2026-11-16
> Approval-Digest: 1de0e43eadcffe548c06a76dbea8f80ce34e8e357c2b5bef50ffde3399ff8d68
> Source-Revision: 5c43a4e7

계측 topic에서 본 CF-463의 의미다. [승인 후보 스냅샷](approved-candidates.md)의 후보 3을 옮겼다. 그 밖의 이벤트와 개인정보 경계는 CF-431까지의 payload가 그대로 유효하다.

- 계측(정정): 공고 저장 계측의 계기 `trigger` 값은 `button` 하나이고 `posting_auto_save_cancelled` 이벤트는 없다. 둘 다 #387에서 열기 자동 저장과 함께 빠졌다.
