# DOM 스냅샷 픽스처

실사이트 평가 중 관찰한 실패를 오프라인에서 재현하기 위한 비식별 샘플과 판단 기록이다.
수집 절차는 [정책](../../../harness/policies/dom-snapshot-fixtures.md)을 따른다.
결과는 정제된 범위의 재현 근거이며 실사이트 성공률이나 설치 확장의 동작을 입증하지 않는다.

## 2026-10-12 판단 결과

| 픽스처                                                                         | 판정        | 재현       | 요약                                                                                                                              |
| ------------------------------------------------------------------------------ | ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [sk-careers-application-form](sk-careers-application-form/review.md)           | 조건부 등록 | 해당 없음  | 전체 폼 구조 기준선. 반복 행 종류별 1개 포함, SK 어댑터로 후보 134개(숨김 36개). 특정 실패 재현이 아님                            |
| [lg-ai-research-birth-split-email](lg-ai-research-birth-split-email/review.md) | 조건부 등록 | 재현됨     | 생년월일 label의 for가 없는 id를 가리켜 select 3개에 생년월일 문맥이 없음. 분리 이메일은 막히지 않고 아이디 칸이 이메일 후보가 됨 |
| [kakao-greeting-email](kakao-greeting-email/review.md)                         | 보류        | 재현 안 됨 | 같은 사이트·Greeting 경로에서도 이메일이 written. 원인은 페이지 동작 등 정적 구조 밖으로 추정                                     |
| [naver-panel-loss](naver-panel-loss/review.md)                                 | 수집 중단   | 해당 없음  | 필드 구조가 아니라 패널 생명주기 현상                                                                                             |

LG와 카카오는 초기 규칙(id·name·class와 숨김 상태 제거)으로 만든 샘플을 같은 날 재수집해 교체했다.
초기 판정 "LG 분리 이메일은 의도적 차단", "카카오는 정적 구조에서 정상 입력"은 정제 과정에서 생긴 결과였다.

SK·LG·카카오의 구조 보존 사람 검토는 아직 미실시다.

## 2026-10-20 추가 등록 (CF-177 C12)

| 픽스처 | 판정 | 재현 | 요약 |
| --- | --- | --- | --- |
| [hplace-mrs2-step2-gsenc](hplace-mrs2-step2-gsenc/review.md) | 등록 가능 | builder 대조 | 섹션 140·141·142·16, 컨트롤 97. 텍스트 전부 `[TEXT]` |
| [hplace-mrs2-step2-careerhyundai](hplace-mrs2-step2-careerhyundai/review.md) | 등록 가능 | builder 대조 | 섹션 140·141·142·16, 컨트롤 97. 고교 주야간, YMD 학력 날짜 |
| [hplace-mrs2-step2-abl](hplace-mrs2-step2-abl/review.md) | 등록 가능 | builder 대조 | 섹션 141·142·16(이 tenant는 140 없음), 컨트롤 91. 전공 평점·기여도·경험 기술 |
| [hplace-mrs2-step3-gsenc](hplace-mrs2-step3-gsenc/review.md) | 등록 가능 | 구조 단언 | 섹션 18, 컨트롤 11. 자격증 등록번호 maxlength 64·licenseCode 게이팅 |
| [hplace-mrs2-step3-careerhyundai](hplace-mrs2-step3-careerhyundai/review.md) | 등록 가능 | 구조 단언 | 섹션 18, 컨트롤 33 |
| [hplace-mrs2-step3-abl](hplace-mrs2-step3-abl/review.md) | 등록 가능 | 구조 단언 | 섹션 18, 컨트롤 36 |

사람 개인정보·구조 검토 통과(2026-10-20). 사이트 스크립트·서버 동작은 재현하지 않으며 게이팅이 필요한 테스트는 linkedForm 에뮬레이터를 따로 붙인다.

## 2026-10-18 추가 등록

| 픽스처 | 판정 | 재현 | 요약 |
| --- | --- | --- | --- |
| [ahnlab-write-resume-form](ahnlab-write-resume-form/review.md) | 등록 가능 | 수집 단계 재현 | v4 개인정보·구조 사람 검토 통과. 우편번호 displayName 누락과 메모리상 aria-label 변이를 제품 수집기로 확인. 추가질문은 기권 응답 소비 음성 사례로 보존. 실제 JEV 매칭은 미실행 |

AhnLab v2·v3는 개인정보 잔존으로 철회·삭제됐으며 등록본은 v4다.
정제 HTML은 검증한 SHA-256과 같은 바이트로 등록한다.

## 2026-10-17 판단 결과

| 픽스처 | 판정 | 재현 | 요약 |
| --- | --- | --- | --- |
| [naver-step2-form](naver-step2-form/review.md) | 등록 가능 | 구조 기준선 + 검색 mock | 사람 개인정보·구조 검토 통과. 실제 수집 후보 46개. 폼 밖 검색 표면·서버는 제외하며, 검색 결과 없음 경계만 합성한 integration에서 남은 전체 목록 보류를 확인 |
