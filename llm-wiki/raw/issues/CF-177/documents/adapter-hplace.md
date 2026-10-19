# 에이치닷(Hplace) 공통 어댑터

> Issue: CF-177
> Collected: 2026-10-19
> Approval-Digest: 5a54ecda82fcd8b70574c9b3b35910433c10db4823ea2ad8b15ef0bd74df4b97
> Source-Revision: c35f229db509ad1fc7d3cc440729a026afb359db

승인된 후보 전체와 문서 초안을 수집한 기록이다. 후보의 기준 구현 revision은 `32ec152`이며, 수집 시 HEAD는 위 Source-Revision이다. 아래 과거 수치와 관측은 해당 시점의 근거이며 이번 수집에서 재실행한 결과가 아니다. 실제 지원 값·계정·세션·대화 전문은 포함하지 않는다.

## 현재 상태

기업별 호스트 목록 없이 Hplace 공급자 도메인·앱 자산·DOM 소유 구조를 함께 검증한다. 기존 등록 3개·상세 기본정보 17개 계약을 유지하면서 MRS2 writeResume의 새 범주는 DB 실행 정책 v4와 공통 native 실행기로 연결한다. 로컬 정책과 코드의 지원 범위이며 운영 DB 반영이나 최신 설치 확장의 전체 성공을 의미하지 않는다. 127개 프로필 키의 개별 판정은 [필드별 현황](adapter-field-inventory.md)을 따른다.

### 플랫폼 판별과 페이지 종류

FE 공급자 hostname은 영문 소문자·숫자로 시작하고 끝나며 내부에 하이픈을 허용하는 단일 label에 `.recruiter.co.kr` 또는 `.recruiter.im`이 붙는 형태만 허용한다. 하나의 테넌트 label과 http(s), 현재 문서의 같은 origin script/stylesheet 및 소유 DOM 조합을 확인한다. 기업명·공고 번호·배포 해시를 고정하지 않는다. 일반 Next.js/React/jQuery 표식, 외부 지원 링크, API 문자열, 위장 도메인만으로 판별하지 않는다. BE 공급자 matcher는 호스트를 소문자로 정규화하고 끝의 점 하나를 제거하지만 FE 검사를 대체하지 않는다.

| 화면 | 판별·실행 범위 | 제한 |
| --- | --- | --- |
| 신규지원 등록 `/app/applicant/registResume` | applicantCommon.js + registResume.js + applicant.css + 단일 `form#frm` 소유 `section#loginForm.writeResume`; 이름1·전화3·이메일/확인2칸을 논리 3항목으로 처리 | 일반 로그인 아님. 같은 origin post/writeResume·라벨·타입·name·소유 관계 검증; 비밀번호·동의·인증·작성 버튼 제외 |
| MRS2 `/mrs2/applicant/resume/writeResume`, step1 | 같은 origin writeResume.js/template, 유일 `form#frm > #wrapResume` 포함 관계, 11·13 소유 제어; legacy + 한자명·처우·군별·병과·현주소 | 회사마다 활성 항목이 다름; 영문명 순서 불명은 NO_MATCH |
| 같은 경로 step2 | 고교140·대학141·대학원142·경력153, 중첩 전공 및 숫자 GPA | 프로젝트154 정책은 실DOM 미확인으로 disabled. 학위논문/연구/NCS를 추정 매핑하지 않음 |
| 같은 경로 step3 | 비인증 시험165·활용능력166·자격증168 | GS에는 166 없음. YBM/인증 제외, 작문·독해 등 프로필 없는 필수 항목은 사용자 처리 |
| v1 지원자 앱 | 공급자 + v1 index JS/CSS + root/tooltip-root/overlay-root의 플랫폼 지문 | 인증 이후 실제 입력 구조·정적 매핑 미확보로 입력 미지원. 지문 양성을 지원 완료로 표현하지 않음 |
| JOBDA/jobflex 빌더·외부 JOBDA | 공급자에서 특정 page chunk와 6개 DOM root 조합은 식별 증거 | 홈/공고는 입력 금지; 외부 JOBDA 로그인·인증 이후 구조 미확보, MRS2 계약 재사용 불가 |

문서 판별과 실행 허가는 별개다. 새 native 수집기는 후속 단계에서도 단일 form/root, 같은 origin 자산, 정책의 exact path와 section/row 소유를 확인한다. 기존 회사 정책 우선순위를 유지하며 Hplace 공급자에서 정책 부재·불일치·조회 예외가 있으면 범용/LLM으로 우회하지 않는다. 등록된 SK·현대·Greeting의 비대상 경로는 기존 GENERIC 동작을 유지하되 공유 Hplace 조회를 하지 않는다. 등록 host 문서 자체가 요청 host와 일치하는지도 검사한다.

### 실행 모델과 버전

준비 API → 허용 준비 동작·재수집 → fields 분석 → 승인한 로컬 프로필 결합 → 입력·최종 유지 검증 순서를 유지한다. 준비/필드 API schemaVersion은 2이며 새 라우팅 토큰이나 사용자별 서버 상태를 만들지 않는다. DB v4는 legacy factory의 20개 field rule과 resource의 75개 field rule, 9개 section contract, 10개 action rule을 합친다. 여기서 규칙 수·논리 후보 수·프로필 키 수·실제 입력 성공 수는 서로 다르다. 관행상 부르는 legacy “3+17”은 기존 계약 범위이며 영문명처럼 NO_MATCH인 수집 후보를 전부 성공 필드로 세지 않는다.

`BrowserPolicy v2.nativeForm`은 `SCOPED_FIELDS`, `SINGLE_DEPTH_ROWS`, `NATIVE_DRIVERS`, `NATIVE_DATES`, `KEYPRESS_COMMITTED_TUPLE`, `STAGED_MODAL_COMMIT`, `NESTED_MAJOR_ROWS`, `NUMERIC_GPA_PAIR` capability를 사용한다. 회사 선택자·코드·단계 데이터는 정책에 있고 FE 공통 실행기가 소유/정책/URL/프로필 신원을 검사한다. candidate별 legacy/native 담당을 유지해 같은 DOM을 두 writer가 쓰지 않게 한다. 지문 지연·노드 교체·정책 변경/해제는 기존 handle을 무효화한다.

v4 문서 자체가 없는 경우에만 유효 v3의 기존 바인딩을 사용할 수 있다. 잘못된 v4·조회 예외를 v3/generic 성공으로 숨기지 않는다. seeder는 없는 버전만 insert하고 기존 DB 문서를 덮어쓰지 않는다. fields 예산은 run에 보관한다. legacy와 반복 native section 없는 실행은 최대 3회, 활성 반복 native section이 있으면 정책 상한 8회이며 완료 driver 집합의 진전도 검사한다. preparation·사이트 검색·quality report까지 합친 전체 API 요청 3/8회라는 뜻은 아니다.

### 위젯 프로토콜

**검색 확정:** 입력창 query, hidden 이름, 숨김 class 코드 제어, 표시 span과 결과 상자를 같은 위젯·행에 묶는다. 제한된 `keypress Enter` 및 legacy keyCode/which=13으로 검색하고 새 결과의 정확 title 1개·nonzero code·검증된 metadata만 선택한다. Name/Code/display 최종 tuple을 읽어 검색 성공을 판단한다. query 문자열만으로 완료하지 않는다. 학교 검색 결과에는 지역 근거가 없어 selected catalog의 requiredDetail을 입증할 수 없으면 수동이다. 기존 자유 텍스트 학교명은 정확 title 유일성 계약을 유지하되 지역 동일성까지 입증하지 않는다. 검색 실패 후에는 실행이 쓴 query가 그대로이고 tuple/detail이 비어 있으며 소유가 유지될 때만 query를 복원한다. 결과 목록을 삭제하거나 직접등록을 누르지 않는다.

**시험:** EXAM_CODE, 인증/readonly 흔적, 불명 metadata를 클릭 전에 차단한다. 빈 행에 기본 렌더된 숨김 `.ybmValidateDone.hide`만으로 인증 완료라고 판단하지 않는다. 인증행은 구조 식별자와 고정 표시명, `inert:true`의 placeholder 후보로 rowCount/index를 보존하고 BE는 항상 NoMatch를 반환한다. 저장된 일반 시험은 languageExamSn만으로 인증행으로 오인하지 않고 기존 엔티티 신원으로 소비해 중복 ADD를 막는다. 선택 뒤 교체된 detail·등급 옵션을 재수집하며 grade-only 또는 score-only만 허용한다. grade+score 동시/둘 다 없음, 취득일→응시일, 만점 추정은 수동이다. 사이트 자체 등급조회가 발생할 수 있지만 인증·삭제 API는 허용하지 않는다.

**현주소:** `currentAddress`의 우편번호·기본주소·상세주소를 하나의 승인 그룹으로 묶는다. postcodify 결과의 시도·시군구·도로·본번호/부번호·우편번호가 유일하게 일치해야 한다. 지정 17개 시도 약칭과 정식명만 정규화하고 임의 약칭·지하 표기·참고 문자열 제거로 결과를 맞추지 않는다. 결과 선택 → 모달 zip/base readback → 모달 detail → 활성 버튼의 주소 전용 primary-pointer → 동기 생성된 유일 HTML 확인창 → 원래 3값/span 및 모달 닫힘을 확인한다. 이 모달의 “저장”은 공개 소스상 원래 행으로 값을 복사하는 로컬 확정이며 지원서 저장 허용이 아니다. 실제 사이트 전체 네트워크 무변경까지 입증한 것으로 확대하지 않는다.

원래 hidden zip/readonly base와 staging readonly 값은 직접 쓰지 않는다. 기존 주소가 있으면 자동 모달을 열지 않고, 동일 3값은 readback으로 종료하며 legacy 상세주소는 원래 기본주소·우편번호가 승인 프로필과 같을 때만 처리한다. 실패 뒤 실행이 동기로 캡처한 확인창 취소 → 캡처한 modalClose만 정리할 수 있다. 교체된 창/버튼을 채택하지 않으며 안전한 소유가 없으면 사용자에게 남은 창 처리를 안내한다. 원래 주소를 직접 rollback하지 않는다. `ACTIVATE_PRIMARY`는 공용 DomPlan에서 제거되어 주소 전용 범위다.

**반복·중첩 행:** 채워진 학교/경력/시험 등 기존 엔티티 전체를 보호하고 정확 신원·대응 상세값이 일치하는 프로필을 소비한다. 불완전/중복/충돌 신원은 섹션을 수동으로 돌린다. 나머지만 빈 행에 배정하고 부족분만 ADD한다. 행이 0개이면 ADD 후보를 만들지 않는다. 일반 행의 data-index는 선택적이며 실제 name 인덱스·소유·전체 행 수를 대조한다. 대학/대학원은 `.wrapSubject[data-loop][data-index]`, 추가 버튼은 section 소유이고 전공은 해당 부모 안의 마지막 보이는 ADD만 사용한다. 정확히 +1과 기존·형제 불변을 확인하며 remove/reset은 없다.

학교 item의 API 필드는 평탄하게 유지하고 child index는 로컬 registry에서 관리한다. depth2의 최대 3전공과 부모 최대 20행만 표현한다. 주/복수/부 역할을 프로필로 정하고 부전공만 있으면 추가 슬롯1로 압축한다. D6-a `UNIVERSITY_MAIN_MAJOR_CLASSIFICATION`은 주전공명이 있는 경우만 주전공을 반환한다. 주야간을 추가전공 전체로 복제하지 않는다. 숫자 GPA는 동일 부모 score/perfectScore 쌍의 범위·step·옵션 노드 및 score→scale 활성 순서·최종 두 값 readback을 검사한다. PASS/FAIL, 전공별 학점·평점, 학기/과목 성적은 대체하지 않는다. tenant 내부 maxLimitCount는 DOM 노출 근거가 없어 사전 추정하지 않고 ADD 증가 실패 시 수동 사유를 남긴다.

### 안전 경계

탭·다음·임시저장·미리보기·제출·지원서 작성·비밀번호·동의·파일·YBM/인증·`existYn=false`·remove/reset·상동 복사를 자동 실행하지 않는다. disabled/readonly/기존 값/사용자 변경/프로필 변경/URL·run 변경을 확인하고 선택자·코드·옵션이 불명확하면 해당 항목을 입력 불가로 둔다. required 항목이 남았다고 미지원 값을 추정하지 않는다. 실제 입력값·계정·세션은 분석 API·fixture·문서·로그에 담지 않고 값 결합과 행 신원은 로컬에 둔다.

### 배포 순서와 현재 상태

BE v4와 새 확장을 한 호환 변경으로 준비하되 활성화 순서는 **새 확장 배포 → 대상 사용자의 설치/보급 확인 → BE v4 DB 활성 포인터 변경**이다. 구 확장은 새 capability/DERIVED enum을 이해하지 못해 native 정책 전체를 거부할 수 있다. 로컬 구 validator probe의 4 assertions는 실제 구 확장 브라우저 종단 검증을 대신하지 않는다. resource의 enabled=true는 로컬 코드 설정이며 DB migration·활성 포인터·운영 배포는 수행되지 않았다. 설치 확장의 검색 키 이벤트·주소 포인터·linkedForm·재실행을 확인하기 전 운영 지원 완료로 표시하지 않는다.

## 실사이트 근거와 검증 한계

2026-10-18/19 GS리테일·한국타이어 두 테넌트의 구조·옵션·공개 JS 근거를 비식별로 대조했다. form/root 포함 관계는 같지만 활성 항목과 옵션은 다르다. GS에는 한자명·처우·고교 주야간·봉사 등이 관측됐고, 한국타이어에는 활용능력·컴퓨터활용·수상과 전공 성적 필수 항목이 관측됐다. 두 회사 모두 관측한 step2에는 프로젝트154가 없었다. 동일 공개 template은 다른 공고의 입력 성공 증거가 아니다.

관측 중 합성 keypress가 검색을 발생시키고 학교/전공 선택이 tuple을 확정한 기록, 빈 행 ADD와 재색인, 주소의 실제 포인터→확인창→원래 값 반영 기록이 있다. 이는 조작별 구조 근거이며 HEAD `32ec152` 설치 확장으로 패널→준비→전 범주 입력→재실행을 검증한 기록은 아니다. 실제 지원자 값과 코드값으로서의 사용자 식별값은 이 문서에 기록하지 않는다.

이전 10월 12일 등록 14개사와 10월 13일 두 회사 기본정보의 제한된 설치 관측은 해당 revision의 역사적 증거다. 그 임시 원본 경로는 현재 소실 기록이 있어 checkpoint 요약 이상으로 재검증했다고 주장하지 않는다. 최신 코드의 FE 4,432 통과/19 skip, BE 877 통과/4 skip 및 하네스 통과는 P4 보고서의 자동검증이며 공식 WSL/Linux 실행·최신 설치 확장 평가는 별도다.

## 변경 이유와 근거 위치

등록/기본정보만 있던 v3 이후 실제 후속 단계 구조를 확보해 공통 정책 실행 범위를 넓혔다. 주소 모달의 “저장”을 지원서 저장으로 보아 제외했던 과거 판단은 로컬 복사 소스와 관측으로 정정한다. 기존 전용 코드의 전면 정책 이관과 새 프로필 범주 생성은 이번 범위에서 하지 않는다.

근거: `frontend/src/autofill/adapters/hplace/fingerprint.ts`, `backend/src/main/java/com/careerform/formanalysis/application/policy/HplaceApplicantSite.java`, `backend/src/main/java/com/careerform/formanalysis/infrastructure/persistence/mongo/HplaceCompanyFormPolicyFactory.java`, `backend/src/main/resources/policies/hplace-mrs2-v4.json`, 공통 `frontend/src/autofill/policy/` 및 `workflow/workflow-analysis.ts`; `.git/cf-workflow/{mrs2-section-contracts,design-remaining-scope,task-P1-report,task-P2-report,task-P3-report,task-P4-report}.md`, `live-dom/*.md`, `review-P1.md`–`review-P3.md`. 위 로컬 경로는 수집 당시의 근거 위치이며 배포된 문서가 아니다. 승인 후보의 계약·관측·검증 요약은 아래 bundle 내부 문서로 보존한다.


## 함께 보존한 근거

- [실행 계약 결정](contract-decisions.md)
- [실사이트 구조와 역사적 관측 한계](live-evidence.md)
- [단계별 자동 검증과 남은 검증](verification.md)
- [범위 밖 후속 후보](follow-up-candidates.md)
