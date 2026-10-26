# Web Push VAPID 키와 알림 기능 배포 설정

공고 구독 알림(Web Push)의 발송기는 VAPID(RFC 8292) 서명이 필요하다. 이 문서는 사람이
VAPID 키 쌍을 만들어 GitHub Environment에 넣고, 환경별로 알림 기능을 켜고, 키를 회전하는
순서를 적는다. 키 값, 호스트 주소, 계정 정보는 이 문서와 저장소, Issue, PR, Wiki, 로그에
적지 않는다. 시크릿 등록, 배포, 토글 결정은 사람이 수행하고 AI는 하지 않는다.

## 전달 경로

GitHub Environment(`development`, `staging`, `production`)의 변수·시크릿 → 세 deploy
workflow의 `deploy` job `env` → `infra/compose.deploy.yaml` → backend 컨테이너 환경변수 →
Spring `career-form.notification.*` 설정. `infra/compose.deploy.yaml`에 열거된 이름만
컨테이너에 전달되고, `infra/scripts/deploy.sh`의 필수값 목록은 바뀌지 않았다.

workflow는 Environment에 값이 없으면 빈 문자열을 넘긴다. Spring placeholder
(`${CAREER_FORM_PUSH_DISPATCH_INTERVAL:60s}`)는 변수가 비어 있어도 기본값을 쓰지 않으므로,
compose가 `${NAME:-기본값}`으로 backend `application.yml`과 같은 기본값을 채운다. 값이
하나도 없는 환경은 기능이 꺼진 채 기동한다.

## 변수와 시크릿

| 종류 | 이름 | 미설정 시 | 대응 Spring 설정 | 설명 |
|---|---|---|---|---|
| 변수 | `CAREER_FORM_NOTIFICATION_ENABLED` | `false` | `career-form.notification.enabled` | 알림 기능 토글. `true`일 때만 발송기와 `/api/v1/notifications/*`가 뜬다 |
| 변수(선택) | `CAREER_FORM_PUSH_DISPATCH_INTERVAL` | `60s` | `career-form.notification.push.dispatch-interval` | 발송 주기, 10s 이상 1h 이하 |
| 변수(선택) | `CAREER_FORM_PUSH_CONCURRENCY` | `20` | `career-form.notification.push.concurrency` | 동시 발송 수, 1 이상 200 이하 |
| 시크릿 | `CAREER_FORM_PUSH_VAPID_PUBLIC_KEY` | 빈 값 | `career-form.notification.push.vapid.public-key` | base64url 공개키(65바이트 비압축 P-256, 87자) |
| 시크릿 | `CAREER_FORM_PUSH_VAPID_PRIVATE_KEY` | 빈 값 | `career-form.notification.push.vapid.private-key` | base64url 비공개키(32바이트 스칼라, 43자) |
| 시크릿 | `CAREER_FORM_PUSH_VAPID_SUBJECT` | 빈 값 | `career-form.notification.push.vapid.subject` | 운영 연락처 `mailto:` URI |

토글이 `true`인데 시크릿 세 개 중 하나라도 비어 있거나 형식이 다르면 backend가 기동에
실패하고 `deploy.sh`가 이전 digest로 되돌린다. 시크릿을 먼저 등록하고 토글은 나중에 켠다.

## 키 생성과 Environment 등록 (사람)

1. 로컬 터미널에서 키 쌍을 만든다. 서버나 CI에서 만들지 않는다.

   ```bash
   npx web-push generate-vapid-keys
   ```

   출력의 `Public Key`(87자)와 `Private Key`(43자)는 화면에서 다음 단계의 입력란으로 바로
   옮기고 파일, 메모, 채팅, Issue, PR에 남기지 않는다. 옮긴 뒤 터미널 출력을 지운다.
2. 환경마다 별도 키 쌍으로 시크릿 세 개를 등록한다. Settings → Environments → 해당 환경 →
   Secrets에서 넣거나, 아래 명령으로 값을 프롬프트에 입력한다. subject는 `mailto:` 뒤에
   운영 담당 메일 주소를 적는다.

   ```bash
   gh secret set CAREER_FORM_PUSH_VAPID_PUBLIC_KEY --env development
   gh secret set CAREER_FORM_PUSH_VAPID_PRIVATE_KEY --env development
   gh secret set CAREER_FORM_PUSH_VAPID_SUBJECT --env development
   ```

3. 토글은 아직 만들지 않거나 `false`로 둔 채 한 번 배포해 `/actuator/health`가 `UP`인지
   확인한다.
4. 변수 `CAREER_FORM_NOTIFICATION_ENABLED`를 `true`로 만들고 다시 배포한다. 변수와 시크릿은
   배포 시점에 읽히므로 바꾼 뒤 새 배포가 있어야 컨테이너에 반영된다.

   ```bash
   gh variable set CAREER_FORM_NOTIFICATION_ENABLED --env development --body true
   ```

5. 배포 뒤 `/actuator/health`가 `UP`이고 기동 로그에 알림 설정 오류가 없으며
   `GET /api/v1/notifications/vapid-public-key`가 등록한 공개키를 돌려주는지 확인한다.
   토글이 꺼져 있으면 이 경로는 404다.

재배포 트리거는 환경마다 다르다.

| 환경 | 재배포 방법 |
|---|---|
| development | `backend/**`, `compose.yaml`, `infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`, 배포 workflow 중 하나를 바꾸는 `develop` push |
| staging | `release/**` push 또는 `스테이징 환경 배포` workflow를 release 브랜치에서 수동 실행 |
| production | `main` 병합(릴리스 또는 hotfix) |

## 스테이징 활성화 점검 순서

1. `staging` Environment에 시크릿 세 개를 등록한다.
2. staging을 배포하고 `/actuator/health`를 확인한다.
3. `CAREER_FORM_NOTIFICATION_ENABLED=true`로 다시 배포하고 health와 기동 로그를 확인한다.
4. `[FE]` #349의 스테이징 빌드 확장으로 구독한 뒤 합성 공고 한 건으로 FCM 수락 로그와
   확장 수신을 종단 확인한다.

## 운영 활성화와 릴리스 점검표

운영 토글은 릴리스 승인 시 사람이 결정한다. 릴리스 PR 병합 전 점검에 다음을 함께 확인한다.

- 운영 설정에 새 필수값이 없는지(`infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`,
  deploy workflow를 `main`과 diff).
- 이번 릴리스에서 운영 알림 토글(`CAREER_FORM_NOTIFICATION_ENABLED`)을 켤지. 켠다면
  `production` 시크릿 세 개가 등록돼 있고 staging 종단 확인을 마쳤는지.

## 공개키 배포

확장은 공개키를 빌드에 넣지 않고 `GET /api/v1/notifications/vapid-public-key`로 받아
구독한다. 키를 등록하거나 바꿔도 확장 재빌드와 스토어 재심사가 필요 없다.

## 키 회전

회전은 유출이 의심될 때만 수행한다. 새 키 쌍을 만들어 시크릿 세 개를 교체하고 배포하면
기존 구독 전부가 무효가 된다(푸시 서비스가 이전 키로 만든 구독에 새 키 서명을 거부한다).
확장이 새 공개키로 다시 구독할 때까지 알림이 가지 않으므로 회전 전에 팀에 공지하고, 이전
키는 교체 뒤 폐기한다.
