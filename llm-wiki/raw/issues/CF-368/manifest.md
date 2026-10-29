# CF-368 Knowledge Bundle

> Issue: CF-368
> Collected: 2026-10-29
> Approval-Digest: 0ca1b67136be3ae037b664c3398b75b7d43ff56854e386b64df2836d2e9144a5
> Approval-Response: 승인할게 (워크플로 하네스가 사용자 원문을 그대로 전달)
> Approval-Date: 2026-10-29
> Source-Revision: bd1f21a776d4de1461717ac108125248f994711c

승인 digest는 사람이 위 응답으로 승인한 worktree 체크포인트의 후보 열한 개 목록을 순서대로 담은 JSON 배열(UTF-8, 비ASCII 문자 그대로, 구분자 `,`·`:`, 공백 없음)의 SHA-256이다. [후보 스냅샷](documents/approved-candidates.md)의 번호 목록 본문을 순서대로 배열에 넣으면 같은 digest가 나온다. 스냅샷은 승인을 요청한 후보 문구를 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다.

여섯 payload의 후보 배치는 다음과 같다. Greeting 어댑터는 후보 1·2·3·4, 어댑터 필드 현황은 후보 1·3·4, 확장 패널 UI는 후보 5·6·7, 프로필 카탈로그는 후보 3·8·10, 프로필 필드는 후보 9, 프론트 정적 검사는 후보 11을 담는다. 각 payload는 같은 topic의 앞선 근거를 대체하되, 바꾸지 않은 내용은 Supersedes가 가리키는 문서를 따른다. 실제 지원값·계정·세션·요청 본문·시크릿·서버 주소는 포함하지 않는다. 실사이트 측정은 테스트 계정과 합성 프로필로 했다.

## adapter-greeting

> Payload: [Greeting 동명 고교 지역 동점 해소, 재실행 검증, 한국폴리텍 대학 번호 표기 대조와 카카오게임즈 실측](documents/greeting-school-name-tie-break-and-numbered-college.md)
> Supersedes: [CF-346 Greeting 검색의 직접 입력 선택지와 검색 실패 사유 코드](../CF-346/documents/greeting-direct-input-and-search-failure-codes.md)

## adapter-field-inventory

> Payload: [Greeting 고교·대학 학교명 확정 범위와 카카오게임즈 실측](documents/greeting-school-name-field-inventory.md)
> Supersedes: [CF-346 Greeting v19 직접 입력 지원 범위와 카카오게임즈 기존 미해결 항목](../CF-346/documents/greeting-v19-field-inventory.md)

## extension-ui

> Payload: [사이드 패널의 선택형 값 라벨 표시, 반복 항목 구분, 패널 열기 단축키](documents/side-panel-labels-entries-and-shortcut.md)
> Supersedes: [CF-82 확장 프로그램 프로필·지원서 패널 UI](../CF-82/documents/extension/extension-ui.md)

## profile-catalog-identity

> Payload: [카탈로그 자격증 발급기관 채움, TOEIC Speaking 추가, 한국폴리텍 대학 번호 표기 대조](documents/profile-catalog-issuer-toeic-speaking-and-numbering.md)
> Supersedes: [CF-162 프로필 카탈로그 선택과 식별 연결](../CF-162/documents/profile-catalog-identity.md)

## profile-fields

> Payload: [자격증 등록번호 표시 라벨](documents/certificate-registration-number-label.md)
> Supersedes: [CF-41 프로필 필드](../CF-41/documents/docs/PROFILE_FIELDS.md)

## frontend-static-checks

> Payload: [프론트 lint의 TS 소스 제외와 typecheck 미실행 관찰](documents/frontend-lint-and-typecheck-gaps.md)
> Supersedes: None
