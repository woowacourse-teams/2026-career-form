# Hplace 비식별 구조 관측과 역사적 근거

> Issue: CF-177
> Collected: 2026-10-19
> Approval-Digest: 5a54ecda82fcd8b70574c9b3b35910433c10db4823ea2ad8b15ef0bd74df4b97
> Source-Revision: c35f229db509ad1fc7d3cc440729a026afb359db

승인된 후보 전체와 문서 초안을 수집한 기록이다. 후보의 기준 구현 revision은 `32ec152`이며, 수집 시 HEAD는 위 Source-Revision이다. 아래 과거 수치와 관측은 해당 시점의 근거이며 이번 수집에서 재실행한 결과가 아니다. 실제 지원 값·계정·세션·대화 전문은 포함하지 않는다.

### K01. 공급자 지문과 공개 표본의 한계

정확한 단일 테넌트 recruiter.co.kr/recruiter.im 호스트와 같은 origin 앱 자산·DOM 조합으로 식별한다. 기업 목록·배포 해시를 고정하지 않는다. 최초 30개사 공개 62표본·정상 반례5와 안랩의 applicantCommon.js/registResume.js/CSS/등록 form 지문은 식별 근거다. 표본 발견과 실제 전체 지원서 탐지율은 다르며 공개 지문 검증을 인증 이후 지원 완료로 확대하지 않는다.

근거: checkpoint[1]; fingerprint.ts.

### K02. 등록 화면의 제한된 입력 예외

사용자 확정 범위는 MRS2 신규지원 시작 화면의 이름·휴대전화·이메일이다. 단일 form#frm의 post/같은 origin writeResume, section#loginForm.writeResume, 라벨·타입·name·maxlength·소유 관계를 검사한다. 이름1칸·전화3칸·이메일/확인2칸을 논리3항목으로 묶고 비밀번호·동의·인증·작성 버튼은 제외한다.

근거: checkpoint[2]; registration.ts.

### K03. v3 legacy 범위와 현재 v4 조합

v3는 등록3+기본정보17의 20개 rule을 제공하고 필수 anchor와 optional 제어의 타입·유일성을 검사한다. 비활성 optional은 상태 선택 뒤 재수집한다. 성별/국적 CONDITIONAL 및 병역/보훈/장애 ALLOWED 경계는 기존 계약을 보존한다. 영문 이름의 순서 안내 부재는 NO_MATCH다. 현재 v4는 legacy 규칙에 공통 native 정책을 더하며 로컬 구현과 실제 서버/운영 반영을 구분한다.

근거: checkpoint[3]; HplaceCompanyFormPolicyFactory.java; P1/P2/P4 보고서.

### K04. 등록 그룹의 값·검증 표식 소유

분할전화·이메일 확인은 전체 그룹의 기존/부분 입력, 중복·누락·hidden·readonly·disabled·사용자/프로필 변경·stale을 보호한다. 전화 이벤트가 동기화한 숨김 제출값, 이메일 본문 blur 후 확인란과 새 source 검증 표식을 확인하며 이전 ok 표식을 재사용하지 않는다. 값 조회·결합은 로컬에만 두고 요청에는 값·계정·세션을 담지 않는다.

근거: checkpoint[4]; write.ts; task-C-report.md.

### K05. 10월13일 기본정보 전수 비교의 시점 제한

당시 현대해상 기본정보는 프로필120키와 대조했고 생일·기존 주소 일치 시 상세주소·비상전화에 성별/국적·보훈3·장애3·병역6을 더한 상세17 범위를 기록했다. 대한민국 KR, YM 복무기간과 조건부 활성 제한이 있었고 상세의 이름/전화/메일은 표시 전용이었다. 당시 한자 DOM 없음과 후속 화면 미검증은 그 화면에 한정된다. 현재 프로필은127키이며 GS 한자/처우 실관측과 v4 주소 지원을 반영한다. 모달 저장 때문에 주소 전체를 제외한 과거 설명은 K26으로 정정하고 과거 임시 inventory 원본은 현재 재현 증거로 사용하지 않는다.

근거: checkpoint[5]; plan.md; live-dom/gs-step1-basic.md.

### K06. 10월12일 공개·등록 설치 관측의 범위

checkpoint는 안랩 제외29개사 공개58문서의 지문 일치, MRS2 등록14개사에서 42논리항목/84칸 입력 및 패널 종료 후 유지, 초기 기존값0과 금지 조작0을 기록한다. V1 6개사 동의, 외부JOBDA 5개사 로그인에서 중단했고 채용없음/Pool3개 및 목적지 미확보1개를 분리했다. 당시 설치 revision 9eb456de18dbaca51f29dd29fe79c6a1515eeac3/CLEAN이며 독립 정답 비교와 hidden 합성값은 미측정이었다. 과거 임시 원본은 소실 기록이 있어 이 수치는 checkpoint의 역사 요약으로만 유지하고 최신 v4 설치 성공으로 쓰지 않는다.

근거: checkpoint[6]; plan.md의 임시 근거 소실 기록.

### K07. 읽기 DOM·합성 fixture·설치 평가의 구분

현대해상/한국타이어 기본정보와 공개 writeResume/template로 유일 same-form/section11·13/subject/row 소유를 합성 fixture에 표현했다. 생일의 YYYY.MM.DD·공개 초기화 상한과 기존 주소의 base/zip/span 일치를 검사했으나 당시 검색·hidden/readonly 직접쓰기·실제입력은 없었다. 영문 순서 및 미확인 선택코드를 추정하지 않는다. 공개 소스·읽기 구조·합성 입력·설치 확장 증거를 서로 대신하지 않는다.

근거: checkpoint[7]; legacy detail fixture.

### K09. run 단위 요청 예산과 지연 지문 보호

legacy 상세의 정상 preparation1/fields1, 등록의 preparation1/fields2 회귀와 run 단위 fields 최대3을 기록한다. 매 mutation/최종에 프로필·URL·소유노드·기존값·날짜·주소를 재확인하고 지연 지문으로 회사 선택이 바뀌면 재시작한다. 지연 지문 회귀는 fields1→0·생일쓰기0을 확인했다. 현재 v4의 활성 반복 section은 진전 조건과 최대8을 사용한다(K17). preparation/quality report/사이트 검색은 fields 예산과 별도다.

근거: checkpoint[9]; workflow-analysis.ts.

### K11. 10월13일 두 테넌트 제한된 설치 평가

당시 설치 revision599a4dc7c2538c8b0789c364f7de1615bce6be7b/CLEAN에서 현대해상/한국타이어 기본정보를 평가했다. 회사별 안전 입력 후보3개를 사전 확인했지만 실제 자동 입력은 각1개였고 익명 대상의 정규화 일치·패널 닫은 뒤 유지를 관측했다. 제어35개/33개 중 대상1개만 변경됐으며 한국타이어 한 실행은 준비1+fields1, 모두HTTP200이었다. 현대해상 실행별 API 기준점·전체 제안 수·정답률은 미측정이다. 금지 동작은 하지 않았으며 임시 원본 소실로 현재는 checkpoint 요약만 재사용한다.

근거: checkpoint[11]; plan.md.

### K12. linkedForm radio click과 승인 경계 정정

공개 linkedForm은 radio click을 구독하므로 change만 듣는 fixture의 거짓양성을 click 전용 RED→GREEN으로 수정했다. 정확 코드/라벨/바인딩/소유와 data-rel 연결을 검사하고 다른 subject·금지 제어 연결을 차단한다. 같은 단계 상태3개를 일괄 처리해 재분석1회, 조건부 자식 활성/날짜 상대값/최종 상태를 검증했다. 준비1+fields2·재실행 이벤트0·반대 기존상태 보존 회귀이며 당시 실제 입력은0이었다. 민감 표시와 별개로 당시 공통 sensitive-confirmation allowlist18개는 일반 oneclick 허용이었다는 정정을 유지하고 새로운 개별승인 필수 규칙을 만들지 않는다.

근거: checkpoint[12]; legacy basic-write 회귀.

### K18. 두 테넌트의 root·활성 section 차이

GS리테일/한국타이어 모두 div#wrap > form#frm > div#wrapResume > section.writeResume 구조다. 대학/대학원 행은 loop 클래스 없는 wrapSubject이며 전공은 row.loop다. GS에는 한자·처우·고교 주야간·봉사, 한국타이어에는 활용능력·컴퓨터활용·수상·전공 성적/파일 필수 등이 관측됐다. 같은 공개 template은 공고별 활성 구성이나 입력 성공의 보장이 아니다.

근거: live-dom/step2-education-career.md; repeat-rows.md; step3-language-license.md.

### K20. 연봉 단위는 실제 CSS 소유 근거

희망/직전연봉은 직접 부모 span 또는 label.money의 computed ::after가 정확히 만원이고 million 클래스가 없을 때만 쓴다. .million은 억원이며 숫자 상한이나 label 태그만으로 단위를 추정하지 않는다. 수집·쓰기·최종 확인에서 같은 unit guard를 사용하고 경력별 salary와 latestSalary를 혼용하지 않는다.

근거: live-dom/gs-step1-basic.md; repeat-rows.md; native-form-unit.ts.

### K26. D5 주소 모달의 로컬 확정

주소 모달 저장은 공개 btnEvent상 원래 currentAddress triplet/span으로 복사하는 로컬 확정이므로 지원서 저장과 구분한다. 활성 결과는 postcodify_search_result이며 midas-address-result라는 초기 추정을 정정했다. 주소/우편번호 유일 정확 결과→모달 readback→모달 상세→주소 전용 primary-pointer→동기 소유 HTML confirm→원래 triplet/span 및 닫힘을 확인한다. HTMLElement.click 무반응과 실제 포인터 관측은 synthetic pointer의 설치 수용을 증명하지 않는다.

근거: live-dom/address-modal-finding.md; staged-address.ts.

### K32. ADD·재색인·tenant 한도 관측

일반 add는 마지막 행 내부, 대학 addCollege는 section 소유, 전공 add는 해당 학교 내부다. 일부 행에는 data-index가 없어 name/순서/전체집합으로 검증한다. 외부 삭제는 뒤 행을 재색인하므로 stale 신원을 중단한다. 수집0행에서 ADD하지 않고 내부 maxLimitCount는 DOM 노출 근거가 없어 추정하지 않는다. 실패 후 한도/추가 조건 수동 안내를 남기며 remove/reset/existYn=false를 실행하지 않는다.

근거: live-dom/repeat-rows.md; task-P3-report.md.

### K34. 127키와 사이트 전용 항목의 전수 분리

현재13범주127키를 빠짐없이 한 번씩 세고 정책 enabled·FE 소비를 함께 대조한다. 실제 활성/간접 소비89, 의미 불일치15, 구조 미확인20, 지정 화면 부재1, 파일 사용자 처리2다. 프로젝트4키는 disabled 규칙을 구현 수에 넣지 않는다. 새 범주 생성 없이 사이트 전용27행을 별도 표로 두며 프로필 키 없음23/명시 제외2/인증·파일2를 구분한다.

근거: field-definitions.ts; adapter-field-inventory-hplace.md 초안.
