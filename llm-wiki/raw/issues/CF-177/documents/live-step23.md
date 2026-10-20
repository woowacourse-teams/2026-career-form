# Hplace step 2·3 실화면 실패 수정과 live-eval 근거

> Issue: CF-177
> Collected: 2026-10-20
> Approval-Digest: fdbe4510fabdf1aa3e1f9a6e7373ba1558ada47bdde352eea116187bcf17ef52
> Source-Revision: f5866191b17bb75cd5250c76f8bc2f6242ab1a54

이 문서는 2026-10-19 수집본 이후 별도로 승인된 신규 후보 K41–K55를 수집한 기록이다. Approval-Digest는 후보 파일에서 `<!-- NEW-CANDIDATES-BEGIN -->` 줄의 줄바꿈 다음 바이트부터 파일 끝까지의 UTF-8 바이트에 대한 SHA-256이며, 수집 직전에 다시 계산해 일치를 확인했다. 기존 40후보(K01–K40)의 승인과 digest는 [manifest](../manifest.md) 머리말을 따르며 이 문서는 그 내용을 바꾸지 않는다. 실제 지원자 값·계정·세션·URL·대화 전문은 포함하지 않고, 예시 값은 모두 합성이다.

## 기준선과의 관계

이 문서는 아래 2026-10-19 근거를 대체하지 않고 보강한다. 여기서 바꾸거나 더하지 않은 계약·관측·검증 한계는 각 기준 문서를 따른다.

- [Hplace 공통 어댑터 기준선](adapter-hplace.md)
- [Hplace 127키와 사이트 전용 항목 기준선](adapter-field-inventory.md)
- [Hplace 공통 실행 정책과 배포 경계 기준선](adapter-development.md)
- [비식별 구조 관측과 역사적 근거](live-evidence.md), [단계별 검증](verification.md)

후보 기준 revision은 `f586619`이며 실화면 근거는 `1759db5`와 `f586619` CLEAN 빌드에서 abl·careerhyundai·gsenc 세 테넌트의 step 1–3을 실행한 결과다. 두 실행의 수치는 같았다.

## topic별 현재 상태 변경

### adapter-hplace

- 기준선의 "최신 설치 확장의 검색·주소·linkedForm 미확인"은 정정한다. `f586619`(C9·C7·C11 포함)에서 3사 step 1–3 실화면 평가를 통과했다. C12–C14는 남은 단계다(K40 정정, K55).
- 검색 확정의 legacy Enter는 keyCode/charCode/which를 `KeyboardEventInit`로 넘긴다. 격리 world에서 이벤트 속성을 덮어쓰면 사이트에 전달되지 않는다(K41, K23 정정).
- 검색 필드에 의존하는 학위구분·고교 졸업구분 driver는 같은 위젯 query로 정착을 판정하고, 위젯을 인식하지 못하면 보류한다(K42).
- 검색은 엄격한 확정 판정 뒤 즉시 행 기입과 receipt를 기록하고, 종속 control은 soft로 기다리며 시간 초과에는 `disabled-timeout` 진단만 남긴다(K53). linkedForm 세부 활성화는 비동기다(K47).
- native 라디오의 리뷰 현재값은 정책 라벨로 바꾸고(K45), native select/radio는 선택지 카탈로그 존재를 검사해 `OPTION_UNMATCHED`로 처리한다(K46, K52).
- 시험 등급은 닫힌 ACTFL 약어 표로만 전체 표기 옵션에 대응한다(K48). 사이트가 정규화한 숫자 자기 기입은 충돌이 아니다(K49). 사용 불가 native 항목도 자기 행 itemIndex를 유지한다(K50). 주야간 표준값은 정책 정규화가 필요하다(K51).
- 날짜 정밀도는 섹션의 `data-dates` 토큰으로 정하며 테넌트 단위로 일반화하지 않는다(K44).
- 대입 검정고시 프로필은 고교 섹션 전체를 입력 불가로 두고 테넌트가 제공하지 않는 고용형태의 경력 행은 추가하지 않는다(K52).
- 보류 종속 항목의 코드와 가시 행 규칙(K54).

### adapter-field-inventory

키별 지원 분류 수(구현 89 등)는 이 문서에서 바꾸지 않는다. 아래 키의 실행 조건과 제한만 보강한다.

| 키 | 보강 내용 | 근거 |
| --- | --- | --- |
| 고교·대학·대학원 입학일/졸업일 6규칙 | 정책 formats `["YM","YMD"]`; 섹션 `data-dates` 토큰이 정밀도를 정함(careerhyundai 학력 YMD, gsenc·abl 학력 YM). 기존 값 보호·신원 불일치 차단·최대 졸업일 검사 유지 | K44 |
| 고교·대학·대학원 `attendanceType` | `attendance:day`/`attendance:night`를 정책 `normalizations`로 `주간`/`야간`에 대응 | K51 |
| 대학·대학원 `degreeLevel`, 고교 `completionStatus` | 검색 필드 의존 driver는 위젯 query로 판정, 위젯 미인식 시 보류, driver 실패 시 학교 검색도 보류 | K42 |
| 대학·대학원 `gpaScore` | native number 칸에서 두 값이 모두 십진수이고 수치가 같으면 같은 값(예: 합성 `3.650` → `3.65`) | K49 |
| `languages.languageTest.grade` | 닫힌 ACTFL 약어 표(NL·NM·NH·IL·IM·IM1–3·IH·AL·AM·AH)만; 같은 옵션이 없고 전체 표기 옵션이 정확히 하나일 때만 확장; 기입·행 배정·결과 확인이 같은 규칙 | K48 |
| `careers.career.employmentType` | 선택지 카탈로그는 테넌트마다 다름(careerhyundai 7개 라벨, 아르바이트·기타 없음; 이전 GS리테일·한국타이어 관측형 9개). 활성 옵션에 프로필 라벨이 없으면 경력 행을 추가하지 않고 `OPTION_UNMATCHED` 1회 보고 | K46, K52 |
| `careers.career.terminationReason` | 프로필 값이 없어 사용 불가가 된 행 항목도 자기 행 itemIndex 유지 | K50 |
| `education.highSchool.academicProcess` | `대입 검정고시`면 고교 섹션 전체 입력 불가, 08 선택지는 정책에 넣지 않고 `01 졸업`을 체크하지 않음. 전용 binding은 실화면 검증 뒤 별도 후보(H4) | K52 |
| 전공 구분·계열·주야간, 자격증 발급기관 등 검색 종속 항목 | 검색 확정 뒤 비동기 활성화; soft 대기와 `disabled-timeout` 진단, 보류 시 `ROW_SEARCH_UNCONFIRMED` 또는 `ROW_DRIVER_UNCONFIRMED`. 포커스 없는 창·사이드 패널 동작은 별도 수동 확인(H7) | K47, K53, K54 |

### adapter-development

- fields 예산 상한과 진전 없음 중단(K17)은 유지한다. native 소유 driver는 stage 단위 한 pass로 모두 실행하고 실패 driver와 대상 요소가 겹치는 뒤 driver만 결과 없이 제외한다. 마지막 허용 요청에서 실행할 driver가 남으면 기입 없이 결과만 내고 `DRIVER_LIMIT_REACHED`로 보고한다. non-native(SK·현대·Greeting)는 첫 실패 정지를 유지하며 예산 상향과 9번째 요청은 기각했다(K43).
- 리뷰의 선택지 존재 검사는 native 소유·검색 아닌 select/radio에 한정하고 Greeting button dropdown으로 일반화하지 않는다. nativeOwnership이 없는 SK·현대·Greeting 핸들은 라디오 리뷰값 변경의 영향을 받지 않는다(K45, K52).
- 결과 모델의 기존 값 유지 예외에 `ROW_DRIVER_UNCONFIRMED`를 더했다(K54).
- 정책 수정 뒤 실화면 평가는 사람이 승인한 로컬 DB 재설정으로 재시드하고 서빙 정책 지문 match를 확인한 뒤에만 한다. seeder의 insert-only 경계(K15)는 그대로다(K55).
- live-eval 하네스는 상주 Chromium CDP attach, 무저장 단계 이동, 서빙 정책 지문, 값 없는 보고를 따른다(K55).

## 승인 후보 원문

아래는 승인 digest 대상 본문 중 후보 K41–K55와 정정·보강 관계 표를 옮긴 것이다. 제목 단계만 이 문서 구조에 맞춰 한 단계씩 낮췄고 본문은 바꾸지 않았다. 같은 본문의 "raw/topic 반영 계획" 절은 이 수집으로 이행한 작업 절차여서 옮기지 않았다.

### 신규 후보 (K41–K55)

- 기준: `CF-177`, HEAD `f586619`, 2026-10-20. 실화면 근거는 `1759db5`와 `f586619` CLEAN 빌드의 3사(abl·careerhyundai·gsenc) step 1–3 결과다(두 실행 수치 동일).
- 출처: `live-eval/step23-fix-plan.md` §9의 KC-1–KC-7, 그 뒤 클러스터·추가 수정 커밋과 RED 로그.
- 실제 지원자 값·계정·세션·URL·대화 전문은 포함하지 않는다. 예시 값은 모두 합성이다.

#### K41. 격리 world 이벤트 속성은 사이트에 전달되지 않음 (KC-1)

content script에서 `Object.defineProperties`로 덮은 keyCode/which는 isolated world의 이벤트 래퍼에만 남는다. page world의 jQuery 위임 핸들러는 0을 읽어 학교·전공·자격·시험 검색이 한 번도 실행되지 않았다. legacy 키 값은 `KeyboardEventInit`(keyCode/charCode/which)로 넘기고, 브라우저가 무시하면 즉시 실패로 끝낸다. jsdom 같은 world 테스트는 이 결함을 잡지 못하므로 page world getter로 Enter를 확인하는 사이트 모사 수신기로 단언하고, 부정 경로에는 검색 횟수를 단언한다.

근거: 9072a82; step23-C1-red.log; step23-fix-plan.md §0 F1.

#### K42. 검색 필드 의존은 위젯 query로 판정 (KC-2)

학위구분·고교 졸업구분 driver가 검색 필드에 의존할 때 hidden `academyName` 입력의 visible을 기다리면 절대 정착하지 않는다. 의존 상태는 같은 위젯의 query로 판정한다. 위젯을 인식하지 못하면(query 0개·중복) 이름 기반 판정으로 돌아가 보류하는 fail-closed를 유지한다. driver가 실패하면 학교 검색도 함께 보류한다.

근거: 6e73ded; step23-C3-red.log.

#### K43. native driver 실패는 stage 단위 한 pass로 묶음 (KC-3)

첫 실패 driver에서 멈추고 재수집하면 실패 하나가 fields 요청 하나를 써서 예산 8회에 닿고 결과 없이 정체한다. native 소유 driver는 같은 stage에서 모두 실행하고, 실패 driver의 대상과 요소가 겹치는 뒤 driver만 결과 없이 제외한다. 마지막 허용 요청에서 실행할 driver가 남으면 기입 없이 결과만 내고 대기 항목은 `DRIVER_LIMIT_REACHED`로 보고한다. K17의 상한과 진전 없음 중단은 유지하며, SK·현대·Greeting 등 non-native는 첫 실패 정지를 유지한다. 예산 상향과 9번째 요청은 기각했다.

근거: f221f7d; step23-C2-red.log; 실화면 step 2 fields 5회·driver pass 4회.

#### K44. MRS2 날짜 정밀도는 섹션별 토큰 (KC-4)

MRS2 날짜 정밀도는 섹션의 `data-dates` 토큰(dateInputFormat, 기본 YMD)이 정한다. careerhyundai 학력은 YMD, 병역은 YM이고 gsenc·abl 학력은 YM이다. 테넌트 단위로 일반화하지 않는다. v4 학력 날짜 6규칙의 formats를 `["YM","YMD"]`로 넓혀도 기존 값 보호·신원 불일치 차단·최대 졸업일 검사는 그대로다. 정밀도가 정책과 다르면 같은 학교 행을 신원 불일치로 보고 중복 행을 계획할 수 있다.

근거: a24b539; step23-C5-red.log.

#### K45. native 라디오의 리뷰 현재값은 정책 라벨 (KC-5)

native 라디오의 currentValue가 사이트 코드(예: 50·01·LEAVE)이면 프로필 라벨과 비교돼 실행 자신의 기입이 기존 값 충돌로 표시된다. 체크된 라디오 하나의 정규화 라벨이 정책 options에서 정확히 그 코드로 대응될 때만 라벨을 돌려주고, 그 밖에는 원래 코드를 유지해 충돌 보호를 지킨다. 작성안함 빈 라디오는 빈 값으로 둔다. nativeOwnership이 없는 SK·현대·Greeting 핸들은 영향이 없다.

근거: 0c3a5bb; step23-C4-red.log.

#### K46. 선택지 카탈로그는 테넌트마다 다름 (KC-6)

같은 MRS2 template이라도 선택지 카탈로그는 공고·테넌트마다 다르다. careerhyundai의 고용형태는 7개 라벨이며 아르바이트·기타가 없다. 이전 GS리테일·한국타이어 관측형은 9개 라벨이다. 정책 options 존재를 현재 지원서 선택지 존재로 보지 않는다(K52).

근거: step23-fix-plan.md §4 C9; 1664475.

#### K47. linkedForm 세부 활성화는 비동기 (KC-7)

linkedForm의 `input[data-rel-id]`는 focus 때 200ms poll, blur 때 평가한다. 검색 commit 뒤 전공 구분·계열·주야간, 자격증 발급기관 등의 활성화는 비동기다. native `blur()`에 의존하지 않는다. 하네스는 Playwright focus emulation 때문에 포커스 없는 창·사이드 패널의 동작을 관측할 수 없어 그 경우는 별도 수동 확인(H7) 대상이다.

근거: step23-fix-plan.md §4 C10, §8 항목 4·5; 8a13c1b.

#### K48. 시험 등급 ACTFL 약어 별칭

OPIc 등급 옵션이 `Intermediate High`처럼 전체 표기만 있는 테넌트에서 프로필 `IH`가 일치하지 않아 입력되지 않았다. 닫힌 ACTFL 약어 표(NL·NM·NH·IL·IM·IM1–3·IH·AL·AM·AH)만 둔다. 프로필 값과 같은 옵션이 있으면 그대로 쓰고, 없을 때 전체 표기 옵션이 정확히 하나면 그 옵션으로 확장한다. 기입·기존 행 배정 판정·결과 화면 확인이 같은 규칙을 써야 한다. 결과 판정만 원문을 기대값으로 쓰면 입력된 값이 '입력 결과 확인'으로 남는다.

근거: c768f43, cfb5425; step23-C1-red.log의 C15·C15b 절.

#### K49. 사이트가 정규화한 숫자 자기 기입은 기존 값 충돌이 아님

평점 합성값 `3.650`을 쓰면 사이트 숫자 칸에는 `3.65`가 남는다. 다음 분석 pass의 리뷰가 문자열로 비교하면 실행 자신의 기입을 기존 값 충돌로 보고 결과가 '입력 결과 확인'으로 남는다. native 소유 number 칸에서 두 값이 모두 십진수이고 수치가 같으면 같은 값으로 본다. 다른 수치나 non-native 칸에는 이 완화를 적용하지 않는다.

근거: 5aefd99; step23-C1-red.log의 GPA RED 절.

#### K50. 사용 불가 native 항목도 자기 행 itemIndex를 유지

재직중 경력처럼 종료사유 프로필 값이 없는 행 항목이 사용 불가가 되면서 itemIndex를 잃으면 결과 화면이 다른 경력의 종료사유를 그 항목의 저장값으로 보고 '입력 못함'으로 표시한다. native 행 배정 index가 있으면 사용 불가 항목에도 그대로 둔다. 다른 항목의 값은 그 항목의 저장값이 될 수 없다.

근거: fabc58f; step23-C1-red.log의 unbound-row RED 절.

#### K51. MRS2 주야간 표준값은 정책 정규화가 필요

프로필 표준값 `attendance:day`/`attendance:night`는 native DIRECT 라디오의 정책 옵션 라벨 `주간`/`야간`과 바로 일치하지 않는다. 실화면 주야간 미입력 4건의 공통 원인이었다. v4 정책 `normalizations`에서 고교·대학·대학원 attendanceType 키에 한해 값을 바꾼다. 라벨 `주간` 프로필은 수정 전에도 통과하는 대조 실험으로 원인을 분리했다.

근거: 8a985c5; step23-C10-red.log RED 2 메모.

#### K52. 테넌트 카탈로그가 경력 행 추가를 결정하고 검정고시는 fail-closed (C9)

리뷰는 native 소유·검색 아닌 select/radio에만 선택지 존재를 검사한다. Greeting button dropdown은 열기 전 옵션이 비어 있어 일반화하지 않는다. 활성 옵션에 프로필 라벨이 하나도 없을 때만 `OPTION_UNMATCHED`로 입력 불가 처리하고 프로필 항목·itemIndex를 유지한다. 중복·비활성 같은 구조 실패에는 프로필 탓 코드를 붙이지 않는다. 지원서에 없는 고용형태의 경력은 행을 추가하지 않고 리뷰에서 한 번만 보고해 추가 분석 pass도 만들지 않는다. 학업과정이 `대입 검정고시`인 프로필은 고교 섹션 전체를 입력 불가로 둔다. 08 검정고시 선택지를 정책에 넣지 않으며 `01 졸업`을 체크하지 않는다. 전용 binding은 실화면 검증 뒤 별도 후보다(H4).

근거: 1664475; step23-C9-red.log.

#### K53. 검색은 확정을 먼저 기록하고 종속은 soft 대기 (C10)

의존을 선언만 하면 세부가 끝내 활성화되지 않을 때 tuple이 기록되지 않아 행 전체가 막힌다. 확정 판정은 tuple readback·LICENSE 등록번호 숨김·EXAM detail로 엄격하게 하고, 통과하면 즉시 행 기입과 검색 receipt를 기록한다. 그 뒤 클릭 전에 있던 의존 control을 기준으로 라디오는 그룹 전체, 그 밖은 정확히 1개가 활성화될 때까지 기다린다. 사라지거나 중복되면 시간 초과와 같이 다루고, 시간 초과에도 기입을 유지하고 `disabled-timeout` 진단만 남긴다. 라디오 그룹은 단일 요소 조회로 기다리면 대기 없이 통과하므로 그룹 단위로 조회한다.

근거: 8a13c1b, 8a985c5; step23-C10-red.log; step23-C10-old-client-probe.log.

#### K54. 검증된 driver는 기입으로, 보류 종속은 driver 종류 코드로 (C11)

자기 값이 검증된 비검색 native driver는 종속 정착에 실패해도 입력 완료로 보고하고 실패 대상에서 뺀다. 보류된 종속은 driver 코드를 상속하지 않는다. 비검색 driver의 종속은 `ROW_DRIVER_UNCONFIRMED`, 검색 driver의 종속은 기존 `ROW_SEARCH_UNCONFIRMED`다. 행 안에 수집 후보가 없는 종속(COMMITTED gate 종속, 비게이트 driver 의존, 등급·점수는 1행 병합)은 값 없는 고정 id 수동 행으로 보인다. REGISTRATION(개인정보 gate), 기존 값 exit, 라이브 값이 있는 칸, 이미 수집된 칸은 행을 만들지 않으며 pass 간 중복도 막는다. 결과 모델의 기존 값 유지 예외에 `ROW_DRIVER_UNCONFIRMED`를 더했다.

근거: 1fbcade; step23-C11-red.log.

#### K55. live-eval 하네스 모델

- 상주 Chromium: 하네스가 소유하지 않는 분리 상주 Chromium에 CDP로 붙는다. 마지막 세션을 복원해 실행마다 로그인·이메일 인증을 반복하지 않는다. 브라우저·기본 context·지원서 탭과 전용 프로필은 닫거나 지우지 않는다. 확장은 전용 복사본을 hot reload한다.
- 무저장 단계 이동: 평가 round 밖에서만 사이트의 단계 이동과 같은 POST(지원서·공고 식별자와 단계 번호)를 보내고 저장 핸들러는 부르지 않는다. 다음·임시저장·제출 버튼과 단계 탭은 클릭하지 않는다.
- 서빙 정책 지문: 로컬 BE가 실제로 내보내는 정책의 canonical nativeForm과 대상 HEAD 정책을 비교해 차이 경로만 보고한다. 불일치나 미확인이면 명시 허용 없이 실행하지 않는다.
- 재시드: seeder가 insert-only(K15)라서 정책 파일을 고쳐도 이미 시드된 로컬 DB는 옛 정책을 내보낸다. 정책 수정 뒤에는 사람이 승인한 로컬 DB 재설정(파괴적 명령)으로 재시드하고 지문 match를 확인한 뒤에만 정책 의존 평가를 한다.
- 보고: summary와 verify JSON에는 키·상태·개수만 남기고 값·URL·쿼리·쿠키·HTML은 남기지 않는다. 스크린샷은 로컬 전용이다.

근거: plan.md 2026-10-19 16:45 체크포인트; step23-fix-plan.md §1·§2·§7; step23-CH-red.log; harness `reports/auto-2026-10-20T00-53-15.024Z/summary.md`.

### 신규 후보의 정정·보강 관계

| 기존 후보 | 현재 해석 | 근거 |
| --- | --- | --- |
| K23 제한된 legacyEnter keypress13 | keyCode/which는 init dict로 넘겨야 page world에 전달됨 | K41 |
| K17 fields 예산·진전 검사 | 상한은 유지하고 native driver를 stage 단위로 일괄 실행, 마지막 요청은 보고 전용 | K43 |
| K22 고교 작성안함 기본값 | 리뷰 현재값은 정책 라벨, 작성안함 빈 값 유지 | K45 |
| K19 정적 코드와 tenant Sn | 선택지 카탈로그 존재도 리뷰에서 검사 | K46, K52 |
| K25 시험 등급 정확 코드/라벨 | 닫힌 ACTFL 약어 표에 한해 정확히 하나인 전체 표기로 확장 | K48 |
| K15 insert-only 저장 경계 | 정책 수정 뒤 실화면 평가는 승인된 로컬 재시드와 지문 match가 전제 | K55 |
| K40 최신 설치 확장 검색/주소/linkedForm 미확인 | `f586619`(C9·C7·C11 포함)에서 3사 step 1–3 실화면 통과. C12–C14는 남음 | K55 |
