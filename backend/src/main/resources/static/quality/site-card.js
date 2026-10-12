function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function posting(url) {
  const match = /\/(?:ko|en)\/o\/([1-9]\d*)\/apply$/.exec(url);
  return match ? `공고 ${match[1]}` : "등록 링크";
}

function anchor(url, label) {
  const node = element("a", label);
  node.href = url;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}

export function siteCard(site, scopeCard) {
  const card = element("article", undefined, "candidate");
  card.dataset.siteId = site.id;
  card.append(element("h2", site.site));
  if (site.company) card.append(element("p", `회사 ${site.company}`, "hint"));
  if (site.candidates.some(row => row.identity === "UNVERIFIED")) {
    card.append(element("p", "기업 소속 미확인: 각 화면의 담당과 확인 기준을 따로 기록합니다.", "hint"));
  }
  const links = site.links ?? [];
  const manual = site.candidates.filter(row => row.publicLink && row.publicLink !== site.homepage && !links.some(link => link.url === row.publicLink))
    .filter((row, index, all) => all.findIndex(value => value.publicLink === row.publicLink) === index);
  if (!links.length && !manual.length) card.append(element("p", "작성 링크 미확보", "hint"));
  const applications = element("ul", undefined, "application-links");
  for (const link of links) {
    const item = element("li");
    const node = anchor(link.url, `${posting(link.url)} 지원서 열기`);
    node.dataset.applicationLink = "true";
    item.append(node, element("p", `최근 관측 ${new Date(link.lastSeen).toLocaleString("ko-KR", {timeZone: "Asia/Seoul"})}`, "hint"));
    applications.append(item);
  }
  for (const row of manual) {
    const item = element("li");
    item.append(anchor(row.publicLink, `${posting(row.publicLink)} 열기, 사람이 등록한 링크`));
    applications.append(item);
  }
  if (applications.children.length) card.append(applications);
  if (site.linksOverflow) card.append(element("p", "관측 링크 한도 초과: 최근 20개를 표시합니다. 이전 공고는 다시 관측해 링크를 보완해 주세요.", "hint"));
  card.append(anchor(site.homepage, "사이트 홈 열기, 보조 링크"));
  card.append(element("p", "작성 링크가 만료되면 해당 화면을 보류로 기록하세요. 확인 기록은 다른 화면 범위에 합쳐지지 않습니다.", "hint"));
  site.candidates.forEach((row, index) => card.append(scopeCard(row, index + 1)));
  return card;
}

export function scopePostings(row) {
  return (row.links ?? []).map(link => posting(link.url)).join(", ") || (row.publicLink && row.publicLink !== row.homepage ? "사람이 등록한 링크" : "작성 링크 미확보");
}
