# Greeting 지원서에서 프로필 가져오기

## 전체 필드 선택 가져오기

Greeting 가져오기는 기본 인적사항·연락처·주소, 고등학교·대학교·대학원, 경력·프로젝트, 어학·자격증, 처우·병역·보훈·장애에서 정확한 경로와 기존 프로필 목적지가 확인된 필드 전반을 지원한다. 범주별 기존값 비교, 개별 선택과 민감 항목을 포함하는 전체 선택 후 선택한 필드만 로컬에 저장한다.

## 부분 실패 격리

회사별 추가·생략 필드와 비연속 반복 인덱스를 허용하며 개별 읽기 오류·알 수 없는 필드·모호한 원본 또는 목적지는 값 없이 제외하고 정상 필드 수집을 계속한다. 제외 원인을 화면에 표시하고, 기존 자동 기입 어댑터의 안전 경계는 변경하지 않는다.

## 확인·병합과 저장 충돌

국문·영문 전체 이름은 사용자가 성·이름을 확인하고 월 단위 날짜에는 없는 일자를 만들지 않는다. 표준 옵션과 조건부 전공 상태를 검증하며, 반복 항목은 대표 이름과 새 ID로 추가하거나 같은 종류의 기존 ID에 명시적으로 연결한다. 미선택 정보와 background 단일 비교·저장 큐의 충돌 보호를 유지한다.

## 검증 근거와 한계

합성 Chromium의 다중 범주·부분 실패 흐름과 Aside 실사이트를 구분해 검증했다. 최신 LF 빌드에서 56개 원본 후보를 이름 확인 후 58개 프로필 필드로 저장·대조했고 대응 목적지가 없는 21개 제어는 제외했다. HLB에서도 기본정보 3종과 이메일만 저장 시 다른 정보 보존을 확인했다. 실제 지원서 제출·동의·인증·업로드는 실행하지 않았고 모든 Greeting 사이트 호환성이나 클릭률 개선을 입증한 것은 아니다.

visible disabled·readonly는 읽고 숨김·inert 영역은 제외한다. 지원서 DOM·페이지 저장·제출을 변경하지 않으며 읽은 값을 외부 서버·분석·로그로 보내지 않는다.

## 구현 근거

- [전체 필드 매핑](https://github.com/woowacourse-teams/2026-career-form/blob/accb29d8d3edafadffc7ff8b0e7a69ed5767dec9/frontend/src/profile/page-import/greeting-import-mappings.ts)
- [필드별 reader](https://github.com/woowacourse-teams/2026-career-form/blob/accb29d8d3edafadffc7ff8b0e7a69ed5767dec9/frontend/src/profile/page-import/reader.ts)
- [선택 검토 UI](https://github.com/woowacourse-teams/2026-career-form/blob/accb29d8d3edafadffc7ff8b0e7a69ed5767dec9/frontend/src/profile/page-import/PageImport.tsx)
- [선택 병합과 저장](https://github.com/woowacourse-teams/2026-career-form/blob/accb29d8d3edafadffc7ff8b0e7a69ed5767dec9/frontend/src/profile/page-import/merge.ts)
- [공통 저장 큐](https://github.com/woowacourse-teams/2026-career-form/blob/accb29d8d3edafadffc7ff8b0e7a69ed5767dec9/frontend/src/storage/profile-write-handler.ts)
- [전체 필드 및 실패 격리 회귀](https://github.com/woowacourse-teams/2026-career-form/blob/accb29d8d3edafadffc7ff8b0e7a69ed5767dec9/frontend/src/profile/page-import/reader.expanded.test.ts)
- [Chromium 흐름 검증](https://github.com/woowacourse-teams/2026-career-form/blob/accb29d8d3edafadffc7ff8b0e7a69ed5767dec9/frontend/src/profile/page-import/PageImport.browser.test.tsx)
- [실사이트 포함 구현·검증 보고서](https://github.com/woowacourse-teams/2026-career-form/blob/accb29d8d3edafadffc7ff8b0e7a69ed5767dec9/frontend/src/research/greeting-import-probe.md)
