# Greeting 프로필 import 기술 검증

> Topic: greeting-profile-import
> Status: Current
> Current: [CF-192 읽기 전용 후보 생성과 제품 구현 조건](../../raw/issues/CF-192/documents/greeting-profile-import.md)
> History: [CF-192 근거](../../raw/issues/CF-192/documents/greeting-profile-import.md)
> Updated: 2026-10-12

## 현재 상태

기존 수집기와 행 식별기로 합성 Greeting 기본정보 및 대학교 2개 행의 학교명·입학일·졸업일을 읽어 import 후보를 만들 수 있다. 제품 UI·프로필 저장·외부 전송은 연결하지 않았다.

전체 이름, 학교 카탈로그 식별, 연월 날짜는 추정으로 확정하지 않고 사용자 확인 대상으로 남긴다. 보이는 disabled·readonly는 읽되 숨김·inert·모호한 학력 그룹은 값을 반환하지 않는다. 현재 페이지 밖이나 DOM에서 제거된 항목까지 읽었다고 보장하지 않는다.

후속 제품은 실제 페이지 구조 확인과 사용자 선택 병합이 필요하다. 기존 값 충돌은 개별 선택하고 페이지 행 index나 학교명만으로 기존 학력을 자동 병합하지 않는다. 합성 fixture의 결과는 실사이트 지원이나 자동 기입 클릭률 개선의 증거가 아니다. 상세 근거와 제한은 [CF-192 raw](../../raw/issues/CF-192/documents/greeting-profile-import.md)를 따른다.

## 변경 이유

프로필 작성 부담을 줄이기 위한 import의 기술적 출발점과, 제품에 연결하기 전에 남아 있는 확인·병합 조건을 자동 기입 정책과 구분해 보존한다.
