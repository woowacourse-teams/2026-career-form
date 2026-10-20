# 회사 어댑터 개발

> Topic: adapter-development
> Status: Current
> Current: [CF-177 KDI·구조 미확인 근거](../../raw/issues/CF-177/documents/live-kdi-unverified.md)
> History: [근거 1](../../raw/issues/CF-41/documents/indexes/location-dependent-policies.md); [근거 2](../../raw/issues/CF-46/documents/adapter-development.md); [CF-94 근거](../../raw/issues/CF-94/documents/adapter-development.md); [CF-177 근거](../../raw/issues/CF-177/documents/adapter-development.md); [CF-177 step 2·3 근거](../../raw/issues/CF-177/documents/live-step23.md); [CF-177 C12·C13·시연 근거](../../raw/issues/CF-177/documents/live-c12-c13-demo.md); [CF-177 KDI·구조 미확인 근거](../../raw/issues/CF-177/documents/live-kdi-unverified.md)
> Updated: 2026-10-20

## 현재 상태

백엔드는 의미 매핑과 허용 명령을, 프론트 회사 어댑터는 DOM 수집·조건부 처리·특수 입력을 소유한다. 공통 프론트의 승인·로컬 값 결합·실행 검사는 유지한다. 구조를 검증할 수 없으면 추정하지 않는다. 기존 schemaVersion 2 클라이언트 응답은 유지하며, SK 주소 검색의 새 명령은 preparation API에서 지원을 명시한 클라이언트에만 반환한다. SK 경력·검색·년월 입력은 exact DOM, 유일한 프로필 바인딩, READY 상태와 반복 행 수 보호를 함께 적용한다. 현대 정책 v4는 국내 주소, 국적1 대한민국, 학력 그룹별 행·필드 매핑을 조건부로 적용한다.

승인된 전체 패널 검증에서는 공개 fixture를 실제 가져오기 UI에 적용해 설치된 정적 production 확장의 popup→사이드 패널→자동 기입 경로를 확인했다. 준비·필드 분석 API 10회는 모두 HTTP 200/ADAPTER/COMPLETE였고, UI 집계 23개 기입 성공·0개 직접 확인은 선행 선택·미지원·미선택 전체 성공을 뜻하지 않는다. 테스트 후 프로필 키 미존재와 지원서 204개 제어 상태를 원복했으며, 저장·제출 호환성은 미검증이다. WXT watcher의 자동 reload 가능성 때문에 새로고침 승인을 과거 세션에서 재사용하지 않고, 도구 연결 중단 시 복구 보장을 확대하지 않는다.

## 변경 이유

현대·SK 프론트 분리 결과와 LG 검색의 후속 설계 경계를 승인된 CF-46 근거로 기록했다.

현대 최신 검증은 주소의 유일 결과·modal cleanup, 국적1 `KR`와 국적2 불변, 학력 그룹별 준비·재분석, 실제 학교 `school`·전공 `basic` auto-type을 확인했다. 설치 smoke는 고교·학사 2행과 주소·국적1을 독립 대조했고, API 7회가 모두 HTTP 200/ADAPTER/COMPLETE였다. UI 38/0은 writer 집계이며 전체 성공이 아니고, 저장·제출과 실제 toolbar icon 클릭은 검증하지 않았다.

## Greeting 플랫폼 경계

BE는 기존 등록 회사 정책을 우선한 뒤 `site.host`와 지원서 `pathPattern`으로 Greeting 연결을 판정한다. 정확한 Greeting 기본 도메인 또는 제한된 DNS CNAME 조회에서 Greeting으로 이어지는 별칭을 확인하면 하나의 공통 정책을 선택한다. 기업별 자체 도메인 허용 목록은 사용하지 않는다. DNS 조회 시간·동시성·체인 길이·캐시 크기를 제한하며 조회 오류는 차단한다. CNAME 근거가 없다는 결과를 비-Greeting 확정으로 표현하지 않는다.

FE는 SK·현대의 기존 선택 우선순위를 유지하며 유일한 최상위 `basicInformation.name`, `basicInformation.phoneNumber.nationalNumber` 입력과 소유한 Greeting field 구조 등 공통 DOM 속성으로 화면 어댑터를 선택한다. 수집·준비·입력·재검증에서 일관된 선택을 유지하고 DOM 변경 때문에 검증된 Greeting 입력을 범용 실행기로 낮추지 않는다. 정적·범용 분석의 최종 결정은 BE가 담당하며 Greeting 화면에 범용 응답이 오면 입력을 중단한다.

`routingContext`, `executionAdapterId`, Greeting 전용 capability/header와 사용자별 토큰·만료·서버 메모리는 사용하지 않는다. 도메인별 DNS 결과 캐시는 내부 성능 최적화이며 사용자 세션 계약이 아니다. 준비 API → 필요한 준비 동작·재수집 → 필드 매핑 API → 로컬 값 결합·입력 순서를 유지하고, 서버 어댑터 지정을 위한 추가 준비 요청은 만들지 않는다. 기존 주소 검색 capability와 공통 입력 명령은 유지한다.

이름 없는 이메일 combobox는 `이메일주소` 또는 `이메일`이라는 단일 소유 라벨과 유일한 칸을 확인한 경우에만 연결한다. 값 입력과 이메일 확인을 분리한다. 메디퀴터스 설치 확장에서 비식별 기본 필드 3개 입력을 확인했으며, 다른 Greeting 화면의 전 항목 성공으로 확대하지 않는다. 필드별 경계는 [Greeting 근거](../../raw/issues/CF-94/documents/adapter-greeting.md)에 기록했다.

아래 설치 확장 관측은 2026-09-28 라우팅 단순화 이전의 증거다. 기존 필드 지원의 근거로 보존하며 이번 수정의 브라우저 재검증으로 취급하지 않는다. 이후 카카오게임즈 필드 확장의 실화면 관측과 최신 수정본 검증 한계는 별도 후속 절에 기록한다.

이전 설치 확장 관측은 DNS/DOM 자동 판별 이전의 증거다. DNS/DOM 판별은 합성 회귀·정적 검사·빌드와 로컬 서버의 DNS/API 응답으로 검증했다. 이후 필드 확장의 카카오게임즈 설치 브라우저 관측은 별도이며 최신 수정본의 빈 지원서 전체 실행과 재실행은 아직 확정하지 못했다.

## Greeting 필드 확장 후속 경계

고교·대학 추가전공·경력·어학·자격증을 기존 BE 정책과 FE 실행기로 연결했다. 대학 추가전공은 기존 DERIVED 형식의 공통 규칙 목록을 확장하며 준비·필드 API의 필드는 추가하지 않는다. 수집·행 준비·검색 선택·재수집·결과 확인을 함께 검증한다. 최신 설치 브라우저 전체 실행은 확정하지 못했으며 상세 지원 범위와 관측 한계는 Greeting 어댑터 및 필드 현황을 따른다.


## Hplace와 공통 실행 정책 (CF-177)

기존 회사 정책을 우선하고 공급자의 정확한 호스트·경로·자산·소유 구조로 공유 정책을 선택한다. 전용 등록/기본정보 writer와 공통 native writer의 물리 노드별 소유를 끝까지 유지한다. v4 문서가 없을 때만 유효 v3 바인딩을 사용하고 잘못된 v4나 조회 예외는 차단한다. seeder는 없는 문서만 insert한다.

외곽 API schemaVersion2를 유지하면서 DB v4 sectionContracts와 BrowserPolicy v2 nativeForm을 추가했다. 이는 단순 selector 추가가 아니라 scoped fields, 연속 행 index/count, stage DAG, native driver·날짜·숫자·textarea 정착, 중첩 전공과 GPA 쌍의 실행 계약 확장이다. 행 identity와 값 결합은 로컬에 남고 wire에는 구조와 고정 표시명만 보낸다. fields는 일반 최대3, 활성 반복 native section에서는 최대8이며 완료 driver 집합의 진전이 없으면 중단한다. native 소유 driver는 stage 단위 한 pass로 모두 실행하고 실패 driver와 대상 요소가 겹치는 뒤 driver만 결과 없이 제외한다. 마지막 허용 요청에서 실행할 driver가 남으면 기입 없이 결과만 내고 `DRIVER_LIMIT_REACHED`로 보고한다. SK·현대·Greeting 등 non-native는 첫 실패 정지를 유지하며, 예산 상향과 9번째 요청은 기각했다.

### 검색·주소·행 프로토콜

- committed-search는 같은 위젯·행의 query/Name/Code/display와 새 결과 소유를 검증한다. 제한된 legacy Enter keypress13, 유일한 정확 title·nonzero code·metadata 및 최종 tuple readback이 필요하다. Enter의 keyCode/charCode/which는 `KeyboardEventInit`로 넘겨야 page world에 전달되고, 브라우저가 무시하면 즉시 실패한다. 확정이 통과하면 즉시 행 기입과 receipt를 기록하고 종속 control은 soft로 기다려 시간 초과에는 `disabled-timeout` 진단만 남긴다. 검색 필드에 의존하는 driver는 같은 위젯 query로 판정하고 위젯을 인식하지 못하면 보류한다. 학교의 지역 근거가 없으면 catalog requiredDetail은 수동이다. 인증 시험은 클릭 전에 차단하고 inert placeholder로 실제 행 index/count만 보존한다.
- staged-address는 현주소3값 승인, 정확한 도로/우편번호 결과, 모달 readback·detail, 주소 전용 primary-pointer, 동기 소유 확인창, 원래 triplet/span과 닫힘을 순서대로 검증한다. 모달 저장은 로컬 복사이며 지원서 저장 허용이 아니다. 실패 시 캡처한 cancel→modalClose만 정리하고 소유가 불명확하면 사용자 처리를 안내한다. 원래 hidden/readonly 직접쓰기와 rollback, 공용 pointer 연산은 허용하지 않는다.
- 기존 엔티티 전체를 보호하고 일치하는 프로필을 소비한 뒤 빈 행에만 배정한다. 중첩 전공은 부모·역할·노드집합을 함께 확인하며 depth2/부모20/전공3 상한과 ADD +1·형제 불변을 검사한다. 숫자 GPA는 같은 부모의 score/scale 두 값이 모두 유지되어야 완료다. 알려지지 않은 tenant 한도와 required 미지원 값을 추정하지 않는다.
- 리뷰는 native 소유·검색 아닌 select/radio에만 선택지 존재를 검사해 `OPTION_UNMATCHED`를 붙이며 Greeting button dropdown으로 일반화하지 않는다. native 라디오의 리뷰 현재값은 정책 라벨이고, nativeOwnership이 없는 SK·현대·Greeting 핸들은 영향이 없다. 결과 모델의 기존 값 유지 예외에 `ROW_DRIVER_UNCONFIRMED`를 더했다.

### 호환 배포와 검증 한계

새 확장 배포 → 대상 설치/보급 확인 → BE v4 DB 활성 포인터 순으로 활성화한다. 구 확장은 새 capability/DERIVED enum 때문에 정책 전체를 거부할 수 있으며 구 validator probe는 실제 브라우저 검증을 대신하지 않는다. resource enabled는 운영 활성화가 아니다. 2026-10-20 live-eval 하네스에서 `f586619`의 3사 step 1–3 실화면 평가가 통과해 검색·주소·linkedForm 미확인 상태를 정정했다. C12–C14, 포커스 없는 창·사이드 패널(H7)과 공식 WSL/Linux 검증은 별도이며 이번 수집에서 migration·배포를 실행하지 않았다.

2026-10-20 C13에서 v4 resource의 프로젝트154를 활성화했다. seeder가 insert-only이므로 기존 DB에는 자동 반영되지 않으며 운영 반영 방식은 사람이 정한다. 상세 기본정보의 현주소를 선택 앵커로 바꾼 변경은 FE 상세 앵커, FE MRS2 플랫폼 지문(섹션 13 존재), BE `HplaceFormFingerprint.DETAIL_REQUIRED`(영문 이름만)를 함께 바꿔야 한다. 생년월일도 같은 규칙으로 선택 앵커가 됐다(kdi). 개발용 진단 출력은 기본으로 꺼져 있고 `VITE_AUTOFILL_DEBUG=true`로 빌드할 때만 켜진다.

### 실화면 정제 fixture와 builder 대조

C12는 페이지 함수로 원본 섹션을 새 비활성 문서에 허용 목록 복사해 등록했다(`frontend/fixtures/dom-snapshots/hplace-mrs2-step{2,3}-*`). 값·체크 상태와 모든 표시 텍스트를 지우고 id는 익명화, 선택지 코드와 `data-rel-value`는 같은 합성 코드표, 5자리 이상 숫자는 합성 번호로 바꾼다. 등록 전에는 브라우저 안 원본 대조, 하네스 구조 스냅샷과의 컨트롤 수 독립 대조, offline Chromium 외부 요청 0건을 확인했다. 첫 허용 목록에서 섹션 header·`data-dateinputformat`·`data-rel-value`·행 속성이 빠져 넓힌 뒤 재승인했다. id 익명화 때문에 템플릿 id에 의존하는 legacy 상세 모듈은 이 fixture로 재현되지 않는다. 대조 결과 게이팅 속성(disabled·data-rel-*·data-dates·선택지 수)은 builder와 같았고 tenant 선택 항목과 섹션 16 구성(경력153·프로젝트154·부가 항목)만 달랐다. 실구조로 native 수집을 비교할 때는 정책 `rootSelector`와 자산 태그 골격만 합성한다.

live-eval 하네스는 하네스가 소유하지 않는 상주 Chromium에 CDP로 붙고 브라우저·context·지원서 탭·전용 프로필을 닫거나 지우지 않는다. 평가 round 밖에서만 저장 핸들러 없는 단계 이동 요청을 보내며 다음·임시저장·제출 버튼과 단계 탭은 누르지 않는다. 로컬 BE가 내보내는 정책의 canonical nativeForm이 대상 HEAD 정책과 다르거나 확인되지 않으면 명시 허용 없이 실행하지 않는다. seeder가 insert-only라 정책을 고친 뒤에는 사람이 승인한 로컬 DB 재설정으로 재시드하고 지문 match를 확인한다. 보고에는 키·상태·개수만 남기고 값·URL·쿼리·쿠키·HTML은 남기지 않는다.

현재 계약·결정·과거 관측·단계별 검증의 상세는 [Hplace 어댑터](adapter-hplace.md)와 Current raw를 따른다.
