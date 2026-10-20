# 에이치닷(Hplace) 공통 어댑터

> Topic: adapter-hplace
> Status: Current
> Current: [CF-177 C12·C13·시연 수정 근거](../../raw/issues/CF-177/documents/live-c12-c13-demo.md)
> History: [CF-177 근거](../../raw/issues/CF-177/documents/adapter-hplace.md); [CF-177 step 2·3 근거](../../raw/issues/CF-177/documents/live-step23.md); [CF-177 C12·C13·시연 근거](../../raw/issues/CF-177/documents/live-c12-c13-demo.md)
> Updated: 2026-10-20

## 현재 상태

MRS2 등록의 이름·휴대전화·이메일과 기존 기본정보 계약을 유지하고 새 범주를 v4 실행 정책과 공통 native 실행기로 연결한다. 학력·중첩 전공·숫자 GPA·경력·프로젝트·비인증 어학·자격증·현주소는 검증된 소유 구조와 활성 정책에서만 실행한다. v1/JOBDA의 인증 이후 입력 구조는 지원하지 않는다.

13범주 127키 중 활성 구현 또는 간접 소비는 95키다. 나머지는 의미 불일치13·구조 미확인16·지정 화면 부재1·파일 사용자 처리2로 구분한다. 사이트 전용27행은 별도 집계하며 required라는 이유로 대응 값을 추정하지 않는다. 전체 표는 [필드 현황](adapter-field-inventory.md)과 raw를 따른다.

기존 엔티티 전체 보호, 동일 위젯의 검색 tuple 확정, 현주소3값의 승인·로컬 모달 확정·최종 receipt, 부모와 역할을 함께 확인하는 중첩 전공 계약을 적용한다. 구조·옵션·정체성이 불명확하면 수동 처리하며 범용 실행기로 우회하지 않는다. 지원서 저장·제출·탭 이동·인증·파일은 자동 실행하지 않는다.

## step 2·3 실화면 수정 (2026-10-20)

- **검색 확정:** legacy Enter의 keyCode/charCode/which는 `KeyboardEventInit`로 넘긴다. content script에서 이벤트 속성을 덮으면 격리 world 래퍼에만 남아 사이트 핸들러가 0을 읽는다. 브라우저가 init 값을 무시하면 즉시 실패로 끝낸다. 같은 world의 jsdom 테스트는 이 결함을 잡지 못하므로 page world getter로 Enter를 확인하는 수신기로 단언한다.
- **검색 의존 driver:** 학위구분·고교 졸업구분 driver의 검색 필드 의존은 hidden 학교명 입력의 visible이 아니라 같은 위젯 query로 판정한다. 위젯을 인식하지 못하면 이름 기반 판정으로 돌아가 보류하고 driver 실패 시 학교 검색도 보류한다.
- **확정 뒤 종속 대기:** tuple readback·자격증 등록번호 숨김·시험 detail로 확정을 엄격히 판정한 뒤 즉시 행 기입과 검색 receipt를 기록한다. 종속 control은 클릭 전에 있던 것을 기준으로 라디오는 그룹 전체, 그 밖은 정확히 1개가 활성화될 때까지 soft로 기다린다. 시간 초과·소실·중복에도 기입을 유지하고 `disabled-timeout` 진단만 남긴다. linkedForm 세부 활성화는 focus 200ms poll·blur 평가로 비동기이며 native `blur()`에 의존하지 않는다.
- **driver 실행:** native driver는 stage 단위 한 pass로 모두 실행하고 실패 driver와 대상 요소가 겹치는 뒤 driver만 제외한다. 마지막 허용 요청에서 남은 driver는 `DRIVER_LIMIT_REACHED`로 보고한다. 자기 값이 검증된 비검색 driver는 종속 정착 실패와 무관하게 입력 완료이며, 보류 종속은 비검색 driver면 `ROW_DRIVER_UNCONFIRMED`, 검색 driver면 `ROW_SEARCH_UNCONFIRMED`다.
- **리뷰 비교:** native 라디오 현재값은 체크된 사이트 코드가 정책 options에서 정확히 대응될 때만 라벨로 바꾼다. 사이트가 정규화한 숫자 자기 기입(합성 `3.650` → `3.65`)은 둘 다 십진수이고 수치가 같을 때만 같은 값이다. 사용 불가 native 항목도 자기 행 itemIndex를 유지한다.
- **선택지와 정규화:** 같은 MRS2 template이라도 선택지 카탈로그는 테넌트마다 다르다. native select/radio의 활성 옵션에 프로필 라벨이 없으면 `OPTION_UNMATCHED`로 입력 불가 처리하고, 제공되지 않는 고용형태의 경력 행은 추가하지 않는다. 대입 검정고시 프로필은 고교 섹션 전체를 입력 불가로 둔다. 시험 등급은 닫힌 ACTFL 약어 표로만 확장하고, 주야간 표준값은 정책 `normalizations`로 `주간`/`야간`에 대응한다. 날짜 정밀도는 섹션 `data-dates` 토큰이 정한다.

## C12·C13와 미검증 테넌트 시연 수정 (2026-10-20)

- **프로젝트154 활성화:** 실구조에서 projectName이 행 구동자(maxlength 128)이고 시작·종료일은 YMD, 역할은 maxlength 128이다. 사용자 승인으로 활성화했고 gsenc·abl step 2에서 이름·기간·역할이 일치했다. 사이트 필수인 발주처·근무지는 프로필 키가 없어 비워 두며 확인 필요에도 표시되지 않으므로 사용자가 직접 입력한다. abl의 기여도도 비워 둔다.
- **자격증 등록번호:** maxlength 64이며 검색 결과 선택이 hidden code 입력을 focus해 linkedForm이 발급기관·등록번호·취득일을 연다.
- **C14 종료:** 실화면 step 3에서 metadata 이탈 진단이 0건이라 null/undefined 허용 보강은 하지 않았다.
- **지원 방식 판별:** 공고 상세·position API·공개 리소스로는 구분되지 않고 "지원하기" 뒤 도착 경로가 기준이다. `/app/applicant/registResume`는 MRS2, `/v1/applicant/write-resume/login`은 v1, `www.jobda.im/jobflex/login`은 JOBDA다(표본: ligdna v1, dorco JOBDA, huonsgroup·com2us·kdi MRS2).
- **현주소 없는 기본정보:** com2us처럼 섹션 13에 주소 제어가 전혀 없으면 현주소 없이 상세 기본정보(영문 이름·생년월일·성별·국적·보훈·장애·병역)를 처리한다. 일부만 있는 주소 구조는 계속 차단한다.
- **병역 날짜 정밀도:** 시작일 토큰이 `:YM`이면 월, `:YMD`(huonsgroup)면 일까지 기입·비교한다. 시작일을 인식하지 못하면 병역 하위 칸 전체가 비는 연쇄가 있었다.
- **영문 이름 순서:** 회사 안내가 순서를 명시하면 그 순서, 안내가 전혀 없으면 성 이름(사용자 결정), 안내가 다른 영역에만 있거나 중복·모호하면 미기입이다. 안내 없는 회사가 이름 성 순서를 기대할 수 있다는 한계가 있다.

## 검증과 배포 경계

10월18/19 두 테넌트의 구조 관측과 P4 자동 검증은 로컬 구현의 근거다. 10월12/13 설치 관측은 과거 revision의 제한된 증거이며 소실된 임시 원본을 복구·재검증한 것으로 취급하지 않는다.

2026-10-20 live-eval 하네스로 `1759db5`와 `f586619`(C9·C7·C11 포함) CLEAN 빌드에서 abl·careerhyundai·gsenc의 step 1–3 실화면 평가를 통과했고 두 실행의 수치는 같았다. 이로써 이전의 검색·주소·linkedForm 미확인 상태를 정정한다. 이후 `4962c96`(C13)과 `6a7a141`(시연 수정)에서도 3사 step 1–3이 모두 통과했다. 포커스 없는 창·사이드 패널 동작(H7), 공식 WSL/Linux 검증과 운영 배포는 별도다. 하네스는 상주 Chromium에 CDP로 붙고 무저장 단계 이동만 하며, 서빙 정책 지문이 대상 HEAD 정책과 match일 때만 평가한다. 정책을 고친 뒤에는 사람이 승인한 로컬 DB 재설정으로 재시드해야 한다.

새 확장 배포 → 대상 설치/보급 확인 → BE v4 DB 활성 포인터 변경 순서를 따른다. resource enabled를 운영 활성화로 해석하지 않으며 이 수집에서 migration·배포를 실행하지 않는다.

## 변경 이유

2026-10-20 후반에는 실화면 정제 fixture로 합성 builder를 대조하고(C12), 프로젝트154를 활성화했으며(C13), 처음 보는 테넌트 시연에서 드러난 현주소 앵커·병역 날짜 정밀도·영문 이름 순서 문제를 고쳤다. v3의 등록·기본정보 범위에 후속 단계 구조와 정책 계약을 추가했다. 2026-10-20에는 실화면에서 드러난 분석 루프 정체와 학교·전공·자격·시험 검색 미실행의 원인(격리 world의 Enter 속성, 첫 실패 driver 정지와 예산 소진, hidden 검색 의존, 라디오 코드/라벨 비교 등)을 수정하고 3사 실화면으로 확인했다. 과거 주소 모달 저장 제외 판단은 원래 주소로 복사하는 로컬 확정 근거로 정정했다. 상세한 현재 계약·역사·검증 제한은 연결된 raw를 따른다.
