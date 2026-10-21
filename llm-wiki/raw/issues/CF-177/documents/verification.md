# Hplace 단계별 검증과 미실행 범위

> Issue: CF-177
> Collected: 2026-10-19
> Approval-Digest: 5a54ecda82fcd8b70574c9b3b35910433c10db4823ea2ad8b15ef0bd74df4b97
> Source-Revision: c35f229db509ad1fc7d3cc440729a026afb359db

승인된 후보 전체와 문서 초안을 수집한 기록이다. 후보의 기준 구현 revision은 `32ec152`이며, 수집 시 HEAD는 위 Source-Revision이다. 아래 과거 수치와 관측은 해당 시점의 근거이며 이번 수집에서 재실행한 결과가 아니다. 실제 지원 값·계정·세션·대화 전문은 포함하지 않는다.

### K10. develop 통합과 fixture 발견 범위

이전 merge7f905e5는 develop3daae64의 quality/browser mode 회귀와 Hplace Optional observer/provider 호환을 보존했다. unavailable/mismatch는 greeting=false로 관측하고 값은 로컬에 남긴다. DOM metadata JSON이 프로필 fixture glob에 섞인 6실패는 profile-export*.json로 범위를 좁혀 기존15프로필/41테스트를 보존하는 방식으로 수정했다. 이후 Task C는 develop 실행 정책 엔진과 Hplace 보호를 다시 통합했다. 테스트 discovery 수정과 제품 스키마 변경을 혼동하지 않는다.

근거: checkpoint[10]; task-C-report.md.

### K13. 요구사항 완료와 단계 완료를 구분

checkpoint implementation completed는 등록/기본정보 단계였으며 Issue 전체 완료가 아니었다. 현재 Issue AC는 전범주 대조·검증된 필드 연결·미지원 이유·독립 회귀·최신 품질/설치 평가·승인된 문서를 요구한다. 과거 계획의 미완 체크박스와 최신 코드/보고서를 구분하고 최신 사실은 HEAD와 P4 보고서를 따른다.

근거: plan.md; audit-A-scope.md; Issue177.

### K36. 등록 제출 제어의 거짓양성 수정

develop 병합 뒤 동일 name 중복과 숨김 제출 전화 제어 보호를 RED34→GREEN73으로 고정했다. 제출 가능한 의미 제어와 비제출 제어를 구분해 hidden 값을 놓치거나 정상 반례를 중복으로 오인하지 않는다. 테스트41개 중34개는 기존 결함,7개는 경계 회귀다. 공통 실행 정책·quality/browser mode 통합과 기존 다른 회사 회귀를 함께 검증했다.

근거: task-C-report.md; registration/write/workflow regressions.

### K37. 독립 리뷰의 발견과 수정 이력

P1 리뷰의 v3/legacy 보호·프로필 라벨·연봉단위·엔티티 배정 문제를 P2에서, P2의 실제 wrapSubject/span·저장시험·고교기본값·등록host 경로·query/배정 문제를 P3에서 보완했다. P3의 확인창 cleanup·전역 pointer·undefined legacyName·supplier 경로·구클라이언트·시도 표기를 P4에서 보완했다. 이전 지적을 현재 미해결로 복사하지 않되 maxLimit/학교 지역 신원/설치평가 같은 남은 한계를 숨기지 않는다.

근거: review-P1/P2/P3.md; task-P2/P3/P4 reports.

### K38. 단계별 자동검증과 미실행 검증

Task C FE4042/BE841, P1 FE4095/BE856, P2 최종FE4255/BE865, P3 최종FE4339/BE870, P4 최종FE4432/BE877 통과 기록을 시점별로 보존한다(각 FE skip19, BE skip4). P1 기본하네스 raw base차이 실패는 후속 병합 후 해소됐고 최종 unit400/infra130+skip49/shell9/Wiki·execpolicy 통과다. macOS 제공 환경 기록이며 공식 WSL/Linux 실행, 최신 전체format:check·FE coverage·zip 및 실설치 성공은 이 보고서로 주장하지 않는다. 하네스 coverage86%를 FE coverage로 대체하지 않는다.

근거: task-C/P1/P2/P3/P4-report.md.

### K39. v4와 확장의 호환 배포 순서

새 capability/DERIVED enum으로 구확장은 native 정책 전체를 거부할 수 있다. 구validator 로컬 probe4 assertions는 그 위험을 확인했지만 실제 구확장 브라우저 검증은 아니다. 새 확장 배포→대상 설치/보급 확인→BE v4 정책/DB 활성 포인터 순으로 한 호환 변경을 배포한다. resource enabled와 운영 활성화는 별개이며 이 작업에서 DB/운영 migration·배포를 실행하지 않았다.

근거: task-P4-report.md; P3-old-client-probe.cjs.

### K40. 증거 승격·문서 승인·후속 경계

후보 전체의 정확한 digest 승인을 받은 뒤에만 CF-177 불변 raw bundle과 topic을 작성한다. 기존 raw는 수정/삭제/rename하지 않고 대화·지원자값·계정·세션을 저장하지 않는다. 승인된 수집 절차의 비식별 실제 DOM snapshot, 최신 설치 확장의 검색/주소/linkedForm/재실행, 공식 검증·독립 최종 리뷰·PR 게시와 사람 머지는 별도 남은 단계다.

근거: AGENTS.md; cf-karpathy-llm-wiki; task-P4-report.md.
