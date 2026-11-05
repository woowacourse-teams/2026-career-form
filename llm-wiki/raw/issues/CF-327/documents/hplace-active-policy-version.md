# Hplace 활성 정책 버전은 설정값이다

> Issue: CF-327
> Collected: 2026-10-23
> Approval-Digest: 460019c1c58c3248f460202a9b0e81f8fa783ffef0981abc96f7bccb2ae237f0
> Source-Revision: 82bcb5cd7e384096ee9b6f70e7f71803ed561af6

이 문서는 2026-10-23에 승인된 CF-327 후보 4를 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. CF-177과 CF-310 raw가 "DB 활성 포인터를 사람이 올린다"고 서술한 활성 정책 버전의 실제 동작을 정정하며, 어댑터 계약·실화면 검증 등 바꾸지 않은 내용은 Supersedes가 가리키는 CF-310 문서와 그 이전 근거를 따른다.

## 승인 후보

Hplace 활성 정책 버전은 DB 포인터가 아니라 Spring 속성 `careerform.hplace.active-policy-version`이며 기본값이 4다. `HplaceFormPolicySeeder`는 v3·v4 문서를 없을 때만 insert하고, `MongoHplacePolicyProvider`는 설정값으로 문서를 고른다(4가 없으면 3). `application-prod.yml`, `infra/compose.deploy.yaml`, deploy workflow 어디서도 이 값을 전달하지 않아 백엔드 배포 즉시 v4가 활성화되고 운영에서 끌 레버가 없다. 끄거나 v3로 되돌리려면 설정 전달 경로를 추가하는 infra 변경이 필요하다. 기존 raw의 'DB 활성 포인터를 사람이 올린다'는 서술을 이 내용으로 정정한다.

## 코드 기준 동작

- `MongoHplacePolicyProvider`는 생성자에서 `@Value("${careerform.hplace.active-policy-version:4}")`로 활성 버전을 읽는다. `find()`는 그 버전의 `hplace` 정책 문서를 조회하고, 활성 버전이 4인데 문서가 없을 때만 v3 문서로 내려간다. 활성 버전이 1 미만이면 `Unavailable`을 돌려준다.
- `HplaceFormPolicySeeder`는 local·dev·staging·prod 프로필에서 기동 시 v3(legacy)와 v4(native) 문서를 **없을 때만** insert한다. 기존 문서는 수정하지 않는다. Javadoc은 활성 버전 포인터를 "맞는 확장이 설치된 뒤 사람이 올린다"고 적었지만, 기본값이 이미 4이므로 그 설명은 실제 동작과 다르다.
- `FormAnalysisRouter.sharedLookup`은 Hplace 지원 호스트·경로를 `hplacePolicyProvider.find()`로 바로 조회한다. 다른 회사가 쓰는 `FormAnalysisCompanyDocument.activePolicyVersion`(DB 포인터)은 Hplace 경로에 관여하지 않는다.
- `backend/src/main/resources/application.yml`과 `application-prod.yml`, `application-staging.yml`에는 `careerform.hplace` 항목이 없다. `infra/compose.deploy.yaml`과 `.github/workflows/deploy-*.yml`도 관련 환경변수를 컨테이너에 전달하지 않는다.

## 운영 영향

- 1.4.0 백엔드를 운영에 배포하면 기동과 동시에 v3·v4 문서가 운영 MongoDB에 삽입되고 v4가 활성화된다. 코드 revert는 삽입된 문서를 지우지 않는다.
- 운영에서 v4를 끄거나 v3로 되돌릴 레버가 없다. 필요하면 `CAREERFORM_HPLACE_ACTIVE_POLICY_VERSION` 같은 환경변수를 workflow→`deploy.sh`→compose로 전달하는 infra 변경을 별도 Issue로 한다.
- 따라서 [확장·백엔드 호환 배포](release-compatibility.md)의 순서(새 확장 게시 → 보급 확인 → 백엔드 배포)가 v4 활성화를 제어하는 유일한 수단이다.

## 근거

- `backend/src/main/java/com/careerform/formanalysis/infrastructure/persistence/mongo/MongoHplacePolicyProvider.java`
- `backend/src/main/java/com/careerform/formanalysis/infrastructure/persistence/mongo/HplaceFormPolicySeeder.java`
- `backend/src/main/java/com/careerform/formanalysis/application/FormAnalysisRouter.java`
- `backend/src/main/resources/application.yml`, `application-prod.yml`, `application-staging.yml`
- `infra/compose.deploy.yaml`, `.github/workflows/deploy-production.yml`
- `llm-wiki/raw/issues/CF-177/documents/live-followup-bundle.md`(정정 대상 서술)
