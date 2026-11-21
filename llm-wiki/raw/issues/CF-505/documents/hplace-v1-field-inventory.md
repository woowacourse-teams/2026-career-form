# 에이치닷 v1 지원자 앱 1단계 필드 현황

> Issue: [CF-505](https://github.com/woowacourse-teams/2026-career-form/issues/505)
> Collected: 2026-11-21
> Approval-Digest: 7036bd66de1e2c36d356b4a4084f8db93503281327322fad00b94f87deb3661b
> Source-Revision: 75cd91b

[승인 후보 스냅샷](approved-candidates.md)의 후보 1과 3을 필드 표로 적는다. 다른 회사와 MRS2의 현황은 Supersedes가 가리키는 CF-368 근거와 그 이전 근거를 그대로 따른다. 구조와 정책의 설명은 [v1 1단계 근거](hplace-v1-step1.md)에 있다.

`구현`은 로컬 정책과 프론트 실행 경로가 있다는 뜻이다. 실화면은 v1 테넌트 1곳에서 확인했다.

| 프로필 키 | 상태 / 정책 키 | 화면 위젯과 조건 |
| --- | --- | --- |
| `personal.personal.englishFamilyName`, `englishGivenName` — 영문 성·이름 | 구현 / `hplace.v1.englishName.familyFirst` | 단일 텍스트 칸. 안내 문구가 없어 성 이름 순서 |
| `personal.personal.birthDate` — 생년월일 | 구현 / `hplace.v1.birthday` | 이름 없는 날짜 텍스트, `YYYY.MM.DD` |
| `personal.personal.gender` — 성별 | 구현 / `hplace.v1.gender` | native 라디오, label 클릭 |
| `contact.contact.emergencyPhoneNumber` — 비상연락처 | 구현 / `hplace.v1.emergencyPhone` | 텍스트. 실화면 기입은 미확인(프로필 값 없음 추정) |
| `military.military.militaryStatus` — 병역 상태 | 구현 / `hplace.v1.militaryStatus` | 버튼 묶음 5개, stage 1 driver |
| `military.military.serviceStartDate`, `serviceEndDate` — 복무 시작·종료일 | 구현 / `hplace.v1.serviceStartDate`, `serviceEndDate` | 이름 없는 날짜 텍스트. 상태가 연 뒤에만. 화면이 월 정밀도로 바꾼다 |
| `military.military.militarySpecialty` — 병과 | 구현 / `hplace.v1.militarySpecialty` | 텍스트. 상태가 연 뒤에만 |
| `military.military.militaryRank` — 계급 | 구현 / `hplace.v1.militaryRank` | 드롭다운. 상태가 연 뒤에만 |
| `military.military.dischargeType` — 전역구분 | 구현 / `hplace.v1.dischargeType` | 드롭다운. 상태가 연 뒤에만 |
| `military.military.militaryBranch` — 군별 | 구현 / `hplace.v1.militaryBranch` | 드롭다운. 프로필 라벨과 화면 글자 대응표 사용 |
| `disability.disability.disabilityStatus` — 장애 여부 | 구현 / `hplace.v1.disabilityStatus` | 버튼 묶음 2개, stage 1 driver |
| `disability.disability.disabilityRegistrationNumber` — 장애등록번호 | 구현 / `hplace.v1.disabilityRegistrationNumber` | 텍스트. 대상일 때만 |
| `disability.disability.disabilityGrade` — 장애 정도 | 구현 / `hplace.v1.disabilityGrade` | 드롭다운. 대상일 때만 |
| `disability.disability.disabilityType` — 장애 유형 | 구현 / `hplace.v1.disabilityType` | 드롭다운. 대상일 때만. v1 목록에 없는 유형은 `OPTION_UNMATCHED` |
| `veteran.veteran.veteranStatus` — 보훈 대상 여부 | 구현 / `hplace.v1.veteranStatus` | 버튼 묶음 2개, stage 1 driver |
| `veteran.veteran.veteranNumber` — 보훈번호 | 구현 / `hplace.v1.veteranNumber` | 텍스트. 대상일 때만 |
| `veteran.veteran.veteranRelation` — 보훈 대상자와의 관계 | 구현 / `hplace.v1.veteranRelation` | 드롭다운 11개 항목. 대상일 때만 |
| `personal.personal.nationality` — 국적 | 구현 / `hplace.v1.nationality` | 드롭다운. 대한민국만 대응 |

다루지 않는 v1 1단계 칸:

| 화면 칸 | 분류 | 이유 |
| --- | --- | --- |
| 이름, 휴대전화, 이메일 | 사용자 처리 | 사이트가 채운 읽기 전용 칸 |
| 사진 | 사용자 처리(파일) | 파일 입력 |
| 지원 분야 묶음, 지원경로, 비상연락처 관계, 복무 기간, 편의 제공 여부, 보훈비율, 취미 | 프로필 키 없음 | 대응하는 프로필 값이 없다 |
| 현주소 3칸 | 후속 후보 | 우편번호 검색 모달이 필요하다 |
| 병역구분, 면제·비대상 사유, 장애 등록일, 보훈구분 | 지정 화면 부재 | v1 1단계에 칸이 없다 |

v1 2단계 이후와 JOBDA·채용 빌더는 구조 미확인이며 미지원 안내를 유지한다.
