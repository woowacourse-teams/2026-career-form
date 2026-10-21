# 오프라인 기입 정확도 측정

> Topic: offline-write-accuracy
> Status: Current
> Current: [CF-313 오프라인 기입 정확도 측정 하네스와 첫 기준선](../../raw/issues/CF-313/documents/offline-write-accuracy.md)
> History: [CF-313 오프라인 기입 정확도 측정 하네스와 첫 기준선](../../raw/issues/CF-313/documents/offline-write-accuracy.md)
> Updated: 2026-10-21

## 현재 상태

비식별 DOM 스냅샷과 합성 프로필로 범용 경로의 실제 기입 결과를 오프라인에서 채점한다. 경로 판정은 제품의 `resolveDocumentCompany()`를 그대로 사용하고, 범용 경로가 아닌 스냅샷은 측정하지 않고 manifest에 상태와 이유만 남긴다.

정답은 제품 실행 결과를 보기 전에 커밋하고 sha256과 커밋 SHA를 기록한다. 결과를 본 뒤의 수정은 `corrections.md`와 별도 커밋으로만 한다. aggregate는 커버리지와 보존식을 검증할 뿐 스냅샷별 정확도 실패를 흡수하지 않는다.

전부 `unscored`인 결과는 stale artifact일 수 있으므로 같은 실행의 대조 스냅샷으로 구분하고, 병렬 실행 중 느린 통합 테스트의 타임아웃은 단독 재실행으로 확인한다. 상세 계약은 [CF-313 근거](../../raw/issues/CF-313/documents/offline-write-accuracy.md)를 따른다.

## 기준선 이력

| Issue | 기준 revision | AhnLab | NAVER | 카카오 | LG | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| CF-313 | `6c9c06d` | 5 시도, 3 정확, 2 보류 | 8 시도, 8 정확 | 12 시도, 10 정확, 2 보류 | 7 시도, 6 정확, 1 오입력 | [첫 기준선](../../raw/issues/CF-313/documents/offline-write-accuracy.md) |

이 표는 오프라인 스냅샷 결과다. [실사이트 평가 기준선](generic-autofill-evaluation-baselines.md)과 분모가 다르므로 합산하거나 직접 비교하지 않는다.

## 변경 이유

실사이트 평가는 사람의 탭 준비와 외부 상태에 의존해 제품 변경마다 반복하기 어렵다. 결과를 보기 전에 고정한 정답과 제품 경로 판정을 그대로 쓰는 오프라인 측정으로, 실제 기입 결과의 회귀를 저장소 안에서 재현 가능하게 확인하기 위해서다.
