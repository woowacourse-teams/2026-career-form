# Hplace와 Greeting의 별도 후속 후보

> Issue: CF-177
> Collected: 2026-10-19
> Approval-Digest: 5a54ecda82fcd8b70574c9b3b35910433c10db4823ea2ad8b15ef0bd74df4b97
> Source-Revision: c35f229db509ad1fc7d3cc440729a026afb359db

승인된 후보 전체와 문서 초안을 수집한 기록이다. 후보의 기준 구현 revision은 `32ec152`이며, 수집 시 HEAD는 위 Source-Revision이다. 아래 과거 수치와 관측은 해당 시점의 근거이며 이번 수집에서 재실행한 결과가 아니다. 실제 지원 값·계정·세션·대화 전문은 포함하지 않는다.

### K08. Greeting 반복 분석의 별도 후속 후보

과거 코드에서 같은 단계 driver를 slice(0,1)로 하나씩 처리한 뒤 수집/fields를 재호출해 driver20개가 초기1+20 요청으로 늘 수 있는 구조를 확인했다. 특정 사이트 네트워크 실증과 HTTP 자동 retry가 확인된 것은 아니다. DOM 재연결과 의미 매핑 분리 및 구조 변경 때만 재분석하는 개선은 Greeting 별도 Issue 후보이고 CF-177에 재설계를 섞지 않는다.

근거: checkpoint[8]; 기존 workflow 분석 기록.

### K14. 공급자 라우팅과 legacy/native 공존 결정

기존 전용 등록/기본정보 FE 코드는 유지하고 새 범주만 DB 실행 정책+공통 실행기로 연결한다. 회사 정책 우선 후 공급자 exact path로 공유 snapshot을 읽고 FE hint·라우팅 토큰·사용자 서버 상태는 만들지 않는다. 등록된 타사 host의 비대상 path는 기존 GENERIC, Hplace supplier host는 차단하며 반환 문서 host도 검증한다. 전용 코드 전면 이관은 별도 후보다.

근거: design D1/D10; HplaceApplicantSite.java; task-P4-report.md.

### K22. 단일 고교 기본값·없음의 처리

140도 기존 엔티티 보존을 적용한다. 기본 빈 코드의 작성안함 radio는 정확 라벨·단일 엔티티·현재 프로필 배정 receipt가 있을 때만 바꾼다. 사용자 의도적 작성안함과 기본값을 DOM만으로 구분하지 못하는 한계가 있으며 승인 단계가 남는다. 고교 프로필0건은 프로필 항목 없음으로 설명하고 학교 기존값을 보충하지 않는다.

근거: task-P2/P3 reports; native-form-write.ts.

### K23. D4 committed 검색과 정체성 한계

같은 위젯/행의 query·Name·Code·display·결과 소유를 결합한다. 제한된 legacyEnter keypress13, 새 정확 title1개·nonzero code·metadata, 최종 tuple readback을 요구한다. 학교 결과에 지역이 없으므로 selected catalog requiredDetail은 수동이며 기존 자유 텍스트 정확 title 계약을 지역 증명으로 확대하지 않는다. 실패 시 소유 query만 조건부 복원하고 등록버튼/결과목록 삭제/text 우회는 하지 않는다.

근거: committed-search.ts; native-form-search-dom.ts; task-P2/P3 reports.

### K32. ADD·재색인·tenant 한도 관측

일반 add는 마지막 행 내부, 대학 addCollege는 section 소유, 전공 add는 해당 학교 내부다. 일부 행에는 data-index가 없어 name/순서/전체집합으로 검증한다. 외부 삭제는 뒤 행을 재색인하므로 stale 신원을 중단한다. 수집0행에서 ADD하지 않고 내부 maxLimitCount는 DOM 노출 근거가 없어 추정하지 않는다. 실패 후 한도/추가 조건 수동 안내를 남기며 remove/reset/existYn=false를 실행하지 않는다.

근거: live-dom/repeat-rows.md; task-P3-report.md.

### K35. D11 새 프로필 범주와 required 미충족

수상·해외경험·컴퓨터활용·교육이수·활동·봉사·지원경로/분야·입사가능일·작문/독해·NCS 등은 대응 키 없음으로 남긴다. required라도 회화수준·프로젝트·다른 날짜/학점으로 대체하지 않는다. 건강/논문/특허/대학원 연구 필드는 공개 후보와 실제 소유 계약을 구분하고 v1/JOBDA는 인증 이후 구조 미확인 상태를 유지한다.

근거: v4 unsupportedSections; live-dom/step3-language-license.md.

### K40. 증거 승격·문서 승인·후속 경계

후보 전체의 정확한 digest 승인을 받은 뒤에만 CF-177 불변 raw bundle과 topic을 작성한다. 기존 raw는 수정/삭제/rename하지 않고 대화·지원자값·계정·세션을 저장하지 않는다. 승인된 수집 절차의 비식별 실제 DOM snapshot, 최신 설치 확장의 검색/주소/linkedForm/재실행, 공식 검증·독립 최종 리뷰·PR 게시와 사람 머지는 별도 남은 단계다.

근거: AGENTS.md; cf-karpathy-llm-wiki; task-P4-report.md.
