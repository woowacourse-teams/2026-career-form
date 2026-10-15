# Greeting 지원서에서 프로필 가져오기

## 전체 필드 선택 가져오기

Greeting 가져오기는 기본 인적사항·연락처·주소, 고등학교·대학교·대학원, 경력·프로젝트, 어학·자격증, 처우·병역·보훈·장애에서 정확한 경로와 기존 프로필 목적지가 확인된 필드 전반을 지원한다. 한 화면에서 범주별 기존값을 비교하고 범주, 항목, 값 단위로 고른 뒤 저장 버튼 한 번으로 선택한 필드만 로컬에 저장한다.

## 부분 실패 격리

회사별 추가·생략 필드와 비연속 반복 인덱스를 허용하며 개별 읽기 오류·알 수 없는 필드·모호한 원본 또는 목적지는 값 없이 제외하고 정상 필드 수집을 계속한다. 제외 원인을 화면에 표시하고, 기존 자동 기입 어댑터의 안전 경계는 변경하지 않는다.

## 한 화면 검토와 기본 선택

가져오기 검토는 단계 이동 없이 한 화면에서 한다. 비어 있던 프로필 칸을 채우는 확인된 값만 미리 선택하고, 기존 값을 바꾸는 값과 병역, 보훈, 장애 범주는 꺼진 채로 시작하며, 기존 값과 같은 값은 저장 대상에서 뺀다. #212 이후 field-definitions는 어떤 범주도 sensitive로 표시하지 않으므로 이 세 범주는 가져오기 전용 목록(IMPORT_SENSITIVE_CATEGORIES)으로 지키고 처우는 넣지 않는다. Issue 192 추가 범위에서 "사용자가 명시적으로 선택한 정보"는 저장 버튼을 누르기 전에 화면에서 확인하고 끌 수 있는 이 미리 선택을 포함한다고 정했다.

사람이 정해야 하는 이름 분리, 연월 날짜의 일자, 같은 이름의 기존 반복 항목 연결은 확인 카드로 하나씩 묻고 나중으로 미룰 수 있다. 확인하지 않은 값만 저장에서 빠지고 나머지 저장은 막지 않는다. 결정이 바뀐 행은 새로 읽은 것처럼 다시 시작하고(새 값은 켜고 덮어쓰기는 끔), 없어진 기존 항목을 가리키는 연결은 새 항목으로 바꾸지 않고 다시 묻는다.

같은 새 항목이 두 번 들어오거나 두 행이 같은 기존 항목을 고치면 findInvalidImportRows의 앞선 행 우선 규칙으로 뒤 행 그룹만 저장에서 빼고 개수를 안내한다. 이름이 다른 기존 항목에도 반복 항목의 저장 위치 바꾸기로 명시적으로 연결할 수 있다.

원본 지원서 칸 강조는 값이나 카드에서 실제 마우스 움직임(pointermove)과 80ms 머무름 뒤, 또는 키보드 포커스로 시작하고 scroll nearest로 보이는 칸이면 페이지를 움직이지 않는다. pointerenter를 쓰면 포커스 이동으로 패널이 스크롤될 때 멈춘 마우스 아래 요소가 강조를 덮어쓴다는 것을 Chromium 테스트로 확인했다.

가져오기 화면 문구에는 가운데 점을 쓰지 않는다. field-definitions의 "A·B" label은 plainLabel로 받침에 맞춰 "A와 B" 또는 "A과 B"로 바꾸고 "주·야간"은 "주야간"으로 표시한다. 색은 theme.css 토큰, 주요 버튼은 사이드 패널 자동 기입 버튼 모양을 따른다. 저장 뒤 되돌리기는 범위 밖으로 두었다.

## 실행 정책 기반 읽기

#212가 프론트 Greeting 정적 어댑터를 지우고 실행 정책을 DB로 옮긴 뒤, 가져오기는 자동 기입과 같은 실행 정책 API를 호출해 host와 pathname만 보내고 받은 정책을 문서에 설치한 뒤 읽는다. Greeting 판정은 componentPolicy가 설치돼 있고 기본 컨트롤이 확인될 때만 참이다. 정책이 없으면 읽지 않아 가져올 정보가 없다고 안내하고, 조회에 실패하면 오류 상세 없이 다시 읽기를 안내하며, 같은 URL에 이미 설치된 정책은 다시 부르지 않는다. 지원서 값은 외부로 보내지 않는다.

대학교와 대학원의 추가 전공은 인덱스가 아니라 보이는 구분값(복수전공, 부전공)이 하나일 때만 이름, 유무, 계열 필드에 연결한다. develop에서 없어진 대학원 majorClassification과 additionalMajorClassification 목적지는 제외하고, develop이 완화한 표시 조건(유무 값이 없으면 이름이나 계열만 있어도 표시)을 따른다.

## 확인·병합과 저장 충돌

국문·영문 전체 이름은 사용자가 성·이름을 확인하고 월 단위 날짜에는 없는 일자를 만들지 않는다. 표준 옵션과 조건부 전공 상태를 검증하며, 반복 항목은 대표 이름과 새 ID로 추가하거나 같은 종류의 기존 ID에 명시적으로 연결한다. 미선택 정보와 background 단일 비교·저장 큐의 충돌 보호를 유지한다.

## 검증 근거와 한계

합성 Chromium의 다중 범주·부분 실패 흐름과 Aside 실사이트를 구분해 검증했다. 최신 LF 빌드에서 56개 원본 후보를 이름 확인 후 58개 프로필 필드로 저장·대조했고 대응 목적지가 없는 21개 제어는 제외했다. HLB에서도 기본정보 3종과 이메일만 저장 시 다른 정보 보존을 확인했다. 실제 지원서 제출·동의·인증·업로드는 실행하지 않았고 모든 Greeting 사이트 호환성이나 클릭률 개선을 입증한 것은 아니다.

매핑 커버리지 테스트의 독립 대조 케이스(백엔드 GreetingCompanyFormPolicyFactory 기준)는 #212 이후 develop의 Greeting 실행 정책 스냅샷(v17)을 설치한 상태로 통과한다. 이전에 정적 정책 88개 원본 규칙과 대조했던 근거는 정적 어댑터가 삭제되어 현재 코드에서 다시 실행할 수 없다. 모든 DOM 제어 종류, 선택지, 실사이트 변형의 전수 검증을 의미하지 않는다.

빈 대학원의 기본 주전공 및 빈 경력의 미체크 퇴사는 다른 읽을 수 있는 값이 없으면 제외한다. 이름 없이 날짜나 업무가 있는 행과 읽기 실패의 정상 형제 필드는 보존하고 새 항목 이름 및 충돌 보호를 유지한다.

Aside에서 검증 확장만 활성화하고 이전 콘텐츠 스크립트가 남은 테스트 페이지를 새로고침한 뒤 라이나 3개 및 에코마케팅 5개 필드를 전체 선택 저장과 프로필 재조회로 대조해 일치를 확인했다. 에코의 미지원 수상 필드는 제외됐고 처우 및 반복 항목 개수는 보존됐다. 전체 사이트 호환성은 미입증이다.

visible disabled·readonly는 읽고 숨김·inert 영역은 제외한다. 지원서 DOM·페이지 저장·제출을 변경하지 않으며 읽은 값을 외부 서버·분석·로그로 보내지 않는다.

## 구현 근거

- [전체 필드 매핑](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/greeting-import-mappings.ts)
- [필드별 reader](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/reader.ts)
- [한 화면 검토 상태 모델](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/review-model.ts)
- [한 화면 검토 UI](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/PageImport.tsx)
- [확인 카드](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/ImportConfirmCards.tsx)
- [범주 목록](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/ImportCategoryList.tsx)
- [원본 칸 강조](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/source-presentation.ts)
- [실행 정책 불러오기](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/load-import-policy.ts)
- [선택 병합과 저장](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/merge.ts)
- [공통 저장 큐](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/storage/profile-write-handler.ts)
- [전체 필드 및 실패 격리 회귀](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/reader.expanded.test.ts)
- [Chromium 흐름 검증](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/profile/page-import/PageImport.browser.test.tsx)
- [실사이트 포함 구현·검증 보고서](https://github.com/woowacourse-teams/2026-career-form/blob/843c7ebb10e771ac51570dfff7efc8fbda2aded2/frontend/src/research/greeting-import-probe.md)
