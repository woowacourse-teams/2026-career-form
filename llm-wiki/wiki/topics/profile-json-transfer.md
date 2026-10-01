# 프로필 JSON 전송

> Topic: profile-json-transfer
> Status: Current
> Current: [CF-76 로컬 프로필 JSON 전송 계약](../../raw/issues/CF-76/documents/product/profile-json-transfer.md)
> History: [CF-76 로컬 프로필 JSON 전송 계약](../../raw/issues/CF-76/documents/product/profile-json-transfer.md)
> Updated: 2026-09-07

## 현재 상태

로컬 프로필은 versioned JSON envelope으로만 내보내고, 가져오기는 구조 검증과 전체 교체 확인 뒤 원자적으로 저장한다.

## 변경 이유

브라우저 교체·재설치와 사용자 백업 상황에서 로컬 프로필을 직접 복원할 수 있게 하되, 연락처와 민감 범주를 포함할 수 있는 데이터의 의도하지 않은 교체와 이전 자동 저장의 역전을 막는다.
