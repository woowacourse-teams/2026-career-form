# 범용 등급의 다른 사람 대상 칸 차단

> Topic: generic-other-person-context
> Status: Current
> Current: [CF-261 범용 등급의 다른 사람 대상 칸 차단](../../raw/issues/CF-261/documents/generic-other-person-context.md)
> History: [CF-261 범용 등급의 다른 사람 대상 칸 차단](../../raw/issues/CF-261/documents/generic-other-person-context.md)
> Updated: 2026-10-18

## 현재 상태

칸의 이름·라벨·title·placeholder가 추천인, 보증인, 보호자, 비상·긴급 연락처처럼 지원자가
아닌 사람의 역할을 가리키는데 매칭 키가 지원자 본인의 이름·이메일·전화·주소 계열 키이면
범용 등급은 신뢰도와 무관하게 OTHER_PERSON_CONTEXT로 BLOCKED다. 프로필에 다른 사람의
정보가 없어 본인 값을 넣는 것은 항상 틀리기 때문에 REVIEW가 아니라 BLOCKED다. 판정은
MIXED_EDUCATION_RECORD 뒤, FORMAT_KEY_MISMATCH 앞에서 하고 기존 이유와 경계값은 같다.
비상연락처 키(emergencyPhoneNumber)는 대상에서 제외한다. 화면 문구는 범용 검토 화면
3단계 표시(Task 12, #259)의 변환 표가 맡는다.

## 변경 이유

비활성이어서 우연히 쓰이지 않았을 뿐, 추천인 연락처 칸이 지원자 본인 전화번호 키로
매칭되는 문제가 있었다. 수집 파일, BE 프롬프트, 회사별 분기 없이 범용 등급 안에서
막기 위해서다. 어휘는 서로 무관한 fixture 두 종과 합성 변이를 근거로 한정했다.

## 관련 주제

- [범용 칸 라벨 문맥과 형식 등급 검사](generic-field-context-safety.md)
- [DOM fixture 검토와 재현 경계](dom-snapshot-review-boundaries.md)
