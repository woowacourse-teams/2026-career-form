# 자격증 재선택 때 채운 발급기관 교체와 세션 한정 채움 기억

> Issue: [CF-458](https://github.com/woowacourse-teams/2026-career-form/issues/458)
> Collected: 2026-11-16
> Approval-Digest: ea16894743540db9ef77644ebd4820e6b4fc14638c151f241aa10967d90036ff
> Source-Revision: aaffd610

자격증을 목록에서 다시 고를 때 이전 자격증의 발급기관이 남던 문제를 고친 결정이다. [승인 후보 스냅샷](approved-candidates.md)의 후보 1·2·3을 적는다. 바꾸지 않은 결정(`selected`·`manual` 신원 형식, 이름 수정 시 연결 해제, 발급기관 외 관련 필드의 비추론, 어학 시험 목록과 TOEIC Speaking, 한국폴리텍 번호 표기 대조)은 Supersedes가 가리키는 CF-368 근거와 그 앞의 CF-162 근거를 따른다. 규칙 문구의 정본은 `frontend/src/profile/catalog-data/README.md`의 Certificate selection이다.

## CF-368 결정에서 바뀐 것

CF-368은 "발급기관이 비었거나 공백뿐일 때만 채우고, 입력된 발급기관은 바꾸지 않는다"고 정했다. 이 규칙은 A를 고를 때 자동으로 채운 값도 입력된 값으로 봐서, B를 다시 고르면 A의 발급기관이 남고 그대로 저장됐다. CF-458은 이전 선택이 채운 글자가 그대로 남은 경우를 빈 칸처럼 다시 채우는 경우로 더했다. 사용자가 쓴 값을 보호하는 원칙은 그대로다.

## 채움 규칙 (후보 1)

- 자격증명을 카탈로그에서 고르면 발급기관이 비었거나 공백뿐일 때, 또는 같은 항목에서 이전 자격증 선택이 채운 글자와 정확히 같을 때 새 자격증 detail의 첫 ` · ` 조각으로 채운다.
- 그 밖의 발급기관은 바꾸지 않는다. 첫 선택 전에 입력한 값은 카탈로그 값과 같아도 남는다. 사용자 값을 남긴 선택 뒤에는 이전 채움을 잊는다.
- 이름 입력·지우기·직접 입력과 다른 칸 편집은 채운 값과 그 기억을 그대로 두므로, 다음 목록 선택이 바꾼다.
- 고쳤다가 채운 글자로 되돌린 값도 채운 값으로 본다(글자 비교).
- 타이핑, 직접 입력, 가져오기는 발급기관을 채우지 않는다.

## 세션 한정 기억과 이유 (후보 2)

- 채움 여부는 저장하지 않는다. 새 저장 필드를 만들지 않았다.
- 편집기가 메모리에 들고 있는 프로필에서만 알아본다. 프로필을 다시 불러오거나(새로고침, 옵션 페이지의 지원 공고 탭에 다녀오기, 저장 충돌 뒤 다시 불러오기) 가져온 뒤에는 채운 값도 입력한 값으로 보고 남긴다.
- 저장된 선택의 카탈로그 발급기관과 같으면 채운 값으로 보는 추론은 쓰지 않았다. 자격증 734건 중 613건이 한국산업인력공단이라, 같은 글자를 직접 입력한 값을 덮어쓰기 때문이다.
- 다시 불러온 뒤에도 바꾸려면 채움 여부를 저장하는 형식 변경이 따로 필요하다.

## StrictMode와 갱신 함수 순수성 (후보 3)

- 옵션 페이지는 `React.StrictMode`로 렌더되어 개발 빌드에서 useState 갱신 함수가 두 번 실행된다.
- `useProfileEditor`의 `changeProfile`은 갱신 함수 안에서 저장을 예약한다. 그래서 화면에 반영된 결과와 저장된 결과가 서로 다른 호출에서 나올 수 있다.
- 갱신 함수 안에서 항목 id를 키로 하는 Map이나 ref를 읽고 고치면 화면과 저장값이 갈린다. 키보드 선택은 화면 B·저장 A, 포인터 클릭은 화면과 저장 모두 A로 실측했다.
- 발급기관 채움 기억은 상태 항목 객체를 키로 하는 모듈 수준 WeakMap(`filledIssuers`)에 두고, 갱신 함수가 새로 만든 객체에만 한 번 쓴다. 바뀌지 않은 항목은 같은 객체로 돌려줘야 기억이 유지된다.
- production 빌드(`wxt build`)는 갱신 함수를 두 번 실행하지 않아 수동 확인으로는 이 결함이 드러나지 않는다. 테스트를 StrictMode로 렌더하고 마지막 `repository.save` 인자까지 확인한다.

## 검증

- `ProfileForm.certificate-issuer.test.tsx`(StrictMode 렌더, 화면·렌더 프로필·마지막 저장값 확인)와 `use-profile-editor.test.tsx`에 새 테스트 12개를 더해 고정했다. 수정 전(develop) 훅에서는 교체를 기대하는 일곱 개만 이전 발급기관이 남아 실패했고, 사용자 값 유지와 가져오기 보호 테스트 다섯 개는 통과했다.
- 리뷰의 변이 시험에서 찾은 빈틈(선택 사이 다른 칸 편집, 채운 글자로 되돌린 발급기관)은 그 일곱 개 가운데 두 테스트가 막는다.
- production 빌드를 Chrome for Testing 임시 프로필에 올려 다시 입력한 선택, 이름 지우기 뒤 선택, 다시 입력 없이 고른 다른 결과, 고친 발급기관 유지, 먼저 입력한 발급기관 유지를 화면과 `chrome.storage.local` 저장값으로 확인했다. 수정 전 훅으로 만든 빌드에서는 앞의 세 경우에 이전 발급기관이 남았다.

## 참고 코드

- `frontend/src/profile/hooks/use-profile-editor.ts`(`filledIssuers`, `certificateIssuerEdit`, `updateEntry`)
- `frontend/src/profile/catalog.ts`(`catalogCertificateIssuer`)
- `frontend/src/profile/components/CatalogNameInput.tsx`
- `frontend/src/profile/catalog-data/README.md`, `frontend/src/profile/components/DESIGN.md`
