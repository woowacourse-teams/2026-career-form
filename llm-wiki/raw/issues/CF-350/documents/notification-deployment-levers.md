# 알림 토글과 VAPID 시크릿의 배포 설정 레버

> Issue: CF-350
> Collected: 2026-10-26
> Approval-Digest: e4434614c1e89a70afbbcc7888e48e4574efd1d8e82b811f02845fc4de049961
> Source-Revision: cc7215ecafd7a5406c58d2c9ea5b1f4c47dbee6e

이 문서는 2026-10-26에 승인된 CF-350 후보 1을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. CF-327이 정리한 배포 설정 레버 전체에 공고 구독 알림(Web Push)의 토글과 VAPID 값을 더하며, runner·registry·host 준비 절차, 운영 LLM 비활성 이력, HTTP 공개 상태처럼 바꾸지 않은 내용은 Supersedes가 가리키는 CF-327 근거를 따른다. 변수와 시크릿은 이름만 기록하고 값, host 주소, 포트 값은 기록하지 않는다.

## 승인 후보

배포 설정 레버에 알림 토글과 VAPID 값을 추가한다. Environment 변수 `CAREER_FORM_NOTIFICATION_ENABLED`(기본 false), 선택 `CAREER_FORM_PUSH_DISPATCH_INTERVAL`(기본 60s), `CAREER_FORM_PUSH_CONCURRENCY`(기본 20)로 변수 13개, 환경 시크릿 `CAREER_FORM_PUSH_VAPID_PUBLIC_KEY`, `CAREER_FORM_PUSH_VAPID_PRIVATE_KEY`, `CAREER_FORM_PUSH_VAPID_SUBJECT`(mailto:)로 시크릿 10개가 된다. 값이 없으면 compose 기본값으로 기능이 꺼진 채 기동하고 `deploy.sh` 필수값 6개는 그대로다. 숫자·기간 선택값의 기본값은 compose가 backend application.yml과 같게 채운다. workflow는 Environment 값이 없으면 빈 문자열을 넘기고 Spring placeholder는 빈 문자열에 기본값을 적용하지 않기 때문이다. Environment 변수·시크릿은 배포 시점에 읽히므로 바꾼 뒤 새 배포가 있어야 반영되고, development는 workflow_dispatch가 없어 paths 필터에 걸리는 develop push가 필요하다. 키 생성·등록·회전 절차의 Wiki 밖 정본은 `infra/WEB_PUSH_VAPID.md`다.

## workflow가 읽는 변수와 시크릿

세 deploy workflow(`deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`)는 같은 이름을 쓰고 GitHub Environment(`development`, `staging`, `production`)별 값만 다르다. CF-327 목록에 알림 항목 6개(변수 3개, 시크릿 3개)가 추가됐다.

| 종류 | 이름 | 범위 | 용도 |
|---|---|---|---|
| var | `DOCKERHUB_IMAGE` | 저장소 | image repository |
| var | `BACKEND_PORT` | 환경 | host loopback publish port |
| var | `SERVER_FORWARD_HEADERS_STRATEGY` | 환경(선택) | Spring forward headers, 기본 none |
| var | `CAREER_FORM_LLM_ENABLED` | 환경 | 범용(LLM) 기입 활성, 기본 false |
| var | `CAREER_FORM_QUALITY_ENABLED` | 환경 | 품질 수집 활성, 기본 false |
| var | `CAREER_FORM_QUALITY_MANAGEMENT_URL` | 환경 | 품질 관리 화면 URL |
| var | `CAREER_FORM_QUALITY_DISCORD_ENABLED` | 환경 | Discord 알림, 기본 false |
| var | `CAREER_FORM_QUALITY_DISCORD_ENVIRONMENT` | 환경(선택) | 알림 환경 표시, 기본 prod |
| var | `CAREER_FORM_QUALITY_SELECTION_DAYS` | 환경(선택) | 기본 7 |
| var | `CAREER_FORM_QUALITY_SELECTION_MINIMUM_SAMPLE` | 환경(선택) | 기본 20 |
| var | `CAREER_FORM_NOTIFICATION_ENABLED` | 환경 | 공고 구독 알림(Web Push) 활성, 기본 false. true일 때만 발송기와 `/api/v1/notifications/*`가 뜬다 |
| var | `CAREER_FORM_PUSH_DISPATCH_INTERVAL` | 환경(선택) | 발송 주기, 기본 60s(backend 허용 범위 10s 이상 1h 이하) |
| var | `CAREER_FORM_PUSH_CONCURRENCY` | 환경(선택) | 동시 발송 수, 기본 20(backend 허용 범위 1 이상 200 이하) |
| secret | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | 저장소 | registry login, digest 조회 |
| secret | `SPRING_MONGODB_URI` | 환경 | 환경 전용 DB 연결 |
| secret | `OPENAI_API_KEY` | 저장소 | deploy.sh 필수값(LLM 비활성에도 필요) |
| secret | `CAREER_FORM_QUALITY_PASSWORD_HASH`, `CAREER_FORM_QUALITY_QUERY_TOKEN_HASH` | 환경 | 품질 관리 화면 인증 |
| secret | `CAREER_FORM_QUALITY_DISCORD_WEBHOOK` | 환경(선택) | Discord 알림 |
| secret | `CAREER_FORM_PUSH_VAPID_PUBLIC_KEY` | 환경 | VAPID 공개키(base64url 65바이트 비압축 P-256), 토글 true일 때 필수 |
| secret | `CAREER_FORM_PUSH_VAPID_PRIVATE_KEY` | 환경 | VAPID 비공개키(base64url 32바이트 스칼라), 토글 true일 때 필수 |
| secret | `CAREER_FORM_PUSH_VAPID_SUBJECT` | 환경 | VAPID subject(`mailto:` URI), 토글 true일 때 필수 |

`infra/compose.deploy.yaml`은 알림 항목을 `${CAREER_FORM_NOTIFICATION_ENABLED:-false}`, `${CAREER_FORM_PUSH_DISPATCH_INTERVAL:-60s}`, `${CAREER_FORM_PUSH_CONCURRENCY:-20}`, 시크릿 세 개는 `${NAME:-}`(빈 문자열)로 받는다. 여기 없는 환경변수(`CAREER_FORM_PUSH_MAX_ATTEMPTS` 등 backend의 다른 push 설정)는 컨테이너에 전달되지 않으므로 코드 기본값으로만 동작한다.

## compose가 선택값 기본값을 채우는 이유

workflow의 `deploy` job env는 `${{ vars.NAME }}`을 그대로 넘기므로 Environment에 변수가 없으면 빈 문자열이 전달된다. backend는 `@Value("${career-form.notification.push.dispatch-interval:60s}")`처럼 placeholder 기본값을 쓰는데, Spring은 변수가 비어 있어도 기본값을 적용하지 않아 빈 문자열이 Duration·int로 바인딩되면서 토글을 켠 환경의 기동이 실패한다. 그래서 compose의 `${NAME:-기본값}`이 빈 문자열까지 backend `application.yml`과 같은 값(60s, 20)으로 바꿔 넣는다. `CAREER_FORM_QUALITY_SELECTION_DAYS:-7`과 같은 선례이며, backend 기본값이 바뀌면 compose 기본값도 함께 바꿔야 한다. 시크릿 세 개는 빈 문자열이어도 토글이 false면 읽히지 않고, 토글이 true인데 비어 있으면 `VapidKeys.parse`가 기동 시점에 거부해 `deploy.sh`가 이전 digest로 되돌린다.

## deploy.sh 계약

- 필수: `DEPLOY_ENVIRONMENT`, `BACKEND_IMAGE`(`repo@sha256:<64hex>` 형식), `BACKEND_PORT`(1024 이상 65535 이하), `SPRING_PROFILES_ACTIVE`, `SPRING_MONGODB_URI`, `OPENAI_API_KEY`. 알림 항목은 필수값이 아니며 `deploy.sh`는 보지 않는다.
- 허용 조합: `development:dev`, `staging:staging`, `production:prod`
- 조정값과 자동 rollback은 CF-327 근거를 따른다.

## Environment 값의 반영 시점과 재배포 트리거

변수·시크릿은 deploy job이 실행될 때 읽히므로 GitHub에서 바꿔도 다음 배포까지 컨테이너에 반영되지 않는다.

| 환경 | 재배포 트리거 |
|---|---|
| development | `backend/**`, `compose.yaml`, `infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`, 배포 workflow 중 하나를 바꾸는 `develop` push. workflow_dispatch가 없다 |
| staging | `release/**` push 또는 `스테이징 환경 배포` workflow를 release 브랜치에서 수동 실행 |
| production | `main` 병합(릴리스 또는 hotfix) |

## 유지하는 보관 규칙

- 각 ARM64 self-hosted runner의 registration token은 일회성 값이며 저장소, 문서와 로그에 저장하지 않는다.
- VAPID 비공개키를 포함한 시크릿 값, MongoDB URI, 운영 host 주소는 이미지, 저장소, 문서, Issue·PR, 실행 로그와 Wiki에 저장하지 않는다. 키 생성 명령의 출력도 기록하지 않는다. 이 문서도 이름만 기록한다.
- 키 생성(`npx web-push generate-vapid-keys`), Environment 등록 순서("시크릿 먼저, 토글 나중"), 스테이징 활성화, 키 회전 절차의 Wiki 밖 정본은 `infra/WEB_PUSH_VAPID.md`다.

## 근거

- `.github/workflows/deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`의 deploy job env(CF-350)
- `infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`
- `infra/tests/test_notification_deployment.py`(기본값·빈 값, 합성 값 전달, 워크플로 주입 위치, deploy.sh 필수값 불변)
- `[BE]` #348 작업 브랜치의 `backend/src/main/resources/application.yml`, `NotificationConfiguration`, `PushSettings`, `VapidKeys`(2026-10-25 a98b9c1 기준)
- `llm-wiki/raw/issues/CF-327/documents/deployment-config-levers.md`
