# 공고 알림 직무 필터 전환 변수의 배포 전달

> Issue: CF-413
> Collected: 2026-11-05
> Approval-Digest: 058720dcf405d4c6c31bfaa925163a583a91843a28d3f459f0a5b1cc732c7aec
> Source-Revision: 378814aa

이 문서는 2026-11-05에 승인된 CF-413 후보 1을 수집한 기록이다. CF-350이 정리한 알림 토글과 VAPID 시크릿의 배포 설정 레버에 공고 직무 필터 전환 변수 하나를 더한다. 변수·시크릿 전체 목록, runner·registry·host 준비, 운영 LLM 비활성 이력처럼 바꾸지 않은 내용은 Supersedes가 가리키는 CF-350 근거를 따른다. 변수 이름과 기본값만 기록하며 호스트 주소, 키 값, 계정은 포함하지 않는다.

## 승인 후보

배포 전환 변수 전달(CF-413): 공고 직무 필터 전환 CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED는 세 deploy workflow의 deploy job env(vars)와 infra/compose.deploy.yaml(:-false)을 거쳐 backend에 닿는 Environment 변수이며 미설정·빈 값은 compose가 false로 채우고 infra/scripts/deploy.sh 필수값에는 넣지 않는다. 릴리스와 함께 켜지 않고 새 확장 게시 → 관리 요약 API roleSelectedSubscriptions로 보급 확인 → 사람이 true로 두고 재배포한다. 스테이징은 true로 한 번 배포해 기동 로그 NOTIFICATION_ROLE_FILTER enforced=true와 미선택 구독 제외를 확인한 뒤 false로 되돌린다. 알림 설정 이름을 하나 더할 때는 infra/tests/test_notification_deployment.py의 DEFAULTS와 SYNTHETIC 사전에 이름만 더하면 기본값·주입·deploy job 한정·deploy.sh 제외 네 검사가 함께 적용된다.

## 전달 경로

`[BE]` #394(PR #405)가 backend에 `career-form.notification.role-filter.enforced`(환경변수 `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED`, 기본 `false`)를 추가했지만 배포 경로에는 이 이름이 없어 GitHub Environment에 변수를 만들어도 컨테이너에 닿지 않았다. CF-413은 기존 알림 설정과 같은 경로로 이름을 추가한다.

| 위치 | 추가한 항목 |
|---|---|
| `deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`의 `deploy` job `env` | `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED: ${{ vars.CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED }}` |
| `infra/compose.deploy.yaml` backend `environment` | `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED: ${CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED:-false}` |
| `infra/scripts/deploy.sh` 필수값 | 추가하지 않음(미설정이면 기능이 꺼진 채 기동) |

workflow는 Environment에 값이 없으면 빈 문자열을 넘기고 Spring placeholder는 빈 문자열에 기본값을 적용하지 않으므로, compose가 `:-false`로 backend `application.yml`과 같은 기본값을 채운다. 이로써 Environment 변수는 14개가 된다.

## 켜는 순서

전환은 릴리스 점검 항목이 아니다. `backend/docs/job-posting-notifications.md`의 배포 순서를 따른다.

1. 백엔드를 전환 꺼짐(변수 없음 또는 `false`)으로 배포한다.
2. 받을 직무를 고르는 새 확장을 Web Store에 게시한다.
3. 관리 요약 API의 `roleSelectedSubscriptions`가 전체 구독의 대부분이 될 때까지 보급을 확인한다.
4. 사람이 변수를 `true`로 만들고 재배포한다. 켜면 받을 직무를 고르지 않은 구독은 발송 대상에서 빠진다.

스테이징에서는 `true`로 한 번 배포해 기동 로그 `NOTIFICATION_ROLE_FILTER enforced=true`와 미선택 구독 제외를 확인한 뒤 `false`로 되돌린다. 절차는 `infra/WEB_PUSH_VAPID.md`의 변수 표, 스테이징 점검 순서 5단계, 운영 점검표에 적혀 있다.

## 계약 테스트

`infra/tests/test_notification_deployment.py`는 `DEFAULTS`(미설정·빈 값 기본값)와 `SYNTHETIC`(주입 값) 사전으로 네 검사를 돈다. 미설정·빈 값이면 compose 렌더 결과가 기본값인지, 주입 값이 dev·staging·prod 프로필에 기존 설정을 바꾸지 않고 닿는지, 세 workflow에서 `deploy` job만 `vars` 또는 `secrets`로 받는지, `deploy.sh` 필수값과 본문에 이름이 없는지다. 알림 설정 이름을 하나 더할 때는 두 사전에 이름을 더하면 네 검사가 함께 적용된다. CF-413에서 이 두 줄을 먼저 더해 변경 전 실패 6건을 보고 workflow·compose를 고친 뒤 25건 통과를 확인했다.
