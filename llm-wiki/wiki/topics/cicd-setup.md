# CI/CD 설정

> Topic: cicd-setup
> Status: Current
> Current: [CF-327 배포 설정 레버 근거](../../raw/issues/CF-327/documents/deployment-config-levers.md)
> History: [근거 1](../../raw/issues/CF-41/documents/docs/operations/cicd-setup.md), [근거 2](../../raw/issues/CF-40/documents/operations/cicd-openai-secret.md), [근거 3](../../raw/issues/CF-62/documents/operations/arm64-image-build.md), [근거 4](../../raw/issues/CF-146/documents/operations/llm-deployment-toggle.md), [CF-327 배포 설정 레버 근거](../../raw/issues/CF-327/documents/deployment-config-levers.md)
> Updated: 2026-10-23

## 현재 상태

세 deploy workflow는 같은 이름의 설정을 GitHub Environment(`development`, `staging`, `production`)별 값으로 읽는다. 변수는 `DOCKERHUB_IMAGE`(저장소), `BACKEND_PORT`, `SERVER_FORWARD_HEADERS_STRATEGY`, `CAREER_FORM_LLM_ENABLED`, `CAREER_FORM_QUALITY_ENABLED`, `CAREER_FORM_QUALITY_MANAGEMENT_URL`, `CAREER_FORM_QUALITY_DISCORD_ENABLED`, `CAREER_FORM_QUALITY_DISCORD_ENVIRONMENT`, `CAREER_FORM_QUALITY_SELECTION_DAYS`, `CAREER_FORM_QUALITY_SELECTION_MINIMUM_SAMPLE` 10개, 시크릿은 `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `OPENAI_API_KEY`(저장소), `SPRING_MONGODB_URI`, `CAREER_FORM_QUALITY_PASSWORD_HASH`, `CAREER_FORM_QUALITY_QUERY_TOKEN_HASH`, `CAREER_FORM_QUALITY_DISCORD_WEBHOOK`(환경) 7개다. 미설정 값은 `infra/compose.deploy.yaml` 기본값으로 채워지고 여기 없는 환경변수는 컨테이너에 전달되지 않는다. `deploy.sh` 필수값은 `DEPLOY_ENVIRONMENT`, `BACKEND_IMAGE`(digest 고정), `BACKEND_PORT`, `SPRING_PROFILES_ACTIVE`, `SPRING_MONGODB_URI`, `OPENAI_API_KEY`이고 환경:profile은 development:dev, staging:staging, production:prod만 허용한다. Environment 배포 브랜치 제한은 develop, release/*, main이며 production에 required reviewer를 두지 않는다.

운영에서 LLM 범용 기입은 한 번도 활성화된 적이 없다. 1.0.0 compose의 고정 true는 그 배포가 실패해 운영에 반영되지 않았고, CF-146에서 변수화하며 기본 false로 바꾼 뒤 2026-10-03에 세 환경 모두 false로 만든 변수가 바뀌지 않았다. 1.4.0은 기본 분석 공급자를 openai→jev로 바꿨는데 compose가 `OPENAI_API_KEY`만 전달하고 `TYPESAFE_API_KEY`·`CAREER_FORM_JEV_DATA_POLICY_REVIEWED` 전달 경로가 없어 변수만으로는 켤 수 없다. 운영 host는 nginx 80 포트로 `/api`와 `/quality`를 HTTP 공개 중이며 HTTPS와 도메인은 미도입이다. runner, registry, host bootstrap, ARM64 빌드 cache는 이전 근거를 따른다.

## 변경 이유

이전 topic은 `BACKEND_PORT`, `SPRING_MONGODB_URI`, `CAREER_FORM_LLM_ENABLED`만 기록해 품질 관측 설정 7개와 선택 변수가 빠져 있었고, 운영 공개 상태가 CF-41의 비공개 전제와 달라졌다. 1.4.0 릴리스에서 운영 설정 변경 필요 여부와 LLM 활성 여부를 판단하면서 workflow·compose·deploy.sh·GitHub Environment를 대조해 전체 목록과 이력을 기록했다.

## 관련 지식

- [배포 Runbook](deployment-runbook.md)
- [확장 프로그램 릴리스](extension-release.md)
- [범용 분석 provider의 JEV 단일화](jev-single-analysis-provider.md)
- [공용 모니터링 시스템](monitoring-system.md)
- Wiki 밖 정본: [브랜치와 환경](../../../harness/policies/environments.md), [GitHub 설정 체크리스트](../../../harness/policies/github-setup.md), [릴리스 브랜치 유지와 정리 운영 안내](../../../infra/RELEASE.md)
