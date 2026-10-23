# 배포 설정 레버 전체와 운영 LLM 비활성 이력

> Issue: CF-327
> Collected: 2026-10-23
> Approval-Digest: 460019c1c58c3248f460202a9b0e81f8fa783ffef0981abc96f7bccb2ae237f0
> Source-Revision: 82bcb5cd7e384096ee9b6f70e7f71803ed561af6

이 문서는 2026-10-23에 승인된 CF-327 후보 5를 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. CF-146의 LLM 활성 변수 결정을 포함해 현재 workflow가 실제로 쓰는 설정 전체로 확장하며, runner·registry·host 준비 절차처럼 바꾸지 않은 내용은 CF-41 CI/CD 초기 설정과 CF-146 문서를 따른다. 변수와 시크릿은 이름만 기록하고 값, host 주소, 포트 값은 기록하지 않는다.

## 승인 후보

배포 설정 레버 전체(이름만): Environment vars 10개 — `DOCKERHUB_IMAGE`(저장소 변수), `BACKEND_PORT`, `SERVER_FORWARD_HEADERS_STRATEGY`, `CAREER_FORM_LLM_ENABLED`, `CAREER_FORM_QUALITY_ENABLED`, `CAREER_FORM_QUALITY_MANAGEMENT_URL`, `CAREER_FORM_QUALITY_DISCORD_ENABLED`, `CAREER_FORM_QUALITY_DISCORD_ENVIRONMENT`, `CAREER_FORM_QUALITY_SELECTION_DAYS`, `CAREER_FORM_QUALITY_SELECTION_MINIMUM_SAMPLE`; secrets 7개 — `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`(저장소), `SPRING_MONGODB_URI`, `OPENAI_API_KEY`(저장소), `CAREER_FORM_QUALITY_PASSWORD_HASH`, `CAREER_FORM_QUALITY_QUERY_TOKEN_HASH`, `CAREER_FORM_QUALITY_DISCORD_WEBHOOK`. 미설정 값은 compose 기본값(forward headers none, discord env prod, selection 7일·20건, quality false)으로 채워진다. deploy.sh 필수값은 `DEPLOY_ENVIRONMENT`, `BACKEND_IMAGE`(digest 고정), `BACKEND_PORT`, `SPRING_PROFILES_ACTIVE`, `SPRING_MONGODB_URI`, `OPENAI_API_KEY`이고 환경:profile은 development:dev, staging:staging, production:prod만 허용한다. Environment 배포 브랜치 제한은 develop, release/*, main이며 production에 required reviewer를 두지 않는다. LLM 이력: 1.0.0 compose는 `CAREER_FORM_LLM_ENABLED`를 true로 고정했으나 그 배포는 실패해 운영에 반영되지 않았고, CF-146(1.1.0)에서 변수화하며 기본 false로 바꿨다. 2026-10-03에 세 환경 모두 false로 변수를 만든 뒤 변경이 없고 1.2.0(10-12)·1.3.0(10-14) 운영 배포 로그에도 false가 찍혀 운영에서 LLM 범용 기입은 한 번도 활성화된 적이 없다. 1.4.0은 기본 공급자를 openai→jev로 바꿨는데 compose는 `OPENAI_API_KEY`만 전달하고 `TYPESAFE_API_KEY`·`CAREER_FORM_JEV_DATA_POLICY_REVIEWED` 전달 경로가 없어 변수만으로는 켤 수 없다. 운영 공개 상태: nginx 80 포트로 `/api`와 `/quality`를 HTTP 공개 중이고 HTTPS는 미도입이다(기존 runbook의 '도메인 도입 전 비공개 운영' 서술 정정).

## workflow가 읽는 변수와 시크릿

세 deploy workflow(`deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`)는 같은 이름을 쓰고 GitHub Environment(`development`, `staging`, `production`)별 값만 다르다.

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
| secret | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | 저장소 | registry login, digest 조회 |
| secret | `SPRING_MONGODB_URI` | 환경 | 환경 전용 DB 연결 |
| secret | `OPENAI_API_KEY` | 저장소 | deploy.sh 필수값(LLM 비활성에도 필요) |
| secret | `CAREER_FORM_QUALITY_PASSWORD_HASH`, `CAREER_FORM_QUALITY_QUERY_TOKEN_HASH` | 환경 | 품질 관리 화면 인증 |
| secret | `CAREER_FORM_QUALITY_DISCORD_WEBHOOK` | 환경(선택) | Discord 알림 |

`infra/compose.deploy.yaml`은 위 값을 `${NAME:-기본값}` 또는 `${NAME:?required}`로 받고, `CAREER_FORM_QUALITY_VERSION`에 `BACKEND_IMAGE`를 넣는다. OTEL 설정은 host의 `/etc/career-form/otel/<profile>.env`(선택 env_file)에서 읽는다. 여기 없는 환경변수는 컨테이너에 전달되지 않는다.

## deploy.sh 계약

- 필수: `DEPLOY_ENVIRONMENT`, `BACKEND_IMAGE`(`repo@sha256:<64hex>` 형식), `BACKEND_PORT`(1024–65535), `SPRING_PROFILES_ACTIVE`, `SPRING_MONGODB_URI`, `OPENAI_API_KEY`
- 허용 조합: `development:dev`, `staging:staging`, `production:prod`
- 조정값(workflow는 설정하지 않음): `DEPLOY_STATE_DIR`, `READINESS_ATTEMPTS`, `READINESS_INTERVAL_SECONDS`, `READINESS_TIMEOUT_SECONDS`, `READINESS_REQUEST_TIMEOUT_SECONDS`, `DEPLOY_RUNNER_GROUP`

## GitHub Environment 설정

- deployment branch 제한: `development`=develop, `staging`=release/*, `production`=main
- production에 required reviewer를 두지 않는다(main 병합 직후 자동 배포 정책). 승인은 PR 단계에서 사람이 한다.
- 2026-10-23 조회 기준 세 환경 모두 `BACKEND_PORT`, `CAREER_FORM_LLM_ENABLED`, `CAREER_FORM_QUALITY_ENABLED`, `CAREER_FORM_QUALITY_DISCORD_ENABLED`가 있고 staging·production에 `CAREER_FORM_QUALITY_MANAGEMENT_URL`이 추가로 있다. 선택 변수 4개는 설정하지 않아 compose 기본값으로 동작한다.

## 운영 LLM 비활성 이력

| 시점 | 설정 | 운영 결과 |
|---|---|---|
| 1.0.0 (2026-10-01) | compose에 `CAREER_FORM_LLM_ENABLED: "true"` 고정 | 운영 배포 실패. 최초 배포라 rollback 대상이 없어 운영에 반영되지 않음 |
| CF-146 → 1.1.0 (10-03) | 고정값 제거, Environment 변수로 전환, 미설정 시 false | 운영 배포 실패 |
| 2026-10-03 | development·staging·production에 변수 생성, 값 false. 이후 수정 이력 없음 | — |
| 1.2.0 (10-12) | 배포 로그 `CAREER_FORM_LLM_ENABLED: false` | 첫 성공 배포 |
| 1.3.0 (10-14) | 배포 로그 `CAREER_FORM_LLM_ENABLED: false` | 운영 |

운영에서 LLM 범용 기입은 한 번도 활성화된 적이 없다. 코드에는 1.0.0부터 OpenAI 기반 범용 경로가 있었고 비활성 상태에서는 `LLM_UNAVAILABLE`로 끝나며 정적 회사 정책 경로만 동작한다. staging·development도 false라 Jev 경로는 로컬에서만 검증됐다.

## 1.4.0에서 변수만으로 켤 수 없는 이유

`backend/src/main/resources/application.yml`의 `career-form.analysis.provider` 기본값이 1.4.0에서 `openai`→`jev`로 바뀌었다. Jev는 `TYPESAFE_API_KEY`와 데이터 정책 확인(`CAREER_FORM_JEV_DATA_POLICY_REVIEWED`)이 필요한데 `infra/compose.deploy.yaml`과 deploy workflow는 `OPENAI_API_KEY`만 전달한다. `CAREER_FORM_LLM_ENABLED=true`만 바꾸면 키 없는 Jev가 선택돼 범용 기입이 실패한다. 켜려면 workflow→`deploy.sh`→compose에 Jev 키와 정책 확인 값을 전달하는 infra 변경과 사람의 데이터 정책 확인이 먼저 필요하다. `CAREER_FORM_ANALYSIS_PROVIDER=openai`로 되돌리는 것도 같은 이유로 compose 변경 없이는 불가능하다.

## 운영 공개 상태

CF-41 Runbook은 "도메인 도입 전 비공개 운영"을 전제로 쓰였지만, 2026-10-23 기준 운영 host는 nginx가 80 포트에서 `/api`와 `/quality`를 외부에 HTTP로 전달한다. HTTPS와 도메인은 도입되지 않았다. 확장은 이 HTTP origin으로 빌드돼 있어 HTTPS 전환 시 확장 재빌드·재심사가 함께 필요하다. nginx 설정 파일은 저장소에 없고 host에만 있다.

## 근거

- `.github/workflows/deploy-development.yml`, `deploy-staging.yml`, `deploy-production.yml`의 build/deploy job env
- `infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`
- `backend/src/main/resources/application.yml`(analysis·jev·llm 항목), `backend/docs/analysis-providers.md`
- `backend/src/main/java/com/careerform/formanalysis/infrastructure/AnalysisProviderSelection.java`
- GitHub Environment 변수 메타데이터(생성·수정 시각)와 운영 배포 run 로그의 env 출력(2026-10-23 조회)
- `llm-wiki/raw/issues/CF-146/documents/operations/llm-deployment-toggle.md`, `llm-wiki/raw/issues/CF-41/documents/docs/operations/cicd-setup.md`
