# Greeting 프로필 import 기술 검증

Issue: [CF-192](https://github.com/woowacourse-teams/2026-career-form/issues/192)

기존 Greeting 수집기와 행 식별 로직으로 합성 지원서의 기본정보와 대학교 두 행을 읽고, 프로필 연결 후보를 만들 수 있다. 제품 import 구현은 조건부로 진행할 수 있다. 전체 이름 분리, 학교 카탈로그 확정, 연월 날짜의 저장 계약과 기존 프로필 병합은 후속 설계가 필요하다.

이 코드는 제품 진입점에 연결하지 않은 연구용 함수다. 반환된 `available`도 저장 승인이나 실제 채용 사이트 호환성을 뜻하지 않는다. 현재 문서에서 읽은 후보만 메모리에 반환하며 UI, 프로필 저장, 네트워크 호출, 페이지 조작을 하지 않는다.

## 재현

```sh
cd frontend
npm ci
npm run test:unit -- src/research/greeting-import-probe.test.ts
```

[합성 fixture](greeting-import-probe.test-fixtures.ts)는 기존 [Greeting 수집 테스트](../autofill/dom/collect.greeting.test.ts)와 [반복행 테스트](../autofill/adapters/greeting/collection.test.ts)의 name, field, accordion 구조를 출발점으로 사용한다. 대학 두 행을 화면 순서와 반대로 배치하여 index 식별도 검증한다. 실제 지원자 데이터나 실사이트 DOM을 수집한 fixture가 아니다.

[검증 함수](greeting-import-probe.ts)의 `probeGreetingImport(document)`는 아래 결과를 반환한다. [테스트](greeting-import-probe.test.ts)는 기대값을 리터럴로 대조한다.

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

## 기존 프로필과의 병합 제안

이번 함수는 기존 프로필을 받거나 수정하지 않는다. 후속 제품 구현에서는 다음 방식을 검증할 필요가 있다.

1. 단일 필드의 기존 값과 가져온 후보가 같으면 변경하지 않는다. 빈 값은 사용자 확인 후 채우고 다른 값은 둘을 비교해 개별 선택한다.
2. 이름 분리·학교 검색 확정·연월 정밀도 문제를 해결하기 전에는 저장 가능 상태로 승격하지 않는다.
3. 반복 항목은 페이지의 행 인덱스를 기존 프로필의 영구 ID로 사용하지 않는다. 학교와 기간 등으로 일치 후보를 제시하되, 정확한 일치 근거가 부족하면 새 항목 추가 또는 기존 항목 연결을 사용자가 선택한다. 학교명만으로 자동 병합하지 않는다.
4. 읽기 결과 확인부터 저장 사이에 프로필이 변경되면 최신 프로필을 다시 비교한다. JSON 전체 덮어쓰기 경로를 재사용하지 않는다.

## 다음 구현 판단

fixture에서의 **읽기 및 후보 생성은 진행 가능**하다. 사용자 확인·병합·저장 UI를 구현하기 전에 실제 Greeting 페이지 한 종류에서 동일한 DOM과 현재 값 접근이 유지되는지 별도 확인해야 한다. 사이트의 저장·임시저장·이동·제출 호환성은 이번 근거로 판단할 수 없다.

최종 목표인 자동 기입 버튼 클릭률 개선은 제품 구현과 사용자 측정 이후 평가한다. 이번 결과는 그 효과를 증명하지 않는다.

## 자동 검증 기록

2026-10-12 macOS에서 실행했다. 공식 하네스 환경인 WSL/Linux 실행을 대신하지 않는다.

- 신규 연구 테스트: 33개 통과. 최초 빈 구현에서는 33개 모두 기대 결과 부재로 실패했다.
- 연구 모듈 한정 커버리지: 라인 92.85%, 분기 89.88%, 함수 100%.
- `npm run typecheck`, 변경 파일 Prettier, `npm run build`, `git diff --check`: 통과.
- `npm run lint`: 명령 통과. 현재 ESLint 설정은 TypeScript를 제외하므로 신규 TS의 lint 검증으로 표현하지 않는다.
- `npm test`: 3,369개 통과, 6개 실패, 19개 건너뜀. 처음에는 Chromium 런타임 누락으로 브라우저 테스트도 실행되지 않았다. 런타임 준비 후 `npm run test:browser`의 8개는 통과했다.
- 위 6개 실패는 `profile-fixtures.test.ts`가 `fixtures/**/*.json`에서 DOM 구조 snapshot 3개도 프로필로 읽기 때문이다. 변경 전 기준 커밋 `3daae64805e6d4a622fc13e624eacbbe52ff7c89`를 별도 임시 디렉터리에 추출한 뒤 해당 테스트만 실행해 동일한 6개 실패와 41개 통과를 재현했다. #192 범위 밖으로 두며 전체 테스트 통과를 주장하지 않는다.
- `.venv/bin/python harness/scripts/verify.py`: 통과. 하네스 366개, infra 134개 중 36개 건너뜀, 하네스 커버리지 85%.
- 독립 코드·보고서 리뷰: 수정이 필요한 Standards 및 Spec 결함 없음.

이름 없는 이메일 combobox, 국제전화, 실제 Greeting 사이트, Chrome 확장 UI에서의 import는 이번 합성 fixture 검증에 포함되지 않는다. 독립 후속 작업으로 프로필 fixture glob을 프로필 형식 JSON에 한정해 기존 6개 실패를 해결할 필요가 있다.
