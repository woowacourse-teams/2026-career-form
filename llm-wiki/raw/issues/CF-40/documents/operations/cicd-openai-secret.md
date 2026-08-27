# 공용 OpenAI Secret 기반 원격 LLM 실행

> Issue: CF-40
> 결정일: 2026-08-27

## 결정

CF-41의 GitHub Environment, runner, registry와 원격 host 준비 계약을 유지한다. 여기에
LLM 실행 규칙을 추가한다.

- `development`, `staging`, `production` workflow의 `deploy` job만 GitHub Repository
  Secret `OPENAI_API_KEY`를 프로세스 환경에 주입한다.
- `infra/compose.deploy.yaml`은 이 환경 변수를 backend 컨테이너로 전달하고,
  `CAREER_FORM_LLM_ENABLED=true`로 LLM을 항상 활성화한다.
- Spring은 별도 환경 변수가 없을 때 `gpt-5.6-luna`, timeout 10초, retry 1회,
  completion token 2048을 기본값으로 사용한다.
- 로컬 전용 `.env.local`은 원격 배포에 복사하거나 사용하지 않는다.

## GitHub 구성 기준

Repository Variable `DOCKERHUB_IMAGE`은 private image repository를 가리킨다. Repository
Secret `DOCKERHUB_USERNAME`과 `DOCKERHUB_TOKEN`은 GitHub-hosted build job의 registry
login과 image push에만 사용한다.

`development`, `staging`, `production` GitHub Environment마다 Environment Variable
`BACKEND_PORT`와 Environment Secret `SPRING_MONGODB_URI`를 둔다. `OPENAI_API_KEY`는
환경별 값이 아니라 공용 Repository Secret이다.

각 application host의 self-hosted runner는 신뢰된 branch의 deploy job에서만 사용한다.
GitHub가 표시하는 runner registration token은 일회성이므로 파일, 셸 history, 문서에
저장하지 않는다.

## 보안과 운영 경계

API key의 실제 값은 이미지, 저장소, 문서, Issue·PR, workflow 출력, Compose 설정 출력에
기록하지 않는다. 배포 실행, Secret 값 확인, 실제 provider smoke test는 사람이 수행한다.

## 검증 근거

workflow 계약 테스트는 세 deploy job에만 Repository Secret이 주입되는지 확인한다.
Compose 계약 테스트는 합성 key로 backend 환경 변수 전달과 LLM 활성화를 확인한다.
배포 스크립트 테스트는 key가 없을 때 Docker 호출 전에 중단되는지 확인한다.
