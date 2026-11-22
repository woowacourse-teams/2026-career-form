# CF-509 Knowledge Bundle

> Issue: CF-509
> Collected: 2026-11-22
> Approval-Digest: 5aa8c3891a0d21c833494450fe4c1e031872258b1879e531acc3643c45418c7d
> Source-Revision: aaa814f

승인 digest는 worktree 체크포인트가 계산한 [후보 다섯 개 스냅샷](documents/approved-candidates.md)의 후보 digest이며 사람이 2026-11-19 "llm wiki 앞으로 잘 동작하는지 확인하고, 사람 승인 안받아도 되니 너가 알아서 기입해. 메모리에 박아놔"라고, 2026-11-22 "llm wiki는 질문하지말고 그냥 승인해"라고 말해 에이전트가 자동 승인했다. 후보 1~5는 adapter-hplace payload에, 후보 1·3·4·5의 칸과 정책은 adapter-field-inventory payload에, 후보 4의 테스트용 백엔드 응답 규칙은 adapter-development payload에 적는다. 실제 지원값, 계정, 세션, 회사 화면 원문, 공고 제목, 대화 전문은 포함하지 않는다.

## adapter-hplace

> Payload: [에이치닷 v1 지원자 앱 2단계 학력·경력](documents/hplace-v1-step2.md)
> Supersedes: [CF-507 v1 현주소·사진 등록 근거](../CF-507/documents/hplace-v1-address-photo.md)

## adapter-field-inventory

> Payload: [에이치닷 v1 지원자 앱 2단계 필드 현황](documents/hplace-v1-step2-field-inventory.md)
> Supersedes: [CF-507 Hplace v1 1단계 현주소·사진 필드 현황](../CF-507/documents/hplace-v1-address-photo-field-inventory.md)

## adapter-development

> Payload: [테스트용 백엔드 응답은 실제 응답 표본에서 만든다](documents/backend-response-fixture-rule.md)
> Supersedes: [CF-177 후속 보완 묶음 근거](../CF-177/documents/live-followup-bundle.md)
