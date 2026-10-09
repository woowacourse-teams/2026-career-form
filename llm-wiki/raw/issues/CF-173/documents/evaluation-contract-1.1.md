# 범용 평가 계약 1.1과 설치본 근거

근거: [Issue #173](https://github.com/woowacourse-teams/2026-career-form/issues/173), 구현 revision 094e3b43522fa2ec464fb841ba53b8c7b2c9be8c.

Approval-Digest: 13f6d39b24eeee80a26b35b202c456ab067910ad145274757c03802220f336f9

## 유지하는 평가 경계

사용자가 평가 탭을 준비하고 현재 실행을 승인한 경우에만 비민감 입력을 평가한다. 평가 에이전트는 제품 AI와 독립적으로 전체 필드를 AUTOFILLABLE, CONDITIONAL, PROFILE_VALUE_MISSING, FORBIDDEN, CREATED_AFTER_ACTION으로 사전 분류하고 AUTOFILLABLE 분모를 동결한다. 발견된 후보만으로 분모를 줄이지 않는다.

실사이트 LIVE_SITE와 FIXTURE는 별도 집계한다. 매핑 정확도는 제안 수, 매핑 재현율과 정답 입력률은 동결한 전체 AUTOFILLABLE 수, 실행 유지율은 올바른 바인딩 수, 오입력률은 실제 쓰기 수를 분모로 삼는 기존 계산식을 유지한다.

현재 평가 탭의 비민감 기존 값 덮어쓰기 허용, 민감값과 입력 불가 항목의 보류, DOM 재검증 및 승인 후 보고서 영속화는 CF-124의 실행 경계를 유지한다. 저장, 페이지 이동, 미리보기와 제출은 수행하지 않는다. 실제 값, 필드 라벨, 선택지, URL, 개인 경로, 계정·세션, DOM·Console 원문, 스크린샷과 시크릿은 보관하지 않는다.

## 원인 집계

후보의 단일 terminal_result와 reason_code를 사용해 FAILED와 DEFERRED를 각각 집계한다. 정의된 원인 코드의 0건도 출력한다. 원인 코드로 종결 상태를 재추론하지 않으며 각 원인별 합은 해당 stage_counts와 일치한다. 성공 후보는 실패 근거에서 제외한다.

사이트별 및 source별 overall에 reason_counts를 출력한다. reason_evidence는 정렬한 site_id, candidate_id, field_id, terminal_result, reason_code만 포함한다. 후보 및 관측 field ID 중복은 거부한다.

관측되지 않은 AUTOFILLABLE은 undiscovered_autofillable_count로 별도 표시하고 원인을 추측하지 않는다. MEASURED에 후보가 없으면 전체 AUTOFILLABLE이 미발견이다. INCONCLUSIVE는 집계 null과 실행 사유로 남기며 성공 또는 실패 0건으로 취급하지 않는다. source 전체는 측정한 사이트만 집계한다.

실사이트 SiteEvaluationResult는 익명 후보 관측을 개수 요약과 함께 받는다. build_site_report는 발견, 제안, 올바른 매핑·바인딩, 쓰기·유지, 보류·실패·오입력 개수를 재계산해 불일치를 거부하고 CLI와 같은 원인 집계 함수를 사용한다.

## 설치 revision 근거

WXT 개발·production·ZIP은 같은 생성기로 build-info.json을 생성한다. 스키마는 schema_version 1.0, 전체 commit SHA 또는 null인 revision, CLEAN/DIRTY/UNKNOWN인 source_state다. 빌드 입력인 frontend 변경과 미추적 소스를 반영하되 생성 산출물과 ignore된 의존성은 제외한다. Git 부재 또는 판정 실패는 UNKNOWN이다.

실행 중인 background service worker의 globalThis.__careerFormBuildInfo()는 빌드 시 삽입한 불변 snapshot을 반환한다. 새 파일로 덮어쓴 unpacked 디렉터리를 직접 fetch하지 않으므로 재로드 전에는 기존 빌드, 재로드 후에는 새 빌드의 snapshot을 식별한다. 새 권한, 웹 공개 리소스, 외부 메시지 API와 네트워크 전송을 추가하지 않는다.

LIVE_SITE의 확인 방법은 INSTALLED_BUILD_METADATA, FIXTURE는 FIXTURE_SOURCE_METADATA다. metadata_sha256은 schema_version, revision, source_state 키 순서의 공백 없는 JSON과 마지막 개행을 UTF-8로 직렬화한 SHA-256이다. 메타데이터 식별자이며 ZIP 서명이나 악의적 변조 방지 증명이 아니다.

CLEAN metadata, 전체 SHA와 digest 및 확인 방법이 일치해야 VERIFIED다. DIRTY/UNKNOWN은 revision과 revision_status를 UNVERIFIED로 기록하고 DIRTY_SOURCE/UNKNOWN_SOURCE를 남긴다. 조회 불가·누락·잘못된 metadata는 원문을 저장하지 않고 UNAVAILABLE 방법, null metadata/digest와 INSTALLATION_UNAVAILABLE/METADATA_MISSING/METADATA_INVALID를 남긴다. 저장소 HEAD, 버전 문자열과 폴더 이름은 설치본 확인 근거를 대신하지 않는다.

결정의 대안과 결과는 [설치본 내장 revision 메타데이터와 평가 근거 ADR](adr/173-installed-build-revision-evidence.md)에 기록한다.

## 비교와 과거 자료

새 입력과 출력은 평가 계약 1.1이다. 기존 v1 JSON과 병합된 raw는 변경하지 않는다. 현재 CLI는 계약 1.0 입력과 서로 다른 계약 version의 비교를 명시적으로 거부하며 과거 자료를 추정으로 보충하지 않는다.

계약·프로필·site 집합이 맞으면 관측 수치의 분자·분모·비율 차이는 보존한다. 비교 사이트 중 미검증 revision, 같은 revision 재실행 또는 INCONCLUSIVE가 있으면 revision_comparison은 HELD와 사유를 출력하고 제품 revision 기반 regressions를 확정하지 않는다. 모두 측정됐고 서로 다른 VERIFIED revision인 경우 COMPARABLE로 표시한다. 이는 코드 변경 효과의 인과관계 증명은 아니다.

## 기준선과 검증 범위

CF-115 최초 기준선과 CF-124 실사이트 결과는 당시 계약 1.0의 이력으로 보존한다. 이전 근거 링크는 manifest의 Supersedes와 topic의 History에서 찾는다. CF-173은 새 실사이트 입력 평가가 아니라 집계와 설치본 식별 계약의 구현이다. alpha/beta fixture와 예제 SHA는 합성 테스트용이며 실제 사이트 측정으로 해석하지 않는다.

단위·CLI 검증, production/ZIP 메타데이터 대조와 격리 Chromium의 설치본 조회 및 서로 다른 revision의 재로드 전후 snapshot을 확인했다. 실제 지원서 입력·저장·제출이나 새 품질 기준선은 이 검증에서 측정하지 않았다.
