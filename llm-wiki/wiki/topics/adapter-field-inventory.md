# 어댑터 필드 현황

> Topic: adapter-field-inventory
> Status: Current
> Current: [CF-177 현재 근거](../../raw/issues/CF-177/documents/adapter-field-inventory.md)
> History: [근거 1](../../raw/issues/CF-41/documents/indexes/location-dependent-policies.md); [근거 2](../../raw/issues/CF-46/documents/adapter-field-inventory.md); [CF-83 근거](../../raw/issues/CF-83/documents/adapter-field-inventory.md); [CF-86 근거](../../raw/issues/CF-86/documents/adapter-field-inventory.md); [CF-94 근거](../../raw/issues/CF-94/documents/adapter-field-inventory.md); [CF-160 근거](../../raw/issues/CF-160/documents/adapter-field-inventory.md); [CF-168 근거](../../raw/issues/CF-168/documents/adapter-field-inventory.md); [CF-169 근거](../../raw/issues/CF-169/documents/adapter-field-inventory.md); [CF-177 근거](../../raw/issues/CF-177/documents/adapter-field-inventory.md)
> Updated: 2026-10-19

## 현재 상태

CF-160에서 Greeting 현주소, 프로젝트 이름·역할·내용·기간과 행 추가, 어학 등록번호, 자격증 등급·등록번호, 퇴직사유, 대학 총 이수학점, 대학·대학원 소재지, 병과·병역구분·제대구분·장애등록번호·보훈관계를 연결했다. disabled 기본정보는 식별에만 사용하고 쓰기는 차단한다. 대응 키가 없는 필드는 미지원으로 유지한다. [필드별 보호 조건과 검증 범위](../../raw/issues/CF-160/documents/adapter-field-inventory.md)는 코드 지원과 실화면 관측을 구분한다. CF-168은 Greeting 어학 등급·회화 수준의 선택지 불일치를 해당 필드만 건너뛰는 `OPTION_UNMATCHED`로 처리한다([근거](../../raw/issues/CF-168/documents/adapter-field-inventory.md)). 아래 다른 회사의 기존 계약과 과거 검증 수치는 유지한다.

현대·SK 프론트의 구현 기능과 자동 검증 범위를 현황표로 관리한다. 현대 로컬 정책은 v7이며 병역·보훈은 별도 조건부 계약으로 기록한다. 개별 필드 연결은 활성 서버 정책과 DOM 검증을 따르며, 실제 페이지 지원을 추정하지 않는다. 현대 취득일의 ID/이름 구분은 비식별 회귀로 검증했고, 최신 설치 smoke는 주소·국적1과 고교·학사 2행을 독립 대조했다. SK 경력·국적·대학 년월·학교·자격증·시험 검색은 승인된 전체 패널 검증 범위와 함께 기록하되, 저장·제출 호환성 및 P1/P3/P4 전체 기능은 미검증·미구현으로 유지한다. LG 학교 검색은 이번 변경에서 미구현이다.

SK 검색은 입력별 widget의 새 검색 완료와 유일한 label/value를 확인하며 시험은 nonzero id만 자동 선택한다. 행·검색 종류별 쓰기와 확정은 직렬 처리하고, 시험 언어 선택 뒤 text 또는 select 성적란이 하나만 나타날 때 후속 분석한다. 전체 fixture를 실제 popup→사이드 패널→자동 기입 경로로 실행한 결과 준비 2회와 필드 분석 8회가 모두 HTTP 200/ADAPTER/COMPLETE였으며, UI 집계 23개 기입 성공·0개 직접 확인은 선행 선택·미지원·미선택 항목 전체 성공을 의미하지 않는다. 테스트 후 프로필 키 미존재와 지원서 204개 제어 상태를 복원했다.

CF-82는 표준 ID 어학 값을 현재 페이지의 정확히 하나인 메뉴 후보에만 연결한다. 현대는 visible `data-code` 버튼과 선택 뒤 hidden code를, SK는 visible nonzero autocomplete ID와 명시적 별칭을 사용한다. 0개·복수 후보와 자유 텍스트는 자동 선택하지 않는다. 상세 근거는 [CF-82 보완](../../raw/issues/CF-82/documents/adapter/live-option-selection.md)을 따른다.

CF-169는 현대 어학 언어·시험과 SK 어학 언어 상태 드라이버의 실패를 같은 행으로 격리하고 현대 국적과 SK 우대 여부 드라이버는 근거가 없어 제외한다([근거](../../raw/issues/CF-169/documents/adapter-field-inventory.md)).

## 변경 이유

CF-114 범용 자격증 흐름은 회사 어댑터 지원 추가가 아니다. 합성 3개 마크업의 자동 회귀와 설치 빌드 일치를 확인했지만 설치 확장 전체 smoke는 미완료이며 실제 CJ 자동 입력 성공은 입증하지 않았다. 다른 회사 실제 지원도 추정하지 않는다. [CF-114 범용 지원 경계](../../raw/issues/CF-114/documents/generic-certificate-search.md)를 참고한다.

CF-46의 회사별 분리와 현대 취득일 보완을 자동 검증, 현재 화면 읽기 전용 점검, 수정 후 재기입 미검증으로 구분해 기록했다.

## 반복 행 후속 보완

ID 없는 현대 프로젝트·논문 구조 식별로 준비 단계 차단을 복구하고, 어학시험·활용능력의 개수를 분리했다. 자격증명 직접 매핑과 1→3행 추가·개별 입력·중복 추가 방지 회귀를 확인했다. 학력은 정책 v4에서 필요한 행을 준비하며 해외경험 자동 추가는 미지원이다. 로컬 서버 반영과 실제 페이지 재기입 범위를 구분한다. 상세 근거는 위 Current 문서를 따른다.

## 외국어 선택 보완

검증된 언어·영어시험·등급·활용 언어·회화수준 매핑과 단계별 직접입력 준비를 추가했다. 같은 행·메뉴의 선택과 최종 코드 검증, 선행 선택 재실행 방지 및 실패 시 입력 중단을 유지한다. 작문·독해와 미검증 선택지는 추정하지 않는다. Current 근거에서 지원 범위와 검증 한계를 확인한다.

## SK 반복 추가·주소 검색 검증

전체 fixture에서 경력1·자격증3·시험1행의 준비와 결과 단계 도달을 확인했다. SK 주소 검색은 기존 API의 지원 협상, 정확한 필드 바인딩과 카카오 iframe의 유일 결과 선택을 사용한다. 공개 주소의 우편번호·기본주소·상세주소 반영 및 readonly 유지, 정확 일치 없는 주소의 미입력과 원복을 실제 패널에서 검증했다. 주소 검증 당시 경력 매핑·대학 날짜 길이·시험 성적 문제를 제한으로 기록했으나, 최신 경력·년월·시험 검증 범위는 아래 보완 절에서 갱신했다. 다른 검색의 이름 텍스트 일치를 선택 코드 확정으로 확대하지 않으며 실제 저장 호환성과 범위 밖 필드는 제한으로 유지한다.

## 현대 주소·국적·학력 현황

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| 국내 주소 | `postCd` readonly에서 유일한 정확 결과 선택, 상세주소 연결과 실행 소유 modal cleanup | 해외·불명확 결과 미지원; 저장·제출 미검증 |
| 국적1/2 | 국적1 대한민국 표시명·`KR` 확정, 국적2 불변 | 대한민국 범위만 지원 |
| 학력 | 종류 3/4/5/6/7, 그룹별 `itemGroupId/index/count`, 학교 `school`·전공 `basic` 검색과 유효 코드 검증 | 실제 설치는 고교·학사 2행; 대학원·전문학사·박사 미검증 |
| 실제 설치 smoke | 주소 3값·readonly, 학교 2행 이름·코드·marker·기간 4필드, 대학 전공 코드·GPA·졸업 코드 독립 대조; API 7회 200/ADAPTER/COMPLETE | UI 38/0은 전체 성공이 아니며 toolbar icon 클릭 미검증 |

## CF-83 자동 기입 보완 (2026-09-09)

이 절은 앞선 CF-46 검증 기록 이후의 변경이다. CF-83 설치 확장의 가상 전체 fixture 검증에서 SK 학력 0→1과 재실행, 병역·보훈 연결 및 현대 전공 표시명·코드·marker·라벨 상태와 만점기준을 확인했다. 수동 확인 항목은 별도로 남기며 전체 필드 성공으로 표현하지 않는다. 실제 툴바 아이콘 진입, 저장·제출 호환성과 운영 정책 배포는 미검증이다.

SK 고교·대학 추가 버튼은 ID가 없는 후속 행에서도 회사 루트, 학력 종류, 행·버튼 조상 구조와 학교 입력칸을 검증해 안정적인 ID로 수집한다. 공통 반복 실행기의 재식별 및 정확히 1개 증가 조건은 유지한다.

SK 병역은 대상 라디오→군필/미필/면제/복무중 분류→노출된 상세 필드 순서로 처리하고, 보훈은 대상 여부·번호·관계를 연결한다. 기존 반대 선택과 다른 병역 분류는 보존하며, 이미 같은 선택에는 변경 이벤트를 다시 보내지 않는다. 보호 여부는 준비 계획과 실행 직전에 확인한다.

공개 fixture의 병역·보훈 정의 필드는 가상 값으로 채우고, 모순되는 상태는 별도 테스트로 분리한다. 현재 확인한 SK 화면에 없는 군별·계급·복무일자와 미검증 특기·전역구분·보훈구분은 실제 입력 지원으로 표시하지 않는다. 기존 다른 화면용 정책과 신규 미지원 필드를 구분한다.

현대 대학 만점기준은 4.00→4.0/4, 4.30→4.3/4.3, 4.50→4.5/4.5, 100.00→100/100의 표시명/코드만 연결하고 정확한 hidden rcdPerf를 사용한다. directRcdperf 및 기타 직접입력은 제외한다. MongoDB 8의 정책 저장 시 소수점 Map 키를 보존하도록 변환기를 구성하고 SK·현대 정책의 BSON 왕복과 새 가상 DB의 실제 API 조회를 검증했다.

현대 대학 복수·부전공은 유무가 있음이고 이름이 있을 때만 같은 행의 basic/0200/0015 검색에서 유일한 정확 결과와 hidden 코드·marker를 확정한다. 성공 및 이미 확정된 학교·전공에는 exist 클래스를 반영하고 실패·취소 시 실행이 소유한 값과 라벨 상태만 복원한다. 프로필 조건 검증은 대학 범위로 한정한다.

이전 CF-83 학력·전공 검증 시점의 로컬 정책 버전은 SK v23·현대 v5였으며 프로필 스키마와 API DTO는 변경하지 않았다. 자동 테스트, 읽기 전용 실제 DOM 확인, 별도 가상 DB의 API 검증을 실제 설치 확장의 재기입 검증과 구분해 문서화한다. 실제 툴바 아이콘 진입, 저장·제출 호환성과 운영 정책 배포는 미검증이다. 후속 SK 병역 동의어의 실제 재기입은 별도로 대기 중이다.

| 대상 | CF-83 자동 검증 | 실제 설치 검증 상태 |
| --- | --- | --- |
| SK 고교·대학 | 0→1·1→2, 한 번 실행 후 입력, 중복/모호성/비정상 증가 방지 | 가상 전체 fixture에서 0→1과 재실행 확인 |
| SK 병역·보훈 | 상태별 연결, 기존 값 보존, 동일 선택 이벤트 재발행 방지 | 가상 전체 fixture에서 연결 확인 |
| 현대 만점기준 | 4개 표시명/코드, rcdPerf 식별, BSON 왕복 및 실제 API | 가상 전체 fixture에서 확인 |
| 현대 학교·전공 | 같은 행의 검색 확정, 유무 조건, 성공 라벨과 실패 원복 | 전공 표시명·코드·marker·라벨 확인; negative의 추가전공은 수동 |
| SK 병역 alias | `만기전역`→군필의 회사·필드 키 한정 정규화 | 로컬 fixture 경로 확인; 실제 설치 재진입 대기 |

CF-83 후속 negative fixture는 현대 복수전공의 정확 결과 0개를 수동 확인으로 남기고 같은 행의 minor/GPA 입력을 계속해 40개 입력·2개 수동 확인을 기록했다. SK `만기전역` alias는 구조적 fixture import와 로컬 경로만 확인했으며 실제 설치 재진입·저장·제출·toolbar icon·운영 정책 rollout은 미검증이다.

## 현대 병역·보훈 현황 (2026-09-09)

| 대상 | 현재 계약 | 제한 |
| --- | --- | --- |
| 병역 상태·상세 | `milCd`, `milExcptCd`, `milRank`, `milDitinc`의 확인된 표시·코드 | 상태 선택 후 disabled/required와 hidden 코드 재확인; 미승인 상태 추정 금지 |
| 복무 날짜 | `milStartDt`·`milEndDt` exact id/name, YEAR_MONTH | 코드 지원 계약은 반영됨; 실제 설치 검증 상태는 PR #84 기록 참조 |
| 보훈 | `branchYn`, `branchRel`, `branchNo` 조건부 연결 | 보훈구분·취업지원·가점 추정 금지; 번호 숫자 1~10자리 |
| 상태별 fixture | 병역 4 × 보훈 2 전체 프로필 8개 | 코드 지원 계약은 반영됨; 실제 설치 검증 상태는 PR #84 기록 참조 |

초기 공란의 enabled/required 상태 때문에 선행 선택을 gate로 사용한다. 코드 지원 계약과 실제 검증을 구분하며 실제 설치 검증 상태는 [PR #84 검증 기록](https://github.com/woowacourse-teams/2026-career-form/pull/84)를 따른다.
## 현대 만기전역 alias 현황 (2026-09-09)

현대 `milCd` BUTTON_OPTION optionMap의 `만기전역`→필/1 매핑을 `militaryStatus` 필드에 한정한다. 별도 전체 fixture alias 파일과 통합 테스트가 경계를 확인하며, SK 정규화 hook·공통 normalizer·다른 회사/필드·알 수 없는 상태로 확대하지 않는다. 실제 검증 상태와 범위는 [PR #84 검증 기록](https://github.com/woowacourse-teams/2026-career-form/pull/84)를 따른다.

## CF-86 학력 소재지·주야간 현황 (2026-09-10)

프로필 UI·저장 형식은 유지한다. 백엔드 지원 키는 대학·대학원 `attendanceType`, 대학원 `schoolRegion`을 추가하며 표준 ID와 기존 표시 문자열을 호환한다. 로컬 정책은 SK v24·현대 v7이다.

| 대상 | 구현 및 자동 검증 | 실제 설치 검증·제한 |
| --- | --- | --- |
| SK 고교·대학·대학원 소재지 | 정확한 native select name, 공식 지역명 18개 명시 별칭, 기존 문자열과 중복 선택지 보호 | 고교·대학 개별 표시/코드 확인; 대학원 실제 입력 미검증 |
| SK 대학·대학원 주야간 | 정확한 select name, 주간/야간 1/0, 표준 ID 및 기존 표시 문자열 | 대학 주간 확인; 대학원·야간 실제 입력 미검증; 고교 제어 없음 |
| 현대 대학·대학원 주야간 | name 없는 schClass trigger와 hidden schClass, 정확한 그룹·코드·유일 메뉴, D/N | 대학 주간 표시/코드 확인; 대학원·야간 실제 입력 미검증 |
| 현대 대학·대학원 소재지 | name 없는 text trigger, 국가 대한민국/KR 후 재분석, 정확한 서울/95·세종/01356만 허용 | 대학 국가·도시 표시/코드 확인; 대학원·세종 실제 입력 미검증; 다른 도시·구·해외 국가 추정 금지 |
| 현대 소재지 실패 격리 | 빈 국가·중복 도시·정확한 도시 없음은 select-wrap만 수동 처리, 다른 필드 입력 유지 | 자동 통합 테스트로 검증; 학교·주전공 실패 규칙은 별도 유지 |
| API 및 상태 추적 | BUTTON_OPTION text는 SELECT_BUTTON_OPTION만 허용, SET_TEXT 거부; 국가·도시를 DOM 식별자로 구분 | 실제 설치 경로 확인 |

최종 자동 검증은 프론트 79개 파일의 701개 통과·20개 건너뜀, typecheck/lint/format/build, 백엔드 전체 Gradle 테스트, 하네스 검증 통과다. 소재지 실패 격리 회귀는 처리 제거 시 실패하고 원복 후 4개 통과를 확인했다. 빌드는 `VITE_API_BASE_URL=http://localhost:8080`과 manifest/background의 localhost API를 확인했고 로컬 백엔드를 갱신했다. 코드 지원·자동 테스트와 실제 설치 확인 범위를 구분하며, 현대의 별도 검색 재시도·수동 확인을 전체 성공으로 해석하지 않는다. 실제 지원서 저장·제출·페이지 이동·미리보기, 운영 정책 배포는 하지 않았다.


## CF-99 결과 패널 진단 (2026-09-24)

현대 학교·전공 및 SK 학교·자격증·시험 검색의 실패 사유와 성적란 준비 실패를 결과 패널에 연결했다. 신규 지원 필드는 추가하지 않는다. 비식별 자동 테스트로 진단 전달을 확인했으며 실제 설치·저장·제출 검증 범위를 확대하지 않는다. 상세 근거는 [CF-99 승인 결정](../../raw/issues/CF-99/documents/autofill-follow-and-install.md)을 따른다.

## Greeting 공통 정책 현황 (CF-94)

아래 설치 확장 관측은 2026-09-28 라우팅 단순화 이전의 증거다. 기존 필드 지원의 근거로 보존하며 이번 수정의 브라우저 재검증으로 취급하지 않는다. 이후 카카오게임즈 필드 확장의 실화면 관측과 최신 수정본 검증 한계는 별도 후속 절에 기록한다.

[CF-94 필드별 표](../../raw/issues/CF-94/documents/adapter-field-inventory.md)는 카카오모빌리티의 기본정보·민감정보·대학교/대학원 대응 항목과 화면 없음·의미 불일치·미검증 범주를 분리한다. 설치 확장에서는 카카오모빌리티 48개 입력과 재실행 새 입력 0개, 현대오토에버·무신사 공통 3개, 당근서비스 국적 포함 4개, 메디퀴터스의 `이메일` 표시명 포함 3개를 각각 확인했다. 현대오토에버의 별도 공개 공고에서도 재실행 새 입력 0개와 공통 세 값 유지를 확인했다. 카카오모빌리티 대학원 추가전공의 이름·분류·분야도 실화면 값 유지를 각각 관찰했다. 이 숫자는 개별 공개 화면의 실행 결과이며 기업 전체 지원이나 저장·제출 검증이 아니다. 메디퀴터스의 이메일 확인 버튼은 실행하지 않았다.

Greeting DNS/DOM 자동 판별은 기업별 지원 목록을 제거하는 라우팅 변경이다. 이후 승인된 필드 확장은 아래 후속 절로 구분한다. 이전 설치 확장 관측은 DNS/DOM 자동 판별 이전의 증거다. DNS/DOM 판별은 합성 회귀·정적 검사·빌드와 로컬 서버의 DNS/API 응답으로 검증했다. 이후 필드 확장의 카카오게임즈 설치 브라우저 관측은 별도이며 최신 수정본의 빈 지원서 전체 실행과 재실행은 아직 확정하지 못했다.

## 2026-09-28 Greeting 필드 확장

영문이름은 기존 `ENGLISH_FULL_NAME_GIVEN_FIRST`로 이름→성 순서를 유지하며 사용자 실화면 작동 확인을 받았다. 두 값이 모두 있어야 하고 다른 회사의 순서와 기존 값 보호는 바꾸지 않는다.

| 범주 | 추가 연결 항목 | 검증·보호 조건 |
| --- | --- | --- |
| 성별 | `personal.personal.gender` | 확인된 남성·여성 옵션만 선택; 미지정 추정 금지 |
| 고교 | 학교명·졸업상태·입학일·졸업일 | `educationalBackground.highSchool` 단일 행; 기간은 연월 |
| 대학 추가전공 | 복수전공·부전공 이름과 분류 | 유무·이름 일관성, 대학 행 개수, 새로 만든 전공 행의 기본값만 변경 |
| 경력 | 회사·고용형태·입퇴사일·재직상태·부서·직급·담당업무 | `workHistory.workExperiences.*` 행 경계; 재직상태 후 날짜 재수집 |
| 공인어학 | 언어·시험명·취득일·숫자점수 또는 등급 | 언어→시험→성적란 순서 재수집; 만점 추정 금지 |
| 외국어활용 | 언어·회화수준 | `foreignLanguageProficiencies.*` 버튼만 있는 행도 정확한 소유 구조로 수집 |
| 자격증 | 이름·발급기관·취득일 | `certificatesLicenses.*` 행 경계와 연월 날짜 검증 |

BE 정적 규칙과 FE 수집·반복행 준비·검색·날짜·선택 실행을 함께 확장했다. 반복행 종류·인덱스·개수 및 추가 후 정확히 한 행 증가를 확인한다. 기존 값, 중복·불명확한 구조와 선택지를 보호하며 범용 추정으로 우회하지 않는다.

### 대학 추가전공 결합

기존 `DERIVED` 형식에 공통 `UNIVERSITY_ADDITIONAL_MAJOR_1_NAME`, `UNIVERSITY_ADDITIONAL_MAJOR_1_CLASSIFICATION`, `UNIVERSITY_ADDITIONAL_MAJOR_2_NAME`, `UNIVERSITY_ADDITIONAL_MAJOR_2_CLASSIFICATION` 규칙을 추가한다. API 필드는 추가하지 않는다. 복수·부전공의 유무와 이름이 일관되면 복수→부 순으로 있는 전공만 배치한다. 부전공만 있으면 첫 추가 행에 연결하며 빈 복수전공 행은 만들지 않는다. 행 수 계산과 값 결합은 같은 함수를 사용한다. 이번 실행이 만든 것으로 검증한 행의 기본 `주전공`만 변경하고 이미 있던 다른 분류는 보존한다.

### 검색·조건부 제어

검색은 같은 입력이 소유한 현재 후보의 정확하고 유일한 표시명·코드와 선택 후 상태를 확인한다. 고교·회사·자격 검색은 정확한 정식 결과가 없을 때만 화면이 제공하는 유일한 직접 입력 선택지를 사용한다. 중복 정식 결과는 직접 입력으로 우회하지 않는다.

어학은 언어 선택 뒤 시험을, 시험 선택 뒤 숫자점수 또는 등급을 재수집한다. 경력 체크박스는 정확한 경력행·이름과 관측된 `재직중`/`재직 중` 라벨을 검증한 뒤 체크=재직중, 미체크=퇴사로 읽는다. 퇴사·미체크는 클릭하지 않고, 반대 기존 상태는 보존한다. 진행 기록과 결과 모델도 같은 의미 해석을 사용한다.

이메일은 동일 입력·값·controls·URL·확인 버튼 상태를 검증한다. 대기 중 자연스럽게 닫힌 팝업은 다시 확인하며, 입력이 소유한 빈 숨김 제안목록에는 관측된 Escape 닫기를 적용한 뒤 실제 닫힘을 확인한다. 이메일 확인 버튼은 누르지 않는다.

### 지원 제외

대응 프로필 키가 없는 고교 계열, 대학 전공계열, 외국어 작문·독해, 시험 만점은 추정 입력하지 않는다. 현재 카카오게임즈의 ‘어학 / 자격 / 활동’은 섹션 제목이며 독립 활동 입력 칸은 관측되지 않았다. 기업 질문·파일·동의·인증·저장·제출은 실행하지 않는다.

### 이번 검증과 남은 제한

카카오게임즈 설치 브라우저에서 합성 전체 프로필 재실행의 **입력 완료 79개·확인 필요 4개**를 관측했다. 집계와 별도로 고교 4항목, 경력 회사·고용·기간·부서·직급·담당업무, 숫자점수형·등급형 시험 2행, 외국어 언어·회화, 자격증 3행의 표시값을 대조했다. 대학 추가전공 이름도 입력됐으나 분류는 별도 상태였다.

확인 필요 중 추가전공 분류 3개는 앞선 중단 실행이 만든 기존 기본값을 보존한 충돌이다. 재직여부 1개는 정상 미체크를 진행 추적기가 잘못 읽은 결과 표시 오류로, 이후 동일 의미 reader와 실제 수집→기록→재연결→결과 모델 회귀로 수정했다. 이메일 비동기 결함도 이후 회귀로 수정했다. **최신 수정본의 빈 지원서 전체 실행·재실행 성공은 화면 제어 연결의 상태 불일치와 시간초과로 확정하지 못했다.**

최종 자동 검증은 FE 2,205개 통과·19개 건너뜀, BE 381개 통과·실패 없음, 타입·lint·빌드·하네스와 독립 리뷰 통과다. 전체 FE 포맷 검사의 기존 CJ fixture 구문 오류는 별도이며 변경 파일 포맷을 확인했다. 부전공만 있는 대학과 재직중의 조건부 날짜는 자동 회귀 범위로 구분한다. 성별 및 숫자점수형·등급형 시험을 포함한 합성 테스트 프로필을 사용하며 실제 값·계정·세션을 문서에 기록하지 않는다. 다른 회사 전체 양식이나 저장·제출 성공을 주장하지 않는다.


## Hplace 공통 정책 현황 (CF-177, 2026-10-19)

다른 회사의 위 현황은 유지한다. 아래 표는 [CF-177 승인 근거](../../raw/issues/CF-177/documents/adapter-field-inventory.md)의 Hplace 전수 대조이며 설치 성공률이 아니다.

### 현재 상태

아래 프로필 전수표는 **13범주 127키를 각각 한 번** 포함한다. 등록/step1·2·3 범위는 제한 열에서 구분하며 v1/JOBDA 입력은 모든 키에 공통으로 구조 미확인·인증 후 사용자 화면 대기다. `구현`은 활성 로컬 정책과 FE 실행 경로가 있다는 뜻이며 운영 DB 활성화나 최신 설치 확장 성공을 뜻하지 않는다. 모든 신규 v4 항목은 설치 평가 PENDING-live다.

#### 산출 방법과 근거

- `frontend/src/profile/field-definitions.ts`의 category/section/field 정의를 추출한다. 최상위 `latestEducationType`은 기존 binding 관례인 `education.university.latestEducationType`으로 한 번 센다. 증빙 위치 2개도 포함한다.
- `backend/src/main/resources/policies/hplace-mrs2-v4.json`의 **75 fieldRules**를 `executionPolicy.browserPolicy.nativeForm.sections[].enabled` 및 `address.enabled`와 결합한다. 9개 일반 section 중 8개 활성/154 project 하나 비활성, 현주소 descriptor는 별도 활성이다. **fieldRule 존재만으로 지원을 판정하지 않는다.**
- `HplaceCompanyFormPolicyFactory.rules()/createNative()`의 legacy 20규칙을 더한다. DERIVED `KOREAN_FULL_NAME`, `HANJA_FULL_NAME`의 양쪽 입력 키와 `university-additional-majors.ts`의 유무·복수/부전공 이름·계열 소비를 펼친다. 간접 소비 키는 별도 쓰기 필드로 세지 않는다.
- FE 근거: `frontend/src/autofill/adapters/hplace/{registration,detail,basic-controls,write,basic-write,detail-write}.ts`, `frontend/src/autofill/policy/native-form-{collection,write,nested,gpa,row-assignment,search-dom}.ts`, `frontend/src/autofill/profile/{value-binding,university-additional-majors,profile-field-key}.ts`, `frontend/src/autofill/policy/staged-address*.ts`. 정책 키는 v4 `structuralName` 또는 legacy rule ID다.
- 미지원 사유는 정책 부재만으로 화면 부재를 추정하지 않고 `mrs2-section-contracts.md`, `live-dom/*.md`, P1–P4 최종 보고서의 관측 범위를 적용한다. `화면 없음 확인`은 지정 테넌트/step에 한정한다. `프로필 키 없음`은 아래 별도 사이트 항목표에만 사용한다.

#### 기본 인적사항 (9키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `personal.personal.koreanFamilyName` — 국문 성 | 구현 / 정책 키: `hplace.registration.name` | 등록 화면만; 이름 결합/분할전화/이메일 확인 소유 그룹; 상세 표시값 쓰기 아님 |
| `personal.personal.koreanGivenName` — 국문 이름 | 구현 / 정책 키: `hplace.registration.name` | 등록 화면만; 이름 결합/분할전화/이메일 확인 소유 그룹; 상세 표시값 쓰기 아님 |
| `personal.personal.hanjaFamilyName` — 한자 성 | 구현 / 정책 키: `hplace.mrs2.basic.chineseName` | step1/11; HANJA_FULL_NAME은 성·이름 둘 다 있어야 trim 후 결합; GS 관측, 한국타이어에는 없음 |
| `personal.personal.hanjaGivenName` — 한자 이름 | 구현 / 정책 키: `hplace.mrs2.basic.chineseName` | step1/11; HANJA_FULL_NAME은 성·이름 둘 다 있어야 trim 후 결합; GS 관측, 한국타이어에는 없음 |
| `personal.personal.englishFamilyName` — 영문 성 | 미지원 사유: 의미 불일치 | englishName 단일칸의 성·이름 순서 근거 없음; legacy NO_MATCH |
| `personal.personal.englishGivenName` — 영문 이름 | 미지원 사유: 의미 불일치 | englishName 단일칸의 성·이름 순서 근거 없음; legacy NO_MATCH |
| `personal.personal.gender` — 성별 | 구현 / 정책 키: `hplace.detail.gender` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `personal.personal.birthDate` — 생년월일 | 구현 / 정책 키: `hplace.detail.birthday` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `personal.personal.nationality` — 국적 | 구현 / 정책 키: `hplace.detail.nationality` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |

#### 연락처와 주소 (8키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `contact.contact.email` — 이메일주소 | 구현 / 정책 키: `hplace.registration.email` | 등록 화면만; 이름 결합/분할전화/이메일 확인 소유 그룹; 상세 표시값 쓰기 아님 |
| `contact.contact.secondaryEmail` — 보조 이메일 | 미지원 사유: 구조 미확인 | 보조 이메일 전용 필드 계약 없음; 등록 확인란은 같은 이메일의 재입력 |
| `contact.contact.phoneNumber` — 연락처 | 구현 / 정책 키: `hplace.registration.mobile` | 등록 화면만; 이름 결합/분할전화/이메일 확인 소유 그룹; 상세 표시값 쓰기 아님 |
| `contact.contact.emergencyPhoneNumber` — 비상연락처 | 구현 / 정책 키: `hplace.detail.emergencyPhone` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `contact.contact.residenceCountry` — 거주 국가 | 미지원 사유: 구조 미확인 | 거주 국가 제어/정적 매핑 미확인; 국적 또는 주소 국가로 추정 금지 |
| `contact.contact.postalCode` — 우편번호 | 구현 / 정책 키: `hplace.mrs2.currentAddress.zipCode` | step1/13 currentAddress만; 3값 staged 확정/receipt, hidden zip·readonly base 직접 쓰기 없음; 기존 일치 주소의 상세만 legacy 허용 |
| `contact.contact.addressLine1` — 기본주소 | 구현 / 정책 키: `hplace.mrs2.currentAddress.address` | step1/13 currentAddress만; 3값 staged 확정/receipt, hidden zip·readonly base 직접 쓰기 없음; 기존 일치 주소의 상세만 legacy 허용 |
| `contact.contact.addressLine2` — 상세주소 | 구현 / 정책 키: `hplace.mrs2.currentAddress.detailAddress`, `hplace.detail.detailAddress` | step1/13 currentAddress만; 3값 staged 확정/receipt, hidden zip·readonly base 직접 쓰기 없음; 기존 일치 주소의 상세만 legacy 허용 |

#### 학력 (54키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `education.highSchool.academicProcess` — 학업과정 | 미지원 사유: 의미 불일치 | 검정고시 학업과정을 graduationTypeCode/고교 계열로 대체하지 않음; 현 정책은 completionStatus만 연결 |
| `education.highSchool.qualificationPassDate` — 합격일자 | 미지원 사유: 의미 불일치 | 검정고시 합격일과 일반 졸업일의 동일 의미 계약 없음 |
| `education.highSchool.schoolName` — 학교명 | 구현 / 정책 키: `hplace.mrs2.highschool.academyName` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.attendanceType` — 주·야간 | 구현 / 정책 키: `hplace.mrs2.highschool.dayOrNight` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.completionStatus` — 재학 상태 | 구현 / 정책 키: `hplace.mrs2.highschool.graduationTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.schoolRegion` — 학교 소재지 | 구현 / 정책 키: `hplace.mrs2.highschool.locationCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.startDate` — 입학일 | 구현 / 정책 키: `hplace.mrs2.highschool.entranceDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.endDate` — 졸업일 | 구현 / 정책 키: `hplace.mrs2.highschool.graduationDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.schoolType` — 학교 유형 | 미지원 사유: 의미 불일치 | 전문대학/대학교와 degreeLevel(전문학사/학사)은 별도 키; 학위 키만 연결 |
| `education.university.degreeLevel` — 학위구분 | 구현 / 정책 키: `hplace.mrs2.college.degreeTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.schoolName` — 학교명 | 구현 / 정책 키: `hplace.mrs2.college.academyName` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.attendanceType` — 주·야간 | 구현 / 정책 키: `hplace.mrs2.college.major0.dayOrNight` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증; 주전공 한 행에만 연결 |
| `education.university.startDate` — 입학일 | 구현 / 정책 키: `hplace.mrs2.college.entranceDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.endDate` — 졸업일 | 구현 / 정책 키: `hplace.mrs2.college.graduationDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.completionStatus` — 재학 상태 | 구현 / 정책 키: `hplace.mrs2.college.graduationTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.schoolRegion` — 학교 소재지 | 구현 / 정책 키: `hplace.mrs2.college.locationCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.gpaScore` — 평점 | 구현 / 정책 키: `hplace.mrs2.college.score` | step2; 동일 학교 숫자 GPA pair, score→scale 활성/정확 옵션/두 값 최종 확인; PASS/FAIL 제외 |
| `education.university.gpaScale` — 기준평점 | 구현 / 정책 키: `hplace.mrs2.college.perfectScore` | step2; 동일 학교 숫자 GPA pair, score→scale 활성/정확 옵션/두 값 최종 확인; PASS/FAIL 제외 |
| `education.university.totalCredits` — 총 이수학점 | 미지원 사유: 의미 불일치 | 한국타이어 majorCredits는 전공 이수학점; 총 이수학점으로 대체 금지 |
| `education.university.majorField` — 주전공 계열 | 구현 / 정책 키: `hplace.mrs2.college.major0.majorCategoryCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.university.majorName` — 주전공명 | 구현 / 정책 키: `hplace.mrs2.college.major0.majorName`, `hplace.mrs2.college.major0.majorTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.transferStatus` — 편입유무 | 구현 / 정책 키: `hplace.mrs2.college.entranceTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.doubleMajorStatus` — 복수전공유무 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorName`, `hplace.mrs2.college.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.university.minorStatus` — 부전공유무 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorName`, `hplace.mrs2.college.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.university.additionalMajorField` — 복수전공 계열 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorCategoryCode`, `hplace.mrs2.college.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.university.additionalMajorName` — 복수전공명 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorName`, `hplace.mrs2.college.major1.majorTypeCode`, `hplace.mrs2.college.major1.majorCategoryCode`, `hplace.mrs2.college.major2.majorName`, `hplace.mrs2.college.major2.majorTypeCode`, `hplace.mrs2.college.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.university.minorField` — 부전공 계열 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorCategoryCode`, `hplace.mrs2.college.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.university.minorName` — 부전공명 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorName`, `hplace.mrs2.college.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.degreeLevel` — 학위구분 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.degreeTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.combinedDegreeStatus` — 석박사 통합여부 | 미지원 사유: 의미 불일치 | 확인된 학위 선택지는 석사/박사; 통합학위 선택·변환 없음 |
| `education.graduateSchool.country` — 국가 | 미지원 사유: 의미 불일치 | locationCode 학교 소재지와 국가 프로필을 동일시하지 않음 |
| `education.graduateSchool.schoolName` — 학교명 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.academyName` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.attendanceType` — 주·야간 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major0.dayOrNight` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증; 주전공 한 행에만 연결 |
| `education.graduateSchool.schoolRegion` — 학교 소재지 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.locationCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.startDate` — 입학일 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.entranceDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.endDate` — 졸업일 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.graduationDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.admissionType` — 입학구분 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.entranceTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.completionStatus` — 졸업구분 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.graduationTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.gpaScore` — 평점 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.score` | step2; 동일 학교 숫자 GPA pair, score→scale 활성/정확 옵션/두 값 최종 확인; PASS/FAIL 제외 |
| `education.graduateSchool.gpaScale` — 만점기준 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.perfectScore` | step2; 동일 학교 숫자 GPA pair, score→scale 활성/정확 옵션/두 값 최종 확인; PASS/FAIL 제외 |
| `education.graduateSchool.majorField` — 주전공 계열 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major0.majorCategoryCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.graduateSchool.majorName` — 주전공명 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major0.majorName`, `hplace.mrs2.graduateSchool.major0.majorTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.doubleMajorStatus` — 복수전공유무 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorName`, `hplace.mrs2.graduateSchool.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.minorStatus` — 부전공유무 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorName`, `hplace.mrs2.graduateSchool.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.additionalMajorField` — 복수전공 계열 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorCategoryCode`, `hplace.mrs2.graduateSchool.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.graduateSchool.additionalMajorName` — 복수전공명 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorName`, `hplace.mrs2.graduateSchool.major1.majorTypeCode`, `hplace.mrs2.graduateSchool.major1.majorCategoryCode`, `hplace.mrs2.graduateSchool.major2.majorName`, `hplace.mrs2.graduateSchool.major2.majorTypeCode`, `hplace.mrs2.graduateSchool.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.minorField` — 부전공 계열 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorCategoryCode`, `hplace.mrs2.graduateSchool.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.graduateSchool.minorName` — 부전공명 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorName`, `hplace.mrs2.graduateSchool.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.researchField` — 연구분야 | 미지원 사유: 구조 미확인 | 연구분야의 실제 소유 필드와 정적 매핑 미확인 |
| `education.graduateSchool.labName` — LAB실명 | 미지원 사유: 구조 미확인 | lab 실DOM 미관측으로 정책 미활성 |
| `education.graduateSchool.labProfessorName` — LAB 담당교수 성명 | 미지원 사유: 구조 미확인 | academicAdviser 실DOM 미관측으로 정책 미활성 |
| `education.graduateSchool.thesisTitle` — 논문명 | 미지원 사유: 구조 미확인 | 독립 paper 섹션과 해당 대학원 행의 유일 소유 관계 미확인 |
| `education.graduateSchool.thesisSummary` — 논문요약 | 미지원 사유: 구조 미확인 | 독립 paper 섹션과 해당 대학원 행의 유일 소유 관계 미확인 |
| `education.university.latestEducationType` — 최종학력 | 미지원 사유: 구조 미확인 | 최종학력 독립 제어 미확인; 학위/섹션 존재로 추정하지 않음 |

#### 어학 (8키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `languages.languageTest.language` — 외국어 | 미지원 사유: 화면 없음 확인 | 두 테넌트 step3 공인시험 행에 독립 언어 선택 제어가 관측되지 않음; 시험명에서 추정하지 않음 |
| `languages.languageTest.testName` — 시험명 | 구현 / 정책 키: `hplace.mrs2.foreignExam.languageExamName` | step3/165 비인증만; YBM/EXAM_CODE 사용자 처리, detail 재수집; 등급-only 또는 점수-only |
| `languages.languageTest.registrationNo` — 등록번호 | 구현 / 정책 키: `hplace.mrs2.foreignExam.registNumber` | step3/165 비인증만; YBM/EXAM_CODE 사용자 처리, detail 재수집; 등급-only 또는 점수-only |
| `languages.languageTest.acquisitionDate` — 취득일 | 미지원 사유: 의미 불일치 | 취득일과 languageExam.examDate(응시일)의 의미가 다름 |
| `languages.languageTest.grade` — 등급·점수 | 구현 / 정책 키: `hplace.mrs2.foreignExam.gradeCode`, `hplace.mrs2.foreignExam.score` | step3/165 비인증만; YBM/EXAM_CODE 사용자 처리, detail 재수집; 등급-only 또는 점수-only |
| `languages.languageTest.evidenceDocumentPath` — 증빙 서류 위치 | 미지원 사유: 사용자 처리(인증·파일) | 파일 선택/업로드는 명시 제외; EXCLUDED_FIELD_IDS로 자동입력 키에서 제외하되 127키 전수표에는 유지 |
| `languages.languageSkill.language` — 외국어 | 구현 / 정책 키: `hplace.mrs2.foreignAbility.languageCode` | step3/166 한국타이어 관측, GS에는 없음; 정확 label/code만; 작문·독해 별도 사용자 입력 |
| `languages.languageSkill.conversationalLevel` — 회화수준 | 구현 / 정책 키: `hplace.mrs2.foreignAbility.speakingLevelCodeSn` | step3/166 한국타이어 관측, GS에는 없음; 정확 label/code만; 작문·독해 별도 사용자 입력 |

#### 자격증·면허증 (6키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `certifications.certificate.name` — 자격증명 | 구현 / 정책 키: `hplace.mrs2.license.licenseName` | step3/168; 검색 metadata 검증, 등록번호 privateinfo=true, 취득일 YMD |
| `certifications.certificate.grade` — 등급 | 미지원 사유: 의미 불일치 | usescore 점수와 자격증 등급을 서로 대체하지 않음 |
| `certifications.certificate.registrationNo` — 등록번호 | 구현 / 정책 키: `hplace.mrs2.license.registNumber` | step3/168; 검색 metadata 검증, 등록번호 privateinfo=true, 취득일 YMD |
| `certifications.certificate.issuer` — 발급기관 | 구현 / 정책 키: `hplace.mrs2.license.organization` | step3/168; 검색 metadata 검증, 등록번호 privateinfo=true, 취득일 YMD |
| `certifications.certificate.acquisitionDate` — 취득일 | 구현 / 정책 키: `hplace.mrs2.license.acquireDate` | step3/168; 검색 metadata 검증, 등록번호 privateinfo=true, 취득일 YMD |
| `certifications.certificate.evidenceDocumentPath` — 증빙 서류 위치 | 미지원 사유: 사용자 처리(인증·파일) | 파일 선택/업로드는 명시 제외; EXCLUDED_FIELD_IDS로 자동입력 키에서 제외하되 127키 전수표에는 유지 |

#### 직장경력 (9키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `careers.career.companyName` — 직장명 | 구현 / 정책 키: `hplace.mrs2.career.company` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.employmentType` — 고용형태 | 구현 / 정책 키: `hplace.mrs2.career.careerCriteriaCodeSn` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.startDate` — 입사일 | 구현 / 정책 키: `hplace.mrs2.career.entranceDate` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.endDate` — 퇴사일 | 구현 / 정책 키: `hplace.mrs2.career.leavingDate` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.employmentStatus` — 재직 여부 | 구현 / 정책 키: `hplace.mrs2.career.workingStatusCode` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.department` — 근무부서 | 구현 / 정책 키: `hplace.mrs2.career.department` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.position` — 최종직위 | 구현 / 정책 키: `hplace.mrs2.career.position` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.responsibilities` — 담당업무 | 구현 / 정책 키: `hplace.mrs2.career.assignedTask` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.terminationReason` — 종료사유 | 구현 / 정책 키: `hplace.mrs2.career.retirementReason` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |

#### 프로젝트 (5키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `projects.project.startDate` — 활동 시작일 | 미지원 사유: 구조 미확인 | 154 enabled:false; 두 테넌트 step2 화면 없음 확인, 다른 화면 구조 미확인. 비활성 정책 키: `hplace.mrs2.project.startDate` |
| `projects.project.endDate` — 활동 종료일 | 미지원 사유: 구조 미확인 | 154 enabled:false; 두 테넌트 step2 화면 없음 확인, 다른 화면 구조 미확인. 비활성 정책 키: `hplace.mrs2.project.endDate` |
| `projects.project.projectName` — 프로젝트 이름 | 미지원 사유: 구조 미확인 | 154 enabled:false; 두 테넌트 step2 화면 없음 확인, 다른 화면 구조 미확인. 비활성 정책 키: `hplace.mrs2.project.projectName` |
| `projects.project.role` — 담당 역할 | 미지원 사유: 구조 미확인 | 154 enabled:false; 두 테넌트 step2 화면 없음 확인, 다른 화면 구조 미확인. 비활성 정책 키: `hplace.mrs2.project.role` |
| `projects.project.activityDetails` — 활동 상세내역 | 미지원 사유: 의미 불일치 | performWork/comment와 활동 상세내역의 확정 의미 계약 없음; 154 비활성 |

#### 논문·특허 (3키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `publications.publicationPatent.type` — 구분 | 미지원 사유: 구조 미확인 | researchPaper/researchIPR의 타입·반복 행 소유 매핑 미확인 |
| `publications.publicationPatent.title` — 제목 | 미지원 사유: 구조 미확인 | 연구/지재권 섹션과 프로필 행의 소유 매핑 미확인 |
| `publications.publicationPatent.details` — 상세설명 | 미지원 사유: 구조 미확인 | comment 후보의 의미·타입별 소유 계약 미확인 |

#### 처우 (3키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `compensation.compensation.desiredPosition` — 희망직위 | 미지원 사유: 구조 미확인 | hopePosition 공개 템플릿 후보만 있고 실제 두 테넌트 제어/정책 미확인 |
| `compensation.compensation.desiredSalary` — 희망연봉(만원) | 구현 / 정책 키: `hplace.mrs2.basic.hopeSalary` | step1/11; 직접 부모 span/label.money의 ::after="만원" 및 .million 부재; 정수 범위·step 검증 |
| `compensation.compensation.previousSalary` — 직전연봉(만원) | 구현 / 정책 키: `hplace.mrs2.basic.latestSalary` | step1/11; 직접 부모 span/label.money의 ::after="만원" 및 .million 부재; 정수 범위·step 검증 |

#### 병역 (9키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `military.military.militaryStatus` — 병역 상태 | 구현 / 정책 키: `hplace.detail.militaryStatus` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.militaryType` — 병역구분 | 미지원 사유: 의미 불일치 | 현역병/상근예비역 등과 militaryTypeCode의 군필/면제 상태를 혼용하지 않음 |
| `military.military.militaryBranch` — 군별 | 구현 / 정책 키: `hplace.mrs2.basic.militaryBranchCode` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.militarySpecialty` — 병과 | 구현 / 정책 키: `hplace.mrs2.basic.militaryRole` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.militaryRank` — 계급 | 구현 / 정책 키: `hplace.detail.militaryRank` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.serviceStartDate` — 복무 시작일 | 구현 / 정책 키: `hplace.detail.serviceStartDate` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.serviceEndDate` — 복무 종료일 | 구현 / 정책 키: `hplace.detail.serviceEndDate` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.dischargeType` — 전역구분 | 구현 / 정책 키: `hplace.detail.dischargeType` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.exemptionReason` — 면제·비대상 사유 | 구현 / 정책 키: `hplace.detail.exemptionReason` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |

#### 보훈 (4키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `veteran.veteran.veteranStatus` — 보훈 대상 여부 | 구현 / 정책 키: `hplace.detail.veteranStatus` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `veteran.veteran.veteranType` — 보훈구분 | 미지원 사유: 구조 미확인 | 보훈구분 전용 제어 미확인; 보훈비율/관계로 대체하지 않음 |
| `veteran.veteran.veteranRelation` — 보훈 대상자와의 관계 | 구현 / 정책 키: `hplace.detail.veteranRelation` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `veteran.veteran.veteranNumber` — 보훈번호 | 구현 / 정책 키: `hplace.detail.veteranNumber` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |

#### 장애 (5키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `disability.disability.disabilityStatus` — 장애 여부 | 구현 / 정책 키: `hplace.detail.disabilityStatus` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `disability.disability.disabilityType` — 장애 유형 | 구현 / 정책 키: `hplace.detail.disabilityType` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `disability.disability.disabilityGrade` — 장애 정도·등급 | 구현 / 정책 키: `hplace.detail.disabilityGrade` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `disability.disability.disabilityRegistrationNumber` — 장애등록번호 | 미지원 사유: 구조 미확인 | 전용 제어/정적 매핑 미확인 |
| `disability.disability.disabilityRegistrationDate` — 장애 등록일 | 미지원 사유: 구조 미확인 | 전용 제어/정적 매핑 미확인 |

#### 건강 (4키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `health.health.healthItemName` — 건강정보 항목 | 미지원 사유: 의미 불일치 | 고정 신체 측정항목과 범용 반복 건강정보 항목명의 계약 없음 |
| `health.health.healthStatusOrValue` — 상태·값 | 미지원 사유: 의미 불일치 | 키·몸무게·시력 등의 단위/타입과 범용 상태값을 추정 결합하지 않음 |
| `health.health.healthDate` — 진단·확인일 | 미지원 사유: 구조 미확인 | 전용 건강 진단일 제어 미확인 |
| `health.health.healthDetails` — 상세내용 | 미지원 사유: 의미 불일치 | physicalRemark 단일칸과 반복 건강정보 상세의 의미 계약 없음 |

### 사이트 전용 항목 (127키 집계와 별도)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| 수상 / award (170) | 미지원 사유: 프로필 키 없음 | 한국타이어 관측; 이름·기관·날짜·comment 별도 범주 없음 |
| 해외경험 / overseaExperience (167) | 미지원 사유: 프로필 키 없음 | 두 테넌트 관측; 목적·국가·출입국일·내용 없음 |
| 컴퓨터활용 / softwareSkill (169) | 미지원 사유: 프로필 키 없음 | 한국타이어 관측; 도구·수준 범주 없음 |
| 교육이수 (171) | 미지원 사유: 프로필 키 없음 | 정책 unsupportedSections; 두 live 화면 활성 여부 미확인 |
| 활동 / activity (172) | 미지원 사유: 프로필 키 없음 | 두 테넌트 관측; 프로젝트로 임의 분류 금지 |
| 봉사 / volunteerActivity (173) | 미지원 사유: 프로필 키 없음 | GS 관측, 한국타이어 없음 |
| 지원경로 / applyChannel | 미지원 사유: 프로필 키 없음 | 회사별 옵션·직접입력 추정 금지 |
| 지원분야 / applySector | 미지원 사유: 프로필 키 없음 | 공고별 계층 선택; 희망직위로 대체 금지 |
| 입사가능일 / joinPossibleDate | 미지원 사유: 프로필 키 없음 | 프로필 날짜 키 없음 |
| 작문 수준 / writingLevelCodeSn | 미지원 사유: 프로필 키 없음 | 한국타이어 required; 회화수준 복제 금지 |
| 독해 수준 / readingLevelCodeSn | 미지원 사유: 프로필 키 없음 | 한국타이어 required; 회화수준 복제 금지 |
| 전공 이수학점 / majorCredits | 미지원 사유: 프로필 키 없음 | 한국타이어 required; totalCredits 대체 금지 |
| 전공 평점 / majorAverageScore | 미지원 사유: 프로필 키 없음 | 전체 학업 GPA와 별도 |
| 전공 만점 / majorPerfectScore | 미지원 사유: 프로필 키 없음 | 전체 학업 GPA scale과 별도 |
| 고교 계열 / highschoolCategoryCode | 미지원 사유: 프로필 키 없음 | 학업과정과 별도; GS 관측 |
| 대학 계열 / collegeCategoryCode | 미지원 사유: 프로필 키 없음 | 전공 계열과 별도 |
| 본교·분교 / headOrBranch | 미지원 사유: 프로필 키 없음 | 학위·학교 유형으로 추정 금지 |
| 시험 만점 / perfectScore | 미지원 사유: 프로필 키 없음 | 응답 metadata는 검증용; 프로필 등급에서 추정 금지 |
| 경력별 연봉 / career.salary | 미지원 사유: 프로필 키 없음 | 직전연봉 latestSalary와 별도 |
| 종업원 수·매출 / headcount·annualSales | 미지원 사유: 프로필 키 없음 | GS 경력 관측; 회사명으로 추정 금지 |
| 보훈비율 / patriotRate | 미지원 사유: 프로필 키 없음 | 보훈구분과 별도 |
| NCS 능력단위·학기/과목성적 | 미지원 사유: 프로필 키 없음 | 공개 템플릿 후보; 현 프로필 범주 없음 |
| 취미·특기·긴급연락처 관계 | 미지원 사유: 프로필 키 없음 | legacy 조사 후보; 기존 연락처 값으로 의미 추정 금지 |
| 주민등록상·가족·부모 주소/상동 | 미지원 사유: 명시 제외 | 현주소 전용 계약; copy/reset 실행 없음 |
| 사진·성적증명서/기타 첨부 | 미지원 사유: 사용자 처리(인증·파일) | 사용자가 파일 처리; 한국타이어 required 파일 관측 |
| YBM 인증 시험·직접등록 조건 변형 | 미지원 사유: 사용자 처리(인증·파일) | EXAM_CODE/인증 상태 선택 금지; 2년 이상 직접등록 의미를 취득일로 추정 금지 |
| 자기소개서·역량/추가질문·experienceBuilder | 미지원 사유: 명시 제외 | 질문별 답변 생성·범용 바인딩 제외; required라도 자동완료로 간주하지 않음 |

### 집계와 검증 한계

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| 프로필 127키 / 구현 | 89 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 화면 없음 확인 | 1 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 프로필 키 없음 | 0 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 의미 불일치 | 15 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 구조 미확인 | 20 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 사용자 처리(인증·파일) | 2 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 명시 제외 | 0 | 키 단위, 사이트 전용 항목 제외 |

사이트 전용 27행: 프로필 키 없음 23, 명시 제외 2, 사용자 처리(인증·파일) 2。
