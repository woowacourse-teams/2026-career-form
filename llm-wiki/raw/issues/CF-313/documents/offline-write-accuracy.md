# 오프라인 기입 정확도 측정 하네스와 첫 기준선

## 측정 계약

- 실행기는 `frontend/src/autofill/workflow/write-accuracy/`에 있고, 측정 대상 목록은 `frontend/fixtures/write-accuracy/manifest.json`, 스냅샷별 정답은 `frontend/fixtures/write-accuracy/<snapshot>/truth.json`이다.
- 경로 판정은 제품의 `resolveDocumentCompany()`를 그대로 호출한다. 제품이 범용 경로로 보내지 않는 스냅샷(SK는 정책 경로, 에이치닷은 hplace 경로)은 측정하지 않고 manifest에 상태와 이유만 기록한다.
- 정답은 제품 실행 결과를 보기 전에 커밋하고 sha256과 커밋 SHA를 남긴다. 결과를 본 뒤의 정답 수정은 스냅샷의 `corrections.md`와 별도 커밋으로만 한다.
- aggregate는 커버리지와 보존식(attempted = correct + wrong + held, reportedSuccessButWrong <= wrong)을 검증한다. 개별 스냅샷의 정확도 실패를 흡수하지 않으며, 정확도 실패는 그 스냅샷의 테스트 케이스에 남는다.

## 결과 해석 주의

- 스냅샷 결과가 전부 `unscored`로 나오면 정답 매핑 오류가 아니라 이전 실행 리포트를 읽은 stale artifact일 수 있다. 같은 실행의 대조 스냅샷(AhnLab)이 정상 채점되는지로 구분한다.
- 대규모 유닛 스위트를 여러 워커로 동시에 실행하면 느린 통합 테스트(에이치닷 약 33~43초)가 타임아웃으로 실패할 수 있다. 신규 실패로 단정하기 전에 단독 재실행으로 확인한다.

## 실측 기준선

기준 revision은 `origin/develop` `6c9c06d`이다. 합성 프로필과 비식별 DOM 스냅샷의 오프라인 실행 결과이며 실사이트 평가 계약 1.1의 지표와 같은 분모가 아니다.

| 스냅샷 | 시도 | 정확 | 보류 | 오입력 |
| --- | ---: | ---: | ---: | ---: |
| AhnLab | 5 | 3 | 2 | 0 |
| NAVER | 8 | 8 | 0 | 0 |
| 카카오 | 12 | 10 | 2 | 0 |
| LG | 7 | 6 | 0 | 1 (분할 이메일) |

전체 실행 시간은 119.5초였다.

## 근거와 경계

정답 파일, manifest, corrections 기록과 실행기 테스트는 같은 Issue 브랜치에 있다. 실제 지원서 기입·저장·제출, 실사이트 실행과 실제 공급자 호출의 정확도는 이 기준선에 포함하지 않는다. 실제 지원값, 계정, 세션과 페이지 식별 주소는 옮기지 않는다.
