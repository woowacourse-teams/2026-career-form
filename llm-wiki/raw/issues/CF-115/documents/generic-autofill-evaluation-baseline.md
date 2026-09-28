# 범용 자동 기입 실사이트 기준선과 회귀 평가 계약

근거: [Issue #115](https://github.com/woowacourse-teams/2026-career-form/issues/115), 평가 구현 `842e7d6983dd8bbea5579e169e1bdc2d0859d1bd`, 평가한 제품 revision `8105e7c25b97431a5dd97ddc8e8571dbe916727b`.

## 승인된 후보 전체

1. 실사이트 범용 입력은 실행 전 사용자 승인과 실행 후 DOM 직접 확인을 분리한다. 제품 패널의 성공 또는 확인 필요 표시는 실제 유지와 숨은 오입력을 모두 설명하지 못한다.
2. 분할 이메일과 의미가 비슷한 장문 입력에서는 값 바인딩 전에 대상 control 구조와 주변 문맥을 함께 검증한다. LG 분할 이메일과 Neowiz 장문 문항에서 각각 `MAPPING_INCORRECT`가 관측됐다.
3. 커스텀 선택형 control은 프로필 enum과 화면 option을 명시적으로 정규화하고 선택 후 값을 재검증한다. Kakao Mobility에서 보훈과 장애 선택이 반대로 기록되는 `WRITE_FAILED`가 관측됐다.

## 평가 계약

실사이트에서 사람이 확정한 전체 필드 목록을 분모로 사용한다. 탐지된 필드만 분모로 삼지 않는다. 각 필드는 `AUTOFILLABLE`, `CONDITIONAL`, `PROFILE_VALUE_MISSING`, `FORBIDDEN`, `CREATED_AFTER_ACTION` 중 하나로 분류한다. 관측은 `DISCOVERED`, `MAPPED`, `BOUND`, `WRITTEN`, `RETAINED` 순차 단계와 `DEFERRED`, `FAILED` 종결 결과를 분리한다.

지표는 다음처럼 계산한다.

| 지표 | 계산 |
| --- | --- |
| 매핑 정확도 | 올바른 매핑 / 제안한 매핑 |
| 매핑 재현율 | 올바른 매핑 / 자동 입력 가능한 전체 정답 필드 |
| 정답 입력률 | 올바르게 유지된 필드 / 자동 입력 가능한 전체 정답 필드 |
| 실행 유지율 | 올바르게 유지된 필드 / 올바르게 바인딩한 필드 |
| 오입력률 | 잘못 쓴 필드 / 실제 쓴 필드 |

`LIVE_SITE`와 `FIXTURE`를 별도 source로 집계한다. fixture 성공은 실사이트 성공에 합산하지 않는다. 비용을 확인할 수 없으면 `null`로 남긴다. 실제 지원 정보, 전체 HTML, URL query, selector, 프롬프트와 응답 원문, 계정과 세션 정보는 저장하지 않는다.

## CF-115 기준선

평가 계약은 `1.0`, 합성 프로필은 `profile-export-example-v1`이다. 5개 대상 중 4개를 측정했고 기존 값이 있던 1개는 `MANUAL_VERIFICATION_UNAVAILABLE`로 기록했다.

| 범위 | 매핑 정확도 | 매핑 재현율 | 정답 입력률 | 실행 유지율 | 오입력률 | 기존 값 훼손 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 실사이트 전체 | 11/13, 84.6% | 11/31, 35.5% | 8/31, 25.8% | 8/10, 80.0% | 4/12, 33.3% | 0건 |
| LG AI Research | 3/4, 75.0% | 3/7, 42.9% | 2/7, 28.6% | 2/2, 100% | 1/3, 33.3% | 0건 |
| Neowiz Lever | 4/5, 80.0% | 4/10, 40.0% | 4/10, 40.0% | 4/4, 100% | 1/5, 20.0% | 0건 |
| Kakao Mobility Greeting | 4/4, 100% | 4/7, 57.1% | 2/7, 28.6% | 2/4, 50.0% | 2/4, 50.0% | 0건 |
| Megazone | 분모 없음 | 0/7, 0% | 0/7, 0% | 분모 없음 | 분모 없음 | 0건 |

실사이트 실행은 OpenAI `gpt-5.6-luna`를 8회 호출했다. 입력 18,914 tokens, 출력 837 tokens, 합산 20,426ms를 기록했고 비용은 미관측이다. 기계 판독 정본은 `harness/fixtures/generic-autofill/`의 `ground-truth-v1.json`, `observations-v1.json`, `baseline-v1.json`이다.

## 관측된 실패 구조

- LG AI Research는 분할 이메일의 로컬 영역에 전체 이메일이 입력돼 검증에 실패했다. 성별은 프로필 값을 화면 option에 바인딩하지 못해 보류됐다.
- Neowiz Lever는 직장 경력의 담당업무를 희망연봉 산정 이유에 입력했다.
- Kakao Mobility Greeting은 프로필의 보훈과 장애 상태와 반대되는 option을 선택했다. 제품 결과 패널에 이 두 쓰기가 나타나지 않아 DOM 직접 확인으로 발견했다.
- Megazone은 자동 입력 가능한 정답 필드 7개가 있었지만 올바른 매핑을 만들지 못했다.
- Naver Cloud는 기존 값 보호를 위해 쓰기를 실행하지 않았고 실사이트 성공값으로 대체하지 않았다.

실제 제출, 동의, 파일 첨부, 저장, 미리보기와 페이지 이동은 실행하지 않았다.

## 버전별 비교와 보관 경계

Issue raw는 실행 당시 계약, 제품 revision, 프로필 version, 대상 집합과 결과를 불변 근거로 보존한다. topic Wiki는 각 Issue의 raw를 한 표에 연결하는 사람용 비교 인덱스다. 후속 기준선은 평가 계약 version, 제품 revision, 프로필 version, source와 site 집합을 함께 기록해야 한다. 이 값이 달라지면 비율만 직접 비교하지 않고 변경된 분모와 계약을 함께 검토한다.

기계 비교는 분자, 분모, 비율이 있는 baseline artifact를 사용한다. 현재 구현은 CF-115의 `baseline-v1.json` 한 시점과 명시적인 `--compare-to` 비교를 제공하지만 여러 실행의 장기 보관, 자동 추세 표와 그래프는 제공하지 않는다. 이를 자동화하려면 baseline을 실행 ID 또는 Issue와 함께 불변 저장하고 여러 artifact를 읽는 별도 집계 계약이 필요하다.
