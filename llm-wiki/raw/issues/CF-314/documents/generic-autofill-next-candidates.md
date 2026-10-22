# Issue #314 다음 자동 기입 수정 후보 (실사이트 + 오프라인)

- 작성일: 2026-10-22
- 기준 revision: `bf66253f85182b607d91503716f577bf74952147` (CF-314 HEAD = `origin/develop`, 설치 빌드 `CLEAN`)
- 입력: `live/task-15/eval/report.json`, `live/task-15/eval/summary.md`, `live/task-15/eval/pregrade-final.raw`, `live/task-15/eval/dom-verification.json`, `live/task-15/eval/naver-verify.raw`, `live/task-15/eval/woowahan-verify.raw`, `task-14-baseline.txt`, `fixture/task-14-summary.md`, `task-16-candidates.md`, 그리고 2026-10-22 오케스트레이터 정정과 같은 탭의 재조회
- 이 문서는 후보 정리만 한다. Issue #314 브랜치에는 제품 코드 수정이 없다. `report.json`도 수정하지 않았다.

## 0. 근거의 한계와 정정 (먼저 읽기)

이번 실사이트 보고서에는 **측정값과 보고서 작성 시 가정한 값, 그리고 기입 시점 값과 재조회 후 값이 섞여 있다**. 후보 순위는 재조회로 확인한 사용자 가시 결과를 우선한다.

### 0.1 NAVER 18 changed 정정

- `report.json`의 NAVER `dom_fields_changed_total=18`은 **기입 시점에 센 값**이다. 숨은 칸을 포함하고, 이후 재렌더/재조회에서 살아남지 않은 값을 포함한다. **사용자에게 보이는 기입 성공으로 읽으면 안 된다.**
- 같은 탭을 기입 후 다시 읽은 결과(2026-10-22, read-only):
  - 전체 컨트롤 132개(숨은 `input[type=hidden]` 포함), 가시 48개, 숨김 84개.
  - 값이 있는 가시 칸 **6/48** (SELECT 5, TEXT 1).
  - 값이 있는 숨은 칸 **11개** (hidden input 9, TEXT 1, SELECT 1).
- 사용자가 직접 `기입하기`를 눌렀을 때 실제로 채워진 것으로 보인 칸은 약 2개(학력 고교명·소재지에 해당하는 칸)였다.
- 따라서 **naver-careers의 `correct_input_rate` 18/22는 상한**이다. 성공 지표로 쓰지 않고, **"기입 1회 후 재조회에서 값이 있는 가시 칸 수"**를 재현 가능한 관찰값으로 쓴다. 이번 기준값은 **6/48**이다.
- 같은 이유로 전체 `correct_input_rate` 18/57(31.6%)도 상한이다.
- 이 정정은 `report.json`을 바꾸지 않고 이 문서와 후속 Issue에만 기록한다.

### 0.2 보고서 가정값

- `WRITE_FAILED` 14건 + `RETENTION_FAILED` 2건 분할과 후보-필드 대응은 `eval/build-report.py:63-86,108-111`이 필드 순번으로 만든 값이다. 실사이트에서 필드별 종료 코드를 수집한 값이 아니다.
- NAVER의 `existing_value_changed` 2건도 `build-report.py:92`가 17·18번째 후보로 가정했다. 기입 시점 DOM에서 기존 값 2개가 바뀐 것은 측정됐지만, 재조회 후 어느 칸이 살아남았는지는 확정되지 않았다.
- 결과 태그 합계는 17건(`실패` 15 + `완료` 2)인데 기입 시도는 16건이다. 태그는 보조 근거로만 사용했다.
- 정답 작성자는 `evaluation-agent`이고 `human_reviewed=false`다.
- 평가 중 `naver-map.raw`는 페이지 이동으로 실패했다. NAVER의 후보-필드 행 단위 대응은 부분적이다.
- 개인정보 규칙상 값 원문, 라벨, URL, DOM 원문은 저장하지 않았다. 페이지 내부 프레임워크의 정확한 동작은 코드 경로와 재현 픽스처로 확정해야 한다.

## 1. 실사이트 수치 (계약 1.1 + 재조회)

| metric | naver-careers | woowahan-recruitment | overall |
| --- | --- | --- | --- |
| 매핑 정확도 | 19/19 = 100.0% | 16/16 = 100.0% | 35/35 = 100.0% |
| 매핑 재현율 | 19/22 = 86.4% | 16/35 = 45.7% | 35/57 = 61.4% |
| 정답 입력률 (보고값, **상한**) | 18/22 = 81.8% | 0/35 = 0.0% | 18/57 = 31.6% |
| 실행 유지율 (기입 시점) | 18/19 = 94.7% | 0/16 = 0.0% | 18/35 = 51.4% |
| 오입력률 (기입 시점, 값 원문 미확인) | 0/19 = 0.0% | 0/2 = 0.0% | 0/21 = 0.0% |
| 미탐색 AUTOFILLABLE | 3 | 19 | 22 |
| 기입 시점 DOM 변경 | 18 | 0 | 18 |
| **재조회 가시 칸 값 있음** | **6/48** | 0(변경 0/16) | 6/48 + 0 |
| **재조회 숨은 칸 값 있음** | **11/84** | 0 | 11/84 |
| 입력 불가(지연) | 9 | 24 | 33 |

- NAVER: 기입 시점 18 변경은 재조회에서 6개의 가시 칸만 남았다. 숨은 칸 11개가 값을 갖고 있고, 그중 7개는 가시 컨트롤과 같은 행/필드 컨테이너 안에 있다. 사용자 육안 확인은 약 2칸이었다.
- woowahan-recruitment: 기입 1회, 16개 시도, DOM 변경 0/16, 실행 유지 0/16, 정답 입력 0/35, 결과 태그 `완료` 2인데 해당 칸도 빈 값.
- 두 사이트의 공통 실패는 **가시 칸에 쓴 값이 프레임워크 재렌더 후 남지 않는 것**이다. NAVER는 일부 값이 살아남아 6/48로 보이고, woowahan-recruitment는 0/16이다.

## 2. 오프라인 기준 수치

측정: 4개 스냅샷, 23 passed / 1 failed(LG), 실행 119.5초. reviewed 11/13 정답, 0 오답, 2 보류. unreviewed 16/19 정답, 1 오답, 2 보류. 전 스냅샷 `unscored=0`, `preservedViolated=0`.

| snapshot | registered | exercisable | correct | wrong | held |
| --- | ---: | ---: | ---: | ---: | ---: |
| ahnlab-write-resume-form | 38 | 5 | 3 | 0 | 2 |
| naver-step2-form | 46 | 8 | 8 | 0 | 0 |
| kakao-greeting-email | 53 | 12 | 10 | 0 | 2 |
| lg-ai-research-birth-split-email | 10 | 7 | 6 | 1 | 0 |

오프라인에는 프레임워크 재렌더를 모델링한 스냅샷이 없다. `write-accuracy.runner.test.ts:87-100`의 input 리버트 테스트 1개가 유일한 유사 재현이다.

## 3. 순위 후보

| rank | failure class | 근거 규모 | 필요성 | 승격 |
| ---: | --- | --- | --- | --- |
| 1 | 프레임워크 재렌더가 가시 칸 값을 되돌림 | NAVER 가시 6/48, woowahan 0/16 | 입증 | #318 |
| 2 | 숨은 중복 칸에 기입하고 가시 칸은 빈 채로 둠 | NAVER 숨은 11, 가시 6 | 구조 증거 입증, 정확한 중복 매핑 일부 미확정 | #320 |
| 3 | 매핑 미탐색(재현율) | 22칸(19 + 3) | 격차 입증, 원인 경계만 확정 | #319 |
| 4 | LG 분할 이메일 성공-오답 | 1칸(오프라인) | 픽스처 한정 입증 | 미승격 |
| 5 | NAVER 기존 값 2칸 변경 | 2칸(기입 시점) | 미입증 | 미승격 |
| 6 | 입력 불가 33건 | 9 + 24 | 미입증(민감·미지원 혼재) | 미승격 |

### 1) 프레임워크 재렌더가 가시 칸 값을 되돌림 — 양 사이트 공통 최우선

- **failure class:** WRITE_RETENTION / 가시 값 미유지
- **live evidence:**
  - NAVER: 기입 시점 18 변경 → 재조회 가시 6/48(5 SELECT + 1 TEXT). `correct_input_rate` 18/22는 상한이며 사용자 육안 확인은 약 2칸.
  - woowahan-recruitment: 16개 시도, DOM 변경 0/16, 유지 0/16, 정답 입력 0/35, 결과 `완료` 2건도 빈 값.
  - 두 사이트 모두 기입 버튼 1회, 같은 빌드 `bf66253...`.
- **offline evidence:** 기존 4개 스냅샷은 이 동작을 재현하지 못했다(23 passed / 1 failed LG, `preservedViolated=0`). `write-accuracy.runner.test.ts:87-100`만 input 값을 되돌리는 리스너를 모델링한다.
- **cause location:**
  - `frontend/src/autofill/write/native-executor.ts:51-53` — `input`/`change` `Event`만 전송
  - `frontend/src/autofill/write/native-executor.ts:56-70` — 프로토타입 setter로 값 설정
  - `frontend/src/autofill/write/native-executor.ts:519-528` — 텍스트 설정 직후 `written`
  - `frontend/src/autofill/write/native-executor.ts:552-558` — select 설정 직후 `written`
  - `frontend/src/autofill/write/native-executor.ts:575-578` — radio/checkbox 설정 직후 `written`
  - `frontend/src/autofill/write/executor.ts:86-117` — 정착 후 같은 요소 참조로 유지 확인
  - `frontend/src/autofill/write/executor.ts:571-573` — generic 결과의 최종 판정
- **판정:** 네이티브 setter가 DOM 값만 바꾸고 프레임워크의 상태(모델)에는 값이 반영되지 않아, 재렌더가 이전 상태로 되돌리는 것으로 본다. 코드는 `input`/`change` 이벤트만 보내고, 프레임워크가 실제로 상태를 갱신했는지는 확인하지 않는다.
- **재현 픽스처:** 기존 `write-accuracy.runner.test.ts:87-100`은 input 1개만 모델링한다. **추가 필요:** 네이티브 setter + `input`/`change` 후 프레임워크가 상태를 다시 렌더링해 값을 되돌리는 비식별 합성 스냅샷(텍스트·native select·radio 포함)과 write-accuracy truth.
- **expected effect:** 재조회 가시 칸 값 있음 기준으로 NAVER 6/48에서 매핑된 가시 대상이 유지되는 수준까지, woowahan 0/16 → 16/16. 기입 시점 18/22나 18/19를 성공 지표로 쓰지 않는다. 상한은 NAVER 19/48(매핑 19개가 모두 가시이고 유지될 때), 전체 가시 유지 상한은 그에 해당하는 수치다.
- **필요성 입증:** **예.** 두 사이트에서 가시 값 미유지가 재조회로 확인됐다. 프레임워크별 정확한 메커니즘은 재현 픽스처로 확정한다.
- **승격:** #318

### 2) 숨은 중복 칸에 기입하고 가시 칸은 빈 채로 둠 — NAVER

- **failure class:** HIDDEN_DUPLICATE_WRITE / 가시 대상 오선택
- **live evidence:**
  - 재조회: 전체 132 컨트롤 중 가시 48, 숨김 84. 값이 있는 칸은 가시 6, 숨김 11(hidden input 9 + TEXT 1 + SELECT 1).
  - 숨은 값 보유 칸 11개 중 7개가 가시 컨트롤과 같은 행/필드 컨테이너 안에 있다. 9개는 `name`, 4개는 `id`가 있고, 정확히 같은 `name/id/type`을 가진 가시 칸과 겹치는 것은 1개다(나머지는 중복 행/상태 칸으로 보이나 정확한 대응은 미확정).
  - 사용자가 직접 기입했을 때 보인 것은 약 2칸이고, 기입 시점 18 변경에는 숨은 칸이 포함됐다.
- **offline evidence:** 기존 `naver-education-stage` 스냅샷(사람 검토 승인 2026-10-22)과 `generic/structure-loop.stage-visibility.test.ts:257-280`이 숨은/가시 학력 단계 그룹을 모델링한다. 다만 **쓰기 경로**가 가시 칸을 고르는지 단언하는 케이스는 없다.
- **cause location:**
  - `frontend/src/autofill/dom/collect.ts:169-174` — 그룹 후보는 소유 컨트롤 중 하나라도 가시면 가시로 판정(`isFieldCandidateHidden`이 `every(isHidden)`)
  - `frontend/src/autofill/dom/collect.ts:230-232` — 개별 가시성 판정
  - `frontend/src/autofill/write/native-executor.ts:499-500` — `SET_TEXT`가 `handle.elements[0]`을 씀
  - `frontend/src/autofill/write/native-executor.ts:531-533` — `SELECT_OPTION`이 `handle.elements[0]`을 씀
  - `frontend/src/autofill/write/native-executor.ts:560-561` — radio/checkbox가 그룹에서 옵션을 고름
  - `frontend/src/autofill/review/review-plan.ts:1349-1352` — lookup이 `blocked/hidden`일 때만 `hiddenFromReview`를 세움(그룹 일부 가시면 숨은 중복은 남음)
  - `frontend/src/autofill/dom/candidate-registry.ts:15-36` — lookup된 요소 기준으로 hidden을 판정
- **재현 픽스처:** `frontend/fixtures/dom-snapshots/naver-education-stage/sanitized.html`(사람 검토 승인)과 `frontend/src/autofill/generic/structure-loop.stage-visibility.test.ts:257-280`이 기반이다. **추가 필요:** 같은 행에 가시 칸과 숨은 중복 칸이 있을 때 가시 칸에 쓰고 숨은 칸은 건드리지 않으며, 숨은 칸만 값이 있는 상태를 성공으로 세지 않는 write-accuracy 케이스.
- **expected effect:** 숨은 칸에만 값이 있는 11개를 성공에서 제외하고, 같은 행의 가시 중복 칸으로 기입을 돌리면 재조회 가시 값 있음이 6/48에서 최대 +11 오른다. 정확한 중복 대응이 확정되기 전에는 상한으로만 본다. 가시 칸이 빈 채 숨은 칸만 채워지는 성공 표시는 0이 되어야 한다.
- **필요성 입증:** **예(구조 증거).** 가시 6 대 숨은 11, 7/11 같은 행 컨테이너, 기입 시점 18에 숨은 칸 포함이 확인됐다. 숨은 값 11개 중 어느 것이 확장 기입인지의 개별 귀속은 미확정이므로 Issue는 재현 픽스처로 귀속을 확정하는 것부터 시작한다.
- **승격:** #320

### 3) 매핑 미탐색 22칸 — 재현율 61.4%

- **failure class:** MAPPING_RECALL (후보 미제안)
- **live evidence:** 전체 35/57(61.4%). woowahan-recruitment 16/35(45.7%, 미탐색 19), naver-careers 19/22(86.4%, 미탐색 3). 제안된 후보의 정확도는 35/35로 100%다.
- **offline evidence:** 오프라인 측정은 등록된 후보만 세므로 미탐색을 측정하지 않는다. 4개 스냅샷 모두 `unscored=0`이고, 후보 누락 구조를 모델링한 픽스처는 없다.
- **cause location (경계):**
  - `frontend/src/autofill/dom/collect.ts:366` — 필드 수집 경계
  - `frontend/src/autofill/generic/generic-analysis.ts:225-232` — `NO_MATCH` 결과 생성
  - `frontend/src/autofill/generic/generic-analysis.ts:141-159` — `BLOCKED`/`REVIEW` 등급이 선택·기입 가능 여부를 가르는 지점
- **재현 픽스처:** **추가 필요.** 22칸을 "수집 누락 / 중복 제거 / 분석 `NO_MATCH` / 의도된 보류"로 분류한 뒤, 입증된 구조만 합성 스냅샷으로 만든다. 기존 `frontend/fixtures/dom-snapshots/`에는 후보 누락을 재현하는 스냅샷이 없다.
- **expected effect:** 안전하게 복구 가능한 칸만 반영했을 때 재현율과 가시 값 유지가 함께 오른다. 전부 복구된다는 가정의 상한은 57/57이지만, 민감·미지원으로 남길 칸을 제외하면 그보다 낮다.
- **필요성 입증:** **부분.** 22칸 격차는 측정됐지만, 각 칸이 제품 결함인지 의도된 보류인지는 아직 분류되지 않았다. Issue는 분류를 첫 완료 기준으로 둔다.
- **승격:** #319

### 4) LG 분할 이메일 성공-오답 (오프라인)

- **failure class:** WRONG_VALUE / reportedSuccessButWrong
- **live evidence:** LG는 이번 실사이트 평가 대상이 아니다(2개 사이트: NAVER, woowahan-recruitment). 실사이트 수치 없음.
- **offline evidence:** LG 10 registered / 7 exercisable / 6 correct / 1 wrong / 0 held, `reportedSuccessButWrong=1`. 아이디 칸에 전체 주소가 들어가고 `WRITTEN`으로 보고된다.
- **cause location:**
  - `frontend/src/autofill/dom/split-email.ts:25-31` — 도메인 옵션 텍스트가 도메인 모양이어야 분할 이메일로 인식
  - `frontend/src/autofill/review/review-plan.ts:649-663` — 인식 결과에 의존하는 보호
  - `frontend/src/autofill/write/native-executor.ts:735-752` — 인식 결과에 의존하는 쓰기 차단
- **재현 픽스처:** 기존 `frontend/fixtures/dom-snapshots/lg-ai-research-birth-split-email/sanitized.html:187-202`와 truth ordinal 6. 픽스처의 도메인 라벨이 `[TEXT]`로 치환돼 인식 전제가 깨진다.
- **expected effect:** fail-closed로 바꾸면 wrong 1 → 0, held 0 → 1(정답 6/7 유지). 분할 이메일 완전 지원은 별도 계약이며 이 증거로 입증되지 않는다.
- **필요성 입증:** **오프라인 픽스처 한정 예, 실사이트 아니오.** 라벨 치환 때문에 실사이트에서 같은 인식 실패가 난다고 말할 수 없다. 기존 폐쇄 Issue #138과 Project draft `[FE] 범용 이메일과 생년월일 분해형 값 바인딩 지원`이 관련 주제를 다룬다. 중복 생성을 피하기 위해 **미승격**하고, 픽스처 충실도 확인을 선행 조건으로 남긴다.
- **승격:** 없음

### 5) NAVER 기존 값 2칸 변경

- **failure class:** EXISTING_VALUE_PROTECTED 위반 의심
- **live evidence:** 기입 시점 DOM에서 기존 값이 있던 2칸의 값/길이가 바뀌었다(`changedExisting=2`). `report.json`의 `existing_value_damage=2`. 재조회 후에도 그 2칸이 가시 상태로 남았는지는 확인되지 않았다.
- **offline evidence:** 4개 스냅샷 모두 `preservedViolated=0`.
- **cause location:** `frontend/src/autofill/write/native-executor.ts:455-488`의 `hasGenericConflict`가 `item.currentValue`와 같은 기존 값은 충돌로 보지 않고 덮어쓴다. 이번 2칸이 그 경로였는지는 미확인.
- **재현 픽스처:** runner의 preserve 테스트(`write-accuracy.runner.test.ts:110` 부근)는 있으나, 이번 2칸의 구조를 재현하지 못한다. **추가 필요.**
- **expected effect:** 미확인. 보호 위반이면 안전 결함, 의도된 교체면 정상이다.
- **필요성 입증:** **아니오.** 필드 귀속이 `build-report.py:92`의 가정이고, 2칸이 보호 대상이었는지 증거가 없다. 다음 측정에서 필드별 기존 값 보호 플래그를 기록한 뒤 재판정한다.
- **승격:** 없음

### 6) 입력 불가(UNSUPPORTED_CONTROL) 33건

- **failure class:** UNSUPPORTED_CONTROL (지연)
- **live evidence:** NAVER 9, woowahan-recruitment 24. 선택·기입하지 않았다.
- **offline evidence:** 해당 없음.
- **cause location:** `frontend/src/autofill/write/native-executor.ts:138-169`의 금지 문맥/커스텀 제어 차단과 `frontend/src/autofill/generic/generic-analysis.ts:141-159`의 `BLOCKED` 등급.
- **재현 픽스처:** 없음. 사이트별 항목이 비식별로 남지 않아 구성할 수 없다.
- **expected effect:** 민감·미지원을 안전하게 보류한 결과일 수 있어 개선 효과를 수치로 약속할 수 없다.
- **필요성 입증:** **아니오.** 24건에는 민감 항목이 섞여 있고, deferred 항목은 pregraded 필드 id와 대응되지 않아 결함과 정상 보류를 구분할 수 없다.
- **승격:** 없음

## 4. 실패 0 클래스 (근거 포함)

아래는 "실패 0"이지 "완벽한 커버리지"가 아니다. exercisable이 0인 클래스는 실패가 0인 것이 당연하다.

| class | 실패 0 근거 | artifact |
| --- | --- | --- |
| 오프라인 native select | reviewed 3/3 + unreviewed 4/4 = 7/7 정답, 0 오답, 0 보류 | `fixture/task-14-summary.md` |
| 오프라인 reviewed text | 8/8 정답, 0 오답, 1 보류 | `fixture/task-14-summary.md` |
| 오프라인 textarea | 1/1 정답, 0 오답 | `fixture/task-14-summary.md` |
| 오프라인 checkbox | 7 registered / 0 exercisable → 실패 0(측정 대상 없음) | `fixture/task-14-summary.md` |
| 오프라인 radio | 1 exercisable / 0 정답 / 0 오답 / 1 보류 → 오답 0 | `fixture/task-14-summary.md` |
| 오프라인 기존 값 보호 | 4개 스냅샷 모두 `preservedViolated=0` | `fixture/task-14-summary.md` |
| 실사이트 민감 항목 | 선택·기입 0건(NAVER FORBIDDEN 0, woowahan FORBIDDEN 12 미선택) | `report.json`, `summary.md` |
| 실사이트 재기입 | `written_tab_ids` 2개, 탭별 1회 | `report.json`, `review-counts.json` |

주의: NAVER `오입력 0/19`는 기입 시점 수치이고 값 원문을 읽지 않았다. 재조회 가시 값이 6/48이므로 이를 "오입력 0의 성공 근거"로 쓰지 않는다.

## 5. 재현 픽스처 현황

| candidate | exists | must add |
| --- | --- | --- |
| #1 프레임워크 재렌더 | `workflow/write-accuracy/write-accuracy.runner.test.ts:87-100` (input 1개 리버트) | 텍스트·native select·radio + 재렌더/요소 교체 합성 스냅샷, truth/manifest |
| #2 숨은 중복 | `fixtures/dom-snapshots/naver-education-stage/sanitized.html`(사람 검토 승인), `generic/structure-loop.stage-visibility.test.ts:257-280`(숨은/가시 그룹) | 가시 칸과 숨은 중복 칸이 같은 행에 있는 write-accuracy 케이스, 가시 칸 수신·숨은 칸 불변 단언 |
| #3 매핑 미탐색 | 없음(4개 스냅샷은 등록 후보만 측정) | 미탐색 22칸 분류 후 수집 누락 구조 스냅샷 |
| #4 LG 이메일 | `lg-ai-research-birth-split-email/sanitized.html:187-202`, truth ordinal 6 | 실사이트 라벨 형태의 비식별 픽스처(치환 전 구조 확인) |
| #5 기존 값 | `write-accuracy.runner.test.ts:110` preserve 테스트 | 이번 2칸의 구조를 재현하는 스냅샷 |
| #6 입력 불가 | 없음 | 비식별 항목 분류 후 필요 시 |

## 6. 중복 확인

- 기존 열린 Issue(5건; 신규 3건 제외): #314(이 작업), #310(정적 맵핑 QA 하네스), #292(AI provider), #135(Infra 알림), #91(Harness 컨벤션). 기입 유지·숨은 중복·매핑 재현율 주제 없음.
- 열린 PR 전체(4건): #311, #216, #182, #95. 해당 주제 없음.
- 전체 165개 Issue를 제목·본문으로 로컬 필터링(한국어 `--search` 인자가 Windows→WSL 경계에서 비어 전달되어 전체 목록 필터로 대체). `react`, `controlled`, `프레임워크`, `값이 유지`, `리렌더`, `shadow`, `재현율`, `기입 실패` 검색 결과 중 가시 값 유지·숨은 중복 쓰기를 직접 다루는 열린 Issue 없음.
- 폐쇄 #138은 분할 이메일 아이디 칸 전체 주소 차단, 폐쇄 #312는 숨은 학력 단계 칸이 줄 전체를 막는 문제다. #312는 숨은 칸 **탐지/차단**이고 이번 #320은 숨은 중복 칸 **쓰기 대상 선택**이라 원인이 다르다. 둘 다 중복이 아니다.
- Project 149의 기존 draft/Issue 제목을 전수 확인했다. `[AI] LLM 매핑 신뢰도와 안전 중단`, `[FE] 범용 자동 기입 경로의 CJ·Greeting 전용 코드 어댑터 분리`, `[FE] 범용 구조 행동 자동 루프`는 이번 후보와 다른 범위다.
- 결론: 중복이 없어 #318, #319, #320을 새로 만들었다. Sub-issue는 만들지 않았다.

## 7. 승격 결과

| issue | 제목 | labels | Project 149 status | 근거 |
| ---: | --- | --- | --- | --- |
| #318 | [FE] 범용 자동 기입 값이 실사이트에서 유지되지 않는 문제 수정 | `status:ready`, `frontend-change`, `type:bug` | Todo | 후보 1 |
| #320 | [FE] 숨은 중복 칸에 기입해 가시 칸이 비는 문제 수정 | `status:ready`, `frontend-change`, `type:bug` | Todo | 후보 2 |
| #319 | [FE] 범용 자동 기입 매핑 재현율 61.4%의 미탐색 칸 원인 확인과 개선 | `status:ready`, `frontend-change`, `type:bug` | Todo | 후보 3 |

- 생성 방식: Project 149 draft 생성 → `convertProjectV2DraftIssueItemToIssue`로 일반 Issue 승격 → labels 추가.
- 승격 증거: `.omo/evidence/generic-stage-check-and-write-accuracy/live/task-17/convert-*.json`, `issue-318-full.json`, `issue-319-full.json`, `issue-320-full.json`, `project-items-corrected.txt`.
- 미승격 후보 4~6의 이유는 각 절에 적었다.
- 이 Issue 브랜치에는 이 문서와 llm-wiki 지식 기록만 추가한다. 제품 수정·커밋 없음.

## 8. 다음 측정에 필요한 것

- 실사이트 보고서에 **가시/숨은 칸을 분리한 재조회 수치**를 포함한다. 기본 관찰값은 "기입 1회 후 재조회에서 값이 있는 가시 칸 수 / 전체 가시 칸 수"다.
- NAVER의 `correct_input_rate`와 전체 정답 입력률은 상한으로 표시하고, 성공 지표로 쓰지 않는다.
- 필드별 기입 종료 코드(값·라벨 없이)와 기존 값 보호 플래그를 기록한다.
- 미탐색 22칸을 필드 단위로 분류한다.
- 프레임워크 재렌더와 숨은 중복 쓰기를 각각 재현하는 픽스처를 추가한 뒤 같은 계약 1.1로 재측정한다.
- 정답표의 사람 검토를 완료한다.
