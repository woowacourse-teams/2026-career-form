# 현대 어학 상태 드라이버 실패의 행 단위 격리

CF-86의 현대 프론트 어댑터 경계와 지원 범위는 유지한다. CF-169는 어학 언어(`foreLang`)와 어학 시험(`foreExamCd`) 상태 드라이버가 실패할 때 같은 반복 행만 건너뛰고 다른 행과 무관한 항목은 계속 입력하도록 `stateDriverFailureGroup`에 `languageRowFailureGroup`을 추가한다.

행은 `.field-group`이 `foreLang`·`foreExamCd` hidden 입력과 `foreLang_<n>`·`foreExamCd_<n>` 버튼을 각각 정확히 하나씩 소유할 때만 인정한다. 드라이버는 `ADAPTER_VERIFIED`·`READY`·`SELECT_BUTTON_OPTION`이고 프로필 키가 언어 또는 시험명과 일치해야 한다. 컨테이너가 여러 행을 포함하거나 드라이버가 `.field-group` 밖이면 `undefined`를 반환해 기존처럼 전체를 중단한다. 현대 반복 어학 행의 수집 단위는 `.field-content`이며 `.field-group`은 그 안에 있다.

국적(`nationCd1Nm`)은 반복 행이 아니고 컨테이너 근거가 없어 제외한다. 자동 회귀는 합성 DOM 기준이다. 실제 현대 지원서에서 어학 첫 행 시험을 불일치시킨 합성 프로필의 확인은 사람이 설치 확장으로 수행한다.
