# develop에서도 실패하는 native-form 정책 테스트 두 파일

> Issue: [CF-480](https://github.com/woowacourse-teams/2026-career-form/issues/480)
> Collected: 2026-11-18
> Approval-Digest: b9ff638175d31eb6327967418852c23a9ebbcfaf808d26d479d77e6d4cab9f47
> Source-Revision: 7bdc957

[승인 후보 스냅샷](approved-candidates.md)의 후보 3을 적는다. 단위 파일 실행 명령과 확장 수동 확인은 Supersedes가 가리키는 CF-458 근거를 그대로 따른다.

## 관찰 (2026-11-18)

- `cd frontend && npm run test:unit -- src/autofill/policy`에서 `native-form-exam.test.ts`와 `native-form-gpa.test.ts`가 실패했다. 판정 불일치가 1~2건, 15초 시간 제한이 1건이다. 실패하는 경우의 수는 실행마다 달랐다.
- 같은 명령을 develop `a258520` 기준 clone에서 돌려도 같은 두 파일이 실패했다.
- CF-480 브랜치는 `src/autofill`을 바꾸지 않았다.

## 해석

- 이번 변경이 원인이 아니라는 것만 확인했다. 실패 원인은 확인하지 않았다.
- 이 두 파일의 실패를 다른 변경의 회귀로 읽기 전에 develop 기준에서 같은 명령으로 먼저 비교한다.
