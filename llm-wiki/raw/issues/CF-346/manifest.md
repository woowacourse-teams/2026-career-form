# CF-346 Knowledge Bundle

> Issue: CF-346
> Collected: 2026-10-25
> Approval-Digest: fe9263182f4be99fa243d40d23b9a65061d4226063cc78707b5149c59599feb3
> Approval-Response: 승인
> Approval-Date: 2026-10-25
> Source-Revision: d5a5005cc47d628b9044e460e0956021df523c90

승인 digest는 사람이 위 응답으로 승인한 [후보 다섯 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. 세 payload는 후보 1·2·4·5(Greeting 어댑터), 후보 1의 v19 지원 범위와 5(필드 현황), 후보 3(실사이트 평가)을 담는다. 각 payload는 같은 topic의 앞선 근거를 대체하되, 바꾸지 않은 내용은 Supersedes가 가리키는 문서를 따른다. 실제 지원값·계정·세션·요청 본문·시크릿은 포함하지 않는다. 전수 조사에 쓴 값은 모두 합성값이고, 컬리·카카오게임즈 지원서는 공개 공고의 빈 양식이다.

## adapter-greeting

> Payload: [Greeting 검색의 직접 입력 선택지 구조와 v19 허용 범위, 검색 실패 사유 코드](documents/greeting-direct-input-and-search-failure-codes.md)
> Supersedes: [CF-334 열린 Ark UI 팝오버의 숨김 수집 근거](../CF-334/documents/greeting-open-popover-hides-form.md)

## adapter-field-inventory

> Payload: [Greeting v19 직접 입력 지원 범위와 카카오게임즈 기존 미해결 항목](documents/greeting-v19-field-inventory.md)
> Supersedes: [CF-335 현대 v25 경력 날짜·종료사유·자격 등급 지원 현황](../CF-335/documents/hyundai-v25-field-inventory.md)

## live-autofill-evaluation

> Payload: [검색 종류별 정확 일치 없음 전수 조사 절차와 새 정책 버전의 로컬 스택 검증](documents/live-harness-no-exact-match-survey-and-local-policy-stack.md)
> Supersedes: [CF-334 반복 관찰 루프와 서비스 워커 API 관찰](../CF-334/documents/live-harness-service-worker-observation-and-repeat-loop.md)
