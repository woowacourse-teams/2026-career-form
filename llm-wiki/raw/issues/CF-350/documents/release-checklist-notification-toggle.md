# 릴리스 점검표의 운영 알림 토글 결정

> Issue: CF-350
> Collected: 2026-10-26
> Approval-Digest: e4434614c1e89a70afbbcc7888e48e4574efd1d8e82b811f02845fc4de049961
> Source-Revision: cc7215ecafd7a5406c58d2c9ea5b1f4c47dbee6e

이 문서는 2026-10-26에 승인된 CF-350 후보 2를 배포 Runbook 관점에서 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 릴리스 절차, 점검표의 다른 항목, 정책 활성 버전 동기화는 바꾸지 않으며, 바꾸지 않은 내용은 Supersedes가 가리키는 CF-337 근거와 그 앞의 CF-333·CF-323·CF-327 근거를 따른다. 호스트 주소, 계정, 시크릿 값은 포함하지 않는다.

## 승인 후보

릴리스 점검표의 병합 전 점검에서 "운영 설정에 새 필수값이 없는지"와 함께 "이번 릴리스에서 운영 알림 토글(`CAREER_FORM_NOTIFICATION_ENABLED`)을 켤지, 켠다면 production 시크릿 3개 등록과 staging 종단 확인(시크릿 등록 → staging 배포 → health → `[FE]` #349 스테이징 빌드)을 마쳤는지"를 확인한다. 운영 토글은 릴리스 승인 시 사람이 결정하며 main 병합 배포가 있어야 컨테이너에 전달된다. VAPID 키 회전은 기존 구독 전부를 무효로 만들어 확장이 재구독해야 하므로 유출 의심 시에만 공지 뒤 수행한다.

## 병합 전 점검표에 추가하는 항목

- 운영 설정에 새 필수값이 없는지 확인할 때(`infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`, `backend/src/main/resources/application*.yml`, deploy workflow를 main과 diff) 알림 토글 결정을 함께 적는다. 이번 릴리스에서 `production`의 `CAREER_FORM_NOTIFICATION_ENABLED`를 `true`로 둘지, 둔다면 `CAREER_FORM_PUSH_VAPID_PUBLIC_KEY`, `CAREER_FORM_PUSH_VAPID_PRIVATE_KEY`, `CAREER_FORM_PUSH_VAPID_SUBJECT`가 `production` Environment에 등록돼 있고 staging 종단 확인을 마쳤는지 확인한다.
- 알림 항목은 `deploy.sh` 필수값이 아니고 compose 기본값(false, 60s, 20, 빈 문자열)이 있어 등록하지 않아도 배포는 종전과 같이 성공한다. 토글을 켜지 않기로 하면 아무것도 등록하지 않아도 된다.
- Environment 변수·시크릿은 배포 시점에 읽히므로 운영 토글은 main 병합 배포(릴리스 또는 hotfix)가 있어야 컨테이너에 전달된다. 변수만 바꿔서는 운영이 바뀌지 않는다.

## 스테이징 활성화 점검 순서

1. `staging` Environment에 VAPID 시크릿 세 개를 등록한다.
2. staging을 배포하고 `/actuator/health`를 확인한다.
3. `CAREER_FORM_NOTIFICATION_ENABLED=true`로 다시 배포하고 health와 기동 로그를 확인한다. 시크릿이 비어 있거나 형식이 다르면 backend가 기동에 실패하고 `deploy.sh`가 이전 digest로 되돌린다.
4. `[FE]` #349의 스테이징 빌드 확장으로 구독한 뒤 합성 공고 한 건으로 FCM 수락 로그와 확장 수신을 종단 확인한다.

## 키 회전

새 키 쌍으로 시크릿 세 개를 교체해 배포하면 기존 구독 전부가 무효가 되고(푸시 서비스가 이전 키로 만든 구독에 새 키 서명을 거부한다), 확장이 새 공개키로 다시 구독할 때까지 알림이 가지 않는다. 공개키는 `GET /api/v1/notifications/vapid-public-key`로 배포되므로 확장 재빌드는 필요 없다. 회전은 유출 의심 시에만 팀 공지 뒤 수행하고 이전 키는 폐기한다.

## 근거

- `infra/WEB_PUSH_VAPID.md`(CF-350, Wiki 밖 정본): 키 생성·등록 순서, 재배포 트리거, 스테이징 점검 순서, 운영 활성화와 릴리스 점검표, 키 회전
- `infra/compose.deploy.yaml`, `.github/workflows/deploy-*.yml`(CF-350)
- `llm-wiki/raw/issues/CF-327/documents/deployment-pipeline.md`의 릴리스 점검표
- Issue #350 본문의 스테이징 활성화 점검 순서와 운영 활성화 결정
