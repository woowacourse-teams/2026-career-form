# CI/CD 설정

> Topic: cicd-setup
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-40/documents/operations/cicd-openai-secret.md)
> History: [근거 1](../../raw/issues/CF-41/documents/docs/operations/cicd-setup.md), [근거 2](../../raw/issues/CF-40/documents/operations/cicd-openai-secret.md)
> Updated: 2026-08-27

## 현재 상태

GitHub Environment, runner, registry와 원격 host의 준비 계약을 따른다. `development`,
`staging`, `production`의 deploy job은 공용 GitHub Repository Secret
`OPENAI_API_KEY`를 backend 컨테이너까지 전달하고 LLM을 활성화한다.

## 변경 이유

운영 설정 문서를 stable topic 경로로 옮긴 뒤, 모든 원격 환경에서 같은 LLM 실행 규칙을
적용했다. API key 값은 저장소와 실행 로그에 남기지 않는다.
