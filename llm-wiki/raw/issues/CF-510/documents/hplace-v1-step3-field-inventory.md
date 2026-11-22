# 에이치닷 v1 지원자 앱 3단계 필드 현황

> Issue: [CF-510](https://github.com/woowacourse-teams/2026-career-form/issues/510)
> Collected: 2026-11-23
> Approval-Digest: fb169cce8e40f21e49fc3432af9f7dd5df938a5fb0097ad54dd5401cb313b839
> Source-Revision: 0eb8030

[승인 후보 스냅샷](approved-candidates.md)의 후보 3의 칸, 후보 4의 전송 이름과 범위, 후보 5의 실화면 상태를 필드 표로 적는다. v1 1·2단계, 다른 회사와 MRS2의 현황은 Supersedes가 가리키는 CF-509 근거와 그 이전 근거를 그대로 따른다. 구조와 실행 순서의 설명은 [3단계 근거](hplace-v1-step3.md)에 있다.

`구현`은 로컬 정책과 프론트 실행 경로가 있다는 뜻이다. 실화면 기입은 두 번째 v1 테넌트의 자격증 1줄만 확인했다(후보 5, [두 번째 테넌트 실측](hplace-v1-second-tenant.md)).

## 자격증 (`certificate`, i=0~9)

프로필 키 앞부분은 `certifications.certificate.`이다.

| 정책 키 | 프로필 키 | 정책 | 화면 위젯과 조건 |
| --- | --- | --- | --- |
| `licenseName` | `name` | CONDITIONAL | 이름 없는 검색 칸, 먼저 실행하는 드라이버. 정확히 일치하는 줄이 하나일 때만 선택. 등록하기 규칙은 2단계와 같음 |
| `organization` | `issuer` | CONDITIONAL | 글자 칸. 선택 뒤 나타남. 기존 값 유지, 최대 길이 확인 |
| `acquireDate` | `acquisitionDate` | ALLOWED | 이름 없는 글자 칸. 과거 날짜만(`YYYY.MM.DD`, 월까지만이면 `YYYY.MM`). 페이지가 `YYYY.MM`만 남기면 같은 연월이면 유지. 다시 읽어 확인 |
| `registNumber` | `registrationNo` | ALLOWED | 글자 칸. 선택 뒤 나타남. 기존 값 유지 |

## 외국어활용능력 (`languageSkill`, i=0~9)

| 정책 키 | 프로필 키 | 정책 | 화면 위젯과 조건 |
| --- | --- | --- | --- |
| `language` | `languages.languageSkill.language` | CONDITIONAL | 드롭다운. 측정한 선택지 이름과 정확히 같을 때만 선택. 이미 다른 언어가 골라져 있으면 쓰지 않음 |

## 추가 동작

| 동작 이름 | 조건 |
| --- | --- |
| `hplace.v1.certificate.add` | 프로필 자격증 항목 수 − 이미 있는 하위 줄 수만큼 |
| `hplace.v1.languageSkill.add` | 프로필 외국어활용능력 항목 수 − 이미 있는 하위 줄 수만큼 |

## 다루지 않는 v1 3단계 칸

| 화면 칸 | 분류 | 이유 |
| --- | --- | --- |
| 공인외국어시험 블록 전체 | 범위 제외 | 시험을 고르면 외부 성적 확인 탭이 열리고 성적 칸은 잠김. 찾거나 누르지 않음 |
| 컴퓨터활용능력 | 프로필 키 없음 | 대응하는 프로필 범주가 없다 |
| 경험 구역 5개(수상경력 등) | 프로필 키 없음 | 대응하는 프로필 범주가 없다 |
| 외국어활용능력 회화수준 | 구조 미확인 | 측정한 하위 줄에 두 번째 컨트롤이 없다 |
| 자격증 등급 | 구조 미확인 | 선택 뒤 하위 줄에 등급 컨트롤이 없다 |
| 파일 칸, 삭제 아이콘 | 금지 | 사이트 상태를 바꾸며 확장이 되돌리지 않는다 |

v1 4단계 이후와 JOBDA·채용 빌더는 구조 미확인이며 미지원 안내를 유지한다.
