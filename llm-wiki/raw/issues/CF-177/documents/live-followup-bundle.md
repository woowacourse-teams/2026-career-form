# Hplace 후속 보완 묶음: 칸 단위 인식, 효율, 안내, 시드, 재실행 멱등성

> Issue: CF-177
> Collected: 2026-10-20
> Approval-Digest: 47b52e686c57595fd3b1f51c382fa6aa0bbe447631c0dab2b4b9c3c38cbc1bda
> Source-Revision: b80992013b59475c28f3164e904c70355c3778d0

이 문서는 2026-10-20에 별도로 승인된 5차 후보 K70–K76(K75-1 포함)을 수집한 기록이다. Approval-Digest는 후보 파일 `.git/cf-workflow/drafts/knowledge-candidates-r5.md` 전체 UTF-8 바이트의 SHA-256이며 수집 직전에 다시 계산해 일치를 확인했다. 앞선 K01–K69의 승인과 내용은 [manifest](../manifest.md)와 [KDI·구조 미확인 근거](live-kdi-unverified.md)를 따르며, 이 문서는 K66을 정정하고 최종 점검 후속 보완 7건 중 사용자 결정으로 이 PR에 포함한 6건(실화면 하네스 등록 제외)과 실화면 회귀에서 발견한 재로드 보고 결함의 수정을 더한다. 실제 지원자 값·계정·세션·URL 쿼리·대화 전문은 포함하지 않고 예시 값은 모두 합성이다.

## 기준선과의 관계

- K70은 K66의 "상세 섹션의 필수 앵커는 영문 이름 하나"를 "필수 앵커 없음, 칸 단위 독립 인식"으로 대체한다.
- K71·K72·K73·K74·K75·K76은 새 동작·운영 지식이며 기존 근거를 바꾸지 않는다. K75-1은 K75의 재실행 회귀가 진짜 재로드를 흉내 내지 못했던 한계를 정정한다.
- Source-Revision `b809920`는 후속 보완 커밋(c6df59b, f7cc6f0, aa7e064, afb303f, 7d94037, 03cf831, b809920)을 모두 포함한 CF-177 HEAD다.

## 승인 후보

### K70. 상세 기본정보는 칸 단위로 독립 인식한다 (K66 정정)

상세 모듈의 인식 조건은 플랫폼 지문(MRS2 writeResume 자산, 유일한 `form#frm`, 섹션 11·13 각 1개)뿐이다. 영문 이름·생년월일·현주소·비상연락처는 각각 검증해, 없는 칸은 생략하고 형식이 다른 칸은 그 칸만 제외한다(진단 키는 `hplace.detail.<칸>`). 제외된 칸은 K68의 구조 미확인 표시로 드러난다. 성별 수집은 영문 이름 subject에 의존하지 않는다. FE 플랫폼 지문의 섹션 11 표식은 영문 이름 input이 아니라 섹션 자체다. BE `DETAIL_REQUIRED`는 빈 집합이며 허용 필드 1개 이상만 요구한다. K66의 "필수 앵커는 영문 이름 하나"를 대체한다. 이전의 묶음 인식은 com2us(현주소)·kdi(생년월일)처럼 칸 하나가 없을 때마다 모듈 전체가 빠지는 원인이었다.

근거: afb303f `detail.ts`, `basic-controls.ts`, `fingerprint.ts`, `HplaceFormFingerprint.java`; `detail.test.ts`(칸별 제외), `AutofillWorkflow.hplace-unverified-structure.test.tsx`.

### K71. native 실행기는 정책 객체별로 한 번만 검증·직렬화한다

`nativeForm()`은 `browserPolicy` 객체별 `WeakMap`에 검증 결과를 두고, 형식 지문은 `NativeForm` 객체별로 한 번만 직렬화한다(`nativeFormDigest`, `policyDigest`). `currentNativeOwner`는 소유 섹션 하나의 범위만 다시 계산한다. 검색 확정·주소 대기 루프는 매 틱 JSON 직렬화 대신 참조·필드 비교를 쓰고, 주소 대기의 저장 프로필 재로드는 대기 시작 전과 결과 반환 직전에만 수행한다(쓰기 직전 재확인은 유지). 정책을 객체째 교체하면 재검증·중단된다. 정책 객체를 제자리에서 변경(mutate)하는 테스트는 더 이상 변화를 감지하지 못하므로 교체 방식으로 써야 한다.

근거: 7d94037 `native-form-collection.ts`, `committed-search.ts`, `staged-address.ts`, `execution-policy.ts`; 최종 점검 효율 리뷰.

### K72. BE는 staged address 정책 노드를 정책 객체당 한 번만 계산한다

`CompanyFormPolicy.stagedAddress()`가 `executionPolicy`에서 파생한 주소 노드를 지연 캐시하고, 지문·동작 계약이 재사용한다. 생성 시에는 `SEARCH_ADDRESS` 규칙이 있을 때만 한 번 계산한다. 컨트롤러의 2차 정책 조회를 생략하는 변경은 v3 폴백(라우터 응답에 실행 정책이 없는 경우)에서 응답 정책이 빠지는 동작 변경이라 반영하지 않았다.

근거: c6df59b; 최종 점검 BE 리뷰.

### K73. 정책 비호환·정책 미등록·미지원 지원 방식은 서로 다른 안내를 보인다

서버 정책이 이 확장의 검증을 통과하지 못하면(`POLICY_INCOMPATIBLE`) 확장 업데이트 안내, 에이치닷 페이지의 `ADAPTER_POLICY_UNAVAILABLE`은 정책 미등록 안내, 지문이 v1 지원자 앱·채용 빌더 페이지로 판정되면 미지원 사유를 함께 보인다. `hplaceDocumentKind()`가 지문 종류(mrs2·registration·v1·builder)를 노출하며 라우팅은 바꾸지 않는다. `npm run zip`은 `VITE_AUTOFILL_DEBUG=true`면 실패한다(하네스는 `npm run build`로 빌드).

근거: f7cc6f0 `runtime-client.ts`, `company.ts`, `fingerprint.ts`, `scripts/assert-release-flags.mjs`.

### K74. 에이치닷 정책 시드는 모든 배포 프로필에서 insert-only로 실행된다

`HplaceFormPolicySeeder`(구 `LocalHplaceFormPolicySeeder`)가 `StartupPolicySeeder`와 같은 local/dev/staging/prod에서 legacy v3·native v4를 없을 때만 삽입한다. 저장된 버전은 수정하지 않으므로 정책을 고치면 새 버전(v5 자원·팩토리·기본 활성 버전)으로 추가하고 활성 버전 포인터는 사람이 올린다. `hplace-mrs2-v4.json`의 SHA-256을 테스트로 고정해 제자리 수정이 실패하도록 했다. 운영 DB 직접 삽입은 AI가 하지 않는다.

근거: aa7e064 `HplaceFormPolicySeeder.java`, `HplaceFormPolicySeederTest.java`.

### K75. 금지 동작 회귀 범위와 단계 재실행 멱등성

공용 workflow 테스트 하네스는 페이지 골격(단계 탭 `nav#tab`, 이전·임시저장·다음 바, 동의 체크박스, 인증 버튼)을 기본으로 마운트하고 `document` 캡처 리스너로 금지 클릭(단계 탭, 다음·이전·임시저장·저장·제출, 인증·본인확인, 동의, remove·reset·submit·file, 모든 submit 이벤트)을 집계한다. 허용은 staged address 모달의 자체 저장 버튼뿐이다. 2단계 재실행 회귀는 같은 프로필로 두 번 실행해 행·검색·입력 이벤트가 늘지 않음을 확인하고, 사이트가 날짜(`2019.03.01`→`2019-03-01`)·학교명(접미사) 정규화를 한 뒤에도 중복 행이 생기지 않음을 확인한다. 신원 필드가 둘 이상인 섹션에서 기존 행이 어느 항목과 신원 필드 하나만 다르면 중복 행을 추가하지 않고 그 섹션을 사용자 처리로 넘긴다. 같은 회사·다른 입사일인 사용자 행도 같은 이유로 사용자 처리가 된다.

근거: 03cf831 `hplace-mrs2-page-chrome.ts`, `hplace-native-workflow.tsx`, `AutofillWorkflow.hplace-step2-shaped.test.tsx`, `native-form-row-assignment.ts`.

### K75-1. 저장 후 다시 연 페이지의 기존 행은 "기존 값 유지"로 보고한다

GS건설·ABL 2단계 실화면(이전 시연에서 임시저장된 값이 남은 페이지)에서 모든 칸이 "자동으로 입력하지 못했어요"로 보고됐다. 값은 보존됐지만 결과가 틀렸다. 원인은 세 가지였다. (1) 기존 행의 칸은 `unavailableItem`이 되면서 짝인 프로필 항목(`itemIndex`)을 잃어 비교 자체가 불가능했다. (2) 검토 계획과 기존 행 충돌 검사가 날짜·표준 토큰·평점을 사이트 형식이 아닌 원값으로 비교했다(`2019.03.01`≠`2019-03-01`, `주간`≠`attendance:day`, `3.65`≠`3.650`). 토큰 하나(주/야간)만 어긋나도 섹션 전체가 `existing-value-conflict`로 막혔다. (3) 기존 단위 재실행 테스트는 같은 DOM 요소를 재사용해 모듈의 `WeakMap` 배정 기억이 살아 있었고, 진짜 재로드(새 요소)를 흉내 내지 않았다. 지금은 신원이 맞는 기존 행이 짝인 항목 index를 유지하고, `nativeRetainedValueMatches`가 승인·선택 없이 사이트 형식으로만 비교해 같으면 "기존 값 유지", 다르면 "기존 값과 다름"으로 보고한다. 사용자가 직접 고친 값이 있는 행은 그 섹션만 사용자 처리로 남는다(fail-closed 유지). 재로드 회귀는 값을 마크업 속성으로 구운 뒤 `innerHTML`로 요소를 새로 만든다. 행 배정이 막힌 사유는 디버그 로그에 `native-row-assignment:<cause>`로 섹션당 한 번 남는다(`debugCollectionSkip`은 수집 범위 밖에서 버려지므로 `debugRuntimeSkip` 사용).

근거: 4e33efc `native-form-row-assignment.ts`, `native-form-write.ts`, `review-plan.ts`, `result-model.ts`; auto-2026-10-20T12-34 보고(gsenc/abl step 2 76·71건 확인 필요).

### K76. frontend CI 30분 한도와 느린 workflow 테스트

PR #303의 frontend 잡은 `timeout-minutes: 30`에 걸려 취소됐고, develop의 최근 6회도 4회가 같은 이유로 취소·실패했다(19~58분). 로컬 전체 FE 22.3분 중 20초 이상 걸리는 파일이 12.6분이며 상위는 `AutofillWorkflow.hplace-step2-shaped`(109s)·`hplace-major-details`(63s)·`hplace-education-majors`(57s) 등 실제 타이머로 기다리는 workflow 테스트다. `.github/workflows`는 공유 보호 영역이라 한도·샤딩 변경은 별도 하네스 Issue 후보다.

근거: PR #303 checks, `frontend-ci.yml`, final-82bf5e6/coverage.log 파일별 시간.

## topic별 반영

- adapter-hplace: K70, K71, K73, K75, K75-1
- adapter-field-inventory: K70
- adapter-development: K70(FE·BE 동시 변경 범위), K72, K73, K74, K75-1(진단), K76
