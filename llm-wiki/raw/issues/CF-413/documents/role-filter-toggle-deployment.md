# 공고 알림 직무 필터 전환 변수의 배포 전달

> Issue: CF-413
> Collected: 2026-11-05
> Approval-Digest: 058720dcf405d4c6c31bfaa925163a583a91843a28d3f459f0a5b1cc732c7aec
> Source-Revision: 378814aa

이 문서는 2026-11-05에 승인된 CF-413 후보 1을 수집한 기록이다. CF-350이 정리한 알림 토글과 VAPID 시크릿의 배포 설정 레버에 공고 직무 필터 전환 변수 하나를 더하고, 그 뒤 CF-409(`JUSO_API_KEY`)와 CF-410(`TYPESAFE_API_KEY`, `CAREER_FORM_JEV_DATA_POLICY_REVIEWED`)이 추가한 이름까지 포함해 전체 목록을 다시 적는다. runner·registry·host 준비 절차, 운영 LLM 비활성 이력, HTTP 공개 상태처럼 바꾸지 않은 내용은 Supersedes가 가리키는 CF-350 근거를 따른다. 변수 이름과 기본값만 기록하며 호스트 주소, 키 값, 계정은 포함하지 않는다.

## 승인 후보

배포 전환 변수 전달(CF-413): 공고 직무 필터 전환 CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED는 세 deploy workflow의 deploy job env(vars)와 infra/compose.deploy.yaml(:-false)을 거쳐 backend에 닿는 Environment 변수이며 미설정·빈 값은 compose가 false로 채우고 infra/scripts/deploy.sh 필수값에는 넣지 않는다. 릴리스와 함께 켜지 않고 새 확장 게시 → 관리 요약 API roleSelectedSubscriptions로 보급 확인 → 사람이 true로 두고 재배포한다. 스테이징은 true로 한 번 배포해 기동 로그 NOTIFICATION_ROLE_FILTER enforced=true와 미선택 구독 제외를 확인한 뒤 false로 되돌린다. 알림 설정 이름을 하나 더할 때는 infra/tests/test_notification_deployment.py의 DEFAULTS와 SYNTHETIC 사전에 이름만 더하면 기본값·주입·deploy job 한정·deploy.sh 제외 네 검사가 함께 적용된다.

## 전달 경로

`[BE]` #394(PR #405)가 backend에 `career-form.notification.role-filter.enforced`(환경변수 `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED`, 기본 `false`)를 추가했지만 배포 경로에는 이 이름이 없어 GitHub Environment에 변수를 만들어도 컨테이너에 닿지 않았다. CF-413은 기존 알림 설정과 같은 경로로 이름을 추가한다.

| 위치 | 추가한 항목 |
|---|---|
| `deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`의 `deploy` job `env` | `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED: ${{ vars.CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED }}` |
| `infra/compose.deploy.yaml` backend `environment` | `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED: ${CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED:-false}` |
| `infra/scripts/deploy.sh` 필수값 | 추가하지 않음(미설정이면 기능이 꺼진 채 기동) |

workflow는 Environment에 값이 없으면 빈 문자열을 넘기고 Spring placeholder는 빈 문자열에 기본값을 적용하지 않으므로, compose가 `:-false`로 backend `application.yml`과 같은 기본값을 채운다.

## workflow가 읽는 변수와 시크릿 (Source-Revision 기준 전체)

세 deploy workflow(`deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`)는 같은 이름을 쓰고 GitHub Environment(`development`, `staging`, `production`)별 값만 다르다. 변수 15개, 시크릿 12개다.

| 종류 | 이름 | 범위 | 용도 |
|---|---|---|---|
| var | `DOCKERHUB_IMAGE` | 저장소 | image repository |
| var | `BACKEND_PORT` | 환경 | host loopback publish port |
| var | `SERVER_FORWARD_HEADERS_STRATEGY` | 환경(선택) | Spring forward headers, 기본 none |
| var | `CAREER_FORM_LLM_ENABLED` | 환경 | 범용(LLM) 기입 활성, 기본 false |
| var | `CAREER_FORM_JEV_DATA_POLICY_REVIEWED` | 저장소 | jev 공급자 데이터 정책 검토 표시, 기본 false(CF-410) |
| var | `CAREER_FORM_QUALITY_ENABLED` | 환경 | 품질 수집 활성, 기본 false |
| var | `CAREER_FORM_QUALITY_MANAGEMENT_URL` | 환경 | 품질 관리 화면 URL |
| var | `CAREER_FORM_QUALITY_DISCORD_ENABLED` | 환경 | Discord 알림, 기본 false |
| var | `CAREER_FORM_QUALITY_DISCORD_ENVIRONMENT` | 환경(선택) | 알림 환경 표시, 기본 prod |
| var | `CAREER_FORM_QUALITY_SELECTION_DAYS` | 환경(선택) | 기본 7 |
| var | `CAREER_FORM_QUALITY_SELECTION_MINIMUM_SAMPLE` | 환경(선택) | 기본 20 |
| var | `CAREER_FORM_NOTIFICATION_ENABLED` | 환경 | 공고 구독 알림(Web Push) 활성, 기본 false. true일 때만 발송기와 `/api/v1/notifications/*`가 뜬다 |
| var | `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED` | 환경(선택) | 공고 직무 필터 전환, 기본 false. true면 받을 직무를 고르지 않은 구독을 발송 대상에서 뺀다(CF-413) |
| var | `CAREER_FORM_PUSH_DISPATCH_INTERVAL` | 환경(선택) | 발송 주기, 기본 60s(backend 허용 범위 10s 이상 1h 이하) |
| var | `CAREER_FORM_PUSH_CONCURRENCY` | 환경(선택) | 동시 발송 수, 기본 20(backend 허용 범위 1 이상 200 이하) |
| secret | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | 저장소 | registry login, digest 조회 |
| secret | `SPRING_MONGODB_URI` | 환경 | 환경 전용 DB 연결 |
| secret | `OPENAI_API_KEY` | 저장소 | deploy.sh 필수값(LLM 비활성에도 필요) |
| secret | `TYPESAFE_API_KEY` | 환경 | jev 공급자 키, 빈 값 허용(CF-410) |
| secret | `JUSO_API_KEY` | 환경 | 도로명주소 검색 승인키, 빈 값 허용(CF-409) |
| secret | `CAREER_FORM_QUALITY_PASSWORD_HASH`, `CAREER_FORM_QUALITY_QUERY_TOKEN_HASH` | 환경 | 품질 관리 화면 인증 |
| secret | `CAREER_FORM_QUALITY_DISCORD_WEBHOOK` | 환경(선택) | Discord 알림 |
| secret | `CAREER_FORM_PUSH_VAPID_PUBLIC_KEY` | 환경 | VAPID 공개키(base64url 65바이트 비압축 P-256), 토글 true일 때 필수 |
| secret | `CAREER_FORM_PUSH_VAPID_PRIVATE_KEY` | 환경 | VAPID 비공개키(base64url 32바이트 스칼라), 토글 true일 때 필수 |
| secret | `CAREER_FORM_PUSH_VAPID_SUBJECT` | 환경 | VAPID subject(`mailto:` URI), 토글 true일 때 필수 |

`infra/scripts/deploy.sh`의 필수값은 `DEPLOY_ENVIRONMENT`, `BACKEND_IMAGE`, `BACKEND_PORT`, `SPRING_PROFILES_ACTIVE`, `SPRING_MONGODB_URI`, `OPENAI_API_KEY`로 바뀌지 않았다. 알림 항목과 전환 변수는 필수값이 아니며 `deploy.sh`는 보지 않는다.

## 켜는 순서

전환은 릴리스 점검 항목이 아니다. `backend/docs/job-posting-notifications.md`의 배포 순서를 따른다.

1. 백엔드를 전환 꺼짐(변수 없음 또는 `false`)으로 배포한다.
2. 받을 직무를 고르는 새 확장을 Web Store에 게시한다.
3. 관리 요약 API의 `roleSelectedSubscriptions`가 전체 구독의 대부분이 될 때까지 보급을 확인한다.
4. 사람이 변수를 `true`로 만들고 재배포한다. 켜면 받을 직무를 고르지 않은 구독은 발송 대상에서 빠진다.

스테이징에서는 `true`로 한 번 배포해 기동 로그 `NOTIFICATION_ROLE_FILTER enforced=true`와 미선택 구독 제외를 확인한 뒤 `false`로 되돌린다. 재배포 트리거는 환경마다 다르다. development는 `backend/**`, `compose.yaml`, `infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`, 배포 workflow를 바꾸는 `develop` push, staging은 `release/**` push 또는 `스테이징 환경 배포` workflow의 수동 실행, production은 `main` 병합이다. 절차는 `infra/WEB_PUSH_VAPID.md`의 변수 표, 스테이징 점검 순서 5단계, 운영 점검표에 적혀 있다.

## 계약 테스트

`infra/tests/test_notification_deployment.py`는 `DEFAULTS`(미설정·빈 값 기본값)와 `SYNTHETIC`(주입 값) 사전으로 네 검사를 돈다. 미설정·빈 값이면 compose 렌더 결과가 기본값인지, 주입 값이 dev·staging·prod 프로필에 기존 설정을 바꾸지 않고 닿는지, 세 workflow에서 `deploy` job만 `vars` 또는 `secrets`로 받는지, `deploy.sh` 필수값과 본문에 이름이 없는지다. 알림 설정 이름을 하나 더할 때는 두 사전에 이름을 더하면 네 검사가 함께 적용된다. CF-413에서 이 두 줄을 먼저 더해 변경 전 실패 6건을 보고 workflow·compose를 고친 뒤 25건 통과를 확인했다. `infra/tests/test_bootstrap_scripts.py`는 CI/CD topic의 Current raw가 registry·DB 이름과 세 환경 이름을 모두 적는지 검사하므로 이 topic을 대체하는 raw는 전체 목록을 유지해야 한다.

## 유지하는 보관 규칙

- 각 ARM64 self-hosted runner의 registration token은 일회성 값이며 저장소, 문서와 로그에 저장하지 않는다.
- VAPID 비공개키를 포함한 시크릿 값, MongoDB URI, 외부 API 키, 운영 host 주소는 이미지, 저장소, 문서, Issue·PR, 실행 로그와 Wiki에 저장하지 않는다. 이 문서도 이름만 기록한다.
- 키 생성, Environment 등록 순서("시크릿 먼저, 토글 나중"), 전환 변수를 켜는 순서의 Wiki 밖 정본은 `infra/WEB_PUSH_VAPID.md`다.

## 근거

- `.github/workflows/deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`의 deploy job env(Source-Revision 378814aa)
- `infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`, `infra/WEB_PUSH_VAPID.md`
- `infra/tests/test_notification_deployment.py`, `infra/tests/test_bootstrap_scripts.py`
- `backend/docs/job-posting-notifications.md`의 전환 설정과 배포 순서(CF-394)
