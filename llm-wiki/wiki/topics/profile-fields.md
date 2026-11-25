# 프로필 필드

> Topic: profile-fields
> Status: Current
> Current: [CF-499 장애·보훈·병역 상태에 따른 입력 잠금](../../raw/issues/CF-499/documents/status-input-locks.md)
> History: [근거 1](../../raw/issues/CF-41/documents/docs/PROFILE_FIELDS.md); [CF-368 자격증 등록번호 표시 라벨](../../raw/issues/CF-368/documents/certificate-registration-number-label.md); [CF-499 장애·보훈·병역 상태에 따른 입력 잠금](../../raw/issues/CF-499/documents/status-input-locks.md)
> Updated: 2026-11-21

## 현재 상태

지원 정보의 구조와 필드 계약은 CF-41에서 이전한 현재본을 따른다.

자격증 항목의 `registrationNo` 표시 라벨은 `등록번호 및 자격번호`다(CF-368). 필드 키와 저장 형식은 그대로다. 어학 항목의 `registrationNo` 라벨은 `등록번호`로 남아 FE 의미 어휘에서 `등록번호`가 빠지지 않는다. 근거는 [CF-368 자격증 등록번호 표시 라벨](../../raw/issues/CF-368/documents/certificate-registration-number-label.md)을 따른다.

장애·보훈·병역은 상태 칸에 따라 나머지 칸을 잠근다(CF-499). 장애 여부나 보훈 대상 여부가 비대상이면 나머지 칸을, 병역은 상태별 표대로 복무 7칸과 `면제·비대상 사유`를 잠근다. 잠긴 칸은 회색으로 보이고 저장 값은 남지만 자동 기입 값 연결과 페이지 가져오기는 쓰지 않는다. 규칙 표와 근거는 [CF-499 장애·보훈·병역 상태에 따른 입력 잠금](../../raw/issues/CF-499/documents/status-input-locks.md)을 따른다.

자격증 발급기관 자동 채움과 어학 시험 목록은 [프로필 카탈로그 선택과 식별 연결](profile-catalog-identity.md)을 따른다.

## 변경 이유

프로필 필드 기준을 topic Wiki에서 찾을 수 있게 중앙화했다.

자격증 등록번호 라벨은 1.4.0 QA 의견("등록번호 및 자격번호")을 반영했고, 라벨만 바꿔 저장 데이터와 필드 키를 유지했다(CF-368).

장애·보훈·병역 잠금은 사용자 의견("비대상으로 하면 나머지 칸들 그냥 일괄적으로 입력 안 되게", "병역도 넣어봐")을 반영했다. 병역은 상태가 다섯 개라 상태마다 잠글 칸을 지원서 구조(hplace, 우아한형제들)와 칸 이름을 근거로 정했고, 미필의 사유 잠금은 추정으로 남겼다(CF-499).
