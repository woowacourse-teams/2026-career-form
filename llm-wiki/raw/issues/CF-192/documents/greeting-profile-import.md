# Greeting 지원서에서 프로필 가져오기

## 패널에서 선택 가져오기

Greeting 지원서의 인페이지 패널에서 기본정보와 대학교 학교명·입학일·졸업일 후보를 읽고, 사용자가 선택한 필드만 기존 프로필과 비교해 로컬 저장한다. 저장 성공 후 패널 목록을 갱신하고 자동 기입으로 이어갈 수 있다.

## 이름·날짜·학력 확인

이름은 성·이름을 자동 분리하지 않고 사용자가 직접 확인한다. 연월 날짜는 없는 일자를 만들지 않으며 정확한 전체 날짜를 입력하거나 제외한다. 학교명은 manual identity로 저장하고 새 학력에는 학교명과 새 ID가 필요하다. 기존 학력 연결은 사용자가 ID로 선택하며 동일 학교·시작일·종료일의 새 항목 재추가는 막는다.

## 동시 저장 충돌과 복구

프로덕션 프로필 저장은 확장 프로그램 내부 background 단일 큐에서 예상 프로필과 현재 프로필 비교 후 기록한다. 다른 창의 자동 저장과 가져오기 중 오래된 저장은 거부한다. 가져오기 화면은 최신값 재검토를 요구하고 프로필 관리 화면은 미저장 편집을 보존한 뒤 사용자가 확인한 경우에만 최신 프로필을 다시 불러온다.

## 읽기 범위와 검증 한계

가져오기는 visible disabled·readonly 값을 읽지만 숨김·inert·모호한 학력 그룹은 제외한다. 지원서 DOM·페이지 이동·저장·제출을 변경하지 않으며 외부 서버·분석·로그로 값을 보내지 않는다. 합성 Greeting fixture의 Chromium 흐름까지 검증했으며 실사이트 호환성, 현재 페이지 밖 정보의 완전성, 자동 기입 클릭률 개선은 입증하지 않았다.

## 구현 근거

- [제품 reader](https://github.com/woowacourse-teams/2026-career-form/blob/aa33c040f7f183a3fce454c89db4dc33f5bda415/frontend/src/profile/page-import/reader.ts)
- [선택 검토 UI](https://github.com/woowacourse-teams/2026-career-form/blob/aa33c040f7f183a3fce454c89db4dc33f5bda415/frontend/src/profile/page-import/PageImport.tsx)
- [선택 병합과 저장](https://github.com/woowacourse-teams/2026-career-form/blob/aa33c040f7f183a3fce454c89db4dc33f5bda415/frontend/src/profile/page-import/merge.ts)
- [공통 저장 큐](https://github.com/woowacourse-teams/2026-career-form/blob/aa33c040f7f183a3fce454c89db4dc33f5bda415/frontend/src/storage/profile-write-handler.ts)
- [프로필 관리 충돌 복구](https://github.com/woowacourse-teams/2026-career-form/blob/aa33c040f7f183a3fce454c89db4dc33f5bda415/frontend/src/profile/hooks/use-profile-editor.ts)
- [Chromium 흐름 검증](https://github.com/woowacourse-teams/2026-career-form/blob/aa33c040f7f183a3fce454c89db4dc33f5bda415/frontend/src/profile/page-import/PageImport.browser.test.tsx)
- [구현·검증 보고서](https://github.com/woowacourse-teams/2026-career-form/blob/aa33c040f7f183a3fce454c89db4dc33f5bda415/frontend/src/research/greeting-import-probe.md)
