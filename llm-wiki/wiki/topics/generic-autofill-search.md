# 범용 자동 기입 검색 표면

> Topic: generic-autofill-search
> Status: Current
> Current: [CF-110 검증된 CJ 주전공 검색의 제한 경계](../../raw/issues/CF-110/documents/adr/110-verified-major-search.md)
> History: [CF-98 실행과 실측 경계](../../raw/issues/CF-98/documents/generic-autofill-search.md); [CF-108 진단 보완](../../raw/issues/CF-108/documents/generic-autofill-search.md); [CF-110 제한된 CJ 주전공 계약](../../raw/issues/CF-110/documents/adr/110-verified-major-search.md)
> Updated: 2026-09-25

## 현재 상태

승인된 nonempty readonly DIRECT 필드, 소유된 검색 표면, 로컬 exact 선택, DOM/행/기존값 재검증과 원본 제어 1회 조작 경계를 유지한다. 완전한 동일 출처 국내 17개 학교 소재지 목록은 한국 국가 문맥과 명시적 별칭으로만 처리한다. 일반 경로에서 callback 직접 호출, 주소 평가, readonly/hidden 강제 입력과 저장/제출은 금지한다. 아래 CJ 전용 경로의 검증된 두 필드 반영은 이 일반 경로를 완화하지 않는 별도 계약이다.

CF-108은 폼, 화면 이동, 결과 완료와 활성화 실패를 공개 failureCode로 안내한다. 미확정 부수효과로 중단할 때 승인된 후속 항목의 보류를 원인 항목 실패와 구분하며 미승인 결과는 보존한다. CF-108 당시 POST/hidden/inline 학교 검색의 지원 허용 범위는 늘리지 않았다.

native GET navigation 완료 뒤에도 완료 표식, 결과 개수 또는 전체 위치 정보가 필요하다. 완료 근거 없는 목록이 자동 선택된다는 초기 의심은 정정했다. CF-108의 설치 확장 합성 검증에서 두 진단, 후속 opener 0회와 기존값/코드 보존을 확인했지만 당시 실제 CJ와 서버 저장은 미검증이었다.

CF-110은 정확한 origin·opener·첫 대학교 주전공 행·필드 소유권이 확인된 CJ 경우에만 확장이 `dtl_nm`·`num` 두 필드로 검색 POST를 구성한다. 결과 callback은 실행하지 않고 literal 데이터로만 해석한다. 완전히 수신하고 구조를 검증한 렌더링 응답 안에서 정확히 하나 일치할 때만 선택하며 표시값·코드·검토된 needPopup 닫기 lease·500ms 이상 유지를 모두 확인해야 검색 실행 성공이다. CJ 데이터베이스 전체 유일성이나 전체 패널 성공을 의미하지 않는다.

버튼형 input의 value만 의미 라벨로 읽고 일반 text·password·hidden 입력값은 읽지 않는다. 소유권·문맥·응답·팝업 변경, 값 충돌과 취소에는 입력을 보류하며, 기존 사용자 값 보호 및 실패 뒤 후속 검색 보류를 유지한다. 일반 POST·hidden·inline handler 거부, callback 직접 호출 및 주소 평가 금지, 일반 경로의 readonly/hidden 강제 입력 금지, 저장·제출 금지는 그대로다.

설치 확장 실제 화면에서 주전공 표시값과 공개 결과 코드의 일치, 팝업 닫힘, 578ms 유지는 읽기 전용으로 관측했다. 결과 UI는 `입력 결과 확인`, 입력 완료 0개였고 내부 매핑·실행기 반환값은 직접 수집하지 않았다. 기존 `LLM_SUGGESTED`의 확인 필요 판정은 유지한다. 전공만 실행한 것도, 다른 입력값이 모두 불변인 것도 아니다. 서버 저장·제출과 전체 패널 성공은 검증하지 않았다.

## 변경 이유

CF-108의 진단과 미지원 범위는 [이전 근거](../../raw/issues/CF-108/documents/generic-autofill-search.md)로 보존한다. CJ 전공의 확인된 POST·결과 callback 구조만 별도 계약으로 제한해 지원하면서, 기존 범용 검색의 거부 정책을 잃지 않기 위해 [승인된 CF-110 ADR](../../raw/issues/CF-110/documents/adr/110-verified-major-search.md)을 현행 근거로 연결했다.
