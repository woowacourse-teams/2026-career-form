# ARM64 이미지 빌드 최적화

> Issue: CF-62
> 결정일: 2026-08-27

## 결정

GitHub-hosted x86_64 runner가 `linux/arm64` 이미지를 만들 때 애플리케이션 JAR는 workflow의
네이티브 `./gradlew clean check bootJar` 단계에서 한 번 생성한다. Dockerfile은
`build/libs/*.jar`를 입력으로 받아 Spring Boot layer를 추출하며 Dockerfile 안에서 Gradle을
실행하지 않는다.

development, staging, production hotfix image build는 `backend-arm64` scope의 GitHub Actions
BuildKit cache를 import/export한다. production release 경로는 검증된 staging image digest를
조회할 뿐 이미지를 새로 빌드하지 않으므로 cache를 사용하지 않는다.

## 이유

ARM64 Docker build를 x86_64 runner에서 수행하면 QEMU가 ARM64 명령을 에뮬레이션한다.
Dockerfile 안의 Gradle 컴파일은 이 에뮬레이션에서 느려지는 반면, 실행 JAR는 CPU 아키텍처에
독립적이므로 workflow의 네이티브 Gradle 결과를 안전하게 재사용할 수 있다.

`build/` 전체를 context에 넣지 않고 실행 JAR만 다시 포함해 불필요한 산출물의 이미지 context
유입을 막는다.

## 유지하는 계약

- 최종 이미지는 `linux/arm64`이며 기존 image digest 출력과 deploy job 입력을 유지한다.
- Spring Boot의 dependencies, spring-boot-loader, snapshot-dependencies, application layer
  분리와 `careerform` non-root runtime user를 유지한다.
- 실제 image push, 환경 배포와 배포 결과 확인은 workflow와 사람이 담당한다.

## 검증 근거

네이티브 `clean check bootJar` 뒤 `docker buildx build --platform linux/arm64 --load`로 image를
생성하고, image inspect에서 `linux/arm64`, `careerform:careerform`, `java -jar application.jar`
명령을 확인한다. 실제 GitHub Actions 실행에서는 image push와 digest 전달, cache import/export,
그리고 기준 실행과의 시간 비교를 확인한다.
