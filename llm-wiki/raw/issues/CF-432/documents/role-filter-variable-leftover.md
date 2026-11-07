# 직무 필터 전환 변수의 배포 경로 잔존

> Issue: [CF-432](https://github.com/woowacourse-teams/2026-career-form/issues/432)
> Collected: 2026-11-07
> Approval-Digest: 7fa81d649c3847946c61720c258533e9dd42172144711304010e08025c5d43df
> Source-Revision: da17fde3

CF-413이 배포 경로에 더한 직무 필터 전환 변수가 CF-432 뒤 어떤 상태인지 적는다. [승인 후보 스냅샷](approved-candidates.md)의 후보 2다. 다른 배포 변수와 시크릿, 빈 문자열과 Spring placeholder 기본값의 관계는 이전 payload의 내용이 그대로 유효하다.

- `infra/compose.deploy.yaml`, 배포 workflow 3개, `infra/tests/test_notification_deployment.py`, `infra/WEB_PUSH_VAPID.md`는 아직 `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED`를 전달하거나 켜는 절차를 설명한다.
- backend가 CF-432부터 이 값을 읽지 않아 무엇을 넣어도 동작에 영향이 없다.
- 전달과 설명의 정리는 별도 Infra 후보이고, GitHub Environment 변수 삭제 여부는 사람이 정한다.
- 2026-11-07 확인 때 staging·production Environment에는 이 변수가 없었다.
