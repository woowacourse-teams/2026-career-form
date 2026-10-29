# 프로필 필드

> Topic: profile-fields
> Status: Current
> Current: [CF-368 자격증 등록번호 표시 라벨](../../raw/issues/CF-368/documents/certificate-registration-number-label.md)
> History: [근거 1](../../raw/issues/CF-41/documents/docs/PROFILE_FIELDS.md); [CF-368 자격증 등록번호 표시 라벨](../../raw/issues/CF-368/documents/certificate-registration-number-label.md)
> Updated: 2026-10-29

## 현재 상태

지원 정보의 구조와 필드 계약은 CF-41에서 이전한 현재본을 따른다.

자격증 항목의 `registrationNo` 표시 라벨은 `등록번호 및 자격번호`다(CF-368). 필드 키와 저장 형식은 그대로다. 어학 항목의 `registrationNo` 라벨은 `등록번호`로 남아 FE 의미 어휘에서 `등록번호`가 빠지지 않는다. 근거는 [CF-368 자격증 등록번호 표시 라벨](../../raw/issues/CF-368/documents/certificate-registration-number-label.md)을 따른다.

자격증 발급기관 자동 채움과 어학 시험 목록은 [프로필 카탈로그 선택과 식별 연결](profile-catalog-identity.md)을 따른다.

## 변경 이유

프로필 필드 기준을 topic Wiki에서 찾을 수 있게 중앙화했다.

자격증 등록번호 라벨은 1.4.0 QA 의견("등록번호 및 자격번호")을 반영했고, 라벨만 바꿔 저장 데이터와 필드 키를 유지했다(CF-368).
