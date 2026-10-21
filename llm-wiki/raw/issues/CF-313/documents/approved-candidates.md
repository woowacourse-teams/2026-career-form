# 지식 후보 (approval pending) - _draft

Issue #313 (오프라인 기입 정확도 측정 + 달력 최종 확인) 실행에서 나온 재사용 지식 후보. 승인 digest를 받은 뒤에만 llm-wiki에 반영한다.

## C1. 오프라인 기입 정확도 측정 하네스
- 위치: `frontend/src/autofill/workflow/write-accuracy/`, manifest `frontend/fixtures/write-accuracy/manifest.json`, 정답 `frontend/fixtures/write-accuracy/<snapshot>/truth.json`.
- 계약: route는 `resolveDocumentCompany()`를 그대로 호출해 판정한다. 제품이 범용 경로로 가지 않는 스냅샷(SK=policy, 에이치닷=hplace)은 측정하지 않고 manifest에 상태와 이유만 기록한다.
- 정답은 제품 실행 결과를 보기 전에 커밋하고 sha256·커밋 SHA를 남긴다. 결과를 본 뒤 고치는 것은 `corrections.md`와 별도 커밋으로만 한다.
- aggregate는 커버리지·보존식(attempted = correct + wrong + held, reportedSuccessButWrong <= wrong)을 검증하고, 개별 스냅샷의 정확도 실패를 흡수하지 않는다. 정확도 실패는 그 스냅샷 it()에 남는다.

## C2. 달력(SELECT_DATE) 기입도 공통 최종 확인을 거쳐야 한다
- `write/executor.ts`의 SELECT_DATE 경로가 달력 실행기 성공만 믿고 반환하면, 페이지가 값을 되돌려도 "입력 완료"로 보고된다.
- 수정: settle 단계에서 대상 입력의 최종 값을 다시 읽어 승인 날짜와 대조하고, 불일치·노드 교체·분리 시 `skipped(needs-verification, RETAINED_VALUE_UNCONFIRMED)`.
- 테스트에서 값을 바꾸는 시점은 첫 `written` 통지 안(최종 확인 이전)이어야 재현된다. change 핸들러 microtask는 실행기 자체 검사에 먼저 걸린다.

## C3. 측정 결과 해석 주의
- 스냅샷 결과가 전부 `unscored`로 나오면 정답 매핑 오류가 아니라 이전 실행 리포트를 읽은 stale artifact일 수 있다. 같은 실행의 대조 스냅샷(AhnLab)이 정상 채점되는지로 구분한다.
- 대규모 유닛 스위트를 여러 워커로 동시에 돌리면 느린 통합 테스트(에이치닷 33~43초)가 타임아웃으로 실패한다. 신규 실패로 단정하기 전에 단독 재실행으로 확인한다.

## 실측 기준선 (#313, 6c9c06d 기준)
- AhnLab 5 시도/3 정확/2 보류, NAVER 8 시도/8 정확, 카카오 12 시도/10 정확/2 보류, LG 7 시도/6 정확/1 오입력(분할 이메일).
- 실행 시간 119.5초.