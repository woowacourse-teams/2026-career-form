# 범용 자동 기입 검색 표면

> Topic: generic-autofill-search
> Status: Current
> Current: [CF-114 범용 자격증 검색과 후속 재검토 경계](../../raw/issues/CF-114/documents/generic-certificate-search.md)
> History: [CF-98 실행과 실측 경계](../../raw/issues/CF-98/documents/generic-autofill-search.md); [CF-108 진단 보완](../../raw/issues/CF-108/documents/generic-autofill-search.md); [CF-110 제한된 CJ 주전공 계약](../../raw/issues/CF-110/documents/adr/110-verified-major-search.md); [CF-112 첫 대학교 학교명·국가 묶음](../../raw/issues/CF-112/documents/adr/112-verified-school-search.md); [CF-114 범용 자격증 검색](../../raw/issues/CF-114/documents/generic-certificate-search.md)
> Updated: 2026-09-26

## 현재 상태

CF-114는 회사 중립 반복 행 준비, native form의 현재 query·응답 세대 검증, 최대 두 로컬 검색형과 검색 후 새 필드의 재분석·새 승인을 연결한다. 아래 CF-112까지의 POST/hidden 일괄 거부는 역사적 경계이며, 현재는 검증된 native GET/POST와 기존 hidden routing만 제한적으로 허용한다. inline handler나 불투명 callback은 이 확장에 포함하지 않는다. 기존 CJ 학교·전공의 별도 계약은 유지한다.

선택 전 변경 범위·관계 값과 완결된 유일 정확 후보를 확인할 수 없으면 클릭하지 않는다. 검색 후 이름·행·프로필 변경은 후속 쓰기를 차단한다. CJ 적응 때문에 범용 안전 조건을 완화하지 않으며 다른 회사에도 적용 가능한 공통 경로 개선을 우선한다. 세 가지 합성 마크업의 자동 회귀와 설치 확장 전체 smoke 미완료, 실제 CJ 자동 입력 미입증을 구분한다. 상세 근거는 위 Current 문서를 따른다.

승인된 nonempty readonly DIRECT 필드, 소유된 검색 표면, 로컬 exact 선택, DOM/행/기존값 재검증과 원본 제어 1회 조작 경계를 유지한다. 완전한 동일 출처 국내 17개 학교 소재지 목록은 한국 국가 문맥과 명시적 별칭으로만 처리한다. 일반 경로에서 callback 직접 호출, 주소 평가, readonly/hidden 강제 입력과 저장/제출은 금지한다. 아래 CJ 전용 주전공 두 필드와 첫 대학교 학교명·국가 문맥 묶음의 반영은 이 일반 경로를 완화하지 않는 별도 계약이다.

CF-108은 폼, 화면 이동, 결과 완료와 활성화 실패를 공개 failureCode로 안내한다. 미확정 부수효과로 중단할 때 승인된 후속 항목의 보류를 원인 항목 실패와 구분하며 미승인 결과는 보존한다. CF-108 당시 POST/hidden/inline 학교 검색의 지원 허용 범위는 늘리지 않았다.

native GET navigation 완료 뒤에도 완료 표식, 결과 개수 또는 전체 위치 정보가 필요하다. 완료 근거 없는 목록이 자동 선택된다는 초기 의심은 정정했다. CF-108의 설치 확장 합성 검증에서 두 진단, 후속 opener 0회와 기존값/코드 보존을 확인했지만 당시 실제 CJ와 서버 저장은 미검증이었다.

CF-110은 정확한 origin·opener·첫 대학교 주전공 행·필드 소유권이 확인된 CJ 경우에만 확장이 `dtl_nm`·`num` 두 필드로 검색 POST를 구성한다. 결과 callback은 실행하지 않고 literal 데이터로만 해석한다. 완전히 수신하고 구조를 검증한 렌더링 응답 안에서 정확히 하나 일치할 때만 선택하며 표시값·코드·검토된 needPopup 닫기 lease·500ms 이상 유지를 모두 확인해야 검색 실행 성공이다. CJ 데이터베이스 전체 유일성이나 전체 패널 성공을 의미하지 않는다.

버튼형 input의 value만 의미 라벨로 읽고 일반 text·password·hidden 입력값은 읽지 않는다. 소유권·문맥·응답·팝업 변경, 값 충돌과 취소에는 입력을 보류하며, 기존 사용자 값 보호 및 실패 뒤 후속 검색 보류를 유지한다. 일반 POST·hidden·inline handler 거부, callback 직접 호출 및 주소 평가 금지, 일반 경로의 readonly/hidden 강제 입력 금지, 저장·제출 금지는 그대로다.

CF-112는 승인된 CJ 첫 대학교 학교명에 한하여 최소 `school_name`·`num=2_0` POST를 별도 구성하고 callback 없이 완전 수신한 응답의 유일한 정확 결과를 해석한다. 소재지 표시값·지역 코드가 비었을 때만 학교명·학교 코드·`reg_region`·같은 행 소재지 opener의 `country_cd` URL 문맥을 하나의 승인 묶음으로 갱신한다. 이전 `new_country`가 달라도 보존하며 무조건 거부하지 않는다. 같은 학교명이 이미 표시되더라도 코드·국가·URL의 전체 기존 묶음을 실제 응답과 대조한 뒤에만 unchanged를 인정한다. 학교·전공 검색은 검토된 팝업 show/hide와 단일 lease로 직렬화하며 종료·500ms 유지·원래 행 소유권을 검증한다. 실패 시 자신이 쓴 값과 URL만 조건부 복구하고 후속 승인 검색을 보류한다. 첫 대학교 외 행과 일반 POST 계약으로 확대하지 않는다.

학교 검색의 공개 endpoint와 실제 공개 팝업 라이브러리를 합성 입력 대상에 연결해 두 번의 선택·종료 후 549ms와 533ms 유지를 확인하고, 별도 공개 결과의 학교 코드가 하네스 기록 코드와 같음을 확인했다. 설치 확장 전체 패널과 실제 지원서 입력, 저장·제출은 검증하지 않았다. 이 합성 브라우저 결과를 실사이트 지원서 전체 성공으로 해석하지 않는다.

설치 확장 실제 화면에서 주전공 표시값과 공개 결과 코드의 일치, 팝업 닫힘, 578ms 유지는 읽기 전용으로 관측했다. 결과 UI는 `입력 결과 확인`, 입력 완료 0개였고 내부 매핑·실행기 반환값은 직접 수집하지 않았다. 기존 `LLM_SUGGESTED`의 확인 필요 판정은 유지한다. 전공만 실행한 것도, 다른 입력값이 모두 불변인 것도 아니다. 서버 저장·제출과 전체 패널 성공은 검증하지 않았다.

## 변경 이유

CF-108의 진단과 미지원 범위는 [이전 근거](../../raw/issues/CF-108/documents/generic-autofill-search.md)로 보존한다. CJ 전공의 확인된 POST·결과 callback 구조를 별도 계약으로 제한한 [CF-110 ADR](../../raw/issues/CF-110/documents/adr/110-verified-major-search.md)은 유지한다. 학교 검색의 국가 결합 효과는 그 전공 계약의 자동 확장이 아니라 [승인된 CF-112 ADR](../../raw/issues/CF-112/documents/adr/112-verified-school-search.md)에 따라 독립적으로 검증한다. 이를 현재 topic 근거로 연결하되 일반 검색의 기본 거부 정책은 그대로다.
