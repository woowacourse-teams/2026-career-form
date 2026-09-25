# CF-108 범용 검색 진단과 현행 실행 경계

> 근거: [Issue #108](https://github.com/woowacourse-teams/2026-career-form/issues/108), CF-108 구현과 비식별 합성 검증.

## 유지되는 실행 계약

CF-98 실행 계약 (`llm-wiki/raw/issues/CF-98/documents/generic-autofill-search.md`)의 승인된 nonempty readonly DIRECT 필드, 소유된 SearchSurface, 로컬 exact 결과 선택, 현재 DOM과 반복 행 재검증 경계를 유지한다. 학교 소재지의 queryless 경로는 같은 출처 iframe, 한국 국가 문맥, 완전한 국내 17개 지역과 명시적 별칭을 확인한 경우만 대상으로 한다.

회사의 callback을 직접 호출하거나 JavaScript 주소를 평가하지 않는다. 기존에 검증한 단일 리터럴-bearing 원본 링크만 현재 소유 iframe의 MAIN-world에서 한 번 클릭하고 표시값 반영, 팝업 종료와 유지 여부를 확인한다. readonly 해제, hidden code 직접 쓰기, 재클릭, 사이트 저장과 제출은 하지 않는다. CF-108은 이 실행 허용 범위를 확대하지 않는다.

## 공개 진단 코드와 후속 보류

범용 실행기의 내부 reason을 로컬 고정 failureCode로 변환하고 결과 모델과 WorkflowResults까지 전달한다. 기존 coarse code와 outcome은 별도 계약으로 유지한다. 사이트 오류 원문이나 프로필 값을 새 안내문에 넣지 않는다.

| 공개 진단 | 의미 |
| --- | --- |
| SEARCH_FORM_UNVERIFIED | 검색 폼 또는 검색 버튼 구조를 안전하게 확인하지 못함 |
| SEARCH_NAVIGATION_UNSAFE | 허용된 검색 화면 이동인지 확인하지 못함 |
| SEARCH_RESULTS_INCOMPLETE | 전체 결과 근거를 확인하지 못함 |
| SEARCH_ACTIVATION_UNSAFE | 결과 선택 동작을 안전하게 확인하지 못함 |
| SEARCH_FOLLOWUP_HALTED | 앞선 검색의 미확정 부수효과로 후속 입력을 실행하지 않음 |

기존 timeout, 중복, 정확한 결과 없음, 선택 미확인 진단은 의미에 맞게 재사용한다. 마지막 값 유지 재검증 실패에는 VALUE_NOT_RETAINED를 전달한다. 검색 실패의 effect가 none이면 기존 계속 정책을 유지한다. effect가 none이 아닌 기존 중단 조건에서는 승인되고 여전히 선택 가능한 후속 항목에만 보류 진단을 붙인다. 미승인 항목을 새 실패로 표시하지 않는다.

## 학교 검색의 구조 재현과 지원 한계

이전에 보고된 학교 검색의 POST form, hidden 행 문맥, fieldset, query, submit input과 form 내부 ul/li/a 및 리터럴 inline handler 구조를 합성값으로 재현했다. 실제 사이트의 callback 이름이나 개인정보는 복사하지 않았다. 학교 검색 지원 복구를 뜻하지 않는다.

value만 검색으로 표시된 submit input은 현재 라벨 수집에서 검색 버튼으로 인식되지 않아 search_submit_not_found로 먼저 멈출 수 있다. 이 사유도 SEARCH_FORM_UNVERIFIED로 안내한다. 별도의 명시적 button submit 변형은 POST/hidden 폼 거부인 unverified_search_form을 검증하기 위한 진단 사례이며 원 관측 구조와 혼동하지 않는다. 완료 marker를 임의로 더해 학교 선택 성공을 만들지 않는다.

소재지는 학교와 독립된 같은 출처 iframe의 KOR/한국 선택 및 17개 공개 지역 목록으로 검증한다. 이를 학교 실패 뒤 소재지 실행 자체가 보류된 상황과 구별한다. 기존값 충돌, 외국, 누락, 중복과 위험 링크는 자동 선택하지 않는다.

## native GET 완료 근거에 대한 정정

hasCompletedNavigation은 결과 준비 판정에 관여하지만, 이후 complete marker, declared count 또는 전체 위치 정보 중 하나를 요구하는 검사를 우회하지 않는다. 완료 근거가 전혀 없는 목록은 result_set_incomplete로 거부된다. 초기 계획의 navigation 완료만으로 전체 결과 검사가 생략된다는 의심은 전체 코드 경로와 부정 회귀로 정정했다. 개수 근거를 추가한 positive 사례도 별도로 확인하며, 실행 정책은 변경하지 않았다.

## 검증의 경계

실제 빌드한 확장을 새로운 임시 Chromium 프로필에 설치하고 준비/필드 분석 HTTP 응답만 합성 데이터로 대체했다. 확장의 프로필 저장, 필드 수집, 실제 입력 실행기와 결과 UI는 대체하지 않았다. 설치된 manifest, background와 content script의 해시를 로컬 빌드와 대조했다.

설치 확장 화면에서 학교의 구조 확인 실패와 소재지의 후속 보류가 구분됐다. 학교 opener는 1회, 후속 소재지 opener와 query/submit/선택은 0회였고 대상 및 다른 행의 표시값과 hidden code는 그대로 유지됐다. 사용자 브라우저 프로필을 바꾸지 않았으며 임시 검증 프로필은 정리했다.

이 결과는 실제 CJ의 현재 입력 동작, 숨은 코드 반영, 서버 저장 또는 모든 채용 사이트 호환성을 증명하지 않는다. CF-98의 과거 합성 및 CJ 화면 관측 (`llm-wiki/raw/issues/CF-98/documents/generic-autofill-search.md`)은 당시 관측으로만 유지한다. 실제 CJ 재실행, 외부 공급자 실호출과 서버 저장은 CF-108에서 검증하지 않았다.
