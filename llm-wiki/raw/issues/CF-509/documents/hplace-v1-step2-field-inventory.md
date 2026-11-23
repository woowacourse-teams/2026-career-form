# 에이치닷 v1 지원자 앱 2단계 필드 현황

> Issue: [CF-509](https://github.com/woowacourse-teams/2026-career-form/issues/509)
> Collected: 2026-11-22
> Approval-Digest: 5aa8c3891a0d21c833494450fe4c1e031872258b1879e531acc3643c45418c7d
> Source-Revision: aaa814f

[승인 후보 스냅샷](approved-candidates.md)의 후보 1의 칸, 후보 3의 전송 이름, 후보 4의 정책, 후보 5의 검색 확정과 첨부 항목 추가를 필드 표로 적는다. v1 1단계, 다른 회사와 MRS2의 현황은 Supersedes가 가리키는 CF-507 근거와 그 이전 근거를 그대로 따른다. 구조와 실행 순서의 설명은 [2단계 근거](hplace-v1-step2.md)에 있다.

`구현`은 로컬 정책과 프론트 실행 경로가 있다는 뜻이다. 정책 키는 `hplace.v1.<group>.<i>.<field>`이고 아래 표는 `<field>`만 적는다. 대응표는 `프로필 값→화면 글자`이며 "MRS2 대응표"는 `hplace-mrs2-v4.json`의 같은 항목 규칙을 그대로 쓴다는 뜻이다. 화면 선택지에 대응하는 글자가 없으면 `OPTION_UNMATCHED`로 그 칸만 제외한다.

## 고등학교 (`highschool`, i=0)

| 정책 키 | 프로필 키 | 정책 | 화면 위젯과 조건 |
| --- | --- | --- | --- |
| `graduationTypeCode` | `education.highSchool.completionStatus` | CONDITIONAL | 버튼 묶음. MRS2 대응표(재학중→재학). 화면에 수료가 없다 |
| `academyName` | `education.highSchool.schoolName` | CONDITIONAL | 검색 칸, 먼저 실행하는 드라이버. 정확히 일치하는 줄이 하나일 때만 선택 |
| `locationCode` | `education.highSchool.schoolRegion` | CONDITIONAL | 드롭다운. 국내 17개 시도의 코드와 이름을 화면 이름으로 대응. 해외는 대응 없음 |
| `dayOrNight` | `education.highSchool.attendanceType` | CONDITIONAL | 버튼 묶음. 주간/야간 표준 코드를 화면 글자로 대응 |
| `entranceDate` | `education.highSchool.startDate` | ALLOWED | 날짜. 연.월.일 전체, 미래 불가 |
| `graduationDate` | `education.highSchool.endDate` | ALLOWED | 날짜. 연.월.일 전체. 미래 날짜는 졸업예정일 때만 |

- 고등학교 카드는 1장이다. 프로필 고교 항목이 대입 검정고시면 카드를 추가하지 않는다.

## 대학교 (`college`, i=0~9)와 대학원 (`graduateSchool`, i=0~9)

프로필 키 앞부분은 대학교 `education.university.`, 대학원 `education.graduateSchool.`이다.

| 정책 키 | 프로필 키 | 정책 | 화면 위젯과 조건 |
| --- | --- | --- | --- |
| `degreeTypeCode` | `degreeLevel` | CONDITIONAL | 버튼 묶음. 대학교 학사·전문학사, 대학원 석사·박사만 같은 이름으로 대응 |
| `academyName` | `schoolName` | CONDITIONAL | 검색 칸, 먼저 실행하는 드라이버. 정확히 일치하는 줄이 하나일 때만 선택 |
| `entranceDate` | `startDate` | ALLOWED | 날짜. 연.월.일 전체, 미래 불가 |
| `graduationDate` | `endDate` | ALLOWED | 날짜. 연.월.일 전체. 미래 날짜는 졸업예정일 때만 |
| `graduationTypeCode` | `completionStatus` | CONDITIONAL | 버튼 묶음. MRS2 대응표(재학중→재학) |
| `entranceTypeCode` | 대학교 `transferStatus`, 대학원 `admissionType` | CONDITIONAL | 버튼 묶음 입학/편입. 대학교는 MRS2 대응표(비해당→입학, 해당→편입), 대학원은 같은 이름 |
| `score` | `gpaScore` | ALLOWED | 숫자 칸. 만점기준 이하만. 만점기준과 둘 다 써질 때만 남김 |
| `perfectScore` | `gpaScale` | CONDITIONAL | 드롭다운. MRS2 대응표(소수 둘째 자리 표기도 대응). 평점과 쌍 |
| `major0.majorName` | `majorName` | CONDITIONAL | 전공 줄 1개를 추가한 뒤의 검색 칸, 먼저 실행하는 드라이버. 정확히 일치하는 줄이 하나일 때만 선택 |

## 직장경력 (`career`, i=0~9)

프로필 키 앞부분은 `careers.career.`이다.

| 정책 키 | 프로필 키 | 정책 | 화면 위젯과 조건 |
| --- | --- | --- | --- |
| `employmentType` | `employmentType` | ALLOWED | 드롭다운. MRS2 대응표(정규→정규직, 계약→계약직, 파견→파견직, 나머지는 같은 이름) |
| `workingStatus` | `employmentStatus` | ALLOWED | 버튼 묶음 재직중/퇴사(퇴직→퇴사). 먼저 실행하는 드라이버 |
| `entranceDate` | `startDate` | ALLOWED | 날짜. 연.월.일 전체, 미래 불가 |
| `leavingDate` | `endDate` | ALLOWED | 날짜. 퇴사를 고른 뒤 열리며 다음 분석에서 기입. 잠긴 동안 보내지 않음 |
| `company` | `companyName` | CONDITIONAL | 자유 입력. 추천 목록은 고르지 않고 닫음 |
| `department` | `department` | ALLOWED | 글자 칸 |
| `position` | `position` | ALLOWED | 글자 칸 |
| `assignedTask` | `responsibilities` | ALLOWED | 글자 칸. 최대 길이를 넘으면 실패 |

## 추가 동작

| 동작 이름 | 조건 |
| --- | --- |
| `hplace.v1.{highschool,college,graduateSchool,career}.add` | 프로필 항목 수 − 이미 있는 카드 수만큼. 클릭마다 1장 증가와 앞 카드 불변 확인 |
| `hplace.v1.{college,graduateSchool}.<i>.major.add` | 짝인 항목에 전공명이 있고 카드에 전공 줄이 없을 때 1줄 |
| `hplace.v1.careerDescription.add` | 프로필에 `resume` 종류 파일이나 링크가 있고 경력기술서 행에 항목이 없을 때 1번 |
| `hplace.v1.portfolio.add` | 프로필에 `portfolio` 종류 파일이나 링크가 있고 포트폴리오 행에 항목이 없을 때 1번 |

- 검색 칸은 정확히 일치하는 줄이 없고 목록에 친 이름의 `등록하기` 줄 하나만 있으면 그 줄을 한 번 누른다(사용자 결정 2026-11-22). 전공은 등록 뒤 다시 그려진 하위 줄의 선택 표시 하나로 확인한다.
- 경력기술서·포트폴리오 항목의 파일과 URL은 공용 첨부 구역이 어댑터 힌트로 처리한다. 경력기술서는 프로필의 이력서·경력기술서 문서를 쓴다.

## 다루지 않는 v1 2단계 칸

| 화면 칸 | 분류 | 이유 |
| --- | --- | --- |
| 졸업증명서 첨부 | 범위 제외 | 사용자 결정(2026-11-21)으로 첨부 제외 |
| 고등학교 계열, 대학교 학과계열 | 프로필 키 없음 | 대응하는 프로필 값이 없다. MRS2도 다른 값으로 대신하지 않는다 |
| 본교/분교 | 프로필 키 없음 | 대응하는 프로필 값이 없다. 기본 선택 본교를 바꾸지 않는다 |
| 재학기간 옆 기간 버튼 | 범위 제외 | 의미가 확인되지 않았다 |
| 이수학점 | 의미 불일치 | 화면 칸은 전공 학점이고 프로필은 총 학점이다 |
| 전공 평점·석차·전체인원 | 프로필 키 없음 | 대응 값이 없고 잠겨 있다 |
| 두 번째 이후 전공 | 후속 후보 | 복수전공·부전공의 구분 컨트롤을 확인하지 않았다 |
| 대학교·대학원 소재지 | 사이트가 정함 | 학교 선택 뒤 사이트가 정한다. 쓰지 않는다 |
| 카드 머리 아이콘(이동, 삭제), 선택 표시의 지우기 | 금지 | 사이트 상태를 바꾸며 확장이 되돌리지 않는다 |

v1 3단계 이후와 JOBDA·채용 빌더는 구조 미확인이며 미지원 안내를 유지한다.
