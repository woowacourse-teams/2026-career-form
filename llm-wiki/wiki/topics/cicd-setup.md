# CI/CD 설정

> Topic: cicd-setup
> Status: Current
> Current: [CF-350 알림 토글과 VAPID 시크릿의 배포 설정 레버](../../raw/issues/CF-350/documents/notification-deployment-levers.md)
> History: [근거 1](../../raw/issues/CF-41/documents/docs/operations/cicd-setup.md), [근거 2](../../raw/issues/CF-40/documents/operations/cicd-openai-secret.md), [근거 3](../../raw/issues/CF-62/documents/operations/arm64-image-build.md), [근거 4](../../raw/issues/CF-146/documents/operations/llm-deployment-toggle.md), [CF-327 배포 설정 레버 근거](../../raw/issues/CF-327/documents/deployment-config-levers.md), [CF-350 알림 토글과 VAPID 시크릿의 배포 설정 레버](../../raw/issues/CF-350/documents/notification-deployment-levers.md)
> Updated: 2026-10-26

## 현재 상태

세 deploy workflow는 같은 이름의 설정을 GitHub Environment(`development`, `staging`, `production`)별 값으로 읽는다. 변수는 `DOCKERHUB_IMAGE`(저장소), `BACKEND_PORT`, `SERVER_FORWARD_HEADERS_STRATEGY`, `CAREER_FORM_LLM_ENABLED`, `CAREER_FORM_QUALITY_ENABLED`, `CAREER_FORM_QUALITY_MANAGEMENT_URL`, `CAREER_FORM_QUALITY_DISCORD_ENABLED`, `CAREER_FORM_QUALITY_DISCORD_ENVIRONMENT`, `CAREER_FORM_QUALITY_SELECTION_DAYS`, `CAREER_FORM_QUALITY_SELECTION_MINIMUM_SAMPLE`, `CAREER_FORM_NOTIFICATION_ENABLED`, `CAREER_FORM_PUSH_DISPATCH_INTERVAL`, `CAREER_FORM_PUSH_CONCURRENCY` 13개, 시크릿은 `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `OPENAI_API_KEY`(저장소), `SPRING_MONGODB_URI`, `CAREER_FORM_QUALITY_PASSWORD_HASH`, `CAREER_FORM_QUALITY_QUERY_TOKEN_HASH`, `CAREER_FORM_QUALITY_DISCORD_WEBHOOK`, `CAREER_FORM_PUSH_VAPID_PUBLIC_KEY`, `CAREER_FORM_PUSH_VAPID_PRIVATE_KEY`, `CAREER_FORM_PUSH_VAPID_SUBJECT`(환경) 10개다. 미설정 값은 `infra/compose.deploy.yaml` 기본값으로 채워지고 여기 없는 환경변수는 컨테이너에 전달되지 않는다. `deploy.sh` 필수값은 `DEPLOY_ENVIRONMENT`, `BACKEND_IMAGE`(digest 고정), `BACKEND_PORT`, `SPRING_PROFILES_ACTIVE`, `SPRING_MONGODB_URI`, `OPENAI_API_KEY`이고 환경:profile은 development:dev, staging:staging, production:prod만 허용한다. Environment 배포 브랜치 제한은 develop, release/*, main이며 production에 required reviewer를 두지 않는다.

운영에서 LLM 범용 기입은 한 번도 활성화된 적이 없다. 1.0.0 compose의 고정 true는 그 배포가 실패해 운영에 반영되지 않았고, CF-146에서 변수화하며 기본 false로 바꾼 뒤 2026-10-03에 세 환경 모두 false로 만든 변수가 바뀌지 않았다. 1.4.0은 기본 분석 공급자를 openai→jev로 바꿨는데 compose가 `OPENAI_API_KEY`만 전달하고 `TYPESAFE_API_KEY`·`CAREER_FORM_JEV_DATA_POLICY_REVIEWED` 전달 경로가 없어 변수만으로는 켤 수 없다. 운영 host는 nginx 80 포트로 `/api`와 `/quality`를 HTTP 공개 중이며 HTTPS와 도메인은 미도입이다. runner, registry, host bootstrap, ARM64 빌드 cache는 이전 근거를 따른다.

공고 구독 알림(Web Push)은 `CAREER_FORM_NOTIFICATION_ENABLED`(기본 false)로 켜고, 켤 환경에는 VAPID 시크릿 세 개를 먼저 등록해야 한다. 토글이 true인데 시크릿이 비어 있으면 backend가 기동에 실패해 `deploy.sh`가 이전 digest로 되돌린다. 선택값 `CAREER_FORM_PUSH_DISPATCH_INTERVAL`(60s)·`CAREER_FORM_PUSH_CONCURRENCY`(20)의 기본값은 compose가 backend `application.yml`과 같게 채운다. workflow는 Environment 값이 없으면 빈 문자열을 넘기고 Spring placeholder는 빈 문자열에 기본값을 적용하지 않기 때문이다. Environment 변수·시크릿은 배포 시점에 읽히므로 바꾼 뒤 새 배포가 있어야 반영되고, development는 workflow_dispatch가 없어 paths 필터에 걸리는 develop push가 필요하다. 키 생성·등록·회전 절차는 [Web Push VAPID 키와 알림 기능 배포 설정](../../../infra/WEB_PUSH_VAPID.md)을 따른다([CF-350 근거](../../raw/issues/CF-350/documents/notification-deployment-levers.md)).

## 변경 이유

이전 topic은 `BACKEND_PORT`, `SPRING_MONGODB_URI`, `CAREER_FORM_LLM_ENABLED`만 기록해 품질 관측 설정 7개와 선택 변수가 빠져 있었고, 운영 공개 상태가 CF-41의 비공개 전제와 달라졌다. 1.4.0 릴리스에서 운영 설정 변경 필요 여부와 LLM 활성 여부를 판단하면서 workflow·compose·deploy.sh·GitHub Environment를 대조해 전체 목록과 이력을 기록했다. CF-350에서 `[BE]` #348 발송기의 VAPID 서명에 필요한 알림 토글과 시크릿 전달 경로를 세 환경에 추가하며 변수 13개, 시크릿 10개로 목록을 갱신하고, 빈 문자열과 Spring placeholder 기본값의 관계를 기록했다.

## 관련 지식

- [배포 Runbook](deployment-runbook.md)
- [확장 프로그램 릴리스](extension-release.md)
- [범용 분석 provider의 JEV 단일화](jev-single-analysis-provider.md)
- [공용 모니터링 시스템](monitoring-system.md)
- Wiki 밖 정본: [브랜치와 환경](../../../harness/policies/environments.md), [GitHub 설정 체크리스트](../../../harness/policies/github-setup.md), [릴리스 브랜치 유지와 정리 운영 안내](../../../infra/RELEASE.md), [Web Push VAPID 키와 알림 기능 배포 설정](../../../infra/WEB_PUSH_VAPID.md)
