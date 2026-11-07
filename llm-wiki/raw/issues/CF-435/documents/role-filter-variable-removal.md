# 직무 필터 전환 변수의 배포 경로 제거

> Issue: [CF-435](https://github.com/woowacourse-teams/2026-career-form/issues/435)
> Collected: 2026-11-07
> Approval-Digest: 00e55f273b4cb38bc64ae426fbb48bf19696a77a30aafcd81be17afe2097dc25
> Source-Revision: dae7fc69

이 문서는 2026-11-07에 승인된 CF-435 후보 1을 수집한 기록이다. `infra/tests/test_bootstrap_scripts.py`가 CI/CD topic의 Current raw에 registry·DB 이름과 세 환경 이름이 모두 있는지 검사하므로, CF-432 payload의 전체 목록과 보관 규칙을 Source-Revision 기준으로 다시 적고 전환 변수만 뺀다. runner·registry·host 준비 절차, 운영 LLM 비활성 이력, HTTP 공개 상태처럼 바꾸지 않은 내용은 Supersedes가 가리키는 CF-432와 그 이전 근거를 따른다. 변수 이름과 기본값만 기록하며 호스트 주소, 키 값, 계정은 포함하지 않는다.

## 승인 후보

직무 필터 전환 변수의 배포 경로 제거(CF-435): CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED를 세 deploy workflow의 deploy job env, infra/compose.deploy.yaml, infra/tests/test_notification_deployment.py의 DEFAULTS·SYNTHETIC, infra/WEB_PUSH_VAPID.md(변수 표, 스테이징 활성화 점검 5단계, 운영 점검표의 켜는 항목)에서 지웠다. 배포 변수는 세 환경 공통 14개, 시크릿 12개이고 development는 #423의 평가 설정 변수 3개와 시크릿 1개를 더 읽는다. test_removed_role_filter_setting_is_not_passed_to_backend가 옛 이름이 세 workflow와 compose 원문에 없고, 배포 환경에 그 변수가 있어도 compose 렌더 결과로 backend에 전달되지 않는지 검사한다. 2026-11-07 확인 때 development·staging·production Environment에는 이 변수가 없어 지울 값이 없었다.

## 지운 곳

- 세 deploy workflow(`deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`)의 deploy job env에서 `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED` 한 줄씩.
- `infra/compose.deploy.yaml`의 backend 환경에서 같은 이름의 한 줄.
- `infra/tests/test_notification_deployment.py`의 `DEFAULTS`와 `SYNTHETIC` 항목.
- `infra/WEB_PUSH_VAPID.md`의 변수 표 행, 스테이징 활성화 점검 5단계, 운영 활성화와 릴리스 점검표의 직무 필터 전환 항목. 스테이징 점검은 시크릿 등록, 배포와 health, 알림 토글 켜기, 확장 종단 확인의 4단계다.

## workflow가 읽는 변수와 시크릿 (Source-Revision 기준 전체)

세 deploy workflow는 같은 이름을 쓰고 GitHub Environment(`development`, `staging`, `production`)별 값만 다르다. 세 환경 공통은 변수 14개, 시크릿 12개이고, development는 #423의 평가 설정 변수 3개와 시크릿 1개를 더 읽는다.

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
| var | `CAREER_FORM_PUSH_DISPATCH_INTERVAL` | 환경(선택) | 발송 주기, 기본 60s(backend 허용 범위 10s 이상 1h 이하) |
| var | `CAREER_FORM_PUSH_CONCURRENCY` | 환경(선택) | 동시 발송 수, 기본 20(backend 허용 범위 1 이상 200 이하) |
| var | `CAREER_FORM_EVALUATION_ENABLED`, `CAREER_FORM_EVALUATION_AUTO_RUN_ENABLED`, `CAREER_FORM_EVALUATION_OPENAI_ENABLED` | development 환경만(선택) | 평가 설정, compose 기본 false(#423) |
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
| secret | `CAREER_FORM_EVALUATION_PROVIDER_KEYS` | development 환경만(선택) | 평가 공급자 키, compose 기본 빈 값(#423) |

`infra/scripts/deploy.sh`의 필수값은 `DEPLOY_ENVIRONMENT`, `BACKEND_IMAGE`, `BACKEND_PORT`, `SPRING_PROFILES_ACTIVE`, `SPRING_MONGODB_URI`, `OPENAI_API_KEY`로 바뀌지 않았다. 알림 항목은 필수값이 아니며 `deploy.sh`는 보지 않는다.

## 계약 테스트

- `infra/tests/test_notification_deployment.py`는 `DEFAULTS`(미설정·빈 값 기본값)와 `SYNTHETIC`(주입 값)의 알림 설정(`CAREER_FORM_NOTIFICATION_ENABLED`, 발송 주기, 동시성, VAPID 시크릿 세 개)에 기본값·주입·deploy job 한정·`deploy.sh` 제외 네 검사를 돈다.
- 같은 파일의 `test_removed_role_filter_setting_is_not_passed_to_backend`는 옛 이름 `CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED`가 세 workflow와 compose 원문에 없고, 배포 환경에 그 변수가 있어도 compose 렌더 결과(dev·staging·prod)로 backend에 전달되지 않는지 검사한다.
- `infra/tests/test_bootstrap_scripts.py`는 CI/CD topic의 Current raw가 registry·DB 이름과 세 환경 이름, registration token 보관 규칙을 모두 적는지 검사하므로 이 topic을 대체하는 raw는 전체 목록을 유지해야 한다.

## 유지하는 보관 규칙

- 각 ARM64 self-hosted runner의 registration token은 일회성 값이며 저장소, 문서와 로그에 저장하지 않는다.
- VAPID 비공개키를 포함한 시크릿 값, MongoDB URI, 외부 API 키, 운영 host 주소는 이미지, 저장소, 문서, Issue·PR, 실행 로그와 Wiki에 저장하지 않는다. 이 문서도 이름만 기록한다.
- 키 생성과 Environment 등록 순서("시크릿 먼저, 토글 나중")의 Wiki 밖 정본은 `infra/WEB_PUSH_VAPID.md`다.

## 근거

- `.github/workflows/deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`의 deploy job env(Source-Revision dae7fc69)
- `infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`, `infra/WEB_PUSH_VAPID.md`
- `infra/tests/test_notification_deployment.py`, `infra/tests/test_bootstrap_scripts.py`
