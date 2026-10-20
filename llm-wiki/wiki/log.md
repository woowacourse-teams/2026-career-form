# Wiki Log

## [2026-10-19] ingest | CF-280 분류 추적 게이트 보완

- Approval-Digest: 93111e1673e3486b37ce6fe5adbd51226592b1737c7eccdfc613ec4bcda86bb6
- Source-Revision: 8688dfd5dcaf2f958ee2a915ace52c0f92c9b755
- 아직 병합되지 않은 [CF-280 bundle](../raw/issues/CF-280/manifest.md)에 fixture 투영 출처와 분류 서비스 응답부터 매칭까지의 오프라인 추적 후보를 추가했다.
- [날짜 텍스트 칸 매칭 조사](topics/generic-date-text-matching-investigation.md)에 mock 공급자 경계와 실제 분류 파이프라인, FE collector·실사이트 CSS 미실행 한계를 구분했다.

## [2026-10-19] ingest | CF-280 범용 전체 날짜 텍스트 칸 매칭 조사

- Approval-Digest: 7f7a1af804f79e38d63b1b046937d0fd7a33a8355d3c7698d727f2f3b6fab8e3
- Source-Revision: 8f9a02657ff1856b570e2dd98c97a15a90486190
- 승인한 두 후보를 [CF-280 bundle](../raw/issues/CF-280/manifest.md)에 기록하고 [전체 날짜 텍스트 칸 매칭 조사](topics/generic-date-text-matching-investigation.md)를 추가했다.
- 기존 raw는 변경하지 않았다. 모의 응답은 코드 경로만 보이며 실제 JEV 판단과 실사이트 CSS 상태는 미확인으로 남긴다.

## [2026-10-18] ingest | CF-260 범용 구조 반복 실행과 학력 행 격리

- Approval-Digest: 3af32cb932097163bced35189944304b518e3778188cbd73b763cfa764e1128c
- Source-Revision: 252e9e1fb86ca7b631d9e18b26dbfeccc8aea44c
- 승인한 후보 네 개를 [CF-260 bundle](../raw/issues/CF-260/manifest.md)에 기록하고 [구조 반복 실행](topics/generic-structure-loop.md)을 추가했다.
- 기본 수집 보존, 단계별 행 식별과 보류 격리의 합성 검증을 기록했다. 기존 raw와 구조 행동 ADR의 제안 상태를 유지하며 실사이트 검증으로 확대하지 않는다.

## [2026-10-18] ingest | CF-259 범용 검토 화면의 3단계 표시

- Approval-Digest: 2ec99be9cf99938cbeb5b9489acb77830cddf0df2b1bc7355eb47d0497fe35ff
- Source-Revision: 0ca3ef09cc9d4296f456d807aed2ba3e28cb9731
- 승인한 후보 네 개를 [CF-259 bundle](../raw/issues/CF-259/manifest.md)에 기록하고
  [범용 검토 화면의 3단계 표시](topics/generic-review-tiers.md)를 추가했다.
- 브라우저 QA와 실사이트 검증은 하지 않았다.

## [2026-10-18] ingest | CF-263 검색 표면 닫기 안전 판정과 사유 타입

- Approval-Digest: b3cd2e7383f13f6aa4efbe5b4a9b8094dbf7cd672175f9a8c840a3b516b52ec3
- Source-Revision: e0849a8ee250a0f8c588a85b7a0511ad7dc97a68
- 승인한 세 후보를 [CF-263 bundle](../raw/issues/CF-263/manifest.md)에 기록하고 [검색 표면 닫기 판정](topics/generic-search-surface-close-safety.md)을 추가했다.
- 기존 raw는 변경하지 않았다. 특성화와 변이 실패는 합성 DOM의 현재 복구 검증이며 과거 커밋 전 RED나 실사이트 검증으로 기록하지 않는다.

## [2026-10-18] ingest | CF-261 범용 등급의 다른 사람 대상 칸 차단

- Approval-Digest: efaf5d4ecaf8f6976e70d9aefc2c5196e03ffe049bc661bcae08f52f7a236f72
- Source-Revision: 76ecbdac4d71b174390ff5efa5d66d07be4d8a11
- 승인한 후보 세 개를 [CF-261 bundle](../raw/issues/CF-261/manifest.md)에 기록하고
  [범용 등급의 다른 사람 대상 칸 차단](topics/generic-other-person-context.md)을 추가했다.
- 화면 문구는 Task 12(#259)의 변환 표에 위임하며 실사이트 검증은 하지 않았다.

## [2026-10-18] update | CF-251 범용 합성 값 binding 소비와 등급 경계

- Approval-Digest: b280bc6ed4d3bd17c43b277a87b1322d47113bd2f22c96c83ea4be78fd8d9ef1
- Source-Revision: a7eac91a98982932bb6ecd6d34ada6487ac7aa35
- 승인한 후보 1개를 [CF-251 bundle](../raw/issues/CF-251/manifest.md)에 기록하고 [frontend 검증 경계](topics/generic-binding-frontend-validation.md)의 현재 상태를 소비 완료로 갱신했다.
- CF-250 raw는 변경하지 않고 History에 남겼다. 실사이트 실행은 하지 않았다.

## [2026-10-18] ingest | CF-252 범용 칸 문맥·형식 검사와 DOM fixture 검토 경계

- Approval-Digest: c0af678e0f5e91a1f8edbf7d9446fb69b054b135db7ce4264c1ec2c0c82325cf
- Source-Revision: e04949fb6c20943a0d0c994dc29c2455d5ffff0c
- 승인된 수정 후보 네 개를 [CF-252 bundle](../raw/issues/CF-252/manifest.md)에 기록하고
  [범용 칸 문맥과 형식 검사](topics/generic-field-context-safety.md),
  [DOM fixture 검토와 재현 경계](topics/dom-snapshot-review-boundaries.md)를 추가했다.
- 자체 title/placeholder의 범용 로컬 읽기는 2026-10-18 사용자 승인 사항이다.
  기존 raw는 변경하지 않고 실제 JEV·실사이트 검증의 미실행 경계를 유지한다.

## [2026-10-18] ingest | CF-250 범용 응답 합성 값 표현

- Approval-Digest: 0ee8fe6c546245d56ad81d38d4fde2a719b830d39c8181f43ac8a8d48c5fef6b
- Source-Revision: 01c430db48c9e2d6277a84e544f106dc6b7cc00f
- 승인한 후보 4개를 [CF-250 bundle](../raw/issues/CF-250/manifest.md)에 기록하고 [합성 값 표현](topics/generic-synthetic-binding-response.md)과 [frontend 검증 경계](topics/generic-binding-frontend-validation.md)를 추가했다.
- 합성 요청·응답 검증 경계를 유지한다. 기존 raw는 변경하지 않는다.

## [2026-10-18] ingest | CF-253 범용 검색 실패 격리와 fixture 공백 정규화

- Approval-Digest: 39539b34214157c8ade45d63698fd83be4ca20b3c668b66d2d2de77776379603
- Source-Revision: 470686cd80f395921b6daf499fe40c13b63122ac
- 승인한 후보 4개를 [CF-253 bundle](../raw/issues/CF-253/manifest.md)에 기록하고 [검색 실패 격리](topics/generic-search-failure-isolation.md), [fixture 공백 정규화](topics/dom-snapshot-fixture-whitespace.md)를 추가했다.
- 합성 DOM과 검색 경계 mock의 검증 경계를 유지한다. 실사이트에서 실제로 탄 분기는 확인되지 않았다.

## [2026-10-17] ingest | CF-244 범용 클릭 경계, 섹션 캐시와 endpoint 부재 전달

- Approval-Digest: c03f361ba687892e12dd432b8b9607ec34af9fd86545fe697a7896e6ba510135
- Source-Revision: 7aac227f4663c5e402d92158607adaeb3f3342db
- 승인한 세 후보를 [CF-244 bundle](../raw/issues/CF-244/manifest.md)에 기록하고 [드롭다운 클릭 경계](topics/generic-dropdown-click-gate.md), [섹션 분석 캐시](topics/generic-section-analysis-cache.md), [endpoint 부재 전달](topics/generic-endpoint-unavailable.md)를 추가했다.
- 합성 DOM·API mock의 검증 경계를 유지한다. 기존 raw와 ADR 초안의 상태는 변경하지 않는다.

## [2026-10-16] ingest | CF-222 범용 구조 행동, JEV 단일화, 범용 API 분리 ADR 초안

- Approval-Digest: 7d9a06235498d16e25310b1a8ecb773c87d2a4fa6c1e4656991a891cfdb4dbef
- Source-Revision: fa9125d656cf4f645b7f317318a35e9dd5f2d9a5
- 승인한 세 후보를 [CF-222 bundle](../raw/issues/CF-222/manifest.md)에 기록하고 [구조 행동 자동 실행](topics/generic-autonomous-structural-actions.md), [JEV 단일 provider](topics/jev-single-analysis-provider.md), [범용 API 분리](topics/generic-api-section-category-matching.md)를 추가했다.
- 세 ADR은 제안됨 상태이며 구현 결과를 반영한 확정은 후속 작업에서 한다.

## [2026-10-15] ingest | CF-198 범용 폼 컨텍스트 수집 경계와 전후 비교

- Approval-Digest: a62db0f0fe59c1802b8232a2d513137ad07c402bcb9cd25b185461b7e9a53ba2
- Source-Revision: adc78ef58f88c1a8070fc084c62355ba52cde08a
- 승인한 세 후보를 [CF-198 bundle](../raw/issues/CF-198/manifest.md)에 기록하고 [범용 폼 컨텍스트 수집](topics/generic-form-context.md)을 추가했다.
- 실사이트 전후 비교는 혼합·고분산 결과이며 개선으로 판정하지 않는다. 후보 수 동일은 악화 원인을 확정하지 않으며 원인은 미확인이다. 설치 revision은 UNVERIFIED이고 범위는 보이는 native control이다.

## [2026-10-11] ingest | CF-178 브라우저 테스트 계층과 CI 경계

- Approval-Digest: a44d4319a65cb6f0fc17934d216e915b38e1c1fec8acb5c1d1839957fa6b7013
- Source-Revision: 2bed14247592b4710bdfa3b2fcd5e4f217576d32
- 승인한 ADR 전문과 구현 경계 두 후보를 [CF-178 bundle](../raw/issues/CF-178/manifest.md)에 기록했다.
- [프론트 브라우저 테스트](topics/frontend-browser-testing.md)에 unit/browser 프로젝트, 합성 fixture 검증, 80% 커버리지와 CI 경계를 연결했다.
- 설치 확장 E2E와 실사이트 R1 기준선을 이번 브라우저 테스트 결과로 대체하지 않는다.

## [2026-10-09] ingest | CF-173 실패 원인 집계와 설치 revision 근거

- Approval-Digest: 13f6d39b24eeee80a26b35b202c456ab067910ad145274757c03802220f336f9
- Source-Revision: 094e3b43522fa2ec464fb841ba53b8c7b2c9be8c
- 승인한 네 후보와 설치본 메타데이터 ADR을 [CF-173 bundle](../raw/issues/CF-173/manifest.md)에 기록했다.
- [평가 기준선](topics/generic-autofill-evaluation-baselines.md)과 [실사이트 평가](topics/live-autofill-evaluation.md)에 계약 1.1의 원인 집계, 미발견 분리, 설치 snapshot 근거, 비교 보류를 연결했다.
- 과거 v1 artifact와 raw는 변경하지 않았다. 합성 CLI 및 설치본 재로드 검증을 새 실사이트 자동 입력 결과로 기록하지 않는다.

## [2026-10-07] ingest | CF-162 카탈로그 식별 검색 선택

- Disposition: Adds profile-catalog-identity topic; supersedes CF-160 adapter-greeting topic
- Approval-Digest: 4bba7d6154fe33711cb12bc5d00772d1c26e81b57827b3678bcc5672130381f3
- Source-Revision: 8824d14828234a684ee9852a8565231590f63f4e
- Raw: llm-wiki/raw/issues/CF-162/manifest.md
- Topics: 2

## [2026-10-06] ingest | CF-160 Greeting 기본정보, 날짜, 주소와 추가 필드

- Disposition: Supersedes CF-94 adapter-greeting and adapter-field-inventory topics
- Approval-Digest: 03ed4dab97485d3f52bc4069336d4a0cb5d9b31fba41a083db342596c497ab5b
- Source-Revision: 6a75891b8806f28d51583f7705304c6205d61e6c
- Raw: llm-wiki/raw/issues/CF-160/manifest.md
- Topics: 2

## [2026-10-02] ingest | CF-146 범용 기입 활성 여부 배포 설정

- Disposition: Supersedes CF-62 cicd-setup topic
- Approval-Digest: 81b34972abbbdbfd75a2094723621262d17ccb2def411ee03370eb59bc11509c
- Source-Revision: af9dc2f8429c0b13eebb3d6ccccf3c2858fe4dc4
- Raw: llm-wiki/raw/issues/CF-146/manifest.md
- Topics: 1

## [2026-10-02] ingest | CF-147 미지원 안내와 선택적 이용 계측

- Disposition: New
- Approval-Digest: 6e01ddd1fe145b97cfe572a34fa01dac1efb3844d81c27ffca19eb3354086e65
- Source-Revision: 02cae24217a2ab02e3b65b5d32492b8a8c3f3421
- Raw: llm-wiki/raw/issues/CF-147/manifest.md
- Topics: 2

## [2026-09-11] ingest | CF-88 검증 이후 코드 이해 체크포인트

- Disposition: Supersedes CF-41 issue-development-workflow topic
- Approval-Digest: 8e7f84a750fc8d327f231b987bbc5f04acdd0a618828f07ccc0c9a212ba5dfde
- Source-Revision: 2cbfb305bff1b96c94f9667ec383d49df34e0186
- Raw: llm-wiki/raw/issues/CF-88/manifest.md
- Topics: 1

## [2026-09-09] ingest | CF-82 프로필 입력과 확장 UI

- Disposition: New
- Approval-Digest: cabff5388840dd58b1396514f705083113a98ebeeaebc2ed6eee15a2a027990a
- Source-Revision: f8069272a64bcdd4d9c6ff8268a8573e71c8e83a
- Raw: llm-wiki/raw/issues/CF-82/manifest.md
- Topics: 5

## [2026-09-07] ingest | CF-76 로컬 프로필 JSON 전송 계약

- Disposition: New
- Approval-Digest: faa201aaabf6f8c182db50ceb22f33f3cba9285ea098761ec0ce1d8a8b185d1b
- Source-Tree: cb98cbd3372e4ad77bb5c235753b10ec771afe65
- Raw: llm-wiki/raw/issues/CF-76/manifest.md
- Topics: 1

## [2026-08-18] ingest | 제품, 하네스, 개발 컨벤션 초기 정본
- Disposition: New
- Raw: llm-wiki/raw/business/product-principles.md
- Raw: llm-wiki/raw/technical/harness-lifecycle.md
- Raw: llm-wiki/raw/conventions/development-conventions.md

## [2026-08-22] ingest | CF-41 기존 docs baseline과 append-only 지식 모델

- Disposition: New
- Approval-Digest: fa9b17330c14a8b740fac6a3945fdaac1eca3907bcbbe46061cb83610da777e3
- Source-Tree: acc0c186e310f2582bbae0d5f48694ca159fd7cf
- Raw: llm-wiki/raw/issues/CF-41/manifest.md
- Topics: 16

## [2026-08-24] ingest | CF-44 지원서 분석 API와 데이터 경계

- Disposition: New
- Approval-Digest: 82759db7cd94a01a18eccbc2074396c9900b4fb09e299f4e364664af4bf060ed
- Source-Tree: b6bb3eff9d590ddf43b1f906b7e7cccd9c4ec6c9
- Raw: llm-wiki/raw/issues/CF-44/manifest.md
- Topics: 2

## [2026-08-25] revise | CF-44 Snapshot 전용 endpoint 분리

- Disposition: Revised before merge
- Approval-Digest: ddf207c25e086b724918aea420f1718266069d9920ad8bef08a955620f222cbf
- Raw: llm-wiki/raw/issues/CF-44/manifest.md
- Topics: 2

## [2026-08-25] revise | CF-44 반복 입력 action 실행 경계

- Disposition: Revised before merge
- Approval-Digest: eb5dd4337e91f7503dfeed6582f2f81fca0c06a225196185fb709f014449c3cb
- Raw: llm-wiki/raw/issues/CF-44/manifest.md
- Topics: 2

## [2026-08-25] revise | CF-44 반복 실행 횟수의 browser 책임화

- Disposition: Revised before merge
- Approval-Digest: 70cb0b1946eb0f058fc3b92d1920a8650a76f27e3bb50a044dd2e7e487261c10
- Raw: llm-wiki/raw/issues/CF-44/manifest.md
- Topics: 2

## [2026-08-25] revise | CF-44 반복 레코드 item 문맥 추가

- Disposition: Revised before merge
- Approval-Digest: 39378e4cefce4574a1305bf1fdcfb1cfd091803d3b7114b737086fff53117a92
- Raw: llm-wiki/raw/issues/CF-44/manifest.md
- Topics: 2

## [2026-08-25] revise | CF-44 canonical field key와 LLM 전체 candidate 계약

- Disposition: Revised before merge
- Approval-Digest: 35b4142c8c0e9e7f8483e1e434433071033273d5c35481d1825a409c7188c050
- Raw: llm-wiki/raw/issues/CF-44/manifest.md
- Topics: 2

## [2026-08-26] ingest | CF-47 자동 기입 모달 경계

- Disposition: New
- Approval-Digest: 47c048bdc2eb40e20be1e1bf88721b0aae256ccbf973be817703029e945f200a
- Raw: llm-wiki/raw/issues/CF-47/manifest.md
- Topics: 1
## [2026-08-26] ingest | CF-48 발표 디자인 시스템

- Disposition: New
- Approval-Digest: 0893d3bc4b52808ffabfc6df1791b6d49f382238d00a86e418d1eb59653a8aa5
- Source-Tree: e60aef0cd60a5fbe5f62dc1a4018108cdebe4ae7
- Raw: llm-wiki/raw/issues/CF-48/manifest.md
- Topics: 1

## [2026-08-26] ingest | CF-40 범용 LLM 지원서 분석 계약

- Disposition: Supersedes CF-44 application form analysis topics
- Approval-Digest: e8635edc3fa60442af7b6f28723a2bfd12379ce5798e83acd282ded5acb8958c
- Source-Tree: 5fc6b76a1037746c7dacb58950586d77e63e82e2
- Raw: llm-wiki/raw/issues/CF-40/manifest.md
- Topics: 2

## [2026-08-27] revise | CF-40 지원서 분석 구조와 검증 소유권 단순화

- Disposition: Revised before merge
- Approval-Digest: d101af26fc0cd558a4b4ed3f7e9e64c7bd8b5364d0570f0a5b0ba0ae46e15a04
- Source-Tree: 548461d59e367e3324bc8a52be86a6a60a7c0b18
- Raw: llm-wiki/raw/issues/CF-40/manifest.md
- Topics: 2

## [2026-08-27] revise | CF-40 공용 OpenAI Secret 기반 원격 LLM 실행

- Disposition: Supersedes CF-41 CI/CD setup topic
- Approval-Digest: 8e30d82663277bab17b279009eb5e8431b8fb9802c7359532eed08acef6bd9e3
- Source-Tree: 5f06a881a2e64c97dd4390a5da62a8eed7ee51c5
- Raw: llm-wiki/raw/issues/CF-40/manifest.md
- Topics: 3

## [2026-08-27] ingest | CF-57 OpenAI Chat Completion 응답 저장

- Disposition: Supersedes CF-40 application-form-analysis-data-boundary topic
- Approval-Digest: c841fa98e025acbc49245c311d7ca73666747720ba719b71e806272c8e95e59f
- Source-Tree: 551c3b27a53256d0e5526fda27789ee40ba05fbb
- Raw: llm-wiki/raw/issues/CF-57/manifest.md
- Topics: 1

## [2026-08-27] ingest | CF-61 필드 매핑 provider output 계약 안전화

- Disposition: Supersedes CF-40 API and CF-57 data-boundary topics
- Approval-Digest: 24484961339269c5afdfc9d853b0c918696b0ada4511eb23ce978e580b8fdb76
- Source-Tree: 20b74dd793ac0fc26ede51a99939b83e61963079
- Raw: llm-wiki/raw/issues/CF-61/manifest.md
- Topics: 2

## [2026-09-07] ingest | CF-46 프론트 회사 어댑터 경계

- Disposition: Supersedes CF-41 adapter-development and adapter-field-inventory; adds Hyundai and SK topics
- Approval-Digest: df027b5910423b1ffad4ad267c719385039d40aeb09259bbacb19780ac393101
- Source-Revision: dd9f867ad020a72dec51b27ab54073d59eef48ac
- Raw: llm-wiki/raw/issues/CF-46/manifest.md
- Topics: 4


## [2026-09-07] ingest | CF-46 현대 취득일 식별과 미입력 점검

- Disposition: 승인된 미병합 CF-46 bundle의 현대 어댑터와 지원 현황 보완
- Approval-Digest: c6dd7f157308a54725e298ce056c553ce575d294e74da94d77645377d1ef85be
- Source-Base-Revision: 325535401b2c5ab8999142fa41f7f3c0f6b157a1
- Source-State: CF-46 작업 트리의 미커밋 보완 포함
- Raw: llm-wiki/raw/issues/CF-46/manifest.md
- Topics: 2

## 2026-09-07 현대 반복 행 준비 보완

- 승인 digest `0b3ad344c8d413acd5d691120d2884b4e1b1d3384fd32ae5daba5bc843f50924`의 전체 후보를 CF-46 미병합 raw와 현대,지원 현황 topic에 반영했다.
- 실제 구조의 추가 동작 식별 누락, 어학 하위 섹션별 개수, 자격증명 매핑과 반복 추가,입력 회귀를 기록했다. 실제 입력값은 기록하지 않았다.

## 2026-09-07 현대 어학 선택과 첫 실행 회귀

- 승인 digest `2227ce4216e2c2ff5436f16be4451aa39d683491ba015bfed9ab19c0bf021280`의 전체 후보를 CF-46 미병합 근거와 현대,지원 현황 topic에 반영했다.
- 정확한 추가 동작 재탐색, 검증된 어학 매핑, 단계별 정상 직접입력 준비와 같은 메뉴 선택 검증을 기록했다. 실프로필 값은 기록하지 않았다.

## 2026-09-08 — CF-46 SK 주소 검색 검증 반영

- 승인된 전체 후보18개(digest: 28d877aae8306a494fe2eace6bf4e0baf55bddd0e31b87ffdfacb55c53c74d9f)를 기준으로 [CF-46 bundle](../raw/issues/CF-46/manifest.md)을 갱신했다.
- SK 후속 반복 버튼/어학 개수 분리, 기존 API capability 협상, 카카오 iframe 검색,정확 선택,최종 반영과 실제 fixture 검증 및 원복을 회사 문서와 지원 현황에 반영했다.
- 경력,날짜,시험 성적 등 남은 제한과 다른 회사의 미검증 상태를 보존했다.

## 2026-09-08 — CF-46 전체 패널 검증과 SK 검색 후속 근거 반영

- 승인된 신규 후보 9개(digest: `964819f79cb6d5cba4ffbffad54f89d49a66e114cfa9f714d8d4e720796362f3`)를 기존 승인18개(digest: `28d877aae8306a494fe2eace6bf4e0baf55bddd0e31b87ffdfacb55c53c74d9f`) 위에 누적해 CF-46 미병합 bundle을 갱신했다.
- SK 경력 exact DOM,재직상태 후속 분석, `YEAR_MONTH` 날짜,대한민국 국적 lookup, widget 검색의 유일 확정,직렬 처리와 전체 공개 fixture의 실제 popup→사이드 패널→자동 기입 검증을 기록했다.
- UI writer 집계의 범위, 204개 제어 원복, WXT watcher의 reload 경계와 저장,제출 미검증을 함께 기록했으며 P1/P3/P4 전체 완료로 확대하지 않았다.

## 2026-09-08 — CF-46 현대 주소,국적,학력 검증 반영

- 승인 digest `c0e3c1533f98c631846cdd6e7e769b749c3bb7d07a70986e5d1be3f034416df6`의 현대 후보 7개를 기존 CF-46 지식 위에 누적했다.
- 국내 주소 유일 결과 선택과 실행 소유 modal cleanup, 국적1 대한민국/KR,국적2 불변, 학력 정책 v4의 그룹별 행,필드와 실제 `school`/`basic` auto-type을 기록했다.
- 설치 production smoke는 고교,학사 2행을 확인하고 주소 3값,readonly, 학교,전공 코드와 기간,GPA,졸업 코드를 독립 대조했다. API 7회는 HTTP 200/ADAPTER/COMPLETE였고 UI 38/0은 전체 성공이 아니다.
- 실제 대학원,전문학사,박사, 저장,제출, toolbar icon 클릭은 검증하지 않았으며 지원서 1149개 제어와 원래 프로필 키 부재 상태를 복원했다. 개인 입력값,원본 DOM,세션은 기록하지 않았다.

## 2026-09-09 — CF-83 SK,현대 자동 기입 보완

- 승인 digest `8ee710bc2303688173a36b717de467a7f31b20054ecacfb9ade8d74c931bd4dd`의 후보 6개를 [CF-83 bundle](../raw/issues/CF-83/manifest.md)에 기록했다.
- SK 학력 재식별,병역/보훈 기존 값 보호, 현대 만점기준,추가 전공,라벨 및 소수점 정책 저장 보완을 회사 topic과 현황표에 반영했다.
- CF-46 근거는 보존하고 CF-83 자동 검증과 실제 설치 재기입 미검증을 구분했다.

## [2026-09-09] revise | CF-83 후속 검증 근거 보완

- 승인 digest `dce8d6f067af9892c4c2a3da6d1957ef6498091e2b1ea16d72b5a3530c01b5e4`의 전체 후보 8개를 CF-83 미병합 bundle에 반영했다.
- SK `만기전역`→군필 alias의 회사,필드 한정 정규화와 준비,실행,검토 경로, 현대 복수,부전공 검색의 0개 결과 수동 확인,나머지 입력 계속 규칙을 기록했다.
- Hyundai negative fixture는 40개 입력,2개 수동 확인으로 기록했다. 설치 hash와 구조적 import 일치는 확인했으나 실제 SK alias 재진입, 저장,제출,toolbar icon 및 운영 정책 rollout은 미검증으로 유지했다.

## 2026-09-10 CF-86 학력 소재지,주야간 계약 갱신

- 승인 digest `dd275895addeb2568dd3e7b517a5dc8867f83e0fdb03afc39d6a2e2aa2d6dbed`의 후보 전체 4개를 [CF-86 bundle](../raw/issues/CF-86/manifest.md)에 기록했다.
- SK,현대 회사 문서와 지원 현황표를 함께 갱신하고 CF-83 불변 근거는 보존했다.
- 표준/기존 값 호환, 정확한 메뉴,hidden 코드, 국가→도시 재분석과 실패 격리를 기록했다. 자동 테스트,실제 설치 대상 필드,미검증 범위를 분리하고 개인정보,세션은 포함하지 않았다.

## [2026-09-12] ingest | CF-90 지원서 패널 안 자동 기입 흐름

- Disposition: New
- Approval-Digest: 6d84c630c0cdc78c6bd9d05ecb5ee9f1845464846eeceed5feb29f3cdbde59b1
- Source-Revision: 7c03209dbc22f1e216db1f8359c23f5f9d08471a
- Raw: llm-wiki/raw/issues/CF-90/manifest.md
- Topics: 1

## [2026-09-19] ingest | CF-96 랜딩,온보딩 웹 페이지

- Approval-Digest: 514b194740c528ad3a9354d2de0f96e4e38719507d2990c34dc0143be4794daa
- Raw: [CF-96 bundle](../raw/issues/CF-96/manifest.md)
- 승인된 후보 3개를 기록하고 [랜딩,온보딩 topic](topics/landing-onboarding.md)을 색인에 연결했다.

## [2026-09-22] ingest | CF-99 입력 위치 표시와 설치 안내

- Approval-Digest: 2a87ccd12e581e9177e8a4b527ab2df5d39800efdebddfc7ef698c47392463d2
- Raw: [CF-99 bundle](../raw/issues/CF-99/manifest.md)
- 승인된 후보 3개를 기록하고 [입력 위치 표시와 설치 안내 topic](topics/autofill-follow-and-install.md)을 색인에 연결했다.

## [2026-09-23] ingest | CF-98 범용 분석과 검색 표면

- 승인 digest `09f47713670f79bb2053d52af823b912cd0b06bc635066c63f9457d7b9f74db3`의 후보 6개와 제안 ADR 전문을 [CF-98 bundle](../raw/issues/CF-98/manifest.md)에 비식별 기록했다.
- 정적 정책 우선, OpenAI/Jev 단일 공급자 선택, 비식별 의미 문맥, 로컬 검색 링크 1회 클릭과 사후 검증을 분석 API,데이터 경계,검색 표면 topic에 연결했다.
- 합성 확장과 실제 CJ 화면의 관측 범위를 구분했다. Jev 실호출,보관 정책, Greeting 실제 화면, CJ 항목별 확장 판정과 저장 상태는 미검증으로 유지했다.

## [2026-09-24] ingest | CF-102 OpenAI 분석 예산과 안전 진단

- 승인 digest `e350514e46e5143c397314f3209dc2d4295bfdd7b8654d2d61d492b94bd79476`의 후보 3개를 [CF-102 bundle](../raw/issues/CF-102/manifest.md)에 비식별 기록했다.
- 준비,필드 30초 기본/60초 미만, 상호작용 별도 SDK 8초,무재시도, 구조화된 종료 사유와 안전한 실패 분류를 [topic](topics/openai-analysis-budget-and-diagnostics.md)에 연결했다.
- Docker/실제 공급자/CJ 검증은 환경 및 승인 부재로 미완료로 남겼다.

## [2026-09-24] ingest | CF-101 범용 날짜 형식 변환과 로컬 승인

- 승인 digest `62463e58e4e9043e334ba50b33b3a8b81140469f775e2b9eb9598763ea975219`의 후보 3개를 [CF-101 bundle](../raw/issues/CF-101/manifest.md)에 비식별 기록했다.
- 엄격한 날짜 DIRECT 변환, 로컬 DOM 승인 재검증과 원본 fallback 금지를 [topic](topics/generic-date-format.md)에 연결했다.
- 합성 통합,설치 UI,실사이트 검증을 구분하고 개별 unavailable 이유의 기존 표시 제한을 기록했다.

## [2026-09-24] ingest | CF-104 DOM 검증 기반 연월 달력 선택

- 승인 digest `0d4d85a28616d32e0e203efbedf10812ee26115f76ab57c44c80f188e5daf030`의 ADR 제안 전문을 [CF-104 bundle](../raw/issues/CF-104/manifest.md)에 기록했다.
- 모델의 비식별 후보 역할 판별과 브라우저의 개별 승인,DOM 소유권,연월 선택,실제 값 검증을 [topic](topics/generic-calendar-selection.md)에 연결했다.
- 합성 fixture와 설치 확장 UI 자동 검증을 수행했으며, 실제 지원서 입력과 외부 공급자 실호출은 확인하지 않았다.

## [2026-09-24] ingest | CF-99 최종 입력 결과와 안내 흐름

- Approval-Digest: 20126b48eacbf09b8af7fcaddbaad25843ec829a766fb688ebe465b8363c913b
- [CF-99 bundle](../raw/issues/CF-99/manifest.md)의 최종 후보 6개를 반영했다.
- 입력 중 화면 고정, 범주별 결과 검토, 선택적인 접기, 합성 안내 시연과 현대,SK 진단 경계를 관련 topic 및 현황표에 연결했다.

## [2026-09-25] ingest | CF-108 범용 검색 실패 진단과 후속 보류

- Approval-Digest: 80dfb2e074f122e975d4d611d9d0c2f5c80519bcbac1247d1d8d3720bae3deb9
- 승인된 후보 4개를 [CF-108 bundle](../raw/issues/CF-108/manifest.md)에 기록했다.
- 공개 진단과 승인된 후속 보류, 학교 구조의 미지원 경계, native GET 완료 검사 정정과 격리 설치 검증 범위를 [검색 표면 topic](topics/generic-autofill-search.md)에 반영했다. 실제 CJ와 서버 저장은 미검증이다.

## [2026-09-25] ingest | CF-110 검증된 CJ 대학교 주전공 검색

- Approval-Digest: ad86e9a311c54fb3b9fc132310c2375b1972ebc129c46261fef22aa1d6c0bd19
- 승인된 후보 3개와 제한된 ADR을 [CF-110 bundle](../raw/issues/CF-110/manifest.md)에 기록하고 [범용 검색 topic](topics/generic-autofill-search.md)에 연결했다.
- 검색 POST의 정확한 소유권,두 필드, callback 비실행과 응답 내 유일성,표시값/코드/팝업 종료/500ms 유지, 버튼형 input 라벨,실패 보호 경계를 반영했다. 일반 검색 거부와 CF-108 진단은 유지한다.
- 합성 입력 대상 브라우저 검증과 설치 확장 실제 화면의 읽기 전용 관측을 구분한다. 실제 화면 결과 UI는 확인 필요 및 입력 완료 0개였으며, 전체 패널 성공,서버 저장,제출,CJ 데이터베이스 전체 유일성은 입증되지 않았다.

## [2026-09-26] ingest | CF-112 CJ 첫 대학교 학교명과 국가 문맥 검색

- Approval-Digest: e78f86f65972ab454f6e92f7fcb1d98e14a4855551975bec8598772c8f021d0e
- 승인된 후보 2개와 Issue의 결정을 [CF-112 bundle](../raw/issues/CF-112/manifest.md)에 비식별 기록하고 [범용 검색 topic](topics/generic-autofill-search.md)에 연결했다.
- 최소 학교 POST, 학교명,코드,국가,같은 행 소재지 URL 묶음, 기존 `new_country` 보존, 전체 기존 묶음의 재검증, 학교,전공 공유 팝업 lease와 조건부 복구를 기록했다. 일반 POST 허용이나 회사 전체 어댑터 지원으로 확장하지 않는다.
- 공개 검색과 공개 팝업을 연결한 합성 브라우저에서 두 번의 선택,닫힘,500ms 이상 유지를 확인하고 공개 결과 코드와 독립 대조했다. 설치 확장 전체 패널, 실제 지원서, 저장,제출은 검증하지 않았다.

## [2026-09-27] ingest | CF-94 Greeting 공통 정적 매핑

- Approval-Digest: d36c93eae7d0daa585f8b33f6985c5edde7043a449cf12547daa9b0d6c5a4dbe
- 승인된 후보 5개와 Issue의 ADR 결정을 [CF-94 bundle](../raw/issues/CF-94/manifest.md)에 비식별 기록했다.
- BE 판정,문맥과 FE 어댑터 실행의 경계, 카카오모빌리티,현대오토에버,무신사,당근서비스,메디퀴터스의 화면별 지원 현황, `이메일주소`/`이메일` 단일 칸 호환을 topic과 지원 현황표에 연결했다.
- 자동 테스트와 Aside 설치 확장의 입력 관측을 구분했다. 이메일 인증, 파일, 동의, 실제 저장,제출과 다른 Greeting 양식 전체의 호환성은 검증하지 않았다.
## [2026-09-26] ingest | CF-114 범용 자격증 검색과 후속 재검토

- Approval-Digest: 90d7fdfda386fb1e7451130ed6401efc3669ea4ee10ab3685e883b7ce3fb752a
- 승인된 후보 5개를 [CF-114 bundle](../raw/issues/CF-114/manifest.md)에 기록하고 [범용 검색 topic](topics/generic-autofill-search.md)과 [지원 현황](topics/adapter-field-inventory.md)에 연결했다.
- 회사 중립 반복 행,검색,새 승인 경계를 기록했다. 합성 회귀와 설치 빌드 확인을 실제 CJ 또는 다른 회사의 자동 입력 성공으로 확대하지 않는다.

## [2026-09-28] ingest | CF-115 범용 자동 기입 실사이트 평가 기준선

- Approval-Digest: 518589069f3ccddb753ef238afbb1cfba40604807f9fd95170192ba96ddbb65b
- 승인된 후보 3개와 5개 사이트의 비식별 기준선을 [CF-115 bundle](../raw/issues/CF-115/manifest.md)에 기록하고 [평가 기준선 topic](topics/generic-autofill-evaluation-baselines.md)을 추가했다.
- 실사이트 4개 측정과 1개 미확정, 단계별 지표, 실행 사용량과 오입력 구조를 기록했다. 실제 값, HTML, URL query, selector, 요청과 응답 원문, 계정과 세션 정보는 포함하지 않았다.
- Issue raw는 실행 근거, topic은 revision별 사람용 이력, 하네스 JSON은 기계 판독 정본으로 구분했다. 여러 기준선의 자동 추세 집계는 현재 범위에 포함하지 않았다.

## [2026-09-28] ingest | CF-124 AI 운영 실사이트 자동 입력 평가 워크플로우

- Approval-Digest: 224fb55347d9c7aa08b770bd022e814bb18f5eece660a368eac595a477c95e20
- 승인된 후보와 ADR을 [CF-124 bundle](../raw/issues/CF-124/manifest.md)에 기록하고 [실사이트 평가 워크플로우 topic](topics/live-autofill-evaluation.md)을 추가했다.
- 비민감 기존 값 덮어쓰기, 민감값 보류, Console 원문 비보관과 실제 DOM 재검증 경계를 기록했다. 저장, 이동, 미리보기와 제출은 실행 범위가 아니다.

## [2026-09-28] ingest | CF-124 사전 판정 분모와 실사이트 평가 보고

- Approval-Digest: c7c6e46f9d8c47103fa5e34987b4b9525f96b5f4eaeb60ec0be20e4ebb06ea2a
- 평가 에이전트가 제품 AI와 독립적으로 전체 필드를 분류하고 `AUTOFILLABLE` 분모를 실행 전에 동결하는 계약을 [CF-124 bundle](../raw/issues/CF-124/manifest.md)에 기록했다.
- `neowiz-lever`와 `lg-ai-research`의 두 사이트 실행 결과를 [실사이트 평가 워크플로우](topics/live-autofill-evaluation.md)와 [평가 기준선](topics/generic-autofill-evaluation-baselines.md)에 연결했다.
- 설치된 제품 revision은 `UNVERIFIED`로 기록했다. CF-115 이후 저장소 변경을 설치 빌드의 변경으로 간주하지 않으며 revision 기반 개선 또는 회귀 비교를 보류했다.
- 최초 두 사이트 실행은 CF-115 `ground-truth-v1` 분모를 재사용했다. 이후 `neowiz-lever` 재실행에서 평가 에이전트가 확장 프로그램 실행 전에 전체 30개 필드를 분류하고 `AUTOFILLABLE` 10개를 동결해 새 사전 판정 게이트를 E2E 검증했다. `lg-ai-research`는 이전 분모를 재사용한 결과로 남는다.

## [2026-09-28] ingest | CF-94 기존 회사별 Greeting 라우팅

- Approval-Digest: e059c7035aacff70bb63053c36bd05ff7370595c5af450788ac836798cb49b8a
- 승인된 후보 4개를 [CF-94 bundle](../raw/issues/CF-94/manifest.md)에 반영했다.
- FE host 선택,BE 독립 정적 정책, 전용 API 필드/토큰/추가 준비 요청 제거와 명시 등록의 지원 경계를 갱신했다. 이전 설치 확장 결과는 이번 라우팅 변경 이전 증거로 구분했다.

## [2026-09-28] ingest | CF-94 카카오게임즈 자체 도메인

- Approval-Digest: cac312a1d58fd3930f34a3ec7e62130c7a6026aa5654a054f57065b20c650876
- [CF-94 bundle](../raw/issues/CF-94/manifest.md)의 승인 후보 전체를 갱신해 카카오게임즈 명시 등록과 공개 페이지,CNAME 확인 근거를 추가했다. 런타임 자동 탐지와 전 항목 실화면 입력 검증으로 확대하지 않는다.

## [2026-09-28] ingest | CF-94 Greeting DNS,DOM 공통 판별

- Approval-Digest: c2488a72f8044f14f8edd98d8b975422d669e2a1db3a6b15f0a94760985bc71a
- 승인된 후보 4개를 [CF-94 bundle](../raw/issues/CF-94/manifest.md)에 반영했다.
- BE CNAME 연결,FE 공통 DOM 어댑터 선택으로 기업별 등록을 대체하고 기존 라우팅 API와 필드 보호 조건을 유지한다. 이전 설치 입력 결과와 이번 DNS/API,합성 검증의 범위를 구분한다.

- 2026-09-28: CF-94 승인 후보에 따라 Greeting 영문이름의 이름→성 정책과 카카오게임즈 프로필/양식 지원 공백을 반영했다. 실제 입력값은 수집하지 않았고 미구현 범주는 조사 결과로 구분했다.

- 2026-09-28: CF-94 승인 후보 `2a2272f6138752170845c9b3a7fb03ae7746ccba332a7f6588da3720ea914b01`로 Greeting 고교,대학 추가전공,경력,어학,자격증 지원 및 이메일,재직 결과 보완을 반영했다. 실제 설치 관측과 최신 수정본의 전체 브라우저 재검증 미완료를 분리했고 다른 회사 raw는 변경하지 않았다.
- 2026-09-28: CF-118 승인 후보 `3e40207f5d644edd4f230e4fe7b18dfc3b5175beff2eed764049f03a10e6c5f5` 3개를 [CF-118 bundle](../raw/issues/CF-118/manifest.md)에 반영했다. ui-datepicker 공유 루트 소유권 증명, 0~11 월 select 신뢰 조건, 월,연월일 달력 동시 감지 보류를 기록했고 합성 fixture 검증과 실제 사이트 수동 검증 미완료를 구분했다.

## [2026-09-29] ingest | CF-129 혼합 학력 행과 role 없는 레이어 검색

- Approval-Digest: 244732492bc75aead7f8ca1dfc2e99245e2b6afca3a8b270f1e1f55a885ca494
- 승인된 후보 4개를 [CF-129 bundle](../raw/issues/CF-129/manifest.md)에 기록하고 [범용 자동 기입 검색 표면](topics/generic-autofill-search.md)의 Current를 갱신했다.
- 합성 자동 테스트 근거만 기록했고 실제 지원서 입력값과 수동 검증 결과는 수집하지 않았다.

## [2026-09-29] ingest | CF-129 구분별 분기 반복 행

- Approval-Digest: 4370b04c1b54c40ecb2453ee7d1eec1afdc9949ba9a7fdacfdfc25d47dce3952
- 승인된 후보 6을 [CF-129 bundle](../raw/issues/CF-129/manifest.md)에 추가하고 [범용 자동 기입 검색 표면](topics/generic-autofill-search.md)의 반복 행 경계를 갱신했다.
- 합성 자동 테스트와 읽기 전용 구조 관측만 근거로 했고 실제 입력값은 수집하지 않았다.

## [2026-10-01] ingest | CF-117 공급자 중립 검색 결과 구조 해석

- Approval-Digest: 10e27f3d552b78401bed61525d7005d7e3eb9be7a07dba87e0baf9addef7cd11
- 승인된 후보 4개를 [CF-117 bundle](../raw/issues/CF-117/manifest.md)에 기록하고 [범용 자동 기입 검색 표면](topics/generic-autofill-search.md)의 Current를 갱신했다.
- 합성 자동 테스트와 계약 테스트 근거만 기록했고 실제 지원서 입력값과 수동 검증 결과는 수집하지 않았다.
## [2026-09-30] ingest | CF-131 공용 모니터링

- Approval-Digest: c4372b8759c34da242143a1bda83d89131652f1d19a6bb4c4f702424ae12c02b
- 승인한 후보 5개를 [CF-131 bundle](../raw/issues/CF-131/manifest.md)과 [공용 모니터링 시스템](topics/monitoring-system.md)에 기록했다.
- 로컬 합성 검증과 실제 AWS 배포, Discord 수신 및 장기 보존 미검증을 구분하고 기존 배포 Runbook 근거는 유지했다.

## [2026-10-01] ingest | CF-138 분할 이메일 보호와 공급자 호출 추적

- Approval-Digest: 251cd740a1cb88bba6e71f390215f232002ae888c28ed77a111ad85ee5f8f50a
- Source-Revision: fac9abf8a0019f508bcdb0a833e671a436d34601
- 승인한 후보 4개와 ADR,운영 안내를 [CF-138 bundle](../raw/issues/CF-138/manifest.md)에 기록했다.
- [범용 분할 이메일 보호](topics/generic-split-email-safety.md)와 [Jev,OpenAI 호출 추적](topics/provider-call-tracing.md)을 새 topic으로 연결했다.
- 합성 실제 패널 및 합성 입력의 실제 공급자,LangSmith 검증 범위를 기록하며 실제 지원 정보, 계정, 세션과 시크릿은 수집하지 않았다.

## [2026-10-01] ingest | CF-140 범용 입력 결과 완료 판정

- Approval-Digest: f613f99c662b07a118bee6e68460f9417d62a0e98246c1c318e9938bd2d78892
- Source-Revision: b63ee0327d26cd7984f9211c7f583c78eee19ef6
- 승인한 두 후보를 [CF-140 bundle](../raw/issues/CF-140/manifest.md)에 기록했다.
- [지원서 패널 안 자동 기입 흐름](topics/autofill-panel-workflow.md)에 범용 쓰기의 실제 값 기반 완료 기준과 result-model,progress verifier의 연계를 추가했다. 기존 CF-90 raw를 보존했다.
- 합성 실제 workflow의 정상,불일치,읽기 불가 결과와 데스크톱,모바일 검증 범위를 기록했다. 전체 커버리지의 별도 통합 테스트 실패는 통과로 기록하지 않았다.

## [2026-10-02] ingest | CF-142 범용 버튼 드롭다운

- Approval-Digest: b1d28af146b567a09987ebfeab7e0ee823bc4be8723710f1f19355b77ac2c7e0
- Source-Revision: ca54009aa971b283f3149710361dc57c666e67e8
- 승인한 두 후보를 [CF-142 bundle](../raw/issues/CF-142/manifest.md)에 기록했다.
- [범용 버튼 드롭다운 안전성](topics/generic-button-dropdown-safety.md)을 추가하고 [패널 흐름](topics/autofill-panel-workflow.md)에 값 보존,재승인 후 재검증,실제 반영 판정을 연결했다. 기존 raw는 보존했다.
- 실사이트 DOM 구조 조사와 합성 실제 Chromium의 4개 수집,선택을 구분한다. 실제 지원 정보와 세션은 기록하지 않고 전체 기존 실패,환경 제한도 전체 통과로 표현하지 않는다.

## [2026-10-02] ingest | CF-144 호스트 루트 디스크 알림

- Approval-Digest: 7e3be48100b9de605c9003b848f9799f83f06d952fabc568c025ee7996026056
- Source-Revision: b8d419b74e081f1d7b248e477e58287cf1819b80
- 승인한 두 후보를 [CF-144 bundle](../raw/issues/CF-144/manifest.md)에 기록하고 [공용 모니터링 시스템](topics/monitoring-system.md)의 Current를 갱신했다. 기존 CF-131 raw는 보존했다.
- 호스트별 90%, 5분 지속 조건과 KeepLast의 상태 유지 및 관측 경계를 기록했다. 합성 Grafana와 mock receiver 검증을 실제 서버 반영이나 Discord 수신으로 해석하지 않는다.

## [2026-10-03] ingest | CF-151 dev 호스트 디스크 임계값 95%

- Approval-Digest: 775160facdfcfd37acb841ce7fabf5338b75644155897a0d05e3243b01a98189
- Source-Revision: 7c81d191c810991aabe856699e680dd75e91df2a
- 승인한 후보 한 건을 [CF-151 bundle](../raw/issues/CF-151/manifest.md)에 기록하고 [공용 모니터링 시스템](topics/monitoring-system.md)의 Current를 갱신했다. 기존 raw는 보존했다.
- dev/staging 95%와 기존 정책 유지, 남은 공간의 대응 여유 감소, 로컬 합성 검증과 사람 담당 운영 반영의 경계를 기록했다.

- 2026-10-03: CF-155 승인 후보를 수집해 [릴리스 브랜치 유지와 정리](topics/release-branch-lifecycle.md)를 추가하고 배포 Runbook에 연결했다.

## [2026-10-03] ingest | CF-154 Grafana HTTP 접속

- Approval-Digest: 2668b9f7c5e2968895780831f9e889ad176c65919d2f21bc26fe184e6bd9016b
- Source-Revision: 732932774645a1576264520f3f4c5c4ba6e6d1d3
- 승인한 두 후보를 [CF-154 bundle](../raw/issues/CF-154/manifest.md)에 기록하고 [공용 모니터링 시스템](topics/monitoring-system.md)의 Current를 갱신했다. 기존 raw는 보존했다.
- HTTP UI 진입점과 수집 인증 분리, 필수 외부 URL, 사람 담당 수동 반영 절차를 기록했다.

## [2026-10-06] ingest | CF-158 장애 분석 로그와 외부 호출 P95

- Approval-Digest: 1cb4110f01da3eb03cd9bd1bd5a5d5ffba56c4dd910990521f61bab3527623cf
- Source-Revision: 15a5e992a3e291263ecfdf564162ea04930094e0
- 승인한 네 후보를 [CF-158 bundle](../raw/issues/CF-158/manifest.md)에 기록하고 [공용 모니터링 시스템](topics/monitoring-system.md)의 Current를 갱신했다. 기존 raw는 보존했다.
- 기본 필터 패널, 요청 연결, 외부 성공 P95와 표본, 수집 상태 해석과 사람 담당 반영 경계를 기록했다.

## [2026-10-07] ingest | CF-164 자동 입력 품질 관측

- Approval-Digest: 86514685359a23e2deeeb4323caf4caeb06c67fbc8a7ef5b488caa55b6a4d2de
- Source-Revision: 94ba74906887c5635b8cc031c047f0e079f43f85
- 승인한 후보 9개와 ADR을 [CF-164 bundle](../raw/issues/CF-164/manifest.md)에 기록하고 [자동 입력 품질 관측과 사람 확인 요청](topics/autofill-quality-observation.md)을 추가했다.
- 기존 운영 모니터링 raw와 Current는 보존하고 품질 관측, 사람 참고 분모와 전용 평일 확인 요청을 별도 주제로 연결했다.

## [2026-10-08] ingest | CF-168 상태 드라이버 실패의 안전 범위 보류

- Approval-Digest: f5b043321be6413904e748fc04484291fde3a9e5fe7378d439566b7bf093ec8b
- Source-Revision: 08107e139501224e8f2a71912c8fe40354f3442e
- 승인한 세 후보를 [CF-168 bundle](../raw/issues/CF-168/manifest.md)에 기록하고 [Greeting 공통 어댑터](topics/adapter-greeting.md), [지원서 패널 안 자동 기입 흐름](topics/autofill-panel-workflow.md), [어댑터 필드 현황](topics/adapter-field-inventory.md)의 Current를 갱신했다. 기존 raw는 보존했다.
- 변경 전 실패 판정 기준, Greeting 어학 수준 필드 단위 보류, `OPTION_UNMATCHED` 보고 범위를 기록했다.

## [2026-10-08] ingest | CF-169 현대, SK 어학 상태 드라이버 실패의 행 단위 격리

- Approval-Digest: 334a004a2a7ed47c3557351c9d59635962c10937400d08d3727cc98f980054e2
- Source-Revision: 3539437b04cb50c42f04b8d4b68a001cefdc173e
- 승인한 세 후보를 [CF-169 bundle](../raw/issues/CF-169/manifest.md)에 기록하고 [현대 어댑터](topics/adapter-hyundai.md), [SK 어댑터](topics/adapter-sk.md), [어댑터 필드 현황](topics/adapter-field-inventory.md)의 Current를 갱신했다. 기존 raw는 보존했다.
- 현대 `.field-group`과 SK `.form-item-group.langExam-Item`의 행 격리 조건, 국적과 우대 여부 드라이버 제외를 기록했다.

## [2026-10-12] ingest | CF-192 Greeting 프로필 import 기술 검증

- Approval-Digest: 09e992e80ac677ab64606c19fe1babcff1e300a589fa7a3f99b93e04eafd01c2
- Source-Revision: 2567a6ab93014787eb155670651796ef5013567c
- 승인한 네 후보를 [CF-192 bundle](../raw/issues/CF-192/manifest.md)과 [Greeting 프로필 import 기술 검증](topics/greeting-profile-import.md)에 기록하고 색인을 추가했다.
- 기존 raw와 자동 기입 정책은 보존하고, 읽기 검증 결과와 제품 구현의 후속 조건을 구분했다.

## [2026-10-12] ingest | CF-192 Greeting 프로필 가져오기 제품 연결

- Approval-Digest: 1d53de70607a0afcdd1bf1ae1d18373d5b927860730dbb1efd1606ce09e551dc
- Source-Revision: aa33c040f7f183a3fce454c89db4dc33f5bda415
- 새로 승인한 네 후보로 아직 병합되지 않은 [CF-192 bundle](../raw/issues/CF-192/manifest.md)과 [가져오기 topic](topics/greeting-profile-import.md)을 제품 구현 상태에 맞춰 갱신했다. 기준 브랜치의 raw는 변경하지 않았다.
- 선택 병합·저장, 이름·날짜·학력 확인, 공통 저장 큐의 충돌 보호와 복구, 합성 fixture 검증의 한계를 기록했다.

- 2026-10-12: CF-192 승인된 전체 필드 가져오기·부분 실패 격리·Aside LF/HLB 검증 근거로 병합 전 raw와 topic을 갱신했다.

## [2026-10-12] ingest | CF-183 확장 품질 보고 fetch 호출 문맥

- Approval-Digest: a0023aa706b1b4fd3c776de453075b9a7718c3ff09d069f63780963d8836fc13
- Source-Revision: f2e0634ff9f81c216211aa47fe1280ecaea613a1
- 승인한 후보 하나를 [CF-183 bundle](../raw/issues/CF-183/manifest.md)에 기록하고 [fetch 호출 문맥](topics/extension-fetch-context.md)을 추가했다. 기존 raw는 보존했다.

## [2026-10-12] ingest | CF-185 Wiki 검증 기준 브랜치

- Approval-Digest: 465066ab4d30dd20534d671736989ccaafc3fda9ae84604459ab37a2b8b066c5
- Source-Revision: 0ca328ce84497e30fa10d300141967ca2116693a
- 승인한 후보를 [CF-185 bundle](../raw/issues/CF-185/manifest.md)에 기록하고 [Wiki 검증 기준 브랜치](topics/wiki-validation-base.md)를 추가했다. 기존 raw는 보존했다.

## [2026-10-12] ingest | CF-190 품질 확인 사이트와 공개 지원서 링크

- Approval-Digest: 8a3b7d0be9741e604a6593e6c683295587c16cb5ad0910c1beb820b07187d79e
- Source-Revision: 7e8b704cc8023a109affd75ec30118ff74597f28
- 승인한 네 후보를 [CF-190 bundle](../raw/issues/CF-190/manifest.md)에 기록하고 [품질 확인 사이트와 링크](topics/quality-site-links.md)를 추가했다. 기존 raw는 보존했다.

## [2026-10-12] ingest | CF-195 공고 단위 품질 확인

- Approval-Digest: 638fd7c699ebcece0e16268c71ab4779bde8f1f9a9fbd46757444b88a4ac2d47
- Source-Revision: 6783d4d0b2c9db9717c696196bc63ad9e45b3de1
- 승인한 네 구현 기준과 ADR 195를 [CF-195 bundle](../raw/issues/CF-195/manifest.md)에 기록하고 [품질 확인 사이트와 링크](topics/quality-site-links.md)를 갱신했다. 기존 raw는 보존했다.

## [2026-10-12] ingest | CF-197 시스템 PR 계약

- Approval-Digest: 179ef852f0c27dfbb2cc374949e8b18360c58d912b79a13648622ae02d0c6fc7
- Source-Revision: c2f545f5c1349b1da28feb5203bbbe9ffaf4b525
- 승인한 두 항목을 [CF-197 bundle](../raw/issues/CF-197/manifest.md)에 기록하고 [시스템 PR 계약](topics/release-pr-contract.md)을 추가했다. 기존 raw는 보존했다.

## [2026-10-13] ingest | CF-201 품질 관측 인터럽트 처리

- Approval-Digest: 8e6c08112dd8956d9e9e3b96c057d46cb46125a296ac59b397cb4dbfb21fe226
- Source-Revision: 149244d91f4108c183a9b09e22136bbf8a90e6b3
- 승인한 후보를 [CF-201 bundle](../raw/issues/CF-201/manifest.md)에 기록하고 [품질 관측 인터럽트 처리](topics/quality-observation-interruption.md)를 추가했다. 기존 raw는 보존했다.

## [2026-10-13] ingest | CF-204 품질 report 종료 전송

- Approval-Digest: c77035f9272a13a0c57efcb4397b53809a4cc8f2e4d79b61eb72bafe0e8cc0f3
- Source-Revision: d0ab0303e2b9514b40a32b316f5b88d434d56693
- 승인한 후보를 [CF-204 bundle](../raw/issues/CF-204/manifest.md)에 기록하고 [품질 report 전송 시점](topics/quality-report-lifecycle.md)을 추가했다. 기존 raw는 보존했다.

## [2026-10-13] ingest | CF-207 공용 MongoDB 관측

- Approval-Digest: a6f687d3bd725214fa37de4509a5f0ba195e8fb80ffe2272f2a4381f9acffa2b
- Source-Revision: cbd283762b4b30a485f1ce8be1f48680d00c65cb
- 승인한 세 후보를 [CF-207 bundle](../raw/issues/CF-207/manifest.md)에 기록하고 [공용 모니터링 시스템](topics/monitoring-system.md)을 갱신했다. 기존 raw는 보존했다.

## [2026-10-12] ingest | CF-193 간단 프로필 등록과 첫 클릭률

- Approval-Digest: eea777b397530073223f8dde4d136056a3edb99391d3a4c5bf27968b0b414859
- Source-Revision: a1494f67fb6eaa7b47f328254c1747045670dbae
- 승인한 두 후보를 [CF-193 bundle](../raw/issues/CF-193/manifest.md)에 기록했다.
- [랜딩, 온보딩](topics/landing-onboarding.md)과 [이용 계측](topics/usage-analytics.md)의 Current를 갱신하고 이전 raw와 개인정보 경계를 보존했다.

## [2026-10-13] ingest | CF-193 단계형 프로필 등록과 첫 클릭률 보완

- Approval-Digest: 8ff319811d59ad9d3db60a1b14a87bdf53acb34f44e6755289f0226655a7edf1
- Source-Revision: 070b6c55185da237903ec915b2798a8ace7cf47e
- 새로 승인한 두 후보에 맞춰 아직 병합되지 않은 [CF-193 bundle](../raw/issues/CF-193/manifest.md)을 갱신했다.
- [랜딩, 온보딩](topics/landing-onboarding.md)의 단계형 질문, 선택 보충, 같은 탭 전환과 [이용 계측](topics/usage-analytics.md)의 단계형 첫 저장 표현을 현재 상태로 기록했다. 기존 개인정보 경계와 웹 시연 경계는 보존했다.

## [2026-10-14] ingest | CF-184 사이트별 자동 입력 결과

- Approval-Digest: 44786fd7c6ee3529b9ffdbe14c2f183836d556bf6b822ad4e86d2dc0019caf3d
- Source-Revision: 05b7a90ec1a02050b8ded4adc703f5edc3e6a9d4
- 승인한 세 후보를 [CF-184 bundle](../raw/issues/CF-184/manifest.md)에 기록하고 [사이트별 자동 입력 결과와 일별 그래프](topics/autofill-quality-dashboard.md)를 추가했다. 기존 품질 관측 주제에서 연결하고 기존 raw는 보존했다.

## [2026-10-15] ingest | CF-192 한 화면 가져오기 검토

- Approval-Digest: dcf2130a93c947448df405fedb580e0143e8a836eeca0e6a06be55c783062682
- Source-Revision: f926716d0f1efc792d8129f6d2dff8df6f98cdc5
- 승인한 후보 8개에 맞춰 아직 병합되지 않은 [CF-192 bundle](../raw/issues/CF-192/manifest.md)을 갱신했다.
- [Greeting 지원서에서 프로필 가져오기](topics/greeting-profile-import.md)의 현재 상태를 한 화면 검토, 새 값 미리 선택, 확인 카드, 중복 행 안내, 원본 칸 강조, 화면 문구 규칙으로 갱신했다.

## [2026-10-15] ingest | CF-192 실행 정책 기반 가져오기 통합

- Approval-Digest: e7990fbc0dfac3e68910c58c5e8a6037f640da03eae1c85b69c822281d58ccb1
- Source-Revision: 843c7ebb10e771ac51570dfff7efc8fbda2aded2
- 최신 develop 병합 뒤 승인한 후보 10개에 맞춰 아직 병합되지 않은 [CF-192 bundle](../raw/issues/CF-192/manifest.md)을 갱신했다.
- [Greeting 지원서에서 프로필 가져오기](topics/greeting-profile-import.md)에 실행 정책 기반 읽기, 가져오기 전용 민감 범주, 구분값 기준 추가 전공을 반영했다.

## [2026-10-16] ingest | CF-192 실사이트 테스트와 재가져오기 보완

- Approval-Digest: 9a96f691055d378fe05e9106fab5ed1b61926d2ef0fba8e9fc7a8b5d03d35c0b
- Source-Revision: 79a3dd19f1fc99bcfb4ac0482bf9d2c3f9a944c6
- 승인한 후보 12개에 맞춰 아직 병합되지 않은 [CF-192 bundle](../raw/issues/CF-192/manifest.md)을 갱신했다.
- [Greeting 지원서에서 프로필 가져오기](topics/greeting-profile-import.md)에 재가져오기 생략 조건과 실사이트 테스트 범위를 반영했다.

## [2026-10-19] ingest | CF-281 범용 범주 안 JEV 매칭 누락 원인과 의미 근거 보강

- Approval-Digest: acf6371d55c2272e43692af2e5a7010dc364ddd8162a37b4d7811aeea30b05b8
- Source-Revision: eac609ea083a39ef9c92217abf4cf36affbca43a
- 승인한 후보 3개를 [CF-281 bundle](../raw/issues/CF-281/manifest.md)로 수집하고 [범용 범주 안 JEV 매칭 누락 원인과 의미 근거 보강](topics/generic-category-semantic-matching.md)을 추가했다.

## [2026-10-19] ingest | CF-281 Astra 게이트 B1·B2 정정

- Approval-Digest: f2f0727ce2014c09ef0ec6cf3df54c6f4b44d96e4947aa890fa069fa6f457ec8
- Source-Revision: 25ffdcba6bea7406a704b0499e079867a9893e89
- 사용자 사전 승인 범위에서 후보 4개로 아직 병합되지 않은 [CF-281 bundle](../raw/issues/CF-281/manifest.md)을 갱신했다.
- 기존 등급·점수 계약을 등급 전용으로 좁힌 잘못된 설명을 정정하고, 원본에는 없는 프로젝트 상세 반례를 별도 합성 변이로 명시한 출처를 반영했다.

## [2026-10-20] ingest | CF-288 분석 응답과 품질 관측의 비동기 분리

- Approval-Digest: 541589a83e078dd8c571a98b42c1ffd6b5e7bb1e05be47336ad246322b7458a9
- Source-Revision: 541f4c2e473b8575e00ac1d154c41bec9b96fa61
- 승인한 정책 후보 3개와 ADR 전문을 [CF-288 bundle](../raw/issues/CF-288/manifest.md)에 기록했다.
- [비동기 품질 처리](topics/async-quality-observation.md)를 추가하고 기존 품질 관측, report 시점과 이전 실행기의 인터럽트 계약에 현재 구조를 연결했다.

## [2026-10-20] ingest | CF-296 품질 가공 경계 이동과 배치 보고

- Approval-Digest: a0fe90430f2ca019308b9afcef2767a057cb22986e6ae6f486e20ef30982d2da
- Source-Revision: e0730141498ad616f3f0325caac3fc196e998bf5
- 승인한 후보 4개를 [CF-296 bundle](../raw/issues/CF-296/manifest.md)에 기록했다.
- [비동기 품질 처리](topics/async-quality-observation.md)와 [보고 시점](topics/quality-report-lifecycle.md)을 현재 구조로 갱신했다.

## [2026-10-20] ingest | CF-304 프론트 테스트 shard 분할과 병합 검증

- Approval-Digest: 7a00004c1382c5d9a3dc7c67868c7828594f155b5e905e79b2a5d00585d37e3d
- Source-Revision: f0dc5cfb9ebeb2aaa4dc2f4806d0fc7f7063c16a
- 승인한 후보 5개(ADR, topic 갱신, Vitest 동작 사실, shard 수 결정 근거, 진단 근거)를 [CF-304 bundle](../raw/issues/CF-304/manifest.md)에 기록했다.
- [프론트 브라우저 테스트](topics/frontend-browser-testing.md)의 CI 경계를 shard 실행과 병합 검증으로 갱신하고 CF-178 실행 경계를 History로 옮겼다.
