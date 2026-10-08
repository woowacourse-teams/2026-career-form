# SK 어학 상태 드라이버 실패의 행 단위 격리

CF-86의 SK 어댑터 경계와 지원 범위는 유지한다. CF-169는 어학 언어 선택(`lngLanguageType`)이 실패할 때 같은 시험 행만 건너뛰고 다른 행과 무관한 항목은 계속 입력하도록 `stateDriverFailureGroup`에 `languageRowFailureGroup`을 추가한다. 기존 검색 드라이버(학교·자격증·시험명)의 행 격리는 그대로 유지한다.

행은 `.form-item-group.langExam-Item`이 `lngLanguageType` select를 정확히 하나만 소유하고, 이 select의 가장 가까운 `.form-item-group`이 그 행일 때만 인정한다. 드라이버는 `ADAPTER_VERIFIED`·`READY`·`SELECT_OPTION`이고 직접 바인딩의 프로필 키가 어학 언어여야 한다. 컨테이너가 여러 select를 포함하거나 시험 행 밖이거나 중첩 그룹이 소유하면 `undefined`를 반환해 기존처럼 전체를 중단한다.

우대 여부 드라이버(`isVerifiedProfilePriorityStatus`)는 반복 행이 아니고 컨테이너 근거가 없어 제외한다. 자동 회귀는 합성 DOM 기준이다. 실제 SK 지원서에서 어학 첫 행 언어를 불일치시킨 합성 프로필의 확인은 사람이 설치 확장으로 수행한다.
