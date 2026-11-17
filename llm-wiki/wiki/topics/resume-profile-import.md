# 이력서 글자 프로필 초안 API

> Topic: resume-profile-import
> Status: Current
> Current: [CF-469 이력서 글자 프로필 초안 API](../../raw/issues/CF-469/documents/resume-profile-import.md)
> History: [CF-469 이력서 글자 프로필 초안 API](../../raw/issues/CF-469/documents/resume-profile-import.md)
> Updated: 2026-11-17

## 현재 상태

`POST /api/v1/profile-import/resume`는 이력서 글자(`{text}`, 앞뒤 공백을 뺀 20000자 이하)를 받아 프로필 모델 모양의 초안 `{schemaVersion: 1, profile: 13개 범주}`를 돌려준다. 반복 범주는 `{sectionId, values}` 배열이고 항목 `id`는 FE가 만든다. 오류는 `RESUME_TEXT_EMPTY`(400), `INVALID_INPUT`(400), `RESUME_TEXT_TOO_LONG`(413, `maxLength` 20000), `RATE_LIMITED`(429), `PROFILE_IMPORT_UNAVAILABLE`(502), `PROFILE_IMPORT_NOT_CONFIGURED`(503)다.

모델 응답에서 프로필 모델 밖 키는 버리고(`droppedKeys`), 형식이 틀리거나 원문에서 찾을 수 없는 값은 버린다(`droppedValues`). 날짜는 원문에 연월일이 있으면 `YYYY-MM-DD`, 연월만 있으면 `YYYY-MM`이고 연도만 있으면 비운다. 서버는 일이나 월을 만들지 않으며, 날짜 근거는 연도와 월이 원문에서 한 날짜 표기(연-월 또는 월-연, 구분자 `.` `-` `/` 또는 `년`)로 붙어 있어야 한다. 앞뒤에 다른 숫자가 붙은 수는 근거로 보지 않는다. 최종학력과 증빙 서류 위치는 가져오지 않는다.

값 트레이스(`career-form.profile-import.trace-values`)는 기본 끔이다. `application-local.yml`과 `application-staging.yml`에서만 켜고 `prod` 프로필에서는 코드가 강제로 끈다. 애플리케이션 로그와 DB에는 어떤 환경에서도 원문과 추출 값을 남기지 않는다.

## 변경 이유

처음 쓰는 사용자가 갖고 있는 이력서 문서로 프로필을 채우게 하려고 서버 LLM 변환을 더했다(2026-11-17 사용자 결정). 연월만 쓴 날짜를 버리지 않고 `YYYY-MM`으로 남기는 규칙과, 로컬·스테이징에서만 값 트레이스를 켜는 규칙도 같은 날 사용자 결정이다.

## 관련 지식

- [프로필 필드](profile-fields.md)
- [지원서 분석 API](application-form-analysis-api.md)
