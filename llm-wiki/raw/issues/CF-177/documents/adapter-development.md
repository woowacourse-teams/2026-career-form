# Hplace 공통 실행 정책과 어댑터 개발 경계

> Issue: CF-177
> Collected: 2026-10-19
> Approval-Digest: 5a54ecda82fcd8b70574c9b3b35910433c10db4823ea2ad8b15ef0bd74df4b97
> Source-Revision: c35f229db509ad1fc7d3cc440729a026afb359db

승인된 후보 전체와 문서 초안을 수집한 기록이다. 후보의 기준 구현 revision은 `32ec152`이며, 수집 시 HEAD는 위 Source-Revision이다. 아래 과거 수치와 관측은 해당 시점의 근거이며 이번 수집에서 재실행한 결과가 아니다. 실제 지원 값·계정·세션·대화 전문은 포함하지 않는다.

기존 회사 어댑터의 계약은 유지하며 CF-177의 공급자 라우팅과 공통 실행 정책 계약을 추가한다. 대체 전 근거는 manifest의 Supersedes와 topic History에서 추적한다.

### K14. 공급자 라우팅과 legacy/native 공존 결정

기존 전용 등록/기본정보 FE 코드는 유지하고 새 범주만 DB 실행 정책+공통 실행기로 연결한다. 회사 정책 우선 후 공급자 exact path로 공유 snapshot을 읽고 FE hint·라우팅 토큰·사용자 서버 상태는 만들지 않는다. 등록된 타사 host의 비대상 path는 기존 GENERIC, Hplace supplier host는 차단하며 반환 문서 host도 검증한다. 전용 코드 전면 이관은 별도 후보다.

근거: design D1/D10; HplaceApplicantSite.java; task-P4-report.md.

### K15. v3 fallback과 insert-only 저장 경계

v4 문서 부재일 때만 검증된 v3 바인딩을 사용하고 v3는 native 실행 정책 없이 기존 경로로 처리한다. 잘못된 v4·조회 예외는 차단하고 generic/DNS로 우회하지 않는다. seeder는 없는 문서만 insert하며 기존 v3/v4 DB 문서나 활성 포인터를 자동 덮어쓰지 않는다.

근거: task-P2-report.md; MongoHplacePolicyProvider.java; LocalHplaceFormPolicySeeder.java.

### K16. D2/D3의 실제 계약 확장

외곽 preparation/fields schemaVersion2를 유지하면서 DB sectionContracts와 BrowserPolicy v2 nativeForm을 추가했다. 선택적 section·canonical 필드/명령·그룹·연속 rowIndex/count·상한·stage DAG·scoped fields·native radio/select/text settlement·YM/YMD·number/textarea는 새로운 실행 계약이다. 기존 명령 재사용만을 이유로 단순 selector 데이터 추가라고 설명하면 안 된다.

근거: design D2/D3; hplace-mrs2-v4.json.

### K17. 실행 소유·요청 예산·개인정보

legacy/native 후보를 물리 노드별로 조합하고 원래 소유 writer를 끝까지 유지한다. 정책/URL/프로필·노드가 바뀌면 handle을 무효화한다. fields 예산은 run에 저장하고 활성 반복 native section이 있을 때 최대8, 그 밖 native는최대3이며 완료 driver 집합의 진전이 없으면 중단한다. 값·행 identity·프로필 배정은 로컬만, wire에는 구조/고정 표시명만 전달한다.

근거: workflow-analysis.ts; task-P1/P2 reports.

### K19. 정적 코드와 tenant Sn을 구분

언어·지역·학위·주야간 등의 확인된 코드/정확 라벨을 데이터화하고 고용형태·회화수준의 tenant별 Sn은 고정하지 않는다. 정확 허용 라벨로 찾은 현재 양의 코드·옵션 노드를 승인 후에도 고정한다. 고용형태9개와 군별8개 프로필 선택지는 명시 LOOKUP으로 연결한다. unknown/0개/중복/라벨·노드 변경은 수동이며 표준 프로필 계열을 더 세부적인 전공 계열로 추정하지 않는다.

근거: live-dom/*.md; native-form-profile-options.test.ts; v4 policy.

### K20. 연봉 단위는 실제 CSS 소유 근거

희망/직전연봉은 직접 부모 span 또는 label.money의 computed ::after가 정확히 만원이고 million 클래스가 없을 때만 쓴다. .million은 억원이며 숫자 상한이나 label 태그만으로 단위를 추정하지 않는다. 수집·쓰기·최종 확인에서 같은 unit guard를 사용하고 경력별 salary와 latestSalary를 혼용하지 않는다.

근거: live-dom/gs-step1-basic.md; repeat-rows.md; native-form-unit.ts.

### K21. 기존 엔티티 전체 보호와 행 배정

기존 학교/경력/시험 행은 일부 빈칸이 있어도 전체 보호한다. 정확 identityFields와 채워진 대응 상세가 일치하는 프로필만 이미 입력됨으로 소비하고 남은 프로필을 빈 행에 배정한다. 이전 배정을 먼저 예약해 사용자 추가 입력과의 중복을 탐지한다. 불완전·중복·충돌 신원은 섹션 수동이며 index만으로 다른 사람/다른 경력의 값을 섞지 않는다.

근거: native-form-row-assignment.ts; task-P2/P3 reports.

### K22. 단일 고교 기본값·없음의 처리

140도 기존 엔티티 보존을 적용한다. 기본 빈 코드의 작성안함 radio는 정확 라벨·단일 엔티티·현재 프로필 배정 receipt가 있을 때만 바꾼다. 사용자 의도적 작성안함과 기본값을 DOM만으로 구분하지 못하는 한계가 있으며 승인 단계가 남는다. 고교 프로필0건은 프로필 항목 없음으로 설명하고 학교 기존값을 보충하지 않는다.

근거: task-P2/P3 reports; native-form-write.ts.

### K23. D4 committed 검색과 정체성 한계

같은 위젯/행의 query·Name·Code·display·결과 소유를 결합한다. 제한된 legacyEnter keypress13, 새 정확 title1개·nonzero code·metadata, 최종 tuple readback을 요구한다. 학교 결과에 지역이 없으므로 selected catalog requiredDetail은 수동이며 기존 자유 텍스트 정확 title 계약을 지역 증명으로 확대하지 않는다. 실패 시 소유 query만 조건부 복원하고 등록버튼/결과목록 삭제/text 우회는 하지 않는다.

근거: committed-search.ts; native-form-search-dom.ts; task-P2/P3 reports.

### K24. D7 비인증 시험과 placeholder

EXAM_CODE·인증/readonly·불명 metadata를 선택 전에 거부한다. 기본 숨김 ybmValidateDone.hide는 인증 완료가 아니며 languageExamSn만 있는 저장 일반 시험도 인증으로 오인하지 않는다. 인증행은 inert:true 고정 placeholder로 실제 rowCount/index를 보존하고 BE는 항상 NoMatch다. 사용자 값/코드를 placeholder에 싣지 않고 같은 신원은 중복 ADD하지 않는다.

근거: task-P2/P3 reports; native-form-exam.test.ts.

### K25. 시험 detail 재렌더와 성적 의미

시험 선택 후 교체된 DOM·등급 옵션의 정착을 기다리고 새 handle로 재수집한다. grade-only는 정확 코드/라벨, score-only는 허용 정수 범위만 입력한다. both/neither를 한 grade 값으로 추정하지 않고 취득일과 응시일·만점을 분리한다. 직접등록 변형의 연수 조건도 추정하지 않는다. 일반 시험 추가/선택의 사이트 등급조회는 인증/삭제 허용이 아니다.

근거: task-P2-report.md; v4 policy.

### K26. D5 주소 모달의 로컬 확정

주소 모달 저장은 공개 btnEvent상 원래 currentAddress triplet/span으로 복사하는 로컬 확정이므로 지원서 저장과 구분한다. 활성 결과는 postcodify_search_result이며 midas-address-result라는 초기 추정을 정정했다. 주소/우편번호 유일 정확 결과→모달 readback→모달 상세→주소 전용 primary-pointer→동기 소유 HTML confirm→원래 triplet/span 및 닫힘을 확인한다. HTMLElement.click 무반응과 실제 포인터 관측은 synthetic pointer의 설치 수용을 증명하지 않는다.

근거: live-dom/address-modal-finding.md; staged-address.ts.

### K27. 주소 비교·승인·최종 receipt

현주소3값을 묶어 승인하고 시도·시군구·도로·본번호/부번호·우편번호를 대조한다. 17개 시도 약칭만 명시 정규화하며 세종의 시군구 없는 도로명을 허용한다. 지하·미등록 시도·임의 약칭/괄호 제거는 수동이다. 모달 postcode -는 초기 placeholder일 뿐 성공값이 아니다. 원래 hidden/readonly에 직접 쓰지 않고 receipt와 값/URL/정책/노드가 같을 때만 결과 완료로 센다.

근거: staged-address-road.ts; staged-address-receipt.ts; task-P4-report.md.

### K28. 주소 실패 cleanup과 연산 범위 축소

확인창 생성 뒤 실패할 때 상세주소만 비우면 잔류 확인창이 잘못 반영할 수 있다. 실행 click 직후 동기로 캡처한 cancel과 modalClose만 순서대로 사용하고 교체된 노드는 채택하지 않는다. 소유가 불명확하면 창과 staging을 남겨 구체적 수동 사유를 안내하며 원래 주소 rollback은 하지 않는다. ACTIVATE_PRIMARY는 공용 DomPlan에서 제거하고 고정된 주소 descriptor에 한정한다.

근거: review-P3.md; task-P4-report.md; staged-address-activation.ts.

### K29. D6 중첩 전공은 부모와 역할을 함께 식별

대학/대학원 부모와 collegeMajor child의 이름·index·data-rel-target·노드 집합을 함께 검사한다. API items는 평탄 canonical 필드이고 child index는 로컬이다. 빈 부모를 실제 프로필에 배정했을 때만 준비하고 부모별 마지막 보이는 ADD를 눌러 +1/새 빈행/형제 불변을 확인한다. depth2·부모20·전공3 상한, role/name 모순·중복·부모 교체 차단, 재실행 추가0 계약을 유지한다.

근거: native-form-nested.ts; task-P4-report.md.

### K30. D6-a와 추가전공 recipe의 재사용

D6-a 승인으로 UNIVERSITY_MAIN_MAJOR_CLASSIFICATION을 FE/BE DERIVED enum에 추가했다. 해당 행 주전공명이 있어야 주전공을 반환하고 사이트01은 정확 코드/라벨로 선택한다. 기존 additional-major NAME/CLASSIFICATION/FIELD를 대학·대학원에 재사용하며 부전공만 있으면 슬롯1로 압축한다. 유무·이름·계열은 간접 소비되며 주야간은 주전공1행에만 적용한다.

근거: value-binding.ts; university-additional-majors.ts; task-P4-report.md.

### K31. 숫자 GPA 쌍의 완료는 두 값 확인

동일 부모 score number/perfectScore select를 승인 쌍으로 고정하고 0이상·소수3자리 이하·승인 만점 이하 및 DOM min/max/step·linked target·옵션 노드를 재확인한다. score 입력으로 scale이 활성화될 때까지 기다리고 두 값이 맞아야 완료다. PASS/FAIL·displayScore/name/type 변경은 차단하며 majorCredits/majorAverageScore/majorPerfectScore와 총 이수학점/GPA를 혼용하지 않는다.

근거: native-form-gpa.ts; task-P4-report.md.

### K32. ADD·재색인·tenant 한도 관측

일반 add는 마지막 행 내부, 대학 addCollege는 section 소유, 전공 add는 해당 학교 내부다. 일부 행에는 data-index가 없어 name/순서/전체집합으로 검증한다. 외부 삭제는 뒤 행을 재색인하므로 stale 신원을 중단한다. 수집0행에서 ADD하지 않고 내부 maxLimitCount는 DOM 노출 근거가 없어 추정하지 않는다. 실패 후 한도/추가 조건 수동 안내를 남기며 remove/reset/existYn=false를 실행하지 않는다.

근거: live-dom/repeat-rows.md; task-P3-report.md.

### K33. D8 한자 이름 recipe

HANJA_FULL_NAME은 한자 성과 이름을 trim한 뒤 둘 다 있을 때 구분자 없이 결합한다. 국문 recipe 재사용이나 한쪽만 입력은 하지 않는다. 저장 프로필 schema 변경 없이 DERIVED enum을 확장하며 GS 관측과 다른 테넌트 부재를 구분한다.

근거: value-binding.ts; Hplace v4 fieldRules.

### K35. D11 새 프로필 범주와 required 미충족

수상·해외경험·컴퓨터활용·교육이수·활동·봉사·지원경로/분야·입사가능일·작문/독해·NCS 등은 대응 키 없음으로 남긴다. required라도 회화수준·프로젝트·다른 날짜/학점으로 대체하지 않는다. 건강/논문/특허/대학원 연구 필드는 공개 후보와 실제 소유 계약을 구분하고 v1/JOBDA는 인증 이후 구조 미확인 상태를 유지한다.

근거: v4 unsupportedSections; live-dom/step3-language-license.md.

### K39. v4와 확장의 호환 배포 순서

새 capability/DERIVED enum으로 구확장은 native 정책 전체를 거부할 수 있다. 구validator 로컬 probe4 assertions는 그 위험을 확인했지만 실제 구확장 브라우저 검증은 아니다. 새 확장 배포→대상 설치/보급 확인→BE v4 정책/DB 활성 포인터 순으로 한 호환 변경을 배포한다. resource enabled와 운영 활성화는 별개이며 이 작업에서 DB/운영 migration·배포를 실행하지 않았다.

근거: task-P4-report.md; P3-old-client-probe.cjs.
