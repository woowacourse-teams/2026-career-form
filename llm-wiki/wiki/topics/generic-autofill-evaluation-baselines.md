# 범용 자동 기입 평가 기준선

> Topic: generic-autofill-evaluation-baselines
> Status: Current
> Current: [CF-115 범용 자동 기입 실사이트 기준선](../../raw/issues/CF-115/documents/generic-autofill-evaluation-baseline.md)
> History: [CF-115 첫 기준선](../../raw/issues/CF-115/documents/generic-autofill-evaluation-baseline.md)
> Updated: 2026-09-28

## 현재 상태

범용 자동 기입은 사람이 확정한 전체 필드 분모를 기준으로 발견, 매핑, 바인딩, 쓰기와 유지 단계를 분리해 평가한다. 실사이트와 fixture 결과를 합산하지 않는다. 평가한 제품 revision, 평가 계약 version, 합성 프로필 version, 초기 상태, 공급자와 모델, 예산과 사용량을 함께 기록한다.

CF-115는 첫 공통 기준선이다. 실사이트 5개 중 4개를 측정했고 1개는 기존 값 보호를 위해 미확정으로 남겼다. 매핑 정확도는 84.6%였지만 매핑 재현율은 35.5%, 정답 입력률은 25.8%였다. 올바르게 바인딩한 필드의 실행 유지율은 80.0%였고 실제 쓰기의 오입력률은 33.3%였다. 기존 값 훼손은 없었다.

## 기준선 이력

| Issue | 평가한 제품 revision | 계약 | 프로필 | 실사이트 | 매핑 재현율 | 정답 입력률 | 오입력률 | 근거 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| CF-115 | `8105e7c25b97` | `1.0` | `profile-export-example-v1` | 측정 4, 미확정 1 | 11/31, 35.5% | 8/31, 25.8% | 4/12, 33.3% | [첫 기준선](../../raw/issues/CF-115/documents/generic-autofill-evaluation-baseline.md) |

후속 평가 Issue는 이 표에 한 행을 추가하고 해당 Issue의 불변 raw를 History에 연결한다. 계약, 프로필 또는 site 집합이 달라지면 같은 분모의 전후 비교로 표시하지 않는다. 변경된 조건을 함께 적고 공통 대상만 별도 비교한다.

## 보관 역할

- Issue raw는 당시 실행 근거와 해석을 보존한다.
- 이 topic은 버전별 결과를 찾는 사람용 인덱스다.
- `harness/fixtures/generic-autofill/`의 JSON은 분자, 분모, 비율과 실행 메타데이터를 담는 기계 판독 정본이다.
- 현재 CLI는 단일 이전 artifact와 비교할 수 있지만 여러 기준선의 장기 보관과 자동 추세 집계는 아직 제공하지 않는다.

## 변경 이유

개별 Issue raw만으로도 과거 근거는 보존되지만 여러 revision의 지표를 한눈에 비교하기 어렵다. 불변 raw와 기계 artifact는 그대로 두고 topic에 기준선 이력을 모아 근거 보존과 조회를 분리한다.
