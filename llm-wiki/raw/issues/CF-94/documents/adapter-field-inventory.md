# 어댑터 구현·검증 현황

이 표는 CF-46에서 분리한 프론트 기능의 현황이다. 회사의 모든 필드가 지원된다는 목록이나 실제 사이트의 최신 동작 보장이 아니다. 개별 필드 연결은 활성 백엔드 정책과 현재 DOM의 검증 결과를 따른다. 확인하지 않은 필드는 추정하지 않는다.

| 회사/대상                     | 현재 구현                                                                                                                                     | 근거 수준                                                                                                                  | 남은 제한                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 현대 반복 행·추가 제어        | ID 없는 프로젝트·논문 구조 식별, 어학 하위 섹션별 개수, 부족한 행만 추가; 학력은 정책 v4로 필요한 행 준비                                     | 읽기 전용 구조·API 재현, 자격증 1→3행 통합 회귀 및 학력 그룹 자동화                                                        | 해외경험 추가 미지원; 실제 설치는 고교·학사 2행 범위                                         |
| 현대 버튼형 선택              | 같은 메뉴의 코드·표시명 유일 일치, 선택 후 표시·숨은 코드 검증                                                                                | 비식별 자동 테스트                                                                                                         | 별도 검색 팝업·취소 계약 미추가                                                              |
| 현대 어학·자격증 취득일       | 로컬 정책 v3의 정확한 ID/이름 및 제어 타입 검증, 각각 DIRECT 연결                                                                             | 비식별 정책·수집·리뷰·입력 회귀                                                                                            | 전체 어학·자격증 재기입과 저장·제출 미검증                                                   |
| 현대 일반 text                | 공통 입력 후 회사 라벨 보정                                                                                                                   | 비식별 자동 테스트; 학력 기간·GPA의 실제 대조는 아래 범위 참조                                                             | 모든 일반 text 필드의 실제 입력은 미검증                                                     |
| 현대 주소·국적1/2             | `postCd` readonly의 유일 정확 주소 선택·실행 소유 modal cleanup; 국적1 대한민국 표시명·hidden `KR` 확정과 국적2 불변                          | 실제 설치 smoke에서 주소 3값·readonly, 국적1 코드와 국적2 불변 대조                                                        | 해외·불명확 주소 미지원; 저장·제출 미검증                                                    |
| 현대 학력                     | 종류 3/4/5/6/7, `itemGroupId/index/count`, 고교·대학·대학원 그룹별 날짜·학교·전공·GPA·졸업상태; 학교 `school`, 전공 `basic` 및 유효 코드 검증 | 실제 고교·학사 2행에서 학교명·코드·marker·기간 4필드, 대학 전공 코드·GPA·졸업 코드 독립 대조; API 7회 200/ADAPTER/COMPLETE | 대학원·전문학사·박사 실제 입력 미검증; UI 38/0은 전체 성공이 아니며 toolbar icon 클릭 미검증 |
| SK 반복 학력 행               | 필드 수집의 템플릿 제외와 신규 행 기본값 판별                                                                                                 | 비식별 자동 테스트                                                                                                         | 기존 라디오 탐색 방식 유지                                                                   |
| SK 어학 조건부 항목           | 시험/활용능력 개수 분리, 선행 선택 후 재분석                                                                                                  | 자동 회귀 및 전체 fixture 시험1행 실제 기입                                                                                | 이름/언어 텍스트 일치와 성적·선택 코드 확정은 구분                                           |
| SK 복수·부전공 후속 항목      | 정확한 바인딩·READY·프로필 유일성 검증                                                                                                        | 비식별 자동 테스트                                                                                                         | 기존 승인 경로 유지                                                                          |
| SK 경력·자격증·시험 반복 추가 | 검증된 후속 버튼 구조로 정확한 식별자 복원                                                                                                    | 초기 전체 fixture 경력1/자격증3/시험1행 실행; 최신 경력 필드는 아래 exact DOM 행에서 갱신                                  | 이전 기록에서는 경력 필드 매핑을 별도 미지원으로 기록했으며 최신 범위는 아래 행을 따른다     |
| SK 경력 필드·재직상태         | 8개 필드 exact DOM·프로필 키 및 ID 없는 `SELECT` 제어 검증, 재직상태 후 퇴직사유 재분석                                                       | 비식별 매핑 회귀와 전체 패널 실행                                                                                          | `READY`·유일 바인딩과 반복 행 수 일치가 필요                                                 |
| SK 국적                       | 정확한 select 매핑과 대한민국 한정 lookup                                                                                                     | 실제 1개 필드 일치·제어 불변 확인                                                                                          | 다른 국적 별칭은 미지원                                                                      |
| SK 대학 입학·졸업일           | `YEAR_MONTH`, 숫자 6자리 편집과 `YYYY-MM` 표시 유지                                                                                           | production writer 실제 입력 및 204개 제어 원복                                                                             | 실제 저장 호환성 미검증                                                                      |
| SK 학교·자격증·시험 검색      | 동일 입력의 jQuery UI widget에서 새 검색 완료와 유일 label/value 확정, 시험은 nonzero id만 허용                                               | 전체 fixture·production 패널에서 시험 2행, 자격증 3행, 대학 1행 확인                                                       | id=0·부분·중복 결과는 자동 선택하지 않음; 전체 취소 UX는 미구현                              |
| SK 주소                       | capability 협상, 카카오 iframe 검색/유일 선택, 사이트 반영 확인                                                                               | 전체 fixture 미일치 및 공개 주소 일치 실제 패널 검증                                                                       | 기존값 충돌·후보0/복수·페이지1/1 외 결과는 수동 확인                                         |
| 일반 사이트                   | 기존 표준 수집·입력, 회사 전용 예외 미적용                                                                                                    | 비식별 회귀 테스트                                                                                                         | 회사 특수 명령 미실행                                                                        |
| LG 학교 검색                  | 이번 변경에서 미구현                                                                                                                          | 설계 경계만 기록                                                                                                           | 구조 근거·취소·후보 유일성·선택 반영 검증 필요                                               |

## 현대 미입력 후속 점검

초기 화면 점검에서 어학·자격증 날짜의 공통 이름 충돌을 확인하고 정책으로 구분했다. 최신 정책 v4는 국내 주소·국적1·학력 그룹을 추가하지만 모든 빈칸의 지원을 뜻하지 않는다. 현대 매핑이 누락된 `careers.career.companyName`과 미지원 검색 항목, 대응 프로필 필드가 없는 프로젝트 기관·해외경험 날짜, 민감정보 개별 승인과 실행 당시 분석 사유 미확인은 별도 상태로 유지한다. 실제 입력값이나 원본 DOM은 이 현황표에 기록하지 않는다. 수정 정책은 로컬 서버에 적용하고 비식별 API로 확인했다. 실제 설치 검증은 고교·학사 2행과 주소·국적1 범위로 제한한다.

자격증명은 정확한 ID/이름·텍스트 제어를 검증한 DIRECT 매핑을 추가했다. 반복 행과 프로필 개수 불일치 시 전체 항목을 임의 연결하지 않는다. 자격증 3개에 대해 부족한 2행만 추가하고 이름·등록번호를 각각 입력하며 재실행 시 중복 행을 만들지 않는 통합 회귀를 확인했다.

## 현대 외국어 선택 단계

검증된 언어·영어시험·OPIc 계열 등급·활용 언어·회화수준을 지원한다. 언어→시험→정상 직접입력→활성 점수/등급 순서로 같은 행을 준비하고 재분석하며 완료한 선행 선택은 재실행하지 않는다. 작문·독해의 대응 프로필 필드와 미검증 시험·등급은 미지원이다. 최종 메뉴 표시·숨은 코드 확인과 실패 시 후속 입력 중단을 회귀로 검증한다. 실제 재기입 검증은 별도다.

## SK 검색 패널 검증 보완

행·검색 종류별 쓰기와 확정은 직렬 처리하고, 확정한 이름을 최종 단계에서 다시 쓰지 않는다. 시험 언어 선택 뒤 같은 행의 text 또는 select 성적란이 하나만 나타날 때만 후속 분석하며, `lngExamScoreSel`은 이름과 `SELECT` 제어로 연결한다. 요청 marker 제거와 사용자 변경 뒤 늦은 선택·복원을 막지만 전체 취소 UX는 별도 범위다.

저장소의 전체 공개 SK 검색 fixture를 가져오기 UI로 적용하고 설치된 production 확장의 실제 popup→사이드 패널→자동 기입을 실행했다. 준비 2회와 필드 분석 8회가 모두 HTTP 200, `ADAPTER`, `COMPLETE`였고 UI 집계는 23개 기입 성공·0개 직접 확인이었다. 이 집계는 선행 선택·미지원·미선택 항목 전체 성공을 뜻하지 않는다. 테스트 뒤 프로필 키 미존재와 지원서 204개 값·선택·disabled·readonly 상태를 복원했으며, reload로 재생성된 UUID만 정규화해 비교했다. 이번 후속 매핑은 로컬 정책 v22에 반영된 범위에서 확인했으며 production 정책 배포 완료를 뜻하지 않는다. 저장·제출 호환성과 P1/P3/P4 전체 기능은 미검증·미구현으로 유지한다.

## CF-83 자동 기입 보완 (2026-09-09)

이 절은 앞선 CF-46 검증 기록 이후의 변경이다. CF-83 설치 확장의 가상 전체 fixture 검증에서 SK 학력 0→1과 재실행, 병역·보훈 연결 및 현대 전공 표시명·코드·marker·라벨 상태와 만점기준을 확인했다. 수동 확인 항목은 별도로 남기며 전체 필드 성공으로 표현하지 않는다. 실제 툴바 아이콘 진입, 저장·제출 호환성과 운영 정책 배포는 미검증이다.

SK 고교·대학 추가 버튼은 ID가 없는 후속 행에서도 회사 루트, 학력 종류, 행·버튼 조상 구조와 학교 입력칸을 검증해 안정적인 ID로 수집한다. 공통 반복 실행기의 재식별 및 정확히 1개 증가 조건은 유지한다.

SK 병역은 대상 라디오→군필/미필/면제/복무중 분류→노출된 상세 필드 순서로 처리하고, 보훈은 대상 여부·번호·관계를 연결한다. 기존 반대 선택과 다른 병역 분류는 보존하며, 이미 같은 선택에는 변경 이벤트를 다시 보내지 않는다. 보호 여부는 준비 계획과 실행 직전에 확인한다.

공개 fixture의 병역·보훈 정의 필드는 가상 값으로 채우고, 모순되는 상태는 별도 테스트로 분리한다. 현재 확인한 SK 화면에 없는 군별·계급·복무일자와 미검증 특기·전역구분·보훈구분은 실제 입력 지원으로 표시하지 않는다. 기존 다른 화면용 정책과 신규 미지원 필드를 구분한다.

현대 대학 만점기준은 4.00→4.0/4, 4.30→4.3/4.3, 4.50→4.5/4.5, 100.00→100/100의 표시명/코드만 연결하고 정확한 hidden rcdPerf를 사용한다. directRcdperf 및 기타 직접입력은 제외한다. MongoDB 8의 정책 저장 시 소수점 Map 키를 보존하도록 변환기를 구성하고 SK·현대 정책의 BSON 왕복과 새 가상 DB의 실제 API 조회를 검증했다.

현대 대학 복수·부전공은 유무가 있음이고 이름이 있을 때만 같은 행의 basic/0200/0015 검색에서 유일한 정확 결과와 hidden 코드·marker를 확정한다. 성공 및 이미 확정된 학교·전공에는 exist 클래스를 반영하고 실패·취소 시 실행이 소유한 값과 라벨 상태만 복원한다. 프로필 조건 검증은 대학 범위로 한정한다.

이전 CF-83 학력·전공 검증 시점의 로컬 정책 버전은 SK v23·현대 v5였으며 프로필 스키마와 API DTO는 변경하지 않았다. 자동 테스트, 읽기 전용 실제 DOM 확인, 별도 가상 DB의 API 검증을 실제 설치 확장의 재기입 검증과 구분해 문서화한다. 실제 툴바 아이콘 진입, 저장·제출 호환성과 운영 정책 배포는 미검증이다. 후속 SK 병역 동의어의 실제 재기입은 별도로 대기 중이다.

| 대상           | CF-83 자동 검증                                           | 실제 설치 검증 상태                                           |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| SK 고교·대학   | 0→1·1→2, 한 번 실행 후 입력, 중복/모호성/비정상 증가 방지 | 가상 전체 fixture에서 0→1과 재실행 확인                       |
| SK 병역·보훈   | 상태별 연결, 기존 값 보존, 동일 선택 이벤트 재발행 방지   | 가상 전체 fixture에서 연결 확인                               |
| 현대 만점기준  | 4개 표시명/코드, rcdPerf 식별, BSON 왕복 및 실제 API      | 가상 전체 fixture에서 확인                                    |
| 현대 학교·전공 | 같은 행의 검색 확정, 유무 조건, 성공 라벨과 실패 원복     | 전공 표시명·코드·marker·라벨 확인; negative의 추가전공은 수동 |
| SK 병역 alias  | `만기전역`→군필의 회사·필드 키 한정 정규화                | 로컬 fixture 경로 확인; 실제 설치 재진입 대기                 |

추가 승인 근거: 현대 복수·부전공의 정확 결과가 없을 때 해당 검색만 수동 확인으로 남기고 같은 행의 minor/GPA 입력을 계속하는 negative fixture에서 40개 입력·2개 수동 확인을 확인했다. 별도 정상 fixture에서는 추가전공 유일 결과와 결과 화면 도달을 확인했다. SK `만기전역` alias는 회사·필드 키 한정 정규화와 준비·실행·검토 경로를 검증했지만 실제 설치 재진입은 사용자 새로고침 확인 대기이며 통과로 기록하지 않는다. 설치 확장 hash `e09baaae081d6d55032a05c2a6f0b775adbded798de171b18e3d4eeda3482e40`와 구조적 fixture import 일치는 확인했으나 실제 alias re-entry, 저장·제출·toolbar icon 및 운영 정책 rollout은 미검증이다.

## 현대 병역·보훈 현황 (2026-09-09)

승인 digest d5c753ace169a09c46452b34a1bcab9c0ae730090eba0b57ccaf9de826476020 기준으로 현대 v6 정책과 별도 fixture·alias 계약을 기록한다. 코드 지원 계약과 실제 검증을 구분하며 실제 설치 검증의 현재 상태와 범위는 [PR #84 검증 기록](https://github.com/woowacourse-teams/2026-career-form/pull/84)를 따른다.

| 대상      | 현재 구현·계약                                                        | 제한                                                                  |
| --------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 병역 상태 | `milCd` 4개 명시 매핑; `milExcptCd`, `milRank`, `milDitinc` 버튼 계약 | 상태 전이 후 재수집·재분석 필요; 복무중·특례 등 미승인 상태 추정 금지 |
| 병역 날짜 | `milStartDt`·`milEndDt` exact id/name, YEAR_MONTH                     | 코드 지원 계약은 반영됨; 실제 설치 검증 상태는 PR #84 기록 참조       |
| 보훈      | `branchYn`, `branchRel`, `branchNo` 조건부 계약                       | 보훈구분·취업지원·가점 추정 금지; 번호 digits/maxlength 10            |
| fixture   | 병역 4 × 보훈 2 전체 프로필 8개, 기타 값 원본 동일                    | 실제 저장·제출 근거 아님                                              |

초기 공란의 enabled/required 상태 때문에 선행 상태 선택과 표시·hidden 코드 검증을 gate로 둔다. 코드 지원 계약과 실제 검증을 구분하며 실제 설치 검증 상태는 [PR #84 검증 기록](https://github.com/woowacourse-teams/2026-career-form/pull/84)를 따른다.

## 현대 만기전역 alias 현황 (2026-09-09)

| 대상            | 현재 계약                                                                         | 제한                                                                                                           |
| --------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 현대 병역 alias | `milCd` BUTTON_OPTION optionMap에서 `만기전역`→필/1; 프로필 `militaryStatus` 한정 | SK 정규화 hook·공통 normalizer·다른 회사/필드로 확대하지 않음; 저장 프로필 불변                                |
| alias fixture   | 전체 현대 fixture에서 병역 상태만 `만기전역`으로 변경                             | 실제 검증 상태와 범위는 [PR #84 검증 기록](https://github.com/woowacourse-teams/2026-career-form/pull/84) 참조 |

이 절은 승인 digest d5c753ace169a09c46452b34a1bcab9c0ae730090eba0b57ccaf9de826476020의 후보 14를 반영한다.

## CF-86 학력 소재지·주야간 현황 (2026-09-10)

프로필 UI·저장 형식은 유지한다. 백엔드 지원 키는 대학·대학원 `attendanceType`, 대학원 `schoolRegion`을 추가하며 표준 ID와 기존 표시 문자열을 호환한다. 로컬 정책은 SK v24·현대 v7이다.

| 대상                       | 구현 및 자동 검증                                                                              | 실제 설치 검증·제한                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| SK 고교·대학·대학원 소재지 | 정확한 native select name, 공식 지역명 18개 명시 별칭, 기존 문자열과 중복 선택지 보호          | 고교·대학 개별 표시/코드 확인; 대학원 실제 입력 미검증                                        |
| SK 대학·대학원 주야간      | 정확한 select name, 주간/야간 1/0, 표준 ID 및 기존 표시 문자열                                 | 대학 주간 확인; 대학원·야간 실제 입력 미검증; 고교 제어 없음                                  |
| 현대 대학·대학원 주야간    | name 없는 schClass trigger와 hidden schClass, 정확한 그룹·코드·유일 메뉴, D/N                  | 대학 주간 표시/코드 확인; 대학원·야간 실제 입력 미검증                                        |
| 현대 대학·대학원 소재지    | name 없는 text trigger, 국가 대한민국/KR 후 재분석, 정확한 서울/95·세종/01356만 허용           | 대학 국가·도시 표시/코드 확인; 대학원·세종 실제 입력 미검증; 다른 도시·구·해외 국가 추정 금지 |
| 현대 소재지 실패 격리      | 빈 국가·중복 도시·정확한 도시 없음은 select-wrap만 수동 처리, 다른 필드 입력 유지              | 자동 통합 테스트로 검증; 학교·주전공 실패 규칙은 별도 유지                                    |
| API 및 상태 추적           | BUTTON_OPTION text는 SELECT_BUTTON_OPTION만 허용, SET_TEXT 거부; 국가·도시를 DOM 식별자로 구분 | 실제 설치 경로 확인                                                                           |

최종 자동 검증은 프론트 79개 파일의 701개 통과·20개 건너뜀, typecheck/lint/format/build, 백엔드 전체 Gradle 테스트, 하네스 검증 통과다. 소재지 실패 격리 회귀는 처리 제거 시 실패하고 원복 후 4개 통과를 확인했다. 빌드는 `VITE_API_BASE_URL=http://localhost:8080`과 manifest/background의 localhost API를 확인했고 로컬 백엔드를 갱신했다. 코드 지원·자동 테스트와 실제 설치 확인 범위를 구분하며, 현대의 별도 검색 재시도·수동 확인을 전체 성공으로 해석하지 않는다. 실제 지원서 저장·제출·페이지 이동·미리보기, 운영 정책 배포는 하지 않았다.

## Greeting 공통 정책과 공개 화면 현황 (CF-94, 2026-09-27)

아래의 `대응·지원`은 BE 정적 규칙, FE 전용 입력과 대상 화면에서 확인한 범위다. `화면 없음`은 카카오모빌리티 표본의 상태이며 다른 기업에 해당 범주의 화면이 없다는 뜻이 아니다. 필드별 실행은 [Greeting 어댑터 근거](adapter-greeting.md)의 구조·값 검사를 통과해야 한다.

| 대상·프로필 영역                                               | 카카오모빌리티 판정 | 구현·확인 근거와 제한                                                                                                          |
| -------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 국문 이름·연락처·생년월일·이메일                               | 대응·지원           | 정확한 name 또는 단일 소유 이메일 combobox, 형식·기존 값 확인; 이메일 확인 버튼 미실행. 카카오모빌리티 전체 프로필 실행에 포함 |
| 병역·보훈·장애의 상태와 실제 노출 세부 항목                    | 대응·지원           | 상태 선행 선택, 재수집과 의미 일치 옵션, 민감정보 개별 확인; 미노출·의미 불일치는 자동 입력하지 않음                           |
| 대학교·대학원의 학교·학위·기간·입학/졸업·주야간·전공·평점/만점 | 대응·지원           | 독립 행 인덱스, 필요한 행 준비, 유일 검색 선택 코드, 날짜 정밀도와 평점·만점 결합; 대학 2행·대학원 1행 설치 확장 대조          |
| 화면의 전공 계열·학교 유형 등 의미가 확정되지 않은 질문        | 의미 불일치         | 기존 프로필에 이름이 비슷한 값이 있어도 의미·옵션이 확인되지 않으면 연결하지 않음                                              |
| 주소·경력·어학·자격증·프로젝트·논문/특허·처우·건강             | 화면 없음           | 카카오모빌리티 대상 지원서에 대응 제어가 없거나 비활성; 다른 Greeting 회사에서의 실제 입력은 실화면 미검증                     |
| 파일·기업 질문·동의·이메일 인증·저장·제출                      | 자동 입력 제외      | 프로필 의미 매핑 또는 AI 실행 범위 밖; 사람이 직접 수행                                                                        |

아래는 카카오모빌리티 표본에서 의미가 대응하는 정적 규칙의 필드별 목록이다. `*`는 대학교 또는 대학원의 검증된 0부터 시작하는 행 인덱스다. `자동`은 BE 규칙·FE 어댑터 회귀 테스트, `실화면`은 설치 확장의 비식별 전체 실행에서 해당 영역의 값·선택 상태를 대조한 범위를 뜻한다. 48개 UI 집계만으로 아래 각 행의 저장 결과를 증명하지 않는다.

| 화면 필드 (`basicInformation` 등 접두사 생략)                                          | 프로필 필드                                                | 제어와 완료 판단                                          | 근거·경계                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| `basicInformation.name`                                                                | 국문 성+이름                                               | text, 전체 이름 결합·값 유지                              | 자동·실화면; 기존 값 보호               |
| `basicInformation.phoneNumber.nationalNumber`                                          | `contact.contact.phoneNumber`                              | text, 전화 형식·값 유지                                   | 자동·실화면                             |
| `basicInformation.birthdate`                                                           | `personal.personal.birthDate`                              | 날짜 버튼, 정확한 일자 표시                               | 자동·실화면 대상                        |
| `basicInformation.email`                                                               | `contact.contact.email`                                    | 이름 없는 text/email combobox의 유일한 소유 라벨과 입력값 | 자동·실화면; 인증 버튼 제외             |
| `militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus`    | `military.military.militaryStatus`                         | 버튼 옵션, 선택 상태 확정                                 | 자동·실화면 대상; 개별 확인             |
| `militaryServicePreferentialEmploymentStatus.militaryService.branchOfService`          | `military.military.militaryBranch`                         | 조건부 버튼, 의미 일치 옵션                               | 자동·실화면 대상; 상태 노출 뒤 재분석   |
| `militaryServicePreferentialEmploymentStatus.militaryService.rank`                     | `military.military.militaryRank`                           | 조건부 버튼, 의미 일치 옵션                               | 자동·실화면 대상; 상태 노출 뒤 재분석   |
| `militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.startDate`  | `military.military.serviceStartDate`                       | 조건부 날짜 버튼, 날짜 정밀도                             | 자동·실화면 대상                        |
| `militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.endDate`    | `military.military.serviceEndDate`                         | 조건부 날짜 버튼, 날짜 정밀도                             | 자동·실화면 대상                        |
| `militaryServicePreferentialEmploymentStatus.disability.disabilityStatus`              | `disability.disability.disabilityStatus`                   | radio, 정확한 체크 상태                                   | 자동·실화면 대상; 개별 확인             |
| `militaryServicePreferentialEmploymentStatus.disability.degreeOfDisability`            | `disability.disability.disabilityGrade`                    | 조건부 버튼, 승인된 등급 별칭                             | 자동·실화면 대상                        |
| `militaryServicePreferentialEmploymentStatus.disability.descriptionOfDisability`       | `disability.disability.disabilityType`                     | 조건부 버튼, 정확한 종류                                  | 자동·실화면 대상                        |
| `militaryServicePreferentialEmploymentStatus.veteran.veteranStatus`                    | `veteran.veteran.veteranStatus`                            | radio, 정확한 체크 상태                                   | 자동·실화면 대상; 개별 확인             |
| `militaryServicePreferentialEmploymentStatus.veteranStatus.veteransRegistrationNumber` | `veteran.veteran.veteranNumber`                            | 조건부 text, 번호 형식                                    | 자동·실화면 대상                        |
| `educationalBackground.universities.*.schoolName`                                      | `education.university.*.schoolName`                        | 학교 검색, 유일 결과 표시·코드                            | 자동·대학교 2행 실화면                  |
| `educationalBackground.universities.*.degreeLevel`                                     | `education.university.*.degreeLevel`                       | radio, 실제 체크 상태                                     | 자동·대학교 2행 실화면                  |
| `educationalBackground.universities.*.enrollmentPeriod.startDate`                      | `education.university.*.startDate`                         | 날짜 버튼, 연월 정밀도                                    | 자동·대학교 2행 실화면                  |
| `educationalBackground.universities.*.enrollmentPeriod.endDate`                        | `education.university.*.endDate`                           | 날짜 버튼, 연월 정밀도                                    | 자동·대학교 2행 실화면                  |
| `educationalBackground.universities.*.admissionType`                                   | `education.university.*.transferStatus`                    | radio, 입학/편입 의미 변환                                | 자동·대학교 2행 실화면                  |
| `educationalBackground.universities.*.completionStatus`                                | `education.university.*.completionStatus`                  | 버튼, 졸업 상태 확인                                      | 자동·대학교 2행 실화면                  |
| `educationalBackground.universities.*.attendanceType`                                  | `education.university.*.attendanceType`                    | radio, 주/야간 체크                                       | 자동·대학교 2행 실화면                  |
| `educationalBackground.universities.*.majors.0`                                        | `education.university.*.majorName`                         | 전공 검색, 유일 결과 표시·코드                            | 자동·대학교 2행 실화면                  |
| `educationalBackground.universities.*.gpa.score`                                       | `education.university.*.gpaScore`                          | text, 만점과 한 쌍으로 검사                               | 자동·대학교 2행 실화면                  |
| `educationalBackground.universities.*.gpa.scoreScale`                                  | `education.university.*.gpaScale`                          | 버튼, 허용 만점 표시·코드                                 | 자동·대학교 2행 실화면                  |
| `educationalBackground.graduateSchools.*.schoolName`                                   | `education.graduateSchool.*.schoolName`                    | 학교 검색, 유일 결과 표시·코드                            | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.degreeLevel`                                  | `education.graduateSchool.*.degreeLevel`                   | 버튼, 학위 옵션 확인                                      | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.enrollmentPeriod.startDate`                   | `education.graduateSchool.*.startDate`                     | 날짜 버튼, 연월 정밀도                                    | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.enrollmentPeriod.endDate`                     | `education.graduateSchool.*.endDate`                       | 날짜 버튼, 연월 정밀도                                    | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.admissionType`                                | `education.graduateSchool.*.admissionType`                 | radio, 실제 체크 상태                                     | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.completionStatus`                             | `education.graduateSchool.*.completionStatus`              | 버튼, 졸업 상태 확인                                      | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.attendanceType`                               | `education.graduateSchool.*.attendanceType`                | radio, 주/야간 체크                                       | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.majors.0`                                     | `education.graduateSchool.*.majorName`                     | 전공 검색, 유일 결과 표시·코드                            | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.majors.0.majorClassification`                 | `education.graduateSchool.*.majorClassification`           | 버튼, 분류 옵션 확인                                      | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.majors.0.majorField`                          | `education.graduateSchool.*.majorField`                    | 버튼, 분야 옵션 확인                                      | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.majors.1`                                     | `education.graduateSchool.*.additionalMajorName`           | 조건부 전공 검색·코드                                     | 자동·대학원 추가전공 1행 실화면 값 유지 |
| `educationalBackground.graduateSchools.*.majors.1.majorClassification`                 | `education.graduateSchool.*.additionalMajorClassification` | 조건부 버튼·분류 옵션                                     | 자동·대학원 추가전공 1행 실화면 값 유지 |
| `educationalBackground.graduateSchools.*.majors.1.majorField`                          | `education.graduateSchool.*.additionalMajorField`          | 조건부 버튼·분야 옵션                                     | 자동·대학원 추가전공 1행 실화면 값 유지 |
| `educationalBackground.graduateSchools.*.gpa.score`                                    | `education.graduateSchool.*.gpaScore`                      | text, 만점과 한 쌍으로 검사                               | 자동·대학원 1행 실화면                  |
| `educationalBackground.graduateSchools.*.gpa.scoreScale`                               | `education.graduateSchool.*.gpaScale`                      | 버튼, 허용 만점 표시·코드                                 | 자동·대학원 1행 실화면                  |

국적 `basicInformation.nationalityCode`→`personal.personal.nationality`는 카카오모빌리티 대상 화면에는 없어서 `화면 없음`으로 분리한다. 당근서비스 실화면에서 유일한 동일 표시명·안정적 `data-value`·선택 상태를 확인한 경우에 한해 `대응·지원`으로 기록한다. 당시 한 칸짜리 영문이름은 순서 미확정으로 확인 필요였으며 아래 최신 정책으로 대체한다.

| 공개 양식                  | 실제 설치 확장 확인                                                                       | 지원 경계                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 카카오모빌리티 기본 도메인 | 비식별 전체 프로필 첫 실행 48개 입력 완료·확인 필요 0개; 재실행 새 입력 0개·확인 필요 0개 | 대상 화면의 기본·민감·대학교 2행·대학원 1행을 대조; 저장·제출 미검증                   |
| 현대오토에버 자체 도메인   | 이름·이메일·전화 3개 입력 완료·확인 필요 0개; 별도 공고 재실행 새 입력 0개·세 값 유지     | 해당 공개 양식의 공통 필드 범위                                                        |
| 무신사 자체 도메인         | 이름·이메일·전화 3개 입력 완료; 영문이름 확인 필요 1개                                    | 영문이름의 성·이름 순서와 구분자가 불명확함                                            |
| 당근서비스 기본 도메인     | 이름·국적·이메일·전화 4개 입력 완료; 영문이름 확인 필요 1개; 재실행 새 입력 0개           | 국적은 유일 표시명·안정 코드·선택 상태를 검증한 화면에 한정                            |
| 메디퀴터스 기본 도메인     | `이메일` 표시명의 칸을 포함해 이름·연락처·이메일 3개 입력 완료                            | `이메일주소`/`이메일`만 허용하고 중복 칸은 거부; 이메일 값 유지 확인, 인증 버튼 미실행 |

대학원 추가전공의 이름·분류·분야는 카카오모빌리티 지원서에서 조건부 행 노출과 값 유지를 각각 관찰했다. 다른 양식에서 행이 없으면 `화면 없음`, 행이 있어도 동일한 제어와 값 유지를 확인하지 못하면 `실화면 미검증`이다. 설치 결과의 입력 완료 개수만으로 각 필드의 값을 추정하지 않았다.

설치 결과의 입력 완료 개수는 그 화면에서 실행된 writer의 결과이며 다른 프로필 범주 전체나 실제 저장 호환성을 뜻하지 않는다. 프론트 전체 테스트 2,089개 통과, lint/typecheck/build, 백엔드 check와 하네스 verify를 확인했다. 전체 프론트 포맷 검사는 Issue 밖 기존 CJ fixture의 HTML 구문 오류로 실패했고 CF-94 변경 파일의 포맷 검사는 통과했다.

## 2026-09-28 DNS/DOM 공통 판별

BE는 기존 등록 회사 정책을 우선한 뒤 `site.host`와 지원서 `pathPattern`으로 Greeting 연결을 판정한다. 정확한 Greeting 기본 도메인 또는 제한된 DNS CNAME 조회에서 Greeting으로 이어지는 별칭을 확인하면 하나의 공통 정책을 선택한다. 기업별 자체 도메인 허용 목록은 사용하지 않는다. DNS 조회 시간·동시성·체인 길이·캐시 크기를 제한하며 조회 오류는 차단한다. CNAME 근거가 없다는 결과를 비-Greeting 확정으로 표현하지 않는다.

FE는 SK·현대의 기존 선택 우선순위를 유지하며 유일한 최상위 `basicInformation.name`, `basicInformation.phoneNumber.nationalNumber` 입력과 소유한 Greeting field 구조 등 공통 DOM 속성으로 화면 어댑터를 선택한다. 수집·준비·입력·재검증에서 일관된 선택을 유지하고 DOM 변경 때문에 검증된 Greeting 입력을 범용 실행기로 낮추지 않는다. 정적·범용 분석의 최종 결정은 BE가 담당하며 Greeting 화면에 범용 응답이 오면 입력을 중단한다.

이전 설치 확장 관측은 DNS/DOM 자동 판별 이전의 증거다. DNS/DOM 판별은 합성 회귀·정적 검사·빌드와 로컬 서버의 DNS/API 응답으로 검증했다. 이후 필드 확장의 카카오게임즈 설치 브라우저 관측은 별도이며 최신 수정본의 빈 지원서 전체 실행과 재실행은 아직 확정하지 못했다. 카카오게임즈는 공개 구조·CNAME의 읽기 전용 관측이며 전 항목의 실제 입력 성공으로 확대하지 않는다.

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
