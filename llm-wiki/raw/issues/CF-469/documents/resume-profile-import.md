# 이력서 글자 프로필 초안 API

> Issue: [CF-469](https://github.com/woowacourse-teams/2026-career-form/issues/469)
> Collected: 2026-11-17
> Approval-Digest: 4e0c1ca17fa53e0b15073a5e1d795bcbb356e7747a5df457e365af943975e3e3
> Source-Revision: 76961167

확장이 이력서 문서(PDF, MD, TXT)에서 뽑은 글자를 서버로 보내 프로필 초안을 받는 API다. [승인 후보 스냅샷](approved-candidates.md)의 후보 1~3을 주제별로 옮겼다. 파일 업로드, PDF 글자 추출, 카탈로그 맞추기는 FE 범위(#470)다.

## 계약

- `POST /api/v1/profile-import/resume`, 본문은 `{text}`다. 앞뒤 공백을 뺀 길이로 판단하고 상한은 20000자다.
- 응답은 `{schemaVersion: 1, profile: 13개 범주}`다. 단일 범주는 값 객체, 반복 범주는 `{sectionId, values}` 배열이고 항목 `id`는 FE가 만든다.
- 오류는 `RESUME_TEXT_EMPTY`(400), `INVALID_INPUT`(400), `RESUME_TEXT_TOO_LONG`(413, `maxLength` 20000), `RATE_LIMITED`(429), `PROFILE_IMPORT_UNAVAILABLE`(502), `PROFILE_IMPORT_NOT_CONFIGURED`(503)다.

## 검증 규칙

- 프로필 모델 밖 키는 버리고 `droppedKeys`로 센다. 형식이 틀리거나 원문에서 찾을 수 없는 값은 버리고 `droppedValues`로 센다.
- 날짜는 원문에 연월일이 있으면 `YYYY-MM-DD`, 연월만 있으면 `YYYY-MM`으로 받고 연도만 있으면 비운다. 서버는 일이나 월을 만들지 않는다.
- 날짜 근거는 연도와 월이 원문에서 한 날짜 표기(연-월 또는 월-연, 구분자 `.` `-` `/` 또는 `년`)로 붙어 있어야 한다. 앞뒤에 다른 숫자가 붙은 수는 근거로 보지 않는다.
- 최종학력(`latestEducationType`)과 증빙 서류 위치(`evidenceDocumentPath`)는 가져오지 않는다.

## 값 트레이스와 기록 경계

- `career-form.profile-import.trace-values`는 기본 끔이다. `application-local.yml`과 `application-staging.yml`에서만 켜고, `prod` 프로필에서는 코드가 강제로 끈다.
- 켜지면 LangSmith run에 입력 글자와 추출 값이 더해진다. 그 환경에서는 합성 이력서만 쓴다.
- 애플리케이션 로그와 DB에는 어떤 환경에서도 원문과 추출 값을 남기지 않는다. 요청마다 남는 로그와 트레이스의 기본 내용은 비식별 구조 값(입력 글자 수, 범주별 건수, 버린 키·값 수, 모델, 소요 시간, 결과 코드)이다.
