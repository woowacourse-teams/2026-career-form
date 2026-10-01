# 로컬 프로필 JSON 전송 계약

> Source: [Issue #76](https://github.com/woowacourse-teams/2026-career-form/issues/76) 확정 범위
> Collected: 2026-09-07
> Published: 2026-09-07

## 상태

승인됨

## 관련 Issue

- #76

## 결정

프로필 내보내기는 현재 로컬 프로필만 `schemaVersion: 1`과 전체 `Profile`을 담은 JSON envelope으로 생성한다. 레이아웃 설정, 서버 요청, 계정·세션 데이터는 포함하지 않는다.

가져오기는 JSON 문법, 지원하는 schema version, 모든 profile 범주, 문자열 field value와 반복 항목 식별자를 검증한다. 유효한 파일도 “현재 프로필 전체를 덮어씁니다”라는 확인을 받은 뒤에만 저장한다. 기존 편집의 지연 저장은 취소하고 가져온 profile 저장을 직렬화하여, 이전 값이 복원 결과를 덮어쓰지 못하게 한다.

## 사용자 보호 경계

- 전송은 옵션 화면의 명시적 내보내기·가져오기 동작으로만 시작한다.
- 형식 오류나 확인 취소는 현재 화면과 Chrome local storage 값을 변경하지 않는다.
- 내보낸 파일은 개인정보나 민감 범주를 포함할 수 있으므로 사용자만 보관·삭제를 판단한다.
- 예시 fixture에는 실제 지원 정보와 민감 범주 값을 넣지 않는다.

## 제외 범위

서버 동기화, 계정·클라우드 백업, JSON 병합, 범주별 선택 복원, 과거 schema migration, 자동 입력과 지원서 저장·제출은 이 계약에 포함하지 않는다.
