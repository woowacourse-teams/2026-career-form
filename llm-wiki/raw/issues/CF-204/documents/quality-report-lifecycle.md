# 자동 기입 품질 report의 전송 시점

> Issue: [CF-204](https://github.com/woowacourse-teams/2026-career-form/issues/204)
> Collected: 2026-10-13
> Approval-Digest: c77035f9272a13a0c57efcb4397b53809a4cc8f2e4d79b61eb72bafe0e8cc0f3
> Source-Revision: d0ab0303e2b9514b40a32b316f5b88d434d56693

## 승인한 지식 후보

자동 기입 품질 관측은 실행 및 snapshot별로 로컬에 누적하고 완료, 진행 불가, 오류, 미지원 또는 취소 시 전송한다. 정상 완료는 값 유지 관측을 기다리고 취소는 이를 중단한다. 마지막 데이터 report에 종료 상태를 포함하며 같은 실행의 반복 종료는 전송을 추가하지 않는다. snapshot별 API 및 300 필드 분할, 기존 128KiB 제한과 네트워크 재시도는 유지한다. 영속 저장이 없어 종료 처리 전 탭 종료나 새로고침 시 누적 결과가 유실될 수 있다.
