# CF-177 Knowledge Bundle

> Issue: CF-177
> Collected: 2026-10-19
> Approval-Digest: 5a54ecda82fcd8b70574c9b3b35910433c10db4823ea2ad8b15ef0bd74df4b97
> Checkpoint-Approval-Digest: 8764dbf7815af8782237163a0a64fda297189cad546efc2412e90a99cf942388
> Source-Revision: c35f229db509ad1fc7d3cc440729a026afb359db

승인 대상은 후보 파일 전체 UTF-8 바이트이며 Approval-Digest는 그 SHA-256이다. Checkpoint-Approval-Digest는 같은 승인 내용을 단일 후보로 기록한 JSON 배열의 SHA-256이다. 공식 replace-candidates 명령의 strip()이 마지막 LF 하나를 제거하므로, 승인 기록 전에 저장 후보에 LF를 다시 붙인 UTF-8 바이트가 원본 파일 전체와 정확히 같음을 검증했다. 이 표현 변환과 마지막 LF 정규화는 별도로 승인받았으며 원본 파일과 Approval-Digest는 바꾸지 않았다. 승인된 초안의 지원 범위와 검증 한계만 수집했다.

## adapter-hplace

> Payload: [Hplace 공통 어댑터](documents/adapter-hplace.md)
> Supersedes: None

## adapter-field-inventory

> Payload: [Hplace 127키와 사이트 전용 항목 현황](documents/adapter-field-inventory.md)
> Supersedes: [CF-169 근거](../CF-169/documents/adapter-field-inventory.md)

## adapter-development

> Payload: [Hplace 공통 실행 정책과 배포 경계](documents/adapter-development.md)
> Supersedes: [CF-94 근거](../CF-94/documents/adapter-development.md)
