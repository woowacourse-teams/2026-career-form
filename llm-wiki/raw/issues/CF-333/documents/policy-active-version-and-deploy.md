# 정책 활성 버전은 seeder가 바꾸지 않는다: 검증 환경과 배포 뒤 전환

> Issue: CF-333
> Collected: 2026-10-24
> Approval-Digest: e3220900fa34d5fd1ee3718f11713ef2c78fa8bbdb93741c0fa6e1be570f8e41
> Source-Revision: fe786252f656a3e551a55bfa1825032e2366a086

이 문서는 2026-10-24 테스트 전용 모드 전환에서 승인된 CF-333 후보 3을 배포 runbook 관점에서 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 배포 파이프라인 자체는 바꾸지 않으며, 바꾸지 않은 내용은 Supersedes가 가리키는 CF-323 릴리스 시작 기준 커밋 선택을 따른다. 호스트 주소, 계정, 시크릿은 포함하지 않는다.

## 승인 후보

새 서버 정책 검증은 dev가 아니라 새 볼륨 로컬 스택으로 한다. seeder는 기존 DB의 활성 버전을 바꾸지 않기 때문이다.

## 근거

- 정책 활성 버전은 회사 문서(`form_analysis_companies.activePolicyVersion`)에 있고, 기동 seeder(#212 설계)는 빈 DB만 채우며 기존 DB의 활성 버전은 바꾸지 않는다. 전환 명령이나 API는 없어 사람이 DB에서 직접 `updateOne`으로 바꾼다.
- 2026-10-24 확인: dev DB는 사람이 활성 버전을 SK 38·Greeting 18로 바꾼 뒤에야 dev API가 v38을 줬다. 운영 DB의 활성 버전 37·24·17은 그 시점 main(v1.4.0) seed와 일치했다.
- 버전 대조는 4값으로 한다. 배포 커밋, 그 커밋의 seed `activePolicyVersion`, DB 활성 버전, API 응답(SK 응답에 `eduhgEducationStatus`가 있으면 v38; Greeting v18은 API로 보이지 않아 DB로만 확인).
- 다음 릴리스에서 develop이 main에 들어가면 운영 seed가 38·18이 되므로 배포 직후 운영 DB에서 같은 전환이 필요하다. 운영 전환은 사람이 승인하고 실행한다.

## 쓰임

- 새 정책 버전 검증은 새 볼륨 로컬 스택(seeder가 빈 DB를 채움)에서 하거나, dev DB의 활성 버전을 사람이 바꾼 뒤 API 응답으로 확인한다.
- 릴리스 점검표에 4값 대조와 운영 DB 전환(사람 승인)을 넣는다. seeder의 환경별 자동 적용과 보호된 전환 경로는 #337에서 다룬다.
