# CF-479 승인 후보 스냅샷

> Issue: [CF-479](https://github.com/woowacourse-teams/2026-career-form/issues/479)
> Collected: 2026-11-18
> Approval-Digest: 19cb50157f3f038d01ca9b60eda98210dd0cde6a6a45a6527355f5a539945986

worktree 체크포인트에 기록한 후보 두 개의 원문이다. 사람이 2026-11-18 "승인"으로 확정했다.

1. 프로필 가져오기 출처를 이력서 파일 하나로 축소(CF-479, 사람 결정 2026-11-18): Greeting 지원서 화면에서 프로필을 읽어 오는 기능을 제거했다. 지원서 화면 가져오기 화면(PageImport), Greeting 필드 경로표, 가져오기 정책 준비, 패널의 가져오기 제안 노출, 조사용 probe 파일을 삭제했다. 이력서 가져오기가 함께 쓰는 검토·병합 모듈(ImportCategoryList, ImportConfirmCards, ImportSummary, ImportTargetChoices, NameSplitEditor, merge, review-model, review-fields, review-selection)과 두 스타일 파일은 page-import 폴더에 남겼고, ImportCandidate 타입은 reader.ts에서 import-candidate.ts로 옮겼다. Greeting 지원서 자동 기입, 서버 Greeting 정책, 온보딩 자동 기입 장면의 예시 지원서(GreetingPage)는 바꾸지 않았다.
2. 사용 통계와 온보딩 변경(CF-479): 이벤트 greeting_import_offered, greeting_import_viewed, greeting_import_saved를 제거했다. 기존 대시보드의 해당 지표는 끊긴다. 온보딩은 Greeting 가져오기 안내 단계를 없애 이름, 이메일, 직무 선택, 알림 안내, 사용법의 5단계가 됐고 onboarding_completed는 알림 안내에서 사용법으로 넘어갈 때 기록된다. 저장된 진행 위치가 제거된 단계(greeting)면 다음 단계(usage)로 읽는다(steps.ts의 RETIRED_STEPS). 그 사용자는 다음을 누르지 않았으므로 완료 이벤트가 기록되지 않는다. 단계를 없앨 때는 저장 위치 값을 지우지 말고 이 표에 다음 단계를 등록한다.
