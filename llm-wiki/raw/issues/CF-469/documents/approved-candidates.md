# CF-469 승인 후보 스냅샷

> Issue: [CF-469](https://github.com/woowacourse-teams/2026-career-form/issues/469)
> Collected: 2026-11-17
> Approval-Digest: 4e0c1ca17fa53e0b15073a5e1d795bcbb356e7747a5df457e365af943975e3e3

worktree 체크포인트에 기록한 후보 세 개의 원문이다. 사람이 2026-11-17 "승인"으로 확정했다.

1. 이력서 초안 API 계약: POST /api/v1/profile-import/resume, 본문 {text}, 응답 {schemaVersion:1, profile:13개 범주}, 반복 범주는 {sectionId, values} 배열이고 id는 FE가 만든다. 오류는 RESUME_TEXT_EMPTY(400), INVALID_INPUT(400), RESUME_TEXT_TOO_LONG(413, maxLength 20000), RATE_LIMITED(429), PROFILE_IMPORT_UNAVAILABLE(502), PROFILE_IMPORT_NOT_CONFIGURED(503)
2. 이력서 초안 검증 규칙: 프로필 모델 밖 키는 버리고(droppedKeys), 형식이 틀리거나 원문에서 찾을 수 없는 값은 버린다(droppedValues). 날짜는 원문에 연월일이 있으면 YYYY-MM-DD, 연월만 있으면 YYYY-MM으로 받고 연도만 있으면 비운다. 서버는 일이나 월을 만들지 않는다. 날짜 근거는 연도와 월이 원문에서 한 날짜 표기(연-월 또는 월-연, 구분자 . - / 또는 년)로 붙어 있어야 하고, 앞뒤에 다른 숫자가 붙은 수는 근거로 보지 않는다. 최종학력과 증빙 서류 위치는 가져오지 않는다
3. 이력서 초안 값 트레이스: career-form.profile-import.trace-values는 기본 끔, application-local.yml과 application-staging.yml에서만 켜고 prod 프로필에서는 코드가 강제로 끈다. 애플리케이션 로그와 DB에는 어떤 환경에서도 원문과 추출 값을 남기지 않는다
