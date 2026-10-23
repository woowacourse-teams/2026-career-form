# Hplace 실화면 정제 fixture, 프로젝트 활성화와 미검증 테넌트 시연 수정

> Issue: CF-177
> Collected: 2026-10-20
> Approval-Digest: 542da5f91de838b7628a627f71c8299e1434cc346667f7aea70ea92d50921a61
> Source-Revision: 6a7a14174ccf6b21ae691254fbec78bb63aa22e1

이 문서는 2026-10-20에 별도로 승인된 3차 후보 K56–K65를 수집한 기록이다. Approval-Digest는 후보 파일 `.git/cf-workflow/drafts/knowledge-candidates-r3.md` 전체 UTF-8 바이트의 SHA-256이며 수집 직전에 다시 계산해 일치를 확인했다. 앞선 K01–K55의 승인과 내용은 [manifest](../manifest.md)와 [step 2·3 근거](live-step23.md)를 따르며 이 문서는 그 내용을 바꾸지 않는다. 실제 지원자 값·계정·세션·URL 쿼리·대화 전문은 포함하지 않고, 예시 값은 모두 합성이다.

## 기준선과의 관계

이 문서는 [step 2·3 근거](live-step23.md)를 보강한다. 여기서 바꾸거나 더하지 않은 계약·관측·검증 한계는 그 문서와 2026-10-19 기준선([어댑터](adapter-hplace.md), [필드 현황](adapter-field-inventory.md), [실행 정책](adapter-development.md))을 따른다.

- K59는 기준선의 "프로젝트154 disabled, C13 증거 게이트"를 대체한다.
- K60은 C14를 종료로 확정한다.
- K64는 영문 이름의 "회사 안내가 순서를 명시할 때만 입력" 결정을 "안내가 없으면 성 이름, 모호하면 미기입"으로 대체한다.
- K65는 Hplace 127키 집계를 갱신한다.

## 승인 후보

### K56. 실화면 정제 fixture 추출 계약 (C12)

페이지 함수가 원본 섹션을 새 비활성 문서로 허용 목록 복사한다. 값·체크·선택 상태와 모든 표시 텍스트(`[TEXT]`)를 제거하고, id는 `anon-id-N`(for 동시 치환), 선택지·라디오 value와 `data-rel-value`는 같은 표의 `opt-N`, 5자리 이상 숫자는 `snN`으로 바꾼다. computed `display:none`은 `data-fixture-display` 표식으로만 남긴다. 반환 전 금지 속성·텍스트·외부 참조를 재검사해 실패 종류만 돌려준다. 등록 전 확인은 세 가지다: 브라우저 안 원본 대 정제본 구조 대조, 하네스 구조 스냅샷과의 독립 컨트롤 수 대조, offline·JS 비활성 Chromium에서 외부 요청 0건. 첫 허용 목록(v1)에서는 섹션 `header`(추가 버튼 자리), `data-dateinputformat`, `data-rel-value`, `data-index`/`data-loopname`이 빠져 대조가 불완전했고 v2로 넓혀 재승인했다. 한계: id 익명화 때문에 `id="englishName"` 같은 템플릿 id에 의존하는 legacy 상세 모듈은 이 fixture로 재현되지 않는다.

근거: `.git/cf-workflow/live-eval/c12/{extract.mjs,approved-sha256.txt}`; 700d73d; `frontend/fixtures/dom-snapshots/hplace-mrs2-step{2,3}-*/`.

### K57. step 2 합성 builder와 실구조의 차이 (C12 fidelity)

3사 step 2에서 컨트롤의 이름·타입·초기 disabled·data-rel-*·data-dates·선택지 수는 builder와 같았다. 다른 것은 tenant 선택 항목과 섹션 16 구성이다: gsenc 대학에는 계열 select가 없고, gsenc·abl 대학원에는 입학/편입 라디오가 없으며, abl 대학에는 전공 이수학점·평점·만점이 있고, careerhyundai 고교에는 주야간이 있고 학력 날짜가 YMD다. 섹션 16은 경력(153) 뒤에 프로젝트(154)가 오고, abl에는 경험 기술 textarea, careerhyundai에는 경력 첨부 파일이 붙는다. abl step 2에는 고교(140)가 없다. 실구조로 native 수집을 비교할 때는 정책 `rootSelector`(`#wrapResume`)와 자산 script 태그 골격만 합성해야 하며 섹션 내부는 추가하지 않는다.

근거: 700d73d `hplace-mrs2-live-fidelity.test.ts`(RED 9 → GREEN 20); step23-C12-red.log.

### K58. 자격증 등록번호는 64자이고 licenseCode가 행을 연다

3사 실구조에서 `license[i].registNumber` maxlength는 64이며 발급기관·등록번호·취득일은 `data-rel-target=license[i]`로 초기 disabled다. 사이트의 검색 결과 선택은 hidden code 입력(`data-rel-id=license[i]`)에 값을 넣고 focus해 linkedForm focus poll로 행을 연다. 단위 fixture가 32자·비게이팅이면 64자 이하 등록번호 기입이 검증되지 않는다.

근거: c98452c; step23-C12-registnumber-mutation.log.

### K59. 프로젝트(154) 활성화와 남는 필수 칸 (C13)

실구조: projectName이 행 구동자(`data-rel-id=project[i]`, maxlength 128)이고, 발주처·근무지(clientName/workplace)는 필수지만 프로필 키가 없으며, 시작·종료일은 YMD, 역할은 maxlength 128이다. abl에는 기여도 칸이 추가된다. 사용자 H3 승인으로 v4 154를 활성화했고, 로컬 재시드 뒤 gsenc·abl step 2에서 프로젝트명·시작·종료·역할이 matched였다. 발주처·근무지는 비워 두며 확인 필요에도 표시되지 않으므로 사용자가 저장 전에 직접 입력해야 한다. seeder가 insert-only라 활성화는 기존 DB에 자동 반영되지 않는다.

근거: 4962c96; step23-C13-red.log, step23-C13-red-be.log; live-eval auto-2026-10-20T05-43-27.985Z와 step 2 재실행(하네스 c8c45a7).

### K60. 결과 metadata null/undefined 허용은 불필요 (C14 종료)

실화면 step 3에서 시험·자격증 검색이 3사 모두 matched였고 `committed-search-metadata-*` 이탈 진단은 0건이었다. 진행 조건이 성립하지 않아 speculative hardening을 하지 않았다.

근거: live-eval auto-2026-10-20T01-52-34.807Z step 3 verify.

### K61. 테넌트의 지원 방식은 "지원하기" 도착 경로로만 구분된다

공고 상세 HTML, position API, 공개 리소스 경로는 테넌트 간에 같아 지원 방식을 알려 주지 않는다. "지원하기" 뒤 도착 경로가 기준이다: `/app/applicant/registResume`는 MRS2(지원 대상), `/v1/applicant/write-resume/login`은 v1, `www.jobda.im/jobflex/login`은 JOBDA다. 2026-10-20 표본: ligdna=v1, dorco=JOBDA, huonsgroup·com2us·kdi=MRS2.

근거: 시연 준비 기록(plan.md 2026-10-20 15시·16시 체크포인트).

### K62. 상세 기본정보는 현주소 칸이 없어도 인식한다

com2us step 1의 섹션 13에는 현주소 칸이 없다. 상세 모듈 앵커와 FE 플랫폼 지문이 현주소 상세칸을 필수로 요구해 모듈 전체가 fail-closed됐고, 영문 이름·성별·생년월일·병역(같은 모듈 소유)이 모두 비었다. 지금은 주소 제어가 하나도 없는 화면만 현주소를 생략할 수 있고, 일부만 있는 주소 구조는 계속 차단한다. FE 앵커(`detail.ts`), FE MRS2 지문(섹션 13 존재), BE `HplaceFormFingerprint.DETAIL_REQUIRED`(영문 이름·생년월일)를 함께 바꿔야 한다.

근거: 6a7a141; demo-red.log, demo-red-be.log.

### K63. 병역 기간 날짜 정밀도도 테넌트별이다

검증 3사와 com2us는 `military.militaryDate:YM`, huonsgroup은 `:YMD`다. 시작일 칸이 인식되지 않으면 병역 구분 driver의 하위 정착 대기가 실패해 계급·기간·전역구분·군별이 함께 비는 연쇄가 생긴다. 시작일 토큰으로 정밀도를 정하고 기입·날짜 순서 비교·결과 대조를 같은 형식으로 맞추며, 다른 토큰은 계속 거부한다.

근거: 6a7a141 `AutofillWorkflow.hplace-demo-tenants.test.tsx`, `basic.test.ts`.

### K64. 영문 이름 순서 기본값은 성 이름 (사용자 결정)

순서 안내가 페이지에 전혀 없으면 `familyFirst`("HONG GILDONG")로 보낸다(2026-10-20 사용자 결정). 안내가 지원자 영역 밖에만 있거나, 중복되거나, 순서가 모호하면 계속 미기입이다. BE는 바꾸지 않았다(v4 `hplace.detail.englishName.familyFirst` 규칙 사용). 이전의 "안내가 명시될 때만 입력" 결정을 이 범위에서 대체한다. 안내 없는 회사가 실제로는 이름 성 순서를 기대할 수 있다는 한계가 있다.

근거: 6a7a141 `english-name.ts`, `hplace-run2-english.test.ts`.

### K65. Hplace 필드 현황 갱신

프로젝트 4키(projectName·startDate·endDate·role)가 구조 미확인에서 구현으로 옮겨 집계는 구현 95·화면 없음 1·의미 불일치 13·구조 미확인 16·사용자 처리 2다. 실화면 matched는 84키(3사 공통 65, 일부 테넌트 19)다. 다전공의 2·3번째 전공 주야간은 프로필이 학교 단위 값 하나뿐이라 주전공에만 연결한다(main-major-only, 기존과 같음). 영문 성·이름은 안내가 없거나 명시된 회사에서 입력된다.

근거: `.git/cf-workflow/drafts/adapter-field-inventory-hplace.md`(C13 반영본); 6a7a141 실화면 회귀 9/9.

## topic별 반영

- adapter-hplace: K58, K59, K60, K61, K62, K63, K64
- adapter-field-inventory: K57, K58, K59, K63, K64, K65
- adapter-development: K56, K57, K59(배포 주의), K62(FE·BE 동시 변경)
