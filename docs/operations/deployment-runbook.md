# 배포 운영 Runbook

배포 workflow는 이미지를 `linux/arm64`로 빌드하고 전체 commit SHA tag로 push한 뒤
registry digest를 배포 식별자로 사용한다. application host에서는 신뢰된 push commit을
checkout해 `infra/scripts/deploy.sh`를 실행한다.

## 자동 실행 경로

| 이벤트 | 결과 |
|---|---|
| backend 변경 PR | Java 21 `clean check bootJar` |
| `develop` push | 새 image build/push 후 development 배포 |
| Start release 실행 | `release/<version>`과 main 대상 Draft PR 생성 후 staging workflow 명시적 dispatch |
| `release/*` push | 새 image build/push 후 staging 배포 |
| `release/*` → `main` Merge Commit | staging의 release head SHA digest를 production으로 재사용 |
| `hotfix/CF-*` → `main` Squash Merge | main SHA image를 새로 빌드해 production으로 직접 배포 |
| production 성공 | release tag와 필요한 동기화 PR 생성 |
| production 실패 | 이전 digest rollback 후 Draft revert PR 생성 |
| `revert/*` → `main` | 재배포 없이 rollback된 서버와 main 소스 상태 정렬 |

## 최초 배포

1. [CI/CD 초기 설정](cicd-setup.md)의 secret, variable, runner와 host 점검을 끝낸다.
2. development workflow를 실행할 backend 또는 배포 구성 변경을 `develop`에 병합한다.
3. build job의 full SHA tag와 digest 출력, deploy job의 readiness 성공을 확인한다.
4. host에서 실제 secret 값을 출력하지 않고 다음 상태 파일의 존재만 확인한다.

```bash
sudo find /var/lib/career-form/deploy -maxdepth 2 \
  -type f -name '*-digest' -printf '%p\n'
```

최초 배포에는 `previous-digest`가 없다. readiness가 실패하면 자동 복구 대상이 없으므로
workflow가 실패하고 사람이 MongoDB, network, profile, port와 container log를 확인한다.

## Release 배포

1. Actions에서 `릴리스 시작` workflow를 실행하고 선행 0 없는 `MAJOR.MINOR.PATCH`를
   입력한다.
2. 생성된 Draft PR과 staging 배포 성공을 확인한다.
3. `/actuator/health`가 `UP`인지 확인한 뒤 사람이 staging 수동 E2E를 수행한다.
4. PR을 Ready로 전환하고 승인받은 뒤 Merge Commit으로 main에 병합한다.
5. production workflow가 staging과 같은 digest를 사용했는지 확인한다.
6. 자동 생성된 `v<version>` tag와 `release/*` → `develop` 동기화 PR을 확인한다.
7. 동기화 PR을 Merge Commit으로 병합하면 release 브랜치 정리 workflow가 실행된다.

동시에 활성 `release/*`는 하나만 허용한다. staging 검증 중 일반 개발은 develop에서
계속하고, 릴리스 수정은 대상 release에서 `CF-*`를 분기해 반영한다.

## Hotfix 배포

1. main에서 `hotfix/CF-<Issue 번호>`를 분기한다.
2. PR CI와 사람 승인을 통과한 뒤 main에 Squash Merge한다.
3. production workflow가 main merge SHA의 새 image를 빌드하고 직접 배포한다.
4. 성공 후 생성된 `main` → `develop` PR과 활성 release가 있다면 `main` →
   `release/*` PR을 확인하고 각각 Merge Commit으로 병합한다.

hotfix label은 사용하지 않으며 staging을 우회한다. 일반 `CF-*` 브랜치는 main으로 병합할
수 없다.

## Readiness와 자동 rollback

배포 스크립트는 다음 순서를 수행한다.

1. digest image pull
2. Compose 설정을 `config --quiet`으로 검증
3. `up --detach --no-build backend`
4. 요청별 timeout을 두고 loopback `/actuator/health`를 5초 간격, 전체 최대 120초 확인
5. 성공 시 `current-digest`와 `previous-digest`를 atomic하게 갱신

새 image가 준비되지 않으면 기존 `current-digest`를 다시 올리고 readiness를 재확인한다.
rollback이 성공해도 원래 workflow는 실패 상태를 유지한다. development와 staging이 같은
host를 사용하므로 image 정리는 host의 모든 환경 current/previous digest를 보존하며,
실패한 신규 digest도 rollback 성공 직후 정리한다.

production 실패 시 CI가 `revert/<main-merge-sha>` Draft PR을 만든다. 사람은 다음을
확인한 뒤에만 승인·병합한다.

- 서버가 직전 digest로 실제 복구됐는지
- revert commit이 실패한 main 변경만 취소하는지
- MongoDB schema나 외부 상태처럼 코드 revert로 복구되지 않는 변경이 없는지
- 실패 원인과 후속 수정 계획이 기록됐는지

rollback 자체도 실패하면 workflow log의 `manual recovery is required`를 확인하고 신규
배포를 중단한다. host의 state 파일에서 직전 digest 이름만 확인한 뒤 보안 채널로 환경값을
주입해 `deploy.sh`를 재실행하거나 Docker Compose를 복구한다. 실제 URI와 credential을
명령 history, Issue, PR 또는 공유 로그에 남기지 않는다.

## 재실행과 진단

같은 workflow run을 재실행하면 동일 SHA tag 또는 release digest를 다시 사용한다. 성공한
digest를 재배포해도 state 파일은 손상되지 않는다. main push workflow를 수동 dispatch로
우회하지 않고 원래 실패 run의 job을 재실행한다.

민감값을 출력하지 않는 진단 명령만 사용한다.

```bash
docker ps --filter 'name=career-form-'
docker compose --project-name career-form-development ps
docker compose --project-name career-form-staging ps
curl --fail --silent --show-error http://127.0.0.1:<port>/actuator/health
```

`docker compose config`는 해석된 URI를 출력할 수 있으므로 운영 진단에서도 `--quiet`을
생략하지 않는다. 지원서 값, 계정 정보, MongoDB URI와 browser session 정보는 workflow
log, Issue와 PR에 복사하지 않는다.
