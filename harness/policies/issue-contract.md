# Issue 계약

## 필수 정보

- 배경
- 목표
- 포함 범위
- 제외 범위
- 체크리스트 형식의 인수 조건
- 자동 검증
- 수동 검증
- 위험 작업

기능, 버그, 기술 작업 모두 같은 계약 제목을 사용하므로 자동 검사가 양식을 해석할 수 있다.

## 확정과 변경

`status:ready`는 사람이 범위와 완료 기준을 확정했다는 뜻이다. 이후 본문은 수정하지
않는다. 정정이 필요하면 사람이 `status:planning`으로 되돌려 수정하고 다시
`status:ready`로 확정한다. 새 요구사항, 예상보다 큰 변경, 다른 컴포넌트 작업은 후속
Issue로 분리한다.

작업 상태는 본문을 고쳐 표시하지 않는다. `status:planning`, `status:ready`, `status:in-progress`, `status:blocked`, `status:review` 라벨과 담당자, 연결 PR로 표시한다.
