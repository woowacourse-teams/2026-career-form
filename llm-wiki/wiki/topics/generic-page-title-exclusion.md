# 범용 수집의 페이지 이름 제외

> Topic: generic-page-title-exclusion
> Status: Current
> Current: [CF-472 범용 수집의 페이지 이름 제외](../../raw/issues/CF-472/documents/generic-page-title-exclusion.md)
> History: [CF-472 범용 수집의 페이지 이름 제외](../../raw/issues/CF-472/documents/generic-page-title-exclusion.md)
> Updated: 2026-11-17

## 현재 상태

범용 수집은 공고 제목처럼 페이지 전체의 이름인 글자를 섹션 제목과 섹션 머리 라벨로 쓰지 않는다. 글자가 페이지 이름 전체와 같거나, 공백으로 둘러싸인 구분자(`|`, `-`, `–`, `—`, `:`, `·`)에서 잘린 앞부분·뒷부분과 같으면 섹션 제목 후보에서 뺀다.

페이지 이름은 둘이다. 하나는 `document.title`이다. 다른 하나는 페이지 맨 위 제목으로, 문서의 첫 비어 있지 않은 제목 요소(`h1`~`h6`, `[role=heading]`)이고 그 요소와 첫 입력 칸 사이에 다른 제목 요소가 있을 때만 인정한다. 첫 입력 칸 바로 위 제목은 그 칸 묶음의 이름이라 대상이 아니다. 양식 용어 사전(프로필 범주·섹션·필드 이름 포함)과 정확히 같은 글자는 페이지 이름과 같아도 남긴다.

적용 위치는 `frontend/src/autofill/dom/page-title.ts`의 `pageTitleMatcher`, `semantic-context.ts`의 `pageTitleHeadingMatcher`와 `genericContextLabels`, `generic/section-segments.ts`의 `headingsBetweenFields`다. 범용 칸 분석 요청의 `displayName`, 섹션 분류 요청의 `title`, 준비 결정 요청의 `sectionTitle`은 모두 `segmentGenericSections`의 구간 제목에서 오므로 세 요청에서 함께 빠진다. 정적 정책 경로(`contextLabels`, `sectionName`), 요청 형식, 서버 캐시 키는 그대로다.

공개 지원서 화면 12개를 수정 전후 수집 코드로 읽어 비교했다. 공고 제목이 수집되던 11개는 화면마다 한 곳만 달라졌고, 공고 제목이 섹션 제목이 아니던 1개는 그대로였다. 평가 데이터셋 `generic-matching` v5의 요청 지문은 달라지지 않았다. 서버 응답(분류와 매핑)은 이 확인에 없다.

한계: 문서 제목에 없고 첫 칸 바로 위에 있는 공고 제목은 잡지 못한다. 입력 칸이 제목보다 앞에 있으면 맨 위 제목 규칙이 걸리지 않는다. 제목이 두 단계인 페이지에서 맨 위 제목이 다른 사람을 가리키면 섹션 밖 칸의 라벨에서 그 문맥이 빠진다. 굵은 안내 문구가 구간 제목이 되는 것은 그대로다. 버린 대안과 확인한 화면은 [CF-472 근거](../../raw/issues/CF-472/documents/generic-page-title-exclusion.md)에 있다.

## 변경 이유

공고 제목이 섹션 제목이나 섹션 머리 라벨로 서버에 가서, 같은 양식인데도 [서버의 섹션 결과 캐시](generic-section-analysis-cache.md) 키가 공고마다 달라졌다. 공고 제목은 프로필 필드 매핑에 쓰이지 않는 정보다.

## 관련 주제

- [범용 섹션 분석 캐시: 확장 쪽과 서버 쪽](generic-section-analysis-cache.md)
- [범용 폼 컨텍스트 수집](generic-form-context.md)
