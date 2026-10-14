# 시스템 PR 공유 파일 검사와 릴리스 본문 계약

> Topic: release-pr-contract
> Status: Current
> Current: [CF-197 시스템 PR 계약](../../raw/issues/CF-197/documents/release-pr-contract.md)
> History: [CF-197 시스템 PR 계약](../../raw/issues/CF-197/documents/release-pr-contract.md)
> Updated: 2026-10-12

## 현재 상태

실제 head/base를 중앙 브랜치 계약으로 검증하고 허용된 시스템 PR에는 공유 파일의 harness-change 라벨과 연결 Issue를 요구하지 않는다. 일반 작업과 hotfix의 보호는 유지한다. 릴리스 생성 본문은 현재 여섯 리뷰 섹션과 접힌 검증 기록을 따르며, Issue 종료 참조와 수행하지 않은 검증의 완료 주장을 추가하지 않는다.

## 변경 이유

시스템 PR의 Issue 종료 금지와 공유 파일의 Issue 연결 요구가 충돌했다. 릴리스 생성 본문도 변경된 PR 계약을 반영하지 않아 검사를 통과하지 못했다. 중앙 분류를 재사용하고 실제 생성 본문을 계약 검사기로 검증한다.
