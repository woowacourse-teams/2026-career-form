# 테스트용 백엔드 응답은 실제 응답 표본에서 만든다

> Issue: [CF-509](https://github.com/woowacourse-teams/2026-career-form/issues/509)
> Collected: 2026-11-22
> Approval-Digest: 5aa8c3891a0d21c833494450fe4c1e031872258b1879e531acc3643c45418c7d
> Source-Revision: aaa814f

[승인 후보 스냅샷](approved-candidates.md)의 후보 4 가운데 어댑터 공통 규칙을 적는다. 이 문서는 Supersedes가 가리키는 CF-177 근거의 회사 어댑터 개발 기준에 규칙 하나만 더한다. 에이치닷 v1의 사례는 [2단계 근거](hplace-v1-step2.md)에 있다.

- 백엔드의 `autofillPolicy`는 회사 규칙이 아니라 프로필 칸마다 정해진다. 같은 어댑터의 칸이라도 ALLOWED와 CONDITIONAL이 섞인다.
- 리뷰 계획은 CONDITIONAL 항목을 `needs-review`로 만들고 자동 실행은 그 항목도 선택한다. 어댑터의 쓰기 승인 조건은 두 정책을 모두 받아야 한다.
- 프론트 테스트가 쓰는 백엔드 응답은 손으로 만들지 않는다. 로컬 백엔드에 보낸 합성 요청의 실제 응답 표본에서 만든다. 표본에는 값이 없고 바인딩, 정책, 명령만 있다.
- 모든 칸을 ALLOWED로 돌려주는 가짜 응답은 이 차이를 숨긴다. 에이치닷 v1 2단계에서는 테스트가 모두 통과했지만 실화면에서 CONDITIONAL 칸만 쓰지 못했다.
