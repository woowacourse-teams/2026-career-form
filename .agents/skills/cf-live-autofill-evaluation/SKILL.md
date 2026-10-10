---
name: cf-live-autofill-evaluation
description: 사용자가 외부 Chrome에 평가 대상 채용 페이지를 열고 "평가 시작해줘"처럼 실사이트 자동 입력 평가 실행을 요청할 때, 확장 프로그램의 비민감 입력과 실제 DOM 검증을 안전하게 수행한다. Console 로그 설명이나 코드 조사만 요청한 경우에는 사용하지 않는다.
---

# Live Autofill Evaluation

외부 Chrome에 사용자가 열어 둔 평가 탭에서 현재 실행의 비민감 자동 입력을 평가한다.
`평가 시작해줘`는 현재 실행과 당시 열린 평가 탭에 한해 쓰기를 승인한다.

## 시작 조건

다음 조건이 모두 충족될 때만 실행한다.

1. 사용자가 외부 Chrome에 평가 탭을 열었다.
2. 사용자가 `평가 시작해줘` 또는 같은 의미의 실행 요청을 했다.
3. 대상은 실제 제출로 이어지지 않는 평가 탭이다.

조건이 하나라도 충족되지 않으면 탭을 조작하지 않고 부족한 조건만 보고한다.
Console 설명, 기존 보고서 요약, 코드 조사 요청은 실행 요청이 아니다.

## 실패 페이지의 픽스처 수집

평가 실행 승인은 DOM 스냅샷 수집 승인이 아니다. 사람이 수집 대상과 최소 영역을
별도로 지정하고 요청했을 때만 [비식별 DOM 수집 정책](../../../harness/policies/dom-snapshot-fixtures.md)을
따른다. 실제 값과 구조 원문의 기록 금지는 그대로 유지한다.

수집은 첫 도구 응답·클립보드·파일 저장 전에 브라우저 안에서 비식별화하고,
사람이 검토한 공통 양식 텍스트만 보존하는 별도 절차다. 원본을 반환한 뒤
정제하거나 평가 Console·스크린샷·보고서를 수집 자료로 사용하지 않는다.
도구가 원본 DOM·Console·네트워크 등을 자동 기록하면 연결하지 않고 중단한다.

등록 전 [검토 양식](../../../harness/templates/dom-snapshot-review.md)으로 개인정보 제거와
구조 보존을 각각 확인한다. 수집 대상이 없거나 사람 검토·오프라인 재현이
미완료이면 샘플 수집 완료로 보고하지 않는다. 정제 픽스처의 구조와 검토된
텍스트는 테스트 자산에만 보관하며 이 평가의 보고서와 Wiki 기록 범위를
넓히지 않는다. `FIXTURE` 결과를 `LIVE_SITE` 성공률에 합산하지 않는다.

## 도구 준비

1. `computer-use` 스킬의 현재 버전 안내를 읽고 그 안내가 정한 외부 Chrome 조작 방법만 사용한다.
2. 가시적인 Chrome 창에서 열린 탭을 확인한다. 사이트 URL, 탭 제목, 계정, 세션, 지원서 값은 대화나 파일에 기록하지 않는다.
3. 확장 프로그램이 설치되어 있고 설치된 빌드의 제품 revision과 백엔드 준비 상태를 확인한다. 설치된 빌드에서 revision을 증명할 수 없으면 작업 디렉터리의 HEAD를 대신 기록하지 않고 `UNVERIFIED`로 표시한다.
4. 확장 프로그램 프로필이 비어 있으면 `frontend/fixtures/profile-export.example.json`을 기존 가져오기 UI로 불러온다. 프로필이 있으면 실제 값을 읽거나 출력하지 않고 그대로 사용한다. 가져오기는 프로필이 비어 있을 때만 수행한다.

### 설치본 revision 조회

평가 계약 `1.1`은 설치본의 background service worker 내부 컨텍스트에서
`globalThis.__careerFormBuildInfo()`를 조회한다. 이것은 실제 지원서 값이나 DOM을
읽는 Console 진단과 다르며 빌드 시 삽입된 비식별 메타데이터만 반환한다.
웹 페이지 컨텍스트에서 실행하지 않는다. 반환값은 `schema_version`, `revision`,
`source_state` 세 필드이며 로컬 HEAD, manifest version 또는 경로로 대체하지 않는다.

빌드 산출물의 `build-info.json`은 같은 메타데이터를 담지만 unpacked 파일을
재빌드로 덮어쓴 뒤 파일만 읽으면 아직 실행 중인 구버전과 혼동할 수 있다.
평가에는 현재 실행 컨텍스트의 snapshot을 사용한다. 새 빌드를 평가하려면 사람이
확장 프로그램을 재로드한 뒤 새 컨텍스트에서 조회한다.

근거는 다음 형태로 기록한다.

- `method`: `INSTALLED_BUILD_METADATA`
- `metadata`: 조회한 세 필드만 포함한 객체
- `metadata_sha256`: `JSON.stringify({schema_version, revision, source_state}) + "\n"`의
  UTF-8 SHA-256. 키 순서는 위와 같으며 ZIP 전체의 무결성 서명이 아니다.
- `unverified_reason`: CLEAN이면 `null`, DIRTY이면 `DIRTY_SOURCE`, UNKNOWN이면
  `UNKNOWN_SOURCE`

CLEAN이고 전체 commit SHA와 digest가 유효할 때만 `revision_status: VERIFIED`와
해당 revision을 기록한다. DIRTY/UNKNOWN은 revision과 상태 모두 `UNVERIFIED`로 둔다.
메타데이터가 없거나 잘못됐거나 조회할 수 없으면 원문을 보관하지 않고
`method: UNAVAILABLE`, `metadata: null`, `metadata_sha256: null`과 각각
`METADATA_MISSING`, `METADATA_INVALID`, `INSTALLATION_UNAVAILABLE` 사유를 남긴다.
fixture 코드 근거는 `FIXTURE_SOURCE_METADATA`로 구분하며 설치본 근거로 대신 쓰지 않는다.

## 실행 상태

평가마다 값 원문 없이 `EvaluationState`를 유지한다.

```text
PRECHECK -> PREGRADING -> READY_TO_WRITE -> DOM_VERIFY -> REPORTING -> REPORTED
```

환경, 확장 프로그램, 프로필, 페이지 구조가 평가를 진행할 수 없게 만들면 `BLOCKED`로 끝낸다.
탭에서 쓰기가 끝났다면 탭 ID만 `written_tab_ids`에 보관한다. 재개 시 해당 탭은 `RESUME`으로 `DOM_VERIFY`에 진입하며 다시 쓰지 않는다.

## 평가 에이전트 사전 판정

여기서 평가 에이전트는 이 스킬을 실행하는 에이전트다. 제품과 확장 프로그램이 API로 호출하는 AI가 아니며, 제품 AI의 분석 결과를 정답 기준으로 사용하지 않는다.

1. 확장 프로그램 UI를 열거나 분석을 실행하기 전에 평가 에이전트가 현재 페이지 전체의 입력 컨트롤을 독립적으로 조사한다.
2. 모든 필드를 익명 `field_id`와 함께 `AUTOFILLABLE`, `CONDITIONAL`, `PROFILE_VALUE_MISSING`, `FORBIDDEN`, `CREATED_AFTER_ACTION` 중 하나로 분류한다.
3. `AUTOFILLABLE`은 현재 선택한 프로필에 값이 있고, 현재 페이지에서 안전하게 입력할 수 있으며, 파일 첨부, 동의, 저장, 이동 또는 제출이 필요하지 않은 필드다.
4. 페이지별 전체 필드 수와 `AUTOFILLABLE` 수를 확장 프로그램 실행 전에 동결한다. 이후 확장 프로그램이 발견하거나 제안한 필드 수로 이 분모를 바꾸지 않는다.
5. 판정 기준 생성 주체는 `evaluation-agent`로 기록한다. 사람이 필드 판정을 검토하지 않았다면 사람 검토는 `미실시`로 기록한다.
6. 공개 회사와 플랫폼을 조합한 안정 `site_id`는 기록할 수 있다. 실제 필드 라벨, 값, 선택지, DOM 전문, CSS 선택자, URL, 공고 제목은 기록하지 않는다.

사전 판정이 없거나 `AUTOFILLABLE` 분모가 0이면 `READY_TO_WRITE`로 전환하지 않는다. 페이지 구조 때문에 전체 필드 조사가 불가능하면 해당 사이트를 `BLOCKED` 또는 `INCONCLUSIVE`로 보고한다.

## Console 진단

Console은 선택적인 현장 진단 수단이다. 문제 원인을 확인해야 할 때 개발자 도구 Console의 `[CareerForm]` 그룹에서 다음 단계의 구조적 상태를 확인한다.

1. 필드 수집
2. 필드 분석 응답
3. 리뷰 계획
4. 기입 실행
5. 검색 실행과 실패

Console에는 페이지와 프로필 값 원문, 요청과 응답 객체가 보일 수 있다. 이를 복사, 인용, 스크린샷, artifact 저장, Issue 기록, Wiki 기록, 대화 보고에 사용하지 않는다. Console 상태는 최종 채점 근거가 아니며, 최종 결과는 실제 DOM 재검증으로 결정한다. Console에서 JavaScript를 실행해 값을 읽거나 쓰지 않는다.

## 쓰기 결정

확장 프로그램의 리뷰 후보를 값 없이 `CandidateState`로 만들고 아래 계약을 적용한다.

| 후보 상태 | 처리 |
| --- | --- |
| `available` | `write_candidate_ids()`에 포함 |
| `needs-review` | `write_candidate_ids()`에 포함 |
| `conflict` | `write_candidate_ids()`에 포함 |
| `sensitive` | `DEFERRED` |
| `unavailable` | `DEFERRED` |

`conflict`는 회원가입 기본값, 서버 복원값, 이전 사용자 입력을 구분하지 않는다. 비민감 `conflict`는 현재 평가 실행에서 프로필 값으로 덮어쓴다. 이 규칙은 기존 사용자 입력도 바꿀 수 있으므로 평가 대상 탭과 현재 실행을 넘어 적용하지 않는다.

`current_run_approved=True`은 현재 실행을 요청한 사용자의 승인으로만 설정한다. `advance()`가 `READY_TO_WRITE`에서 `WRITE`를 허용한 경우에만 확장 프로그램의 최종 `기입하기`를 조작한다. 후보별 선택을 사용자에게 다시 묻지 않는다.

## 금지 동작

다음 동작은 어떤 상태에서도 실행하지 않는다.

- 민감정보 자동 승인 또는 자동 입력
- 파일 첨부와 파일 선택
- 개인정보 수집, 이용 동의 또는 법적 확인 선택
- 임시저장, 저장, 미리보기, 페이지 이동, 다음 단계, 제출
- 시크릿, 계정 정보, 브라우저 세션 정보 추출
- Console, DOM, 확장 프로그램에서 본 실제 값과 구조 원문의 영속 기록

## 실제 DOM 검증과 지표

`WRITE` 뒤 페이지가 안정화될 때까지 기다린 다음 실제 DOM에서 각 쓰기 대상의 값 유지 상태를 확인한다. 확장 프로그램 표시 결과와 실제 DOM 결과가 다르면 DOM 결과를 우선한다.

지표의 분모를 다음처럼 구분한다.

| 지표 | 계산 |
| --- | --- |
| 매핑 정확도 | 올바른 매핑 수 / 확장 프로그램 제안 수 |
| 매핑 재현율 | 올바른 매핑 수 / 사전 판정 `AUTOFILLABLE` 수 |
| 정답 입력률 | DOM에서 유지된 정답 입력 수 / 사전 판정 `AUTOFILLABLE` 수 |
| 실행 유지율 | DOM에서 유지된 정답 입력 수 / 올바르게 바인딩된 수 |
| 오입력률 | 오입력 수 / 쓰기 수 |

확장 프로그램이 5개를 제안해 4개가 맞아도 사전 판정 `AUTOFILLABLE`이 10개라면 매핑 정확도는 80%, 매핑 재현율은 40%다.

후보별 익명 `candidate_id`, `field_id`, 순차 stages, mapping/write 결과,
`terminal_result`와 `reason_code`, 기존 값 훼손 여부를 기록한다.
`SiteEvaluationResult.candidates`와 개수 요약을 함께 전달하면 `build_site_report()`가
관측에서 재계산한 개수와 요약의 일치를 검사한다. 원인 코드는
`harness/lib/generic_autofill_eval.py`의 `REASON_CODES`만 사용한다.
`FAILED`와 `DEFERRED`는 별도 원인 집계이며 후보 하나를 여러 원인에 중복 집계하지 않는다.
미발견 AUTOFILLABLE은 `undiscovered_autofillable_count`로 분리하고 원인을 추정하지 않는다.
INCONCLUSIVE는 범용 평가 run에 사유와 빈 candidates를 기록하며 실패 0건으로 보고하지 않는다.

## 보고서 영속화와 Wiki

CLI 또는 대화 표만 출력하고 평가를 끝내지 않는다. DOM 검증 뒤 `REPORTING`에서 비식별 보고서 초안을 만들고 다음 정보를 포함한다.

- 공개 안정 `site_id`
- 설치된 제품 revision과 검증 상태, 평가 계약 version, 프로필 mode와 profile version
- 이전 비교 기준선 revision과 그 이후 변경 요약, 비교 조건이 다르면 비교 불가 사유
- 전체 필드 수, 분류별 수, 동결된 `AUTOFILLABLE` 분모
- 평가 탭별 초기 기존 값 유무, 발견, 매핑, 바인딩, 쓰기, 유지, 보류, 실패 개수
- 매핑 정확도, 매핑 재현율, 정답 입력률, 실행 유지율, 오입력률
- 비식별 기존 값 덮어쓰기 결과 개수
- 정답 기준 생성 주체와 사람 검토 여부
- 중단, 차단, 재개 상태와 비식별 사유
- FAILED/DEFERRED 각각의 원인별 개수, 익명 관측 근거와 미발견 AUTOFILLABLE 수
- 설치본 revision의 확인 방법, 메타데이터 digest와 미확인 사유

실제 값, 필드 라벨, 선택지, URL, 공고 제목, 계정, 세션, DOM 원문, CSS 선택자, Console 원문과 스크린샷은 보고서와 Wiki에 기록하지 않는다.

현재 작업 Issue의 지식 후보에 보고서와 재사용 가능한 계약 변경을 모은다. 사용자에게 후보 전체와 approval digest를 제시하고 명시적으로 승인받은 뒤에만 해당 Issue의 불변 raw 보고서, ADR과 관련 topic Wiki를 갱신한다. 승인이 없으면 보고서 초안 상태를 알리고 `REPORTING`에서 멈춘다. raw가 병합된 Issue라면 수정하지 않고 새 평가 Issue의 raw에 기록한다.

보고서 파일과 topic Wiki 구조 검증이 통과한 뒤 `REPORT_RECORDED`로 `REPORTED`에 전환한다.

프로필 mode 또는 분모가 다른 실행 결과를 같은 전후 비교로 합치지 않는다.
CLI 비교의 수치 차이는 관측 차이이며, 미검증 revision·같은 revision 재실행·미확정
사이트가 있으면 `revision_comparison`의 `HELD`와 사유를 보고한다. 이를 특정 코드
변경의 개선·회귀로 판정하지 않는다. 계약 1.0 자료를 1.1과 직접 비교하거나 근거 없이
과거 원인과 설치 revision을 보충하지 않는다.
