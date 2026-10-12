# Greeting 지원서에서 프로필 가져오기

Issue: [CF-192](https://github.com/woowacourse-teams/2026-career-form/issues/192)

기존 Greeting 수집기와 행 식별 로직을 사용하는 읽기 검증을 실제 지원서 패널의 가져오기 기능으로 연결했다. 사용자가 선택한 기본정보와 대학교 정보를 기존 프로필과 비교한 후 로컬에 저장한다. 전체 이름 분리, 학교 카탈로그 ID, 없는 날짜 일자를 추측하지 않는다.

확장 프로그램의 지원서 패널에서 **지원서에서 가져오기**를 누르면 현재 페이지의 후보를 읽는다. 처음에는 모든 항목이 미선택이다. 이름은 성·이름을 직접 확인하고, 학력은 새 항목 추가 또는 기존 항목 연결을 선택한다. 연월만 있는 날짜는 정확한 연·월·일을 입력하거나 제외한다. **선택한 정보 저장** 성공 후 패널 목록이 갱신되며 기존 자동 기입 버튼으로 이어갈 수 있다.

대상 URL이 제공되지 않아 실제 Greeting 사이트 호환성은 검증하지 않았다. 합성 fixture를 사용하는 Chromium에서 읽기·검토·저장과 취소를 확인했다. 프로그램은 지원서 DOM, 페이지 이동·저장·제출을 조작하지 않는다. 읽은 후보는 로컬 검토 화면에 머무르며, 선택한 프로필 저장만 확장 프로그램 내부 background 저장 경로를 사용한다. 외부 서버·분석·로그로 값을 보내지 않는다.

## 재현

```sh
cd frontend
npm ci
npm run test:unit -- src/research/greeting-import-probe.test.ts src/profile/page-import src/extension/InPageProfilePanel.import.test.tsx
npm run test:browser
```

[합성 fixture](greeting-import-probe.test-fixtures.ts)는 기존 [Greeting 수집 테스트](../autofill/dom/collect.greeting.test.ts)와 [반복행 테스트](../autofill/adapters/greeting/collection.test.ts)의 name, field, accordion 구조를 출발점으로 사용한다. 대학 두 행을 화면 순서와 반대로 배치하여 index 식별도 검증한다. 실제 지원자 데이터나 실사이트 DOM을 수집한 fixture가 아니다.

[제품 reader](../profile/page-import/reader.ts)의 `readGreetingImport(document)`는 아래 결과를 반환한다. [테스트](greeting-import-probe.test.ts)는 기대값을 리터럴로 대조한다.

## 검증 범위와 결과

| 입력 범위                                     | 후보 상태        | 변환 및 제한                                                                                                             |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 이름 한 칸                                    | `review`         | 원문 보존. 성과 이름의 대상 키를 추측하지 않는다.                                                                        |
| 이메일                                        | `available`      | 기본 형식 검사 후 `contact.contact.email` 후보. 주소의 실재 여부는 검사하지 않는다.                                      |
| 전화번호                                      | `available`      | fixture의 국내형 10~11자리, 0으로 시작하는 숫자 표현만 허용하고 공백·하이픈 제거. 국제번호·국가코드 결합은 미지원.       |
| 대학 학교명 두 행                             | `review`         | 행별 `education.university.schoolName` 후보와 `manual` identity. 표시명만으로 `selected` 또는 catalogId를 만들지 않는다. |
| 입학·졸업 연월                                | `review`         | `YYYY-MM`과 `precision: month` 보존. 현재 전체 날짜 계약에 맞추기 위해 1일을 추가하지 않는다.                            |
| 입학·졸업 전체 날짜                           | `available`      | 유효한 날짜만 `YYYY-MM-DD`, `precision: day`로 정규화. 기존 `formatProfileDate`로 윤년·일자 검증.                        |
| 빈 값·잘못된 날짜·미지원 제어                 | `unsupported`    | 후보에 값을 포함하지 않는다.                                                                                             |
| visible disabled·readonly 필드                | 형식에 따라 결정 | 기존 쓰기 차단을 변경하지 않고 값만 읽는다.                                                                              |
| 숨김·inert·접힌 행                            | `unsupported`    | 펼치거나 클릭하지 않고 값을 반환하지 않는다.                                                                             |
| 중복·누락 인덱스·혼합 prefix·학교 anchor 누락 | `unsupported`    | 대학 그룹의 값을 모두 보류하고 기본 연락처는 독립적으로 처리한다.                                                        |

대학교는 **학교명·입학일·졸업일만** 검증한다. 전공·학위·학점·졸업 상태, 추가 학력 종류는 이 연구 함수의 필드 허용 목록에 포함하지 않는다. 이 제한은 기존 자동 기입 어댑터의 지원 범위를 축소하지 않는다.

기준 fixture의 9개 후보는 `available` 3개(이메일, 전화, 전체 날짜 1개), `review` 6개(이름, 학교명 2개, 연월 날짜 3개)다. 이는 합성 fixture의 결과이며 성공률이나 실제 서비스 적용률이 아니다.

## 재사용한 코드와 새 코드의 경계

- `collectFieldsSnapshot`: 구조 메타데이터와 실제 요소의 로컬 registry를 구성한다. 반환된 분석 요청은 전송하지 않는다.
- `CandidateRegistry.lookupField`: 현재 바인딩과 제어 상태를 검사한다. `disabled`·`readonly`는 읽기 연구에서만 허용하고 숨김·inert·불명확한 바인딩은 거부한다.
- `greetingRowIdentity`와 `repeatableItemCandidates`: 이름 기반 행 소유권, 중복 및 0부터 연속된 인덱스를 검증한다. 이번 연구는 하나의 대학 accordion으로 제한한다.
- `customFieldValue`: 검증된 날짜 버튼의 표시값을 읽는다. 메뉴·달력·다음 단계를 열지 않는다.
- 새 코드는 위 구성 요소 위에서 허용된 필드의 읽기와 import 후보 분류만 담당한다. 기존 정방향 자동 기입 규칙을 역함수처럼 사용하지 않는다.

값이 없는 필드와 DOM에 존재하지 않는 필드는 모두 후보 생성 불가로 구분해 보고한다. 현재 페이지 밖, 접힌 상태에서 제거된 제어, 아직 렌더링되지 않은 다른 단계의 존재나 전체 지원서 완전성은 판단하지 않는다.

## 선택 병합과 저장

[PageImport](../profile/page-import/PageImport.tsx)는 각 후보와 기존 값을 표시한다. 선택한 필드만 [mergeImportSelection](../profile/page-import/merge.ts)에서 복제 프로필에 반영한다. 선택하지 않은 필드·학력·다른 범주는 보존한다. `available`은 자동 저장 승인이 아니며 사용자 체크가 필요하다.

- 학교는 직접 입력 `manual` identity로 저장한다. 같은 학교명을 가진 기존 행을 자동 선택하지 않는다. 새 항목은 학교명과 새 고유 ID가 필요하다. 기존 항목은 사용자 선택한 ID를 사용하며 전공 등 미선택 값은 유지한다.
- 학교명·시작일·종료일이 모두 같은 새 학력의 재추가를 거부한다. 학교명만 같은 별도 학력을 임의로 합치지 않는다.
- 이름은 원문을 참고해 국문 성·이름을 직접 입력한다. 연월 날짜는 원문을 표시하고 날짜 입력은 비워 두어 임의의 1일을 만들지 않는다.
- 취소는 저장하지 않는다. 미지원/빈 결과, 읽기 실패 재시도, 저장 실패, 저장 중 중복 클릭을 처리한다. 저장 성공을 확인한 뒤에만 패널의 프로필을 바꾼다.
- 저장 직전 검토 기준 프로필과 최신 프로필을 비교한다. production `ChromeProfileStorage`의 일반 저장과 조건부 저장은 모두 [background 단일 큐](../storage/profile-write-handler.ts)에서 비교와 쓰기를 함께 수행한다. 다른 창의 자동 저장과 가져오기 중 후행 stale write는 거부하며 최신 프로필을 재검토한다. 독립적인 mock repository가 조건부 저장 API를 구현하지 않으면 동일한 원자적 보장을 제공하지 않는다.
- 프로필 관리 화면의 충돌은 일반 저장 실패와 구분한다. 미저장 편집을 버리는 명시적 확인 후 최신 프로필을 다시 불러와 편집을 재개한다.

## 지원 한계

현재 인페이지 지원서 패널에서 시작하며, 기존 이름 있는 이메일·국내 전화와 대학교 학교명/입학/졸업 날짜 구조를 지원한다. 이름 없는 이메일 combobox, 국제전화, 전공·학위·학점·졸업상태, 다른 학력 종류·경력·민감정보·파일은 제외한다. 현재 화면 밖이나 DOM에서 제거된 항목은 자동으로 열거나 탐색하지 않는다.

실제 Greeting 사이트 검증과 자동 기입 버튼 클릭률 효과 측정은 수행하지 않았다. 합성 fixture 성공을 실사이트 전체 양식 지원이나 제출 호환성 보장으로 확대하지 않는다.

## 초기 기술 검증 기록

2026-10-12 macOS에서 실행했다. 공식 하네스 환경인 WSL/Linux 실행을 대신하지 않는다.

- 신규 연구 테스트: 33개 통과. 최초 빈 구현에서는 33개 모두 기대 결과 부재로 실패했다.
- 연구 모듈 한정 커버리지: 라인 92.85%, 분기 89.88%, 함수 100%.
- `npm run typecheck`, 변경 파일 Prettier, `npm run build`, `git diff --check`: 통과.
- `npm run lint`: 명령 통과. 현재 ESLint 설정은 TypeScript를 제외하므로 신규 TS의 lint 검증으로 표현하지 않는다.
- 제품 연결 전 `npm test`: 단위·브라우저 합계 3,377개 통과, 19개 건너뜀, 실패 없음(310개 파일 통과, 1개 건너뜀). Chromium 런타임을 준비한 환경에서 실행했다. 초기 실행의 프로필 fixture 6개 실패는 아래 수정으로 해소했다.
- 위 6개 실패는 `profile-fixtures.test.ts`가 `fixtures/**/*.json`에서 DOM 구조 snapshot 3개도 프로필로 읽기 때문이다. 변경 전 기준 커밋 `3daae64805e6d4a622fc13e624eacbbe52ff7c89`를 별도 임시 디렉터리에 추출한 뒤 해당 테스트만 실행해 동일한 6개 실패와 41개 통과를 재현했다. 사용자 승인으로 #192 범위에 포함해 탐색 대상을 `**/profile-export*.json`으로 한정했다. 루트와 하위 디렉터리의 프로필 export는 계속 검증하고 DOM snapshot 메타데이터는 제외한다. 수정 전 41개 통과·6개 실패를 다시 확인한 후 수정했고, 기존 프로필 41개 및 import 33개가 모두 통과했다. 전체 실행에서도 실패가 없다.
- `.venv/bin/python harness/scripts/verify.py`: 통과. 하네스 366개, infra 134개 중 36개 건너뜀, 하네스 커버리지 85%.
- 초기 기술 검증의 독립 코드·보고서 리뷰: 수정이 필요한 Standards 및 Spec 결함 없음.

위 초기 연구 기록은 제품 UI 연결 전의 결과다. 이후 패널 연결과 실제 Chromium에서의 합성 fixture 검증은 아래에 구분한다.

## 제품 연결 검증

제품 구현 커밋 `588288750e234fbad481f6b56c8f7d8d58b17677`에서 2026-10-12 macOS 검증을 실행했다.

- 전체 `npm test`: **3,437개 통과, 19개 건너뜀, 실패 없음**. 315개 파일 통과, 1개 건너뜀.
- Chromium 10개 포함: 실제 live value 읽기→shadow-root 검토→선택 저장, 연월 날짜 미선택 제외, 원본 지원서 불변, 취소 미저장.
- reader 기존 33개 유지. 선택 병합, 미지원/읽기 실패, 중복 저장 방지, 이름·전체 날짜 직접 확인, 동일 학력 재추가 거부, ID `new` 기존 행 연결, 늦은 초기 프로필 조회 회귀를 검증했다.
- 옵션 저장과 import 저장 순서를 교차시켜 후행 stale write가 거부되고 최신값이 보존됨을 확인했다. 일반 충돌과 일시적 저장 오류를 구분하며, 최신 프로필 다시 읽기의 취소·실패·성공과 저장 재개를 검증했다.
- 타입 검사, lint 명령, 변경 파일 Prettier, production build, `git diff --check`, 가상환경 Python의 `harness/scripts/verify.py` 통과. ESLint의 TypeScript 제외 한계는 기존과 같다.
- 최종 독립 리뷰: Standards 및 Issue Spec 결함 0건. 검토 중 발견한 저장 경쟁·학력 ID 충돌·프로필 관리 충돌 복구 문제는 수정 후 재검토했다.
- 실제 채용 페이지와 WSL/Linux 검증은 수행하지 않았다.
