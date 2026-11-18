# 온보딩 다섯 단계와 제거된 단계의 저장 위치 처리

> Issue: [CF-479](https://github.com/woowacourse-teams/2026-career-form/issues/479)
> Collected: 2026-11-18
> Approval-Digest: 19cb50157f3f038d01ca9b60eda98210dd0cde6a6a45a6527355f5a539945986
> Source-Revision: fd15cf2

[승인 후보 스냅샷](approved-candidates.md)의 후보 2 가운데 온보딩 부분을 적는다. 단계별 화면 구성의 나머지는 Supersedes가 가리키는 CF-431 근거를 따른다.

## 현재 단계

- 이름, 이메일, 직무 선택, 알림 안내, 사용법의 다섯 단계다. Greeting 가져오기 안내 단계와 가져오기 장면(`GreetingStep`, `ImportScene`)은 제거했다.
- `onboarding_completed`는 알림 안내에서 사용법으로 넘어갈 때 기록된다.
- 자동 기입 장면(`FillScene`)이 쓰는 예시 지원서(`GreetingPage`)와 패널 그림(`PanelReplica`)의 자동 기입 부분은 남겼다.

## 제거된 단계의 저장 위치

- 진행 위치는 단계 이름으로 저장된다. 저장된 값이 제거된 단계(`greeting`)면 `steps.ts`의 `RETIRED_STEPS` 표에 따라 다음 단계(`usage`)로 읽는다.
- 그 사용자는 다음을 누르지 않았으므로 완료 이벤트가 기록되지 않는다.
- 단계를 없앨 때는 저장 위치 값을 지우지 말고 이 표에 다음 단계를 등록한다.
