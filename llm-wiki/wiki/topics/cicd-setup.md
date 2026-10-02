# CI/CD 설정

> Topic: cicd-setup
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-146/documents/operations/llm-deployment-toggle.md)
> History: [근거 1](../../raw/issues/CF-41/documents/docs/operations/cicd-setup.md), [근거 2](../../raw/issues/CF-40/documents/operations/cicd-openai-secret.md), [근거 3](../../raw/issues/CF-62/documents/operations/arm64-image-build.md), [근거 4](../../raw/issues/CF-146/documents/operations/llm-deployment-toggle.md)
> Updated: 2026-10-02

## 현재 상태

GitHub Environment, runner, registry와 원격 host의 준비 계약을 따른다. `development`,
`staging`, `production`의 deploy job은 공용 GitHub Repository Secret
`OPENAI_API_KEY`를 backend 컨테이너까지 전달한다. 범용 기입 활성 여부는 환경별
`CAREER_FORM_LLM_ENABLED` 변수로 결정하며 미설정·빈값은 비활성화한다. 비활성 상태에도
API key 필수 조건과 정적 회사 정책 경로는 유지한다. x86_64 GitHub-hosted
runner의 ARM64 image build는 workflow가 만든 JAR를 재사용하고 `backend-arm64` BuildKit cache를
사용한다.

## 변경 이유

운영 설정 문서를 stable topic 경로로 옮긴 뒤, 모든 원격 환경에서 같은 LLM 실행 규칙을
적용했다. 이후 QEMU에서 중복 Gradle 컴파일이 발생하지 않도록 native JAR 재사용과 ARM64 cache
범위를 추가했다. CF-146에서는 고정 활성값을 제거하여 환경별로 범용 기입을 선택하고,
누락된 변수는 비활성화하도록 바꿨다. API key 값은 저장소와 실행 로그에 남기지 않는다.
