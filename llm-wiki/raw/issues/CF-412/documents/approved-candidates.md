# CF-412 approved candidates (2026-11-05, [FE] 범용 결과 화면 확인 필요 분류 정리와 후속 결함 수정)

1. 민감 항목 정책: #212 결정에 따라 병역·보훈·장애·건강도 일반 항목처럼 자동 기입하고 개별 승인을 받지 않는다(2026-10-17 사용자 확인). topic generic-autonomous-structural-actions와 live-autofill-evaluation의 어긋난 문장을 고친다. cf-live-autofill-evaluation 스킬 문구는 harness-change 별도 대상이다.
2. 범용 결과 분류: 확인 필요에는 프로필 값이 있는 칸만 둔다. 값이 없는 칸은 등급과 상관없이 회색 묶음으로 보낸다(프로필 항목 연결 없음=프로필에 없는 항목, 연결됐지만 값 없음=프로필 미입력). 빨간 테두리는 범용에서 확인 필요 칸에만 그린다(#389 '모두 빨강' 결정 변경). 필수 칸은 따로 표시하지 않는다. 정적 경로는 바뀌지 않는다.
3. 범용 수집 제외 규칙: 페이지 수준 contentinfo 랜드마크(role=contentinfo 또는 article·aside·main·nav·section 조상이 없는 footer) 안에 있으면서 form 밖에 있는 입력칸은 지원서 칸으로 세지 않는다.
4. health 구역 분류: 범용 health 키를 NONE 구역으로 두어 범용 매핑에서 빼는 정책을 유지한다(2026-11-05 사용자 결정). 지원하려면 단위와 값 형식 계약이 필요하므로 별도 Issue로 다룬다.

승인: 2026-11-05 사람이 worktree 체크포인트의 후보 digest eba6ba6cbb48683b950a554a698c63bb45e0c56442e5f1e0245e3e858f486e6e로 승인했다("승인").
