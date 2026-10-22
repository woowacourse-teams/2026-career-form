# CF-310 Knowledge Bundle

> Issue: CF-310
> Collected: 2026-10-21
> Approval-Digest: 613b4acd5fd87f8d2186b4ac401715fbed539b93eea1421f11163fb5591ee258
> Approval-Response: 지식 후보 5개 모두 승인합니다.
> Approval-Date: 2026-10-21
> Source-Revision: 149b350a7ed85aefcb65448f816c6901d30f2b12
> Collected-2: 2026-10-22
> Approval-Digest-2: 6e367ec4018bfd976fab32c98e94b94d35cfc59d33de0747f61917e65736919f
> Approval-Response-2: Wiki 지식 후보 5개 모두 승인합니다. CF-310 raw와 topic Wiki에 반영해 같은 PR에 올려 주세요.
> Approval-Date-2: 2026-10-22
> Source-Revision-2: 733c097092f54154e8be5e91bb4b10863b75c193
> Collected-3: 2026-10-22
> Approval-Digest-3: 9fd9bbce11f926e2cc6027742160d7265ecdcdc034a816df189c47238a86477c
> Approval-Response-3: 수정 작업에서 나온 Wiki 지식 후보 5개를 모두 승인합니다. CF-310 raw와 topic Wiki에 반영해 같은 PR에 올려 주세요.
> Approval-Date-3: 2026-10-22
> Source-Revision-3: c5d703f411b7220829268ddf260a289e6cf48814

승인 digest는 사람이 위 응답으로 승인한 [후보 다섯 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. 네 payload는 각 topic의 앞선 근거를 보강하는 새 운영 지식이며, 바꾸지 않은 내용은 Supersedes가 가리키는 문서를 따른다. 후보 2의 12–43바이트는 본문 크기를 바이트로 기록한 두 지원서(kakaogames·kurly)의 범위이고, 글자 수로 기록한 다른 실행은 바이트 범위의 근거가 아니다. 각 payload의 승인 후보 절은 어미만 한다체로 바꿔 옮겼다.

2026-10-22에는 하네스로 열린 탭 16개 전부를 측정한 뒤 두 번째 후보 다섯 개를 승인받았다. Approval-Digest-2는 [두 번째 승인 후보 스냅샷](documents/approved-candidates-2.md) 전체 UTF-8 바이트의 SHA-256이고, 세 payload(adapter-sk, adapter-hplace, live-autofill-evaluation)는 각각 후보 1, 후보 2·4, 후보 3·5를 담는다. 같은 topic의 앞선 CF-310 payload는 이 payload가 대체하며 바꾸지 않은 내용은 그대로 따른다.

2026-10-22 결함 수정 뒤 세 번째 후보 다섯 개를 승인받았다. Approval-Digest-3는 [세 번째 승인 후보 스냅샷](documents/approved-candidates-3.md) 전체 UTF-8 바이트의 SHA-256이고, 다섯 payload(adapter-sk, adapter-greeting, adapter-hplace, adapter-hyundai, live-autofill-evaluation)는 각각 후보 2와 1의 SK 부분, 후보 1의 Greeting 부분, 후보 3, 후보 4, 후보 5를 담는다. 같은 topic의 앞선 payload는 새 payload가 대체한다.

## adapter-hplace

> Payload: [에이치닷 MRS2 지원서의 저장·조회·무저장 이동 요청](documents/hplace-mrs2-requests.md)
> Supersedes: [CF-177 후속 보완 묶음](../CF-177/documents/live-followup-bundle.md)

## adapter-greeting

> Payload: [Greeting 학교·전공 검색의 서버 액션 요청](documents/greeting-search-server-action.md)
> Supersedes: [CF-168 어학 수준 선택지 불일치의 필드 단위 보류](../CF-168/documents/adapter-greeting.md)

## adapter-hyundai

> Payload: [현대자동차 지원서의 Map·Set 재정의](documents/hyundai-map-set-override.md)
> Supersedes: [CF-169 어학 상태 드라이버 실패의 행 단위 격리](../CF-169/documents/adapter-hyundai.md)

## live-autofill-evaluation

> Payload: [실사이트 평가 브라우저의 원복과 대화상자 함정](documents/live-browser-pitfalls.md)
> Supersedes: [CF-173 평가 계약 1.1](../CF-173/documents/evaluation-contract-1.1.md)

## adapter-sk

> Payload: [SK R262309형 고교 행 구조와 후속 추가 버튼 재식별 실패](documents/sk-highschool-row-reidentification.md)
> Supersedes: [CF-169 어학 상태 드라이버 실패의 행 단위 격리](../CF-169/documents/adapter-sk.md)

## adapter-hplace

> Payload: [에이치닷 4단계 분석 예외와 결과 패널 집계](documents/hplace-step4-analyze-and-panel.md)
> Supersedes: [CF-310 요청 구조](documents/hplace-mrs2-requests.md)

## live-autofill-evaluation

> Payload: [실사이트 QA 하네스의 원복 재키 대조와 표시 규칙의 한계](documents/live-harness-residue-and-display.md)
> Supersedes: [CF-310 원복·대화상자](documents/live-browser-pitfalls.md)

## adapter-sk

> Payload: [SK v38: 재학 상태 select 기준 고교 행 재식별과 장애구분 별칭](documents/sk-v38-status-reidentification-and-disability-alias.md)
> Supersedes: [CF-310 R262309 고교 행](documents/sk-highschool-row-reidentification.md)

## adapter-greeting

> Payload: [Greeting v18: 장애 정도 optionMap 별칭](documents/greeting-v18-disability-alias.md)
> Supersedes: [CF-310 검색 서버 액션](documents/greeting-search-server-action.md)

## adapter-hplace

> Payload: [수락 필드 0건인 화면의 분석 호출 생략](documents/hplace-empty-step-analysis-skip.md)
> Supersedes: [CF-310 4단계 분석·패널](documents/hplace-step4-analyze-and-panel.md)

## adapter-hyundai

> Payload: [현대 버튼형 선택지의 코드 수집 한계](documents/hyundai-button-select-codes.md)
> Supersedes: [CF-310 Map·Set 재정의](documents/hyundai-map-set-override.md)

## live-autofill-evaluation

> Payload: [확장 재설치 뒤 탭 재진입과 응답 없는 탭의 CDP 차단](documents/live-harness-reinstall-and-hung-tab.md)
> Supersedes: [CF-310 원복 재키·표시 규칙](documents/live-harness-residue-and-display.md)
