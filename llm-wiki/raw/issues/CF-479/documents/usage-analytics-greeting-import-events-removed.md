# Greeting 가져오기 이벤트 제거

> Issue: [CF-479](https://github.com/woowacourse-teams/2026-career-form/issues/479)
> Collected: 2026-11-18
> Approval-Digest: 19cb50157f3f038d01ca9b60eda98210dd0cde6a6a45a6527355f5a539945986
> Source-Revision: fd15cf2

[승인 후보 스냅샷](approved-candidates.md)의 후보 2 가운데 사용 통계 부분을 적는다. 이력서 가져오기 계측은 Supersedes가 가리키는 CF-470 근거를 그대로 따른다.

## 변경

- 이벤트 `greeting_import_offered`, `greeting_import_viewed`, `greeting_import_saved`를 제거했다. 기능 자체가 없어졌다.
- 온보딩 단계 목록에서 `greeting`을 뺐다. 단계 이름을 속성으로 쓰는 온보딩 이벤트에는 이 값이 더 나오지 않는다.
- `profile_import_clicked`, `resume_import_viewed`, `resume_import_saved`, `resume_import_failed`는 그대로다.

## 영향

- 기존 대시보드에서 Greeting 가져오기 지표는 제거 시점부터 끊긴다. 대시보드 정리는 사람 담당이다.
