# 온보딩 단계 진입과 완료 계측

> Issue: [CF-431](https://github.com/woowacourse-teams/2026-career-form/issues/431)
> Collected: 2026-11-06
> Approval-Digest: 2b1c944c4eeec4e7481efa999e40d57f4709500cea784143009e2fdab1bbaae3
> Source-Revision: cc7f723b

확장 온보딩 개편에 따른 계측 변경이다. [승인 후보 스냅샷](approved-candidates.md)의 후보 2 가운데 계측 부분을 적는다. 익명 ID, 첫 이벤트 중복 방지, 전송 경계는 앞선 payload의 내용이 그대로 유효하다.

- 확장 온보딩은 단계에 들어갈 때 `onboarding_step_viewed`를 속성 `step`과 함께 기록한다. `step`은 `name`, `email`, `roles`, `alerts`, `greeting`, `usage` 가운데 하나이고 입력값은 싣지 않는다. 허용 목록에 없는 값은 버린다.
- Greeting 단계에서 사용법 단계로 넘어갈 때 `onboarding_completed`를 기록한다.
- `onboarding_viewed`와 `onboarding_first_viewed`는 온보딩 탭이 열릴 때 지금처럼 기록한다.
- 직무 선택 단계는 `push_roles_saved`(`role_count`), `push_subscription_enabled`, `push_subscription_disabled`, `notification_test_sent`, `notification_visibility_answered`를 surface `extension_onboarding`으로 기록한다.
- 시작 목적 선택 화면과 단계형 등록(`QuickStart`)이 없어져 `onboarding_autofill_selected`, `onboarding_postings_selected`, 값 없이 건너뛰기 `quick_profile_skipped`, 단계형 등록 열기 `quick_profile_viewed`를 허용 목록에서 뺐다. 그 이전 기간의 시작 목적과 단계형 등록 지표는 더 이어지지 않는다.
- 첫 저장 `profile_first_saved`는 단계형 등록 대신 온보딩 이름·이메일 단계의 저장에서 기록하고, 전체 편집과 Greeting 가져오기에서 기록하는 것은 그대로다.
