# 에이치닷(Hplace) 공통 어댑터

> Topic: adapter-hplace
> Status: Current
> Current: [CF-310 요청 구조 근거](../../raw/issues/CF-310/documents/hplace-mrs2-requests.md)
> History: [CF-177 근거](../../raw/issues/CF-177/documents/adapter-hplace.md); [CF-177 step 2·3 근거](../../raw/issues/CF-177/documents/live-step23.md); [CF-177 C12·C13·시연 근거](../../raw/issues/CF-177/documents/live-c12-c13-demo.md); [CF-177 KDI·구조 미확인 근거](../../raw/issues/CF-177/documents/live-kdi-unverified.md); [CF-177 후속 보완 묶음 근거](../../raw/issues/CF-177/documents/live-followup-bundle.md); [CF-310 요청 구조 근거](../../raw/issues/CF-310/documents/hplace-mrs2-requests.md)
> Updated: 2026-10-21

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
- **현주소·생년월일 없는 기본정보:** com2us처럼 섹션 13에 주소 제어가 전혀 없거나 kdi처럼 생년월일·성별 칸이 없어도 상세 기본정보를 처리한다. 상세 섹션에 필수 앵커는 없고(후속 보완에서 정정) 칸이 있는데 형식이 다른 칸만 차단한다. 아래 후속 보완 묶음 절을 따른다.
- **병역 날짜 정밀도:** 시작일 토큰이 `:YM`이면 월, `:YMD`(huonsgroup)면 일까지 기입·비교한다. 시작일을 인식하지 못하면 병역 하위 칸 전체가 비는 연쇄가 있었다.
- **영문 이름 순서:** 회사 안내가 순서를 명시하면 그 순서, 순서 문구 없이 홍길동 표준 예시가 한 순서로만 있으면 예시 순서(kdi `Hong, Gildong`→성 이름, 같은 순서 반복 허용, 쉼표 없이 띄어쓰기), 안내가 전혀 없으면 성 이름(사용자 결정)이다. 안내가 다른 영역에만 있거나 중복·섞인 순서·홍길동 아닌 예시는 미기입이고, 순서 접미사 없는 후보는 BE 응답과 무관하게 FE 쓰기에서 거부한다. 안내 없는 회사가 이름 성 순서를 기대할 수 있다는 한계가 있다.
- **구조 미확인 칸 표시:** 1단계에서 칸이 화면에 있고 열려 있으며 프로필 값이 있는데 상세·기본 계약을 통과하지 못하면 결과 "확인 필요"에 `입력 불가(화면 구조 확인 불가)`(`STRUCTURE_UNVERIFIED`)로 표시한다. 화면에 없는 칸·닫힌 조건부 칸·값 없는 칸·범용 실행은 제외하며, location이 없는 분리 문서에서는 판정 전에 빠져나온다.
- **진단 로그:** 기본으로 꺼져 있고 `VITE_AUTOFILL_DEBUG=true` 빌드에서만 켜진다(하네스는 명시해 빌드). 시연 중 콘솔 오류(CSP `script-src:` 오타, fonts.gstatic.com CORS)는 사이트 쪽이다.

## 후속 보완 묶음 (2026-10-20)

- **칸 단위 인식:** 1단계 상세 기본정보의 인식 조건은 플랫폼 지문(MRS2 writeResume 자산, 유일한 `form#frm`, 섹션 11·13 각 1개)뿐이다. 영문 이름·생년월일·현주소·비상연락처는 각각 검증해 없는 칸은 생략하고 형식이 다른 칸만 제외하며(진단 키 `hplace.detail.<칸>`), 제외된 칸은 구조 미확인 표시로 드러난다. 성별 수집은 영문 이름에 의존하지 않고 BE `DETAIL_REQUIRED`는 빈 집합이다. 이전의 묶음 인식은 com2us·kdi처럼 칸 하나가 없을 때마다 모듈 전체가 빠지는 원인이었다.
- **효율:** `nativeForm()` 검증과 형식 지문은 정책 객체별 한 번만 계산하고 소유 섹션 하나만 다시 스캔한다. 검색 확정·주소 대기 루프는 매 틱 JSON 직렬화 대신 참조·필드 비교를 쓰고 저장 프로필 재로드는 대기 시작 전과 결과 반환 직전에만 한다(쓰기 직전 재확인 유지). 정책을 객체째 교체하면 재검증·중단되며, 테스트는 정책을 제자리에서 바꾸지 말고 교체해야 한다.
- **안내 구분:** 정책 비호환(`POLICY_INCOMPATIBLE`)은 확장 업데이트 안내, 정책 미등록(`ADAPTER_POLICY_UNAVAILABLE`)은 정책 없음 안내, v1 지원자 앱·채용 빌더 페이지는 미지원 사유를 보인다(`hplaceDocumentKind()`). `npm run zip`은 `VITE_AUTOFILL_DEBUG=true`면 실패한다.
- **금지 동작과 재실행:** 공용 workflow 테스트 하네스가 단계 탭·이전·임시저장·다음·제출·동의·인증 클릭과 모든 submit을 금지로 집계하고(허용은 staged address 모달의 자체 저장뿐), 같은 프로필로 2단계를 두 번 실행하거나 사이트가 날짜·학교명을 정규화한 뒤에도 행·검색·입력이 늘지 않는다. 신원 필드 둘 이상인 섹션에서 기존 행이 한 필드만 다르면 중복 행을 추가하지 않고 섹션을 사용자 처리로 넘긴다.
- **저장 후 다시 연 페이지:** 신원이 맞는 기존 행은 짝인 프로필 항목(`itemIndex`)을 유지하고, 결과는 승인·선택 없이 사이트 형식(점 날짜·옵션 라벨·검색명·숫자 평점)으로 비교해 같으면 "기존 값 유지", 다르면 "기존 값과 다름"으로 보고한다. 기존 행 충돌 검사와 검토 계획의 충돌 판정도 같은 형식으로 비교하며 주/야간 같은 표준 토큰은 라벨로 바꾼다. 사용자가 직접 고친 값이 있는 행의 섹션은 그대로 사용자 처리로 남는다(안내 문구는 아직 "자동으로 입력하지 못했어요"라 후속 과제). gsenc·abl 2단계 실화면에서 76·71건 "입력 못함"이 직접 고친 직장경력 17건으로 줄었다.

## 요청 구조 (2026-10-21)

- 저장은 `/mrs2/applicant/resume/saveStep<단계>`로 간다. 하단 임시저장 버튼(`data-type="tempSave"`)만 같은 경로에 `validateYn=false`를 붙여 저장하고 이동하지 않는다. 작성 모드 1–4단계의 단계 탭과 다음 버튼은 `type="submit"`이라 검증을 거쳐 `validateYn=true`로 저장한 뒤 이동한다. 5단계의 `saveStep5`는 임시저장이 아니라 최종제출이다.
- `/mrs2/applicant/resume/step<단계>.json`은 화면이 단계 데이터를 불러오는 POST이며 저장하지 않는다.
- 학교·전공·자격증·어학 조회는 `/com/code/retrieve*List` POST다(2026-10-21 다섯 테넌트에서 관측).
- 무저장 단계 이동은 사이트 `locationSubmit`과 같이 `resumeSn`, `recruitNoticeSn`, `step`만 담아 `writeResume`에 보내는 POST다. 사이트도 미리보기 모드와 5단계 화면에서는 저장 없이 이 요청만 보낸다.
- 실사이트 QA 하네스(`frontend/scripts/live-qa`, CF-177 live-eval 도구에서 일부를 옮김)의 요청 허용 목록과 원복이 이 구조를 쓴다. 근거는 [CF-310 요청 구조](../../raw/issues/CF-310/documents/hplace-mrs2-requests.md)를 따른다.

## 검증과 배포 경계

10월18/19 두 테넌트의 구조 관측과 P4 자동 검증은 로컬 구현의 근거다. 10월12/13 설치 관측은 과거 revision의 제한된 증거이며 소실된 임시 원본을 복구·재검증한 것으로 취급하지 않는다.

2026-10-20 live-eval 하네스로 `1759db5`와 `f586619`(C9·C7·C11 포함) CLEAN 빌드에서 abl·careerhyundai·gsenc의 step 1–3 실화면 평가를 통과했고 두 실행의 수치는 같았다. 이로써 이전의 검색·주소·linkedForm 미확인 상태를 정정한다. 이후 `4962c96`(C13)과 `6a7a141`(시연 수정)에서도 3사 step 1–3이 모두 통과했다. 후속 보완 묶음 `b809920`에서는 빈 페이지(careerhyundai)와 임시저장 값이 남은 페이지(gsenc·abl)를 함께 돌려, 사용자가 직접 고친 행의 섹션만 확인 필요로 남았다. 포커스 없는 창·사이드 패널 동작(H7), 공식 WSL/Linux 검증과 운영 배포는 별도다. 하네스는 상주 Chromium에 CDP로 붙고 무저장 단계 이동만 하며, 서빙 정책 지문이 대상 HEAD 정책과 match일 때만 평가한다. 정책을 고친 뒤에는 사람이 승인한 로컬 DB 재설정으로 재시드해야 한다.

새 확장 배포 → 대상 설치/보급 확인 → BE v4 DB 활성 포인터 변경 순서를 따른다. resource enabled를 운영 활성화로 해석하지 않으며 이 수집에서 migration·배포를 실행하지 않는다.

## 변경 이유

2026-10-20 후반에는 실화면 정제 fixture로 합성 builder를 대조하고(C12), 프로젝트154를 활성화했으며(C13), 처음 보는 테넌트 시연에서 드러난 현주소 앵커·병역 날짜 정밀도·영문 이름 순서 문제를 고쳤다. v3의 등록·기본정보 범위에 후속 단계 구조와 정책 계약을 추가했다. 2026-10-20에는 실화면에서 드러난 분석 루프 정체와 학교·전공·자격·시험 검색 미실행의 원인(격리 world의 Enter 속성, 첫 실패 driver 정지와 예산 소진, hidden 검색 의존, 라디오 코드/라벨 비교 등)을 수정하고 3사 실화면으로 확인했다. 과거 주소 모달 저장 제외 판단은 원래 주소로 복사하는 로컬 확정 근거로 정정했다. 상세한 현재 계약·역사·검증 제한은 연결된 raw를 따른다.
