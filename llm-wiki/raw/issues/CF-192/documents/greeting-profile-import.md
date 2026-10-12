# Greeting 프로필 import 기술 검증

## 읽기 전용 후보 생성

합성 Greeting fixture에서 기존 수집기와 행 식별기를 재사용해 기본정보 및 대학교 2개 행(학교명·입학일·졸업일)의 읽기 전용 import 후보를 생성했다. 제품 UI·저장·외부 전송은 연결하지 않았다.

## 확인이 필요한 정보

전체 이름은 분리하지 않고, 학교는 manual identity만 만들며, 연월 날짜는 month 정밀도를 보존해 확인 필요로 둔다. 임의의 성·이름·카탈로그 ID·날짜 일을 만들지 않는다.

## 읽기 범위와 완전성

보이는 disabled·readonly는 읽고, 숨김·inert 및 모호한 학력 그룹은 값을 반환하지 않는다. 현재 페이지 밖이나 DOM에서 제거된 항목의 완전성을 보장하지 않는다.

## 후속 제품 구현 조건

후속 제품은 실제 페이지 확인과 사용자 선택 병합이 필요하다. 기존 값 충돌은 개별 선택하며, 행 index나 학교명만으로 기존 학력을 자동 병합하지 않는다. 이번 연구는 실사이트 지원·클릭률 개선의 증거가 아니다.

## 구현 근거

- [검증 함수](https://github.com/woowacourse-teams/2026-career-form/blob/2567a6ab93014787eb155670651796ef5013567c/frontend/src/research/greeting-import-probe.ts): 기존 수집기·registry·반복행 검증기를 재사용한 후보 생성.
- [합성 fixture](https://github.com/woowacourse-teams/2026-career-form/blob/2567a6ab93014787eb155670651796ef5013567c/frontend/src/research/greeting-import-probe.test-fixtures.ts)와 [테스트](https://github.com/woowacourse-teams/2026-career-form/blob/2567a6ab93014787eb155670651796ef5013567c/frontend/src/research/greeting-import-probe.test.ts): 기본정보·대학 2개 행과 읽기·변환 경계 검증.
- [기술 검증 보고서](https://github.com/woowacourse-teams/2026-career-form/blob/2567a6ab93014787eb155670651796ef5013567c/frontend/src/research/greeting-import-probe.md): 범위·제한·후속 병합 제안.

위 링크의 수집 시점은 manifest의 Source-Revision으로 고정한다. 후속 코드 변경의 상태를 이 raw의 검증 근거로 확대하지 않는다.
