# 범용 기입 활성 여부 배포 설정

> Issue: CF-146
> 결정일: 2026-10-02

## 결정과 이유

`development`, `staging`, `production`의 범용 기입 활성 여부는 GitHub Actions 변수
`CAREER_FORM_LLM_ENABLED`로 결정한다. 고정 활성값을 제거하여 정적 회사 정책만 제공할
환경을 별도 코드 변경 없이 선택할 수 있게 한다.

각 GitHub Environment의 Variables에 값을 설정하고, 세 workflow의 `deploy` job만
`${{ vars.CAREER_FORM_LLM_ENABLED }}`를 실행 환경에 주입한다. 기존 `deploy.sh`를 거쳐
`infra/compose.deploy.yaml`의 `${CAREER_FORM_LLM_ENABLED:-false}`가 backend 환경값을
결정한다. 값이 없거나 비어 있으면 `false`이며, `true`인 환경에서 범용 기입을 활성화한다.

## 유지하는 계약

- 범용 기입 비활성화는 정적 회사 정책 경로를 끄지 않는다.
- `OPENAI_API_KEY`는 범용 기입 비활성화 여부와 관계없이 기존 배포 필수값이다.
  공용 Repository Secret을 세 deploy job에서만 backend 컨테이너에 전달한다.
- GitHub-hosted x86_64 runner의 네이티브 `clean check bootJar` 결과를 ARM64 image build에서
  재사용하고 `backend-arm64` BuildKit cache를 유지한다. production release는 검증된
  staging digest를 재사용한다.
- Repository Variable `DOCKERHUB_IMAGE`와 Repository Secret `DOCKERHUB_USERNAME`,
  `DOCKERHUB_TOKEN`은 기존 GitHub-hosted build job의 registry login과 image push에 사용한다.
- 환경별 `BACKEND_PORT`, `SPRING_MONGODB_URI` 주입 경로는 유지한다. 각 ARM64 self-hosted
  runner의 registration token은 일회성 값이며 저장소, 문서와 로그에 저장하지 않는다.
- 실제 시크릿은 이미지, 저장소, 문서, Issue·PR과 실행 로그에 기록하지 않는다.

## 검증과 운영 책임

실제 Docker Compose config를 합성 환경값으로 실행하여 활성 변수 미설정·빈값에서 `false`,
`true` 주입 시 `true`인 것을 확인한다. 기존 infra 배포 계약 및 백엔드의 비활성 상태 정적
회사 정책 테스트도 유지한다.

환경별 변수 설정과 실제 배포는 사람이 수행한다. 배포 후 범용 경로의 `LLM_UNAVAILABLE`과
정적 회사 정책 경로의 `ADAPTER` 응답을 확인한다. 이 변경의 로컬 검증은 실제 배포나
외부 모델 호출을 수행하지 않는다.
