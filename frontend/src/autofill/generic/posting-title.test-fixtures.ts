/**
 * 합성 구조. 실사이트 DOM이나 실제 공고가 아니고, 공고 제목이 섹션 제목이나 섹션 머리 라벨로
 * 수집되던 두 가지 배치만 재현한다(Issue #472).
 */
export interface PostingPage {
  title: string;
  body: string;
}

/**
 * 공고 제목이 첫 칸 묶음 바로 위의 굵은 글씨이고 문서 제목이 "<공고 제목> | <회사>"인 양식.
 * 칸 구성과 라벨은 공고와 회사가 달라도 같다.
 */
export function titleAboveFieldsPage(
  posting: string,
  company = "가나다상사",
): PostingPage {
  return {
    title: `${posting} | ${company}`,
    body: `<div>
  <div>
    <h1>${posting} | ${company}</h1>
    <h2>${posting} | ${company}</h2>
  </div>
  <div>
    <h1>지원서 작성</h1>
    <div><span style="font-weight: 700">${posting}</span></div>
    <div><div>이름</div><input type="text" placeholder="내용을 입력해 주세요."></div>
    <div><div>연락처</div><input type="text" placeholder="01012345678"></div>
    <div><div>이메일</div><input type="text" placeholder="example@domain.test"></div>
    <div style="font-weight: 700">포트폴리오</div>
    <div><div>URL</div><input type="text" placeholder="https://homepage.test"></div>
  </div>
</div>`,
  };
}

/**
 * 공고 제목이 양식 위의 제목 요소이고 문서 제목은 사이트 이름인 양식.
 * 섹션 밖에 있는 마지막 확인 문항이 바깥 컨테이너의 유일한 제목으로 공고 제목을 만난다.
 */
export function titleAboveFormPage(posting: string): PostingPage {
  return {
    title: "가나다 채용",
    body: `<div>
  <header><div><h1><a href="/"></a></h1></div></header>
  <main>
    <div>
      <div><h2>${posting}</h2></div>
      <div>
        <div><div>
          <h3>인적사항<span>필수</span></h3>
          <div>
            <div><label for="email">이메일</label><input id="email" type="email"></div>
            <div><label for="phone">휴대폰 번호</label><input id="phone" type="tel"></div>
          </div>
        </div></div>
        <div><div>
          <h3>학력<span>필수</span></h3>
          <div>
            <div><label for="school">학교명</label><input id="school" type="text"></div>
            <div><label for="major">전공</label><input id="major" type="text"></div>
          </div>
        </div></div>
      </div>
      <div><div>
        <div>위 내용은 사실과 다름없습니까?</div>
        <div><div>
          <input id="confirm-yes" type="radio"><label for="confirm-yes">네</label>
          <input id="confirm-no" type="radio"><label for="confirm-no">아니요</label>
        </div></div>
      </div></div>
    </div>
  </main>
</div>`,
  };
}

export function mount(document: Document, page: PostingPage): void {
  document.title = page.title;
  document.body.innerHTML = page.body;
}
