# Hplace 어댑터 필드 현황

> Issue: CF-177
> Collected: 2026-10-19
> Approval-Digest: 5a54ecda82fcd8b70574c9b3b35910433c10db4823ea2ad8b15ef0bd74df4b97
> Source-Revision: c35f229db509ad1fc7d3cc440729a026afb359db

승인된 후보 전체와 문서 초안을 수집한 기록이다. 후보의 기준 구현 revision은 `32ec152`이며, 수집 시 HEAD는 위 Source-Revision이다. 아래 과거 수치와 관측은 해당 시점의 근거이며 이번 수집에서 재실행한 결과가 아니다. 실제 지원 값·계정·세션·대화 전문은 포함하지 않는다.

## 현재 상태

아래 프로필 전수표는 **13범주 127키를 각각 한 번** 포함한다. 등록/step1·2·3 범위는 제한 열에서 구분하며 v1/JOBDA 입력은 모든 키에 공통으로 구조 미확인·인증 후 사용자 화면 대기다. `구현`은 활성 로컬 정책과 FE 실행 경로가 있다는 뜻이며 운영 DB 활성화나 최신 설치 확장 성공을 뜻하지 않는다. 모든 신규 v4 항목은 설치 평가 PENDING-live다.

### 산출 방법과 근거

- `frontend/src/profile/field-definitions.ts`의 category/section/field 정의를 추출한다. 최상위 `latestEducationType`은 기존 binding 관례인 `education.university.latestEducationType`으로 한 번 센다. 증빙 위치 2개도 포함한다.
- `backend/src/main/resources/policies/hplace-mrs2-v4.json`의 **75 fieldRules**를 `executionPolicy.browserPolicy.nativeForm.sections[].enabled` 및 `address.enabled`와 결합한다. 9개 일반 section 중 8개 활성/154 project 하나 비활성, 현주소 descriptor는 별도 활성이다. **fieldRule 존재만으로 지원을 판정하지 않는다.**
- `HplaceCompanyFormPolicyFactory.rules()/createNative()`의 legacy 20규칙을 더한다. DERIVED `KOREAN_FULL_NAME`, `HANJA_FULL_NAME`의 양쪽 입력 키와 `university-additional-majors.ts`의 유무·복수/부전공 이름·계열 소비를 펼친다. 간접 소비 키는 별도 쓰기 필드로 세지 않는다.
- FE 근거: `frontend/src/autofill/adapters/hplace/{registration,detail,basic-controls,write,basic-write,detail-write}.ts`, `frontend/src/autofill/policy/native-form-{collection,write,nested,gpa,row-assignment,search-dom}.ts`, `frontend/src/autofill/profile/{value-binding,university-additional-majors,profile-field-key}.ts`, `frontend/src/autofill/policy/staged-address*.ts`. 정책 키는 v4 `structuralName` 또는 legacy rule ID다.
- 미지원 사유는 정책 부재만으로 화면 부재를 추정하지 않고 `mrs2-section-contracts.md`, `live-dom/*.md`, P1–P4 최종 보고서의 관측 범위를 적용한다. `화면 없음 확인`은 지정 테넌트/step에 한정한다. `프로필 키 없음`은 아래 별도 사이트 항목표에만 사용한다.

### 기본 인적사항 (9키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `personal.personal.koreanFamilyName` — 국문 성 | 구현 / 정책 키: `hplace.registration.name` | 등록 화면만; 이름 결합/분할전화/이메일 확인 소유 그룹; 상세 표시값 쓰기 아님 |
| `personal.personal.koreanGivenName` — 국문 이름 | 구현 / 정책 키: `hplace.registration.name` | 등록 화면만; 이름 결합/분할전화/이메일 확인 소유 그룹; 상세 표시값 쓰기 아님 |
| `personal.personal.hanjaFamilyName` — 한자 성 | 구현 / 정책 키: `hplace.mrs2.basic.chineseName` | step1/11; HANJA_FULL_NAME은 성·이름 둘 다 있어야 trim 후 결합; GS 관측, 한국타이어에는 없음 |
| `personal.personal.hanjaGivenName` — 한자 이름 | 구현 / 정책 키: `hplace.mrs2.basic.chineseName` | step1/11; HANJA_FULL_NAME은 성·이름 둘 다 있어야 trim 후 결합; GS 관측, 한국타이어에는 없음 |
| `personal.personal.englishFamilyName` — 영문 성 | 미지원 사유: 의미 불일치 | englishName 단일칸의 성·이름 순서 근거 없음; legacy NO_MATCH |
| `personal.personal.englishGivenName` — 영문 이름 | 미지원 사유: 의미 불일치 | englishName 단일칸의 성·이름 순서 근거 없음; legacy NO_MATCH |
| `personal.personal.gender` — 성별 | 구현 / 정책 키: `hplace.detail.gender` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `personal.personal.birthDate` — 생년월일 | 구현 / 정책 키: `hplace.detail.birthday` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `personal.personal.nationality` — 국적 | 구현 / 정책 키: `hplace.detail.nationality` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |

### 연락처와 주소 (8키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `contact.contact.email` — 이메일주소 | 구현 / 정책 키: `hplace.registration.email` | 등록 화면만; 이름 결합/분할전화/이메일 확인 소유 그룹; 상세 표시값 쓰기 아님 |
| `contact.contact.secondaryEmail` — 보조 이메일 | 미지원 사유: 구조 미확인 | 보조 이메일 전용 필드 계약 없음; 등록 확인란은 같은 이메일의 재입력 |
| `contact.contact.phoneNumber` — 연락처 | 구현 / 정책 키: `hplace.registration.mobile` | 등록 화면만; 이름 결합/분할전화/이메일 확인 소유 그룹; 상세 표시값 쓰기 아님 |
| `contact.contact.emergencyPhoneNumber` — 비상연락처 | 구현 / 정책 키: `hplace.detail.emergencyPhone` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `contact.contact.residenceCountry` — 거주 국가 | 미지원 사유: 구조 미확인 | 거주 국가 제어/정적 매핑 미확인; 국적 또는 주소 국가로 추정 금지 |
| `contact.contact.postalCode` — 우편번호 | 구현 / 정책 키: `hplace.mrs2.currentAddress.zipCode` | step1/13 currentAddress만; 3값 staged 확정/receipt, hidden zip·readonly base 직접 쓰기 없음; 기존 일치 주소의 상세만 legacy 허용 |
| `contact.contact.addressLine1` — 기본주소 | 구현 / 정책 키: `hplace.mrs2.currentAddress.address` | step1/13 currentAddress만; 3값 staged 확정/receipt, hidden zip·readonly base 직접 쓰기 없음; 기존 일치 주소의 상세만 legacy 허용 |
| `contact.contact.addressLine2` — 상세주소 | 구현 / 정책 키: `hplace.mrs2.currentAddress.detailAddress`, `hplace.detail.detailAddress` | step1/13 currentAddress만; 3값 staged 확정/receipt, hidden zip·readonly base 직접 쓰기 없음; 기존 일치 주소의 상세만 legacy 허용 |

### 학력 (54키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `education.highSchool.academicProcess` — 학업과정 | 미지원 사유: 의미 불일치 | 검정고시 학업과정을 graduationTypeCode/고교 계열로 대체하지 않음; 현 정책은 completionStatus만 연결 |
| `education.highSchool.qualificationPassDate` — 합격일자 | 미지원 사유: 의미 불일치 | 검정고시 합격일과 일반 졸업일의 동일 의미 계약 없음 |
| `education.highSchool.schoolName` — 학교명 | 구현 / 정책 키: `hplace.mrs2.highschool.academyName` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.attendanceType` — 주·야간 | 구현 / 정책 키: `hplace.mrs2.highschool.dayOrNight` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.completionStatus` — 재학 상태 | 구현 / 정책 키: `hplace.mrs2.highschool.graduationTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.schoolRegion` — 학교 소재지 | 구현 / 정책 키: `hplace.mrs2.highschool.locationCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.startDate` — 입학일 | 구현 / 정책 키: `hplace.mrs2.highschool.entranceDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.highSchool.endDate` — 졸업일 | 구현 / 정책 키: `hplace.mrs2.highschool.graduationDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.schoolType` — 학교 유형 | 미지원 사유: 의미 불일치 | 전문대학/대학교와 degreeLevel(전문학사/학사)은 별도 키; 학위 키만 연결 |
| `education.university.degreeLevel` — 학위구분 | 구현 / 정책 키: `hplace.mrs2.college.degreeTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.schoolName` — 학교명 | 구현 / 정책 키: `hplace.mrs2.college.academyName` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.attendanceType` — 주·야간 | 구현 / 정책 키: `hplace.mrs2.college.major0.dayOrNight` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증; 주전공 한 행에만 연결 |
| `education.university.startDate` — 입학일 | 구현 / 정책 키: `hplace.mrs2.college.entranceDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.endDate` — 졸업일 | 구현 / 정책 키: `hplace.mrs2.college.graduationDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.completionStatus` — 재학 상태 | 구현 / 정책 키: `hplace.mrs2.college.graduationTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.schoolRegion` — 학교 소재지 | 구현 / 정책 키: `hplace.mrs2.college.locationCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.gpaScore` — 평점 | 구현 / 정책 키: `hplace.mrs2.college.score` | step2; 동일 학교 숫자 GPA pair, score→scale 활성/정확 옵션/두 값 최종 확인; PASS/FAIL 제외 |
| `education.university.gpaScale` — 기준평점 | 구현 / 정책 키: `hplace.mrs2.college.perfectScore` | step2; 동일 학교 숫자 GPA pair, score→scale 활성/정확 옵션/두 값 최종 확인; PASS/FAIL 제외 |
| `education.university.totalCredits` — 총 이수학점 | 미지원 사유: 의미 불일치 | 한국타이어 majorCredits는 전공 이수학점; 총 이수학점으로 대체 금지 |
| `education.university.majorField` — 주전공 계열 | 구현 / 정책 키: `hplace.mrs2.college.major0.majorCategoryCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.university.majorName` — 주전공명 | 구현 / 정책 키: `hplace.mrs2.college.major0.majorName`, `hplace.mrs2.college.major0.majorTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.transferStatus` — 편입유무 | 구현 / 정책 키: `hplace.mrs2.college.entranceTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.university.doubleMajorStatus` — 복수전공유무 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorName`, `hplace.mrs2.college.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.university.minorStatus` — 부전공유무 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorName`, `hplace.mrs2.college.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.university.additionalMajorField` — 복수전공 계열 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorCategoryCode`, `hplace.mrs2.college.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.university.additionalMajorName` — 복수전공명 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorName`, `hplace.mrs2.college.major1.majorTypeCode`, `hplace.mrs2.college.major1.majorCategoryCode`, `hplace.mrs2.college.major2.majorName`, `hplace.mrs2.college.major2.majorTypeCode`, `hplace.mrs2.college.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.university.minorField` — 부전공 계열 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorCategoryCode`, `hplace.mrs2.college.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.university.minorName` — 부전공명 | 구현 / 정책 키: `hplace.mrs2.college.major1.majorName`, `hplace.mrs2.college.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.degreeLevel` — 학위구분 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.degreeTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.combinedDegreeStatus` — 석박사 통합여부 | 미지원 사유: 의미 불일치 | 확인된 학위 선택지는 석사/박사; 통합학위 선택·변환 없음 |
| `education.graduateSchool.country` — 국가 | 미지원 사유: 의미 불일치 | locationCode 학교 소재지와 국가 프로필을 동일시하지 않음 |
| `education.graduateSchool.schoolName` — 학교명 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.academyName` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.attendanceType` — 주·야간 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major0.dayOrNight` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증; 주전공 한 행에만 연결 |
| `education.graduateSchool.schoolRegion` — 학교 소재지 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.locationCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.startDate` — 입학일 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.entranceDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.endDate` — 졸업일 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.graduationDate` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.admissionType` — 입학구분 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.entranceTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.completionStatus` — 졸업구분 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.graduationTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.gpaScore` — 평점 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.score` | step2; 동일 학교 숫자 GPA pair, score→scale 활성/정확 옵션/두 값 최종 확인; PASS/FAIL 제외 |
| `education.graduateSchool.gpaScale` — 만점기준 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.perfectScore` | step2; 동일 학교 숫자 GPA pair, score→scale 활성/정확 옵션/두 값 최종 확인; PASS/FAIL 제외 |
| `education.graduateSchool.majorField` — 주전공 계열 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major0.majorCategoryCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.graduateSchool.majorName` — 주전공명 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major0.majorName`, `hplace.mrs2.graduateSchool.major0.majorTypeCode` | step2/140·141·142; 기존 학교 전체 보호, 학교 검색 tuple/학위·옵션·YM 기간 검증 |
| `education.graduateSchool.doubleMajorStatus` — 복수전공유무 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorName`, `hplace.mrs2.graduateSchool.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.minorStatus` — 부전공유무 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorName`, `hplace.mrs2.graduateSchool.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.additionalMajorField` — 복수전공 계열 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorCategoryCode`, `hplace.mrs2.graduateSchool.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.graduateSchool.additionalMajorName` — 복수전공명 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorName`, `hplace.mrs2.graduateSchool.major1.majorTypeCode`, `hplace.mrs2.graduateSchool.major1.majorCategoryCode`, `hplace.mrs2.graduateSchool.major2.majorName`, `hplace.mrs2.graduateSchool.major2.majorTypeCode`, `hplace.mrs2.graduateSchool.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.minorField` — 부전공 계열 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorCategoryCode`, `hplace.mrs2.graduateSchool.major2.majorCategoryCode` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존; 세부 계열 정확 일치만(넓은 프로필 계열 대부분 수동, 기타 가능) |
| `education.graduateSchool.minorName` — 부전공명 | 구현 / 정책 키: `hplace.mrs2.graduateSchool.major1.majorName`, `hplace.mrs2.graduateSchool.major2.majorName` | step2; universityAdditionalMajors의 간접 소비/유무 검증·압축 슬롯 1/2; 별도 유무 칸 직접 쓰기 아님; 중첩 부모 보존 |
| `education.graduateSchool.researchField` — 연구분야 | 미지원 사유: 구조 미확인 | 연구분야의 실제 소유 필드와 정적 매핑 미확인 |
| `education.graduateSchool.labName` — LAB실명 | 미지원 사유: 구조 미확인 | lab 실DOM 미관측으로 정책 미활성 |
| `education.graduateSchool.labProfessorName` — LAB 담당교수 성명 | 미지원 사유: 구조 미확인 | academicAdviser 실DOM 미관측으로 정책 미활성 |
| `education.graduateSchool.thesisTitle` — 논문명 | 미지원 사유: 구조 미확인 | 독립 paper 섹션과 해당 대학원 행의 유일 소유 관계 미확인 |
| `education.graduateSchool.thesisSummary` — 논문요약 | 미지원 사유: 구조 미확인 | 독립 paper 섹션과 해당 대학원 행의 유일 소유 관계 미확인 |
| `education.university.latestEducationType` — 최종학력 | 미지원 사유: 구조 미확인 | 최종학력 독립 제어 미확인; 학위/섹션 존재로 추정하지 않음 |

### 어학 (8키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `languages.languageTest.language` — 외국어 | 미지원 사유: 화면 없음 확인 | 두 테넌트 step3 공인시험 행에 독립 언어 선택 제어가 관측되지 않음; 시험명에서 추정하지 않음 |
| `languages.languageTest.testName` — 시험명 | 구현 / 정책 키: `hplace.mrs2.foreignExam.languageExamName` | step3/165 비인증만; YBM/EXAM_CODE 사용자 처리, detail 재수집; 등급-only 또는 점수-only |
| `languages.languageTest.registrationNo` — 등록번호 | 구현 / 정책 키: `hplace.mrs2.foreignExam.registNumber` | step3/165 비인증만; YBM/EXAM_CODE 사용자 처리, detail 재수집; 등급-only 또는 점수-only |
| `languages.languageTest.acquisitionDate` — 취득일 | 미지원 사유: 의미 불일치 | 취득일과 languageExam.examDate(응시일)의 의미가 다름 |
| `languages.languageTest.grade` — 등급·점수 | 구현 / 정책 키: `hplace.mrs2.foreignExam.gradeCode`, `hplace.mrs2.foreignExam.score` | step3/165 비인증만; YBM/EXAM_CODE 사용자 처리, detail 재수집; 등급-only 또는 점수-only |
| `languages.languageTest.evidenceDocumentPath` — 증빙 서류 위치 | 미지원 사유: 사용자 처리(인증·파일) | 파일 선택/업로드는 명시 제외; EXCLUDED_FIELD_IDS로 자동입력 키에서 제외하되 127키 전수표에는 유지 |
| `languages.languageSkill.language` — 외국어 | 구현 / 정책 키: `hplace.mrs2.foreignAbility.languageCode` | step3/166 한국타이어 관측, GS에는 없음; 정확 label/code만; 작문·독해 별도 사용자 입력 |
| `languages.languageSkill.conversationalLevel` — 회화수준 | 구현 / 정책 키: `hplace.mrs2.foreignAbility.speakingLevelCodeSn` | step3/166 한국타이어 관측, GS에는 없음; 정확 label/code만; 작문·독해 별도 사용자 입력 |

### 자격증·면허증 (6키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `certifications.certificate.name` — 자격증명 | 구현 / 정책 키: `hplace.mrs2.license.licenseName` | step3/168; 검색 metadata 검증, 등록번호 privateinfo=true, 취득일 YMD |
| `certifications.certificate.grade` — 등급 | 미지원 사유: 의미 불일치 | usescore 점수와 자격증 등급을 서로 대체하지 않음 |
| `certifications.certificate.registrationNo` — 등록번호 | 구현 / 정책 키: `hplace.mrs2.license.registNumber` | step3/168; 검색 metadata 검증, 등록번호 privateinfo=true, 취득일 YMD |
| `certifications.certificate.issuer` — 발급기관 | 구현 / 정책 키: `hplace.mrs2.license.organization` | step3/168; 검색 metadata 검증, 등록번호 privateinfo=true, 취득일 YMD |
| `certifications.certificate.acquisitionDate` — 취득일 | 구현 / 정책 키: `hplace.mrs2.license.acquireDate` | step3/168; 검색 metadata 검증, 등록번호 privateinfo=true, 취득일 YMD |
| `certifications.certificate.evidenceDocumentPath` — 증빙 서류 위치 | 미지원 사유: 사용자 처리(인증·파일) | 파일 선택/업로드는 명시 제외; EXCLUDED_FIELD_IDS로 자동입력 키에서 제외하되 127키 전수표에는 유지 |

### 직장경력 (9키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `careers.career.companyName` — 직장명 | 구현 / 정책 키: `hplace.mrs2.career.company` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.employmentType` — 고용형태 | 구현 / 정책 키: `hplace.mrs2.career.careerCriteriaCodeSn` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.startDate` — 입사일 | 구현 / 정책 키: `hplace.mrs2.career.entranceDate` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.endDate` — 퇴사일 | 구현 / 정책 키: `hplace.mrs2.career.leavingDate` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.employmentStatus` — 재직 여부 | 구현 / 정책 키: `hplace.mrs2.career.workingStatusCode` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.department` — 근무부서 | 구현 / 정책 키: `hplace.mrs2.career.department` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.position` — 최종직위 | 구현 / 정책 키: `hplace.mrs2.career.position` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.responsibilities` — 담당업무 | 구현 / 정책 키: `hplace.mrs2.career.assignedTask` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |
| `careers.career.terminationReason` — 종료사유 | 구현 / 정책 키: `hplace.mrs2.career.retirementReason` | step2/153; 기존 엔티티 전체 보호, 정확 신원 소비 후 빈 행만 배정; 날짜 YMD |

### 프로젝트 (5키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `projects.project.startDate` — 활동 시작일 | 미지원 사유: 구조 미확인 | 154 enabled:false; 두 테넌트 step2 화면 없음 확인, 다른 화면 구조 미확인. 비활성 정책 키: `hplace.mrs2.project.startDate` |
| `projects.project.endDate` — 활동 종료일 | 미지원 사유: 구조 미확인 | 154 enabled:false; 두 테넌트 step2 화면 없음 확인, 다른 화면 구조 미확인. 비활성 정책 키: `hplace.mrs2.project.endDate` |
| `projects.project.projectName` — 프로젝트 이름 | 미지원 사유: 구조 미확인 | 154 enabled:false; 두 테넌트 step2 화면 없음 확인, 다른 화면 구조 미확인. 비활성 정책 키: `hplace.mrs2.project.projectName` |
| `projects.project.role` — 담당 역할 | 미지원 사유: 구조 미확인 | 154 enabled:false; 두 테넌트 step2 화면 없음 확인, 다른 화면 구조 미확인. 비활성 정책 키: `hplace.mrs2.project.role` |
| `projects.project.activityDetails` — 활동 상세내역 | 미지원 사유: 의미 불일치 | performWork/comment와 활동 상세내역의 확정 의미 계약 없음; 154 비활성 |

### 논문·특허 (3키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `publications.publicationPatent.type` — 구분 | 미지원 사유: 구조 미확인 | researchPaper/researchIPR의 타입·반복 행 소유 매핑 미확인 |
| `publications.publicationPatent.title` — 제목 | 미지원 사유: 구조 미확인 | 연구/지재권 섹션과 프로필 행의 소유 매핑 미확인 |
| `publications.publicationPatent.details` — 상세설명 | 미지원 사유: 구조 미확인 | comment 후보의 의미·타입별 소유 계약 미확인 |

### 처우 (3키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `compensation.compensation.desiredPosition` — 희망직위 | 미지원 사유: 구조 미확인 | hopePosition 공개 템플릿 후보만 있고 실제 두 테넌트 제어/정책 미확인 |
| `compensation.compensation.desiredSalary` — 희망연봉(만원) | 구현 / 정책 키: `hplace.mrs2.basic.hopeSalary` | step1/11; 직접 부모 span/label.money의 ::after="만원" 및 .million 부재; 정수 범위·step 검증 |
| `compensation.compensation.previousSalary` — 직전연봉(만원) | 구현 / 정책 키: `hplace.mrs2.basic.latestSalary` | step1/11; 직접 부모 span/label.money의 ::after="만원" 및 .million 부재; 정수 범위·step 검증 |

### 병역 (9키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `military.military.militaryStatus` — 병역 상태 | 구현 / 정책 키: `hplace.detail.militaryStatus` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.militaryType` — 병역구분 | 미지원 사유: 의미 불일치 | 현역병/상근예비역 등과 militaryTypeCode의 군필/면제 상태를 혼용하지 않음 |
| `military.military.militaryBranch` — 군별 | 구현 / 정책 키: `hplace.mrs2.basic.militaryBranchCode` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.militarySpecialty` — 병과 | 구현 / 정책 키: `hplace.mrs2.basic.militaryRole` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.militaryRank` — 계급 | 구현 / 정책 키: `hplace.detail.militaryRank` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.serviceStartDate` — 복무 시작일 | 구현 / 정책 키: `hplace.detail.serviceStartDate` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.serviceEndDate` — 복무 종료일 | 구현 / 정책 키: `hplace.detail.serviceEndDate` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.dischargeType` — 전역구분 | 구현 / 정책 키: `hplace.detail.dischargeType` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `military.military.exemptionReason` — 면제·비대상 사유 | 구현 / 정책 키: `hplace.detail.exemptionReason` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |

### 보훈 (4키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `veteran.veteran.veteranStatus` — 보훈 대상 여부 | 구현 / 정책 키: `hplace.detail.veteranStatus` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `veteran.veteran.veteranType` — 보훈구분 | 미지원 사유: 구조 미확인 | 보훈구분 전용 제어 미확인; 보훈비율/관계로 대체하지 않음 |
| `veteran.veteran.veteranRelation` — 보훈 대상자와의 관계 | 구현 / 정책 키: `hplace.detail.veteranRelation` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `veteran.veteran.veteranNumber` — 보훈번호 | 구현 / 정책 키: `hplace.detail.veteranNumber` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |

### 장애 (5키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `disability.disability.disabilityStatus` — 장애 여부 | 구현 / 정책 키: `hplace.detail.disabilityStatus` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `disability.disability.disabilityType` — 장애 유형 | 구현 / 정책 키: `hplace.detail.disabilityType` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `disability.disability.disabilityGrade` — 장애 정도·등급 | 구현 / 정책 키: `hplace.detail.disabilityGrade` | step1; 현재 활성 제어와 정확 옵션·소유·기존 값·프로필 재확인 |
| `disability.disability.disabilityRegistrationNumber` — 장애등록번호 | 미지원 사유: 구조 미확인 | 전용 제어/정적 매핑 미확인 |
| `disability.disability.disabilityRegistrationDate` — 장애 등록일 | 미지원 사유: 구조 미확인 | 전용 제어/정적 매핑 미확인 |

### 건강 (4키)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| `health.health.healthItemName` — 건강정보 항목 | 미지원 사유: 의미 불일치 | 고정 신체 측정항목과 범용 반복 건강정보 항목명의 계약 없음 |
| `health.health.healthStatusOrValue` — 상태·값 | 미지원 사유: 의미 불일치 | 키·몸무게·시력 등의 단위/타입과 범용 상태값을 추정 결합하지 않음 |
| `health.health.healthDate` — 진단·확인일 | 미지원 사유: 구조 미확인 | 전용 건강 진단일 제어 미확인 |
| `health.health.healthDetails` — 상세내용 | 미지원 사유: 의미 불일치 | physicalRemark 단일칸과 반복 건강정보 상세의 의미 계약 없음 |

## 사이트 전용 항목 (127키 집계와 별도)

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| 수상 / award (170) | 미지원 사유: 프로필 키 없음 | 한국타이어 관측; 이름·기관·날짜·comment 별도 범주 없음 |
| 해외경험 / overseaExperience (167) | 미지원 사유: 프로필 키 없음 | 두 테넌트 관측; 목적·국가·출입국일·내용 없음 |
| 컴퓨터활용 / softwareSkill (169) | 미지원 사유: 프로필 키 없음 | 한국타이어 관측; 도구·수준 범주 없음 |
| 교육이수 (171) | 미지원 사유: 프로필 키 없음 | 정책 unsupportedSections; 두 live 화면 활성 여부 미확인 |
| 활동 / activity (172) | 미지원 사유: 프로필 키 없음 | 두 테넌트 관측; 프로젝트로 임의 분류 금지 |
| 봉사 / volunteerActivity (173) | 미지원 사유: 프로필 키 없음 | GS 관측, 한국타이어 없음 |
| 지원경로 / applyChannel | 미지원 사유: 프로필 키 없음 | 회사별 옵션·직접입력 추정 금지 |
| 지원분야 / applySector | 미지원 사유: 프로필 키 없음 | 공고별 계층 선택; 희망직위로 대체 금지 |
| 입사가능일 / joinPossibleDate | 미지원 사유: 프로필 키 없음 | 프로필 날짜 키 없음 |
| 작문 수준 / writingLevelCodeSn | 미지원 사유: 프로필 키 없음 | 한국타이어 required; 회화수준 복제 금지 |
| 독해 수준 / readingLevelCodeSn | 미지원 사유: 프로필 키 없음 | 한국타이어 required; 회화수준 복제 금지 |
| 전공 이수학점 / majorCredits | 미지원 사유: 프로필 키 없음 | 한국타이어 required; totalCredits 대체 금지 |
| 전공 평점 / majorAverageScore | 미지원 사유: 프로필 키 없음 | 전체 학업 GPA와 별도 |
| 전공 만점 / majorPerfectScore | 미지원 사유: 프로필 키 없음 | 전체 학업 GPA scale과 별도 |
| 고교 계열 / highschoolCategoryCode | 미지원 사유: 프로필 키 없음 | 학업과정과 별도; GS 관측 |
| 대학 계열 / collegeCategoryCode | 미지원 사유: 프로필 키 없음 | 전공 계열과 별도 |
| 본교·분교 / headOrBranch | 미지원 사유: 프로필 키 없음 | 학위·학교 유형으로 추정 금지 |
| 시험 만점 / perfectScore | 미지원 사유: 프로필 키 없음 | 응답 metadata는 검증용; 프로필 등급에서 추정 금지 |
| 경력별 연봉 / career.salary | 미지원 사유: 프로필 키 없음 | 직전연봉 latestSalary와 별도 |
| 종업원 수·매출 / headcount·annualSales | 미지원 사유: 프로필 키 없음 | GS 경력 관측; 회사명으로 추정 금지 |
| 보훈비율 / patriotRate | 미지원 사유: 프로필 키 없음 | 보훈구분과 별도 |
| NCS 능력단위·학기/과목성적 | 미지원 사유: 프로필 키 없음 | 공개 템플릿 후보; 현 프로필 범주 없음 |
| 취미·특기·긴급연락처 관계 | 미지원 사유: 프로필 키 없음 | legacy 조사 후보; 기존 연락처 값으로 의미 추정 금지 |
| 주민등록상·가족·부모 주소/상동 | 미지원 사유: 명시 제외 | 현주소 전용 계약; copy/reset 실행 없음 |
| 사진·성적증명서/기타 첨부 | 미지원 사유: 사용자 처리(인증·파일) | 사용자가 파일 처리; 한국타이어 required 파일 관측 |
| YBM 인증 시험·직접등록 조건 변형 | 미지원 사유: 사용자 처리(인증·파일) | EXAM_CODE/인증 상태 선택 금지; 2년 이상 직접등록 의미를 취득일로 추정 금지 |
| 자기소개서·역량/추가질문·experienceBuilder | 미지원 사유: 명시 제외 | 질문별 답변 생성·범용 바인딩 제외; required라도 자동완료로 간주하지 않음 |

## 집계와 검증 한계

| 대상 | 현재 구현·검증 | 제한 |
| --- | --- | --- |
| 프로필 127키 / 구현 | 89 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 화면 없음 확인 | 1 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 프로필 키 없음 | 0 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 의미 불일치 | 15 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 구조 미확인 | 20 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 사용자 처리(인증·파일) | 2 | 키 단위, 사이트 전용 항목 제외 |
| 프로필 127키 / 명시 제외 | 0 | 키 단위, 사이트 전용 항목 제외 |

사이트 전용 27행: 프로필 키 없음 23, 명시 제외 2, 사용자 처리(인증·파일) 2。

## 변경 이유

v3 초안의 주소 검색 대기·후속 탭 전면 미확인을 10월 18–19일 실DOM 관측과 HEAD의 P1–P4 코드 계약으로 갱신한다. 프로젝트 4키의 비활성 규칙과 전공 간접 소비를 구분해 정적 규칙 수를 실제 지원 키 수로 오인하지 않게 한다. 기존 다른 회사의 현황은 이번 변경 대상이 아니다.

정책 JSON SHA-256: `77f4f92ade7801140a258cf6f180d7a9d977d7adaef19c219a4b1c3f5c1bb580`
