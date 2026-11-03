---
name: career-form-evaluation-collection
description: Career Form 범용 자동기입 AI 평가 데이터셋에 새 공고 화면 사례를 추가할 때 사용한다. 사람이 연 지원서 화면을 브라우저 안에서 비식별 정제하고, 제품 코드로 요청을 만들고, 정답을 사람 검토로 확정해 PR로 등록한다.
---

# AI 평가 데이터 수집 지침

이 문서는 팀원이 자기 AI 에이전트에게 그대로 넘기는 수집 절차다. 저장소의 `AGENTS.md`,
`harness/policies/dom-snapshot-fixtures.md`, `backend/docs/model-evaluation.md`를 함께 읽는다.
첫 사례는 우아한형제들 공고 R2605009다(`frontend/fixtures/dom-snapshots/woowahan-r2605009-*`). 현재 데이터셋은
`generic-matching` v4(우아한형제들 처음 화면, 고등학교, 대학교, 검정고시 4개 화면 + NHN Careers 지원서 1단계 최초 화면)다. 학력 구분을 고르기 전 처음 화면은 준비 단계만
채점한다(사례를 만들 때 `preparationOnly`). 실제 제품은 고른 뒤 펼쳐진 화면에서 칸을 채우기 때문이다.

## 지켜야 할 것

- 실제 지원서 값, 계정, 세션, 쿠키, 지원서 URL을 읽거나 저장하지 않는다. 로그인과 화면 준비(행 추가, 구분 선택)는 사람이 한다.
- AI는 제출·저장·임시저장·미리보기·페이지 이동·파일 첨부·동의를 하지 않는다.
- 원본 DOM, 스크린샷, HAR, Console 자동 수집 도구를 쓰지 않는다. 아래 스크립트는 사람이 개발자 도구 Console에 직접 붙여 넣는다.
- 스크립트 출력은 사람이 먼저 본다. 남는 글자 목록에 본인 정보가 있으면 붙여 넣지 않고 번호만 알린다.
- 요청 JSON을 손으로 쓰지 않는다. 요청은 제품 코드가 만든다(4단계).
- 정답은 칸이 뜻하는 지원 프로필 필드다. 프로필 값 유무와 무관하다. 지원 필드 목록(`backend/.../SupportedProfileFields.java`)에 없는 의미는 null(매핑 불가)이다. 병역·보훈·장애도 지원 필드라 정답에 넣는다. 준비 단계 섹션 분류에서도 병역·보훈·장애 섹션의 정답은 SENSITIVE다.

## 1. 구조 통계 (개수만)

사람이 지원서 화면을 연 상태에서 Console에 붙여 넣는다. 글자와 값은 나오지 않는다.

```js
// CF-356 수집 1단계: 구조 통계만 출력한다.
// 출력에는 화면의 글자, 입력값, 속성값(id, name, class, URL)이 들어가지 않는다.
// 태그 이름, input type, role, 개수와 문서 안 위치(태그 순번 경로)만 나온다.
// 브라우저 안에서만 읽고, 페이지를 바꾸거나 네트워크 요청을 보내지 않는다.
(() => {
  const CONTROL = 'input, select, textarea, [contenteditable=""], [contenteditable="true"], ' +
    '[role="textbox"], [role="combobox"], [role="listbox"], [role="radio"], [role="checkbox"], ' +
    '[role="switch"], [role="spinbutton"], [role="slider"]';
  const REGION = 'fieldset, section, [role="group"], [role="region"], form';
  const ADD_WORD = /추가|\+|＋/;

  const roots = [];
  const collectRoots = (root) => {
    roots.push(root);
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) collectRoots(element.shadowRoot);
    }
  };
  collectRoots(document);
  const all = (selector) => roots.flatMap((root) => [...root.querySelectorAll(selector)]);

  const path = (element) => {
    const parts = [];
    for (let node = element; node && node.nodeType === 1; ) {
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      const same = parent ? [...parent.children].filter((child) => child.tagName === node.tagName) : [node];
      parts.unshift(`${tag}[${same.indexOf(node) + 1}]`);
      if (tag === 'body' || !parent) {
        const host = node.getRootNode && node.getRootNode().host;
        if (!parent && host) { parts.unshift('#shadow'); node = host; continue; }
        break;
      }
      node = parent;
    }
    return parts.join('>');
  };

  const kind = (element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'input') return `input:${(element.getAttribute('type') || 'text').toLowerCase()}`;
    if (tag === 'select') return element.multiple ? 'select:multiple' : 'select';
    if (tag === 'textarea') return 'textarea';
    const role = element.getAttribute('role');
    return role ? `role:${role}` : 'contenteditable';
  };
  const hidden = (element) => {
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return true;
    const style = getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden' || element.getClientRects().length === 0;
  };
  const countBy = (items, key) => items.reduce((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  const controls = all(CONTROL);
  const regionOf = (element) => element.closest(REGION) || document.body;
  const regions = new Map();
  for (const control of controls) {
    const region = regionOf(control);
    if (!regions.has(region)) regions.set(region, []);
    regions.get(region).push(control);
  }

  const optionCounts = all('select').map((select) => select.options.length);
  const buttons = all('button, [role="button"], input[type="button"], a[role="button"]');
  const addLike = buttons.filter((button) => ADD_WORD.test(button.textContent || '') ||
    ADD_WORD.test(button.getAttribute('aria-label') || '') || ADD_WORD.test(button.getAttribute('title') || ''));

  const signature = (element) => {
    const kinds = [...element.querySelectorAll(CONTROL)].map(kind).sort();
    return kinds.length ? `${element.tagName}|${kinds.join(',')}` : null;
  };
  const repeats = [];
  for (const parent of all('*')) {
    const groups = countBy([...parent.children], (child) => signature(child) || '');
    for (const [key, count] of Object.entries(groups)) {
      if (key && count >= 2) {
        repeats.push({
          parent: path(parent),
          rows: count,
          controlsPerRow: key.split('|')[1].split(',').length,
        });
      }
    }
  }

  const ids = countBy(all('[id]'), (element) => element.id);
  const idSet = new Set(Object.keys(ids));
  const brokenFor = all('label[for]').filter((label) => !idSet.has(label.htmlFor)).length;
  const brokenAria = all('[aria-labelledby], [aria-describedby], [aria-controls]').filter((element) =>
    ['aria-labelledby', 'aria-describedby', 'aria-controls'].some((name) =>
      (element.getAttribute(name) || '').split(/\s+/).filter(Boolean).some((ref) => !idSet.has(ref)))).length;

  const result = {
    step: 'CF-356-collection-1-structure-stats',
    totals: {
      controls: controls.length,
      visibleControls: controls.filter((control) => !hidden(control)).length,
      byKind: countBy(controls, kind),
      selects: optionCounts.length,
      selectOptionsTotal: optionCounts.reduce((sum, value) => sum + value, 0),
      buttons: buttons.length,
      addLikeButtons: addLike.length,
      visibleAddLikeButtons: addLike.filter((button) => !hidden(button)).length,
      forms: all('form').length,
      iframes: document.querySelectorAll('iframe').length,
      openShadowRoots: roots.length - 1,
      duplicateIds: Object.values(ids).filter((count) => count > 1).length,
      brokenLabelFor: brokenFor,
      brokenAriaRefs: brokenAria,
    },
    regions: [...regions.entries()].map(([region, items]) => ({
      path: path(region),
      tag: region.tagName.toLowerCase(),
      controls: items.length,
      visible: items.filter((control) => !hidden(control)).length,
      byKind: countBy(items, kind),
      addLikeButtons: addLike.filter((button) => regionOf(button) === region).length,
    })),
    repeatedRowGroups: repeats,
  };
  const text = JSON.stringify(result, null, 2);
  console.log(text);
  return result;
})();
```

## 1b. 섹션별 통계

모든 칸을 감싸는 공통 상위 요소(`container.path`)와 섹션별 칸 수, 커스텀 컨트롤 단서를 센다.

```js
// CF-356 수집 1b단계: 섹션별 구조 통계와 커스텀 컨트롤 단서만 출력한다.
// 출력에는 화면의 글자, 입력값, 속성값(id, name, class, URL)이 들어가지 않는다.
// 페이지를 바꾸거나 네트워크 요청을 보내지 않는다.
(() => {
  const CONTROL = 'input, select, textarea, [contenteditable=""], [contenteditable="true"], ' +
    '[role="textbox"], [role="combobox"], [role="listbox"], [role="radio"], [role="checkbox"]';
  const BUTTON = 'button, [role="button"], input[type="button"], input[type="submit"]';
  const ADD_WORD = /추가|\+|＋/;

  const shadowHosts = [...document.querySelectorAll('*')].filter((element) => element.shadowRoot);
  const path = (element) => {
    const parts = [];
    for (let node = element; node && node.nodeType === 1 && node.tagName !== 'HTML'; node = node.parentElement) {
      const same = node.parentElement
        ? [...node.parentElement.children].filter((child) => child.tagName === node.tagName) : [node];
      parts.unshift(`${node.tagName.toLowerCase()}[${same.indexOf(node) + 1}]`);
    }
    return parts.join('>');
  };
  const kind = (element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'input') return `input:${(element.getAttribute('type') || 'text').toLowerCase()}`;
    if (tag === 'select' || tag === 'textarea') return tag;
    return element.getAttribute('role') ? `role:${element.getAttribute('role')}` : 'contenteditable';
  };
  const hidden = (element) => {
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return true;
    const style = getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden' || element.getClientRects().length === 0;
  };
  const countBy = (items, key) => items.reduce((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  const textOf = (element) => `${element.textContent || ''} ${element.getAttribute('aria-label') || ''} ` +
    `${element.getAttribute('title') || ''} ${element.getAttribute('value') || ''}`;

  const controls = [...document.querySelectorAll(CONTROL)];
  const ancestors = (element) => {
    const list = [];
    for (let node = element; node; node = node.parentElement) list.unshift(node);
    return list;
  };
  let common = null;
  for (const control of controls) {
    const chain = ancestors(control);
    if (!common) { common = chain; continue; }
    let index = 0;
    while (index < common.length && index < chain.length && common[index] === chain[index]) index++;
    common = common.slice(0, index);
  }
  const container = common ? common[common.length - 1] : document.body;

  const describe = (root, index) => {
    const inner = [...root.querySelectorAll(CONTROL)];
    if (root.matches && root.matches(CONTROL)) inner.unshift(root);
    const buttons = [...root.querySelectorAll(BUTTON)];
    const headings = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, [role="heading"]')];
    const readonlyText = inner.filter((control) => control.tagName === 'INPUT' &&
      (control.readOnly || control.getAttribute('aria-readonly') === 'true'));
    return {
      index,
      tag: root.tagName.toLowerCase(),
      controls: inner.length,
      visible: inner.filter((control) => !hidden(control)).length,
      byKind: countBy(inner, kind),
      required: inner.filter((control) => control.required || control.getAttribute('aria-required') === 'true').length,
      readonlyTextInputs: readonlyText.length,
      selectOptions: inner.filter((control) => control.tagName === 'SELECT').map((select) => select.options.length),
      radioGroups: new Set(inner.filter((control) => control.type === 'radio').map((radio) => radio.name)).size,
      buttons: buttons.length,
      visibleButtons: buttons.filter((button) => !hidden(button)).length,
      addLikeButtons: buttons.filter((button) => ADD_WORD.test(textOf(button))).length,
      popupButtons: buttons.filter((button) => button.hasAttribute('aria-haspopup')).length,
      expandableButtons: buttons.filter((button) => button.hasAttribute('aria-expanded')).length,
      clickableNonButtons: [...root.querySelectorAll('div[tabindex], span[tabindex], li[tabindex], [onclick]')]
        .filter((element) => !element.matches(BUTTON)).length,
      headings: countBy(headings, (heading) => heading.tagName.toLowerCase()),
      labels: root.querySelectorAll('label').length,
      lists: root.querySelectorAll('ul, ol').length,
    };
  };

  const sections = [...container.children].map(describe).filter((section) => section.controls || section.buttons);
  const outsideButtons = [...document.querySelectorAll(BUTTON)].filter((button) => !container.contains(button));

  const result = {
    step: 'CF-356-collection-1b-section-stats',
    container: {
      path: path(container),
      children: container.children.length,
      controlsInside: controls.filter((control) => container.contains(control)).length,
    },
    sections,
    outsideContainer: {
      buttons: outsideButtons.length,
      addLikeButtons: outsideButtons.filter((button) => ADD_WORD.test(textOf(button))).length,
    },
    shadowRoots: shadowHosts.map((host) => ({
      hostPath: path(host),
      hostTag: host.tagName.toLowerCase().includes('-') ? 'custom-element' : host.tagName.toLowerCase(),
      insideMain: Boolean(host.closest('main')),
      controls: host.shadowRoot.querySelectorAll(CONTROL).length,
      buttons: host.shadowRoot.querySelectorAll(BUTTON).length,
    })),
    hiddenInputsTotal: document.querySelectorAll('input[type="hidden"]').length,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
})();
```

## 2. 비식별 정제

1b의 `container.path`를 `CONTAINER` 선택자로 바꾼 뒤 사람에게 코드를 보여 주고 승인을 받는다.
실행하면 남는 글자 목록이 결과로 나오고 정제본 JSON은 클립보드에 복사된다. `STOPPED`이면 요약만 받아 원인을 고친다.

```js
// CF-356 수집 2단계: 대상 지원서의 비식별 정제본을 만든다.
// - 범위: main 안의 지원서 묶음(body>div[1]>main[1]>div[1])에서 입력 칸이 있는 섹션만. 머리말과 위젯(shadow root)은 뺀다.
// - 원본 페이지는 바꾸지 않는다. 허용한 태그·속성·글자만 새 비활성 문서로 옮긴다.
// - 입력값, 선택·체크 상태, id·name·class, data-*, URL, style, script는 옮기지 않는다. id·name은 익명 번호로 바꾼다.
// - 개인정보처럼 보이는 글자(이메일, 전화번호, 날짜, 4자리 이상 숫자, "님", 입력값과 같은 글자)는 [비식별]로 바꾼다.
// - Console에는 남은 글자 목록과 개수만 보여 주고, 정제본 JSON은 클립보드에만 복사한다.
(() => {
  // 1b 결과의 container.path를 CSS 선택자로 바꿔 넣는다. 예: body[1]>div[1]>main[1]>div[1]
  const CONTAINER = 'body > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1)';
  const CONTROL = 'input, select, textarea';
  const TAGS = new Set(['div', 'span', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'label', 'h1', 'h2', 'h3', 'h4',
    'nav', 'section', 'article', 'header', 'footer', 'aside', 'form',
    'h5', 'h6', 'strong', 'em', 'b', 'small', 'br', 'button', 'input', 'select', 'option', 'optgroup', 'textarea',
    'fieldset', 'legend', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'svg', 'path', 'g']);
  const TEXT_ATTRS = ['aria-label', 'title', 'placeholder'];
  const ID_REF_ATTRS = ['aria-controls', 'aria-labelledby', 'aria-describedby'];
  const KEEP_ATTRS = new Set(['role', 'aria-hidden', 'aria-expanded', 'aria-haspopup', 'aria-required', 'aria-disabled',
    'aria-readonly', 'aria-checked', 'aria-selected', 'tabindex', 'type', 'maxlength', 'minlength', 'readonly',
    'disabled', 'required', 'autocomplete', 'inputmode', 'accept', 'multiple', 'viewBox', 'd']);
  const INPUT_TYPES = new Set(['text', 'tel', 'email', 'number', 'date', 'month', 'radio', 'checkbox', 'file', 'search',
    'url', 'button']);
  const REDACTED = '[비식별]';
  const SYNTHETIC_URL = 'https://example.test';
  const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s"'<>]*/gi;
  const TYPED = new Set(['text', 'tel', 'email', 'number', 'search', 'url', 'date', 'month', 'password']);
  const PERSONAL = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\d{2,3}[- .]?\d{3,4}[- .]?\d{4}/,
    /(19|20)\d{2}\s*[./년-]\s*\d{1,2}/,
    /\d{4,}/,
    /님(?![가-힣])/,
  ];

  const source = document.querySelector(CONTAINER);
  if (!source) {
    console.log(JSON.stringify({ step: 'CF-356-collection-2-sanitize', status: 'STOPPED', reason: 'CONTAINER_NOT_FOUND' }));
    return;
  }
  const values = new Set();
  let filledTextControls = 0;
  for (const control of source.querySelectorAll('input, textarea')) {
    const type = (control.getAttribute('type') || 'text').toLowerCase();
    if (control.tagName === 'INPUT' && !TYPED.has(type)) continue;
    const value = (control.value || '').trim();
    if (value) filledTextControls += 1;
    if (value.length >= 2) values.add(value);
  }
  const isHidden = (element) => {
    if (element.hasAttribute('hidden')) return true;
    const style = getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden';
  };

  const stats = { redactedTexts: 0, droppedElements: {}, droppedDataAttributes: new Set(), syntheticHidden: 0,
    droppedHrefs: 0, replacedUrls: 0 };
  const texts = new Map();
  const reviewText = (raw) => {
    let text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return '';
    text = text.replace(URL_PATTERN, () => {
      stats.replacedUrls += 1;
      return SYNTHETIC_URL;
    });
    const personal = PERSONAL.some((pattern) => pattern.test(text)) ||
      [...values].some((value) => text.includes(value));
    const kept = personal ? REDACTED : text;
    if (personal) stats.redactedTexts += 1;
    texts.set(kept, (texts.get(kept) || 0) + 1);
    return kept;
  };

  const idMap = new Map();
  const nameMap = new Map();
  const anon = (map, prefix, raw) => {
    if (!map.has(raw)) map.set(raw, `${prefix}-${map.size + 1}`);
    return map.get(raw);
  };
  const doc = document.implementation.createHTMLDocument('evaluation-fixture');

  const copyAttributes = (from, to) => {
    for (const attr of [...from.attributes]) {
      const name = attr.name;
      if (name.startsWith('data-')) { stats.droppedDataAttributes.add(name); continue; }
      if (name === 'href') { stats.droppedHrefs += 1; continue; }
      if (name === 'id') { to.setAttribute('id', anon(idMap, 'id', attr.value)); continue; }
      if (name === 'for') { to.setAttribute('for', anon(idMap, 'id', attr.value)); continue; }
      if (name === 'name' && from.matches(CONTROL)) { to.setAttribute('name', anon(nameMap, 'field', attr.value)); continue; }
      if (ID_REF_ATTRS.includes(name)) {
        to.setAttribute(name, attr.value.split(/\s+/).filter(Boolean).map((ref) => anon(idMap, 'id', ref)).join(' '));
        continue;
      }
      if (TEXT_ATTRS.includes(name)) {
        const text = reviewText(attr.value);
        if (text) to.setAttribute(name, text);
        continue;
      }
      if (name === 'type' && from.tagName === 'INPUT' && !INPUT_TYPES.has(attr.value.toLowerCase())) continue;
      if (KEEP_ATTRS.has(name)) to.setAttribute(name, attr.value);
    }
  };

  const optionValues = new WeakMap();
  const cloneNode = (node, parentHidden) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement && ['TEXTAREA', 'SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) return null;
      const text = reviewText(node.textContent || '');
      return text ? doc.createTextNode(text) : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const tag = node.tagName.toLowerCase();
    if (!TAGS.has(tag)) {
      stats.droppedElements[tag] = (stats.droppedElements[tag] || 0) + 1;
      return null;
    }
    if (tag === 'input' && (node.getAttribute('type') || '').toLowerCase() === 'hidden') return null;
    const element = tag === 'svg' || tag === 'path' || tag === 'g'
      ? doc.createElementNS('http://www.w3.org/2000/svg', tag) : doc.createElement(tag);
    copyAttributes(node, element);
    const hiddenHere = !parentHidden && isHidden(node);
    if (hiddenHere) {
      element.setAttribute('hidden', '');
      stats.syntheticHidden += 1;
    }
    if (tag === 'option') {
      const select = node.closest('select');
      if (!optionValues.has(select)) optionValues.set(select, new Map());
      const map = optionValues.get(select);
      const raw = node.getAttribute('value');
      element.setAttribute('value', raw === '' ? '' : anon(map, 'opt', raw ?? node.textContent));
    }
    if (tag !== 'textarea') {
      for (const child of node.childNodes) {
        const copied = cloneNode(child, parentHidden || hiddenHere);
        if (copied) element.appendChild(copied);
      }
    }
    return element;
  };

  const sections = [...source.children].filter((child) => child.querySelector(CONTROL));
  const root = doc.createElement('main');
  for (const section of sections) {
    const copied = cloneNode(section, false);
    if (copied) root.appendChild(copied);
  }
  doc.body.appendChild(root);

  // 정제 결과 검증: 금지 요소·속성, 남은 값, 원본 대비 칸 수.
  const problems = [];
  const details = [];
  for (const element of doc.querySelectorAll('*')) {
    for (const attr of [...element.attributes]) {
      if (attr.name.startsWith('on') || attr.name.startsWith('data-') || ['style', 'class', 'href', 'src', 'value',
        'checked', 'selected'].includes(attr.name) && !(attr.name === 'value' && element.tagName === 'OPTION')) {
        problems.push(`ATTR:${attr.name}`);
      }
      const external = attr.value.replaceAll(SYNTHETIC_URL, '');
      if (/https?:|javascript:|url\(/i.test(external)) {
        problems.push('URL_IN_ATTRIBUTE');
        details.push({ problem: 'URL_IN_ATTRIBUTE', tag: element.tagName.toLowerCase(), attribute: attr.name,
          length: attr.value.length });
      }
    }
  }
  if (doc.querySelector('script, style, iframe, img, link')) problems.push('FORBIDDEN_ELEMENT');
  const kinds = (scope) => [...scope.querySelectorAll(CONTROL)].map((control) =>
    control.tagName === 'INPUT' ? `input:${(control.getAttribute('type') || 'text').toLowerCase()}`
      : control.tagName.toLowerCase()).sort().join(',');
  const sourceKinds = sections.map((section) => kinds(section)).filter(Boolean).join(',').split(',')
    .filter((kind) => kind !== 'input:hidden').sort().join(',');
  const sanitizedKinds = kinds(doc);
  if (sourceKinds !== sanitizedKinds) problems.push('CONTROL_COUNT_MISMATCH');
  const html = `<!doctype html>\n<html lang="ko">\n<head><meta charset="utf-8"><title>evaluation-fixture</title></head>\n` +
    `<body>${root.outerHTML}</body>\n</html>\n`;
  for (const value of values) {
    if (html.includes(value)) {
      problems.push('VALUE_ECHO');
      details.push({ problem: 'VALUE_ECHO', valueLength: value.length });
    }
  }

  const summary = {
    step: 'CF-356-collection-2-sanitize',
    status: problems.length ? 'STOPPED' : 'READY_FOR_HUMAN_REVIEW',
    problems: [...new Set(problems)],
    problemDetails: details,
    filledTextControls,
    replacedUrls: stats.replacedUrls,
    sections: sections.length,
    controls: doc.querySelectorAll(CONTROL).length,
    options: doc.querySelectorAll('option').length,
    labels: doc.querySelectorAll('label').length,
    redactedTexts: stats.redactedTexts,
    syntheticHidden: stats.syntheticHidden,
    droppedElements: stats.droppedElements,
    droppedDataAttributeNames: [...stats.droppedDataAttributes].sort(),
    droppedHrefs: stats.droppedHrefs,
    anonymizedIds: idMap.size,
    anonymizedNames: nameMap.size,
  };
  if (problems.length) {
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }
  const reviewList = [...texts.entries()].map(([text, count], index) => ({ no: index + 1, text, count }));
  const listing = reviewList.map((row) => `${String(row.no).padStart(3, ' ')}. ${row.text}` +
    (row.count > 1 ? `  (${row.count}번)` : '')).join('\n');
  const payload = JSON.stringify({ summary, texts: reviewList, html });
  const copied = typeof copy === 'function';
  if (copied) copy(payload);
  const message = [
    '==================== CF-356 정제 결과 ====================',
    `칸 ${summary.controls}개 / 선택지 ${summary.options}개 / 이미 글자가 있는 칸 ${summary.filledTextControls}개 / [비식별]로 바꾼 글자 ${summary.redactedTexts}개`,
    '',
    '[검토] 아래는 정제본에 남는 글자 전부입니다.',
    '본인 이름·연락처·이메일·주소·학교·회사·지원 건 정보·저장해 둔 답변이 있으면 붙여 넣지 말고 번호만 알려 주세요.',
    '',
    listing,
    '',
    copied
      ? '[다음] 문제가 없으면 Console에서 아무것도 복사하지 말고, 채팅창에 바로 ⌘V로 붙여 넣으세요. (정제본은 이미 클립보드에 있습니다)'
      : '[중단] 이 브라우저에서는 copy()를 쓸 수 없어 정제본을 내보내지 않았습니다.',
    '==========================================================',
  ].join('\n');
  console.log(message);
  // Console 필터에 로그가 가려져도 보이도록 안내와 글자 목록을 결과값으로 돌려준다.
  return message;
})();
```

정제본을 받으면 Git 추적 밖의 임시 위치(`git rev-parse --git-path cf-workflow`)에 두고 다음을 확인한다.

- 정적 검사: 외부 URL, 이벤트 속성, script/style/img, 입력 value, checked/selected, class/style/data-* 가 0건
- 네트워크를 차단한 브라우저(JS 끔)에서 외부 요청 시도 0건
- 제품 수집기(`collectFieldsSnapshot`)로 읽은 후보 수와 섹션 목록을 사람에게 보여 주고 구조 검토를 받는다

조건부 칸(구분 선택, "대상" 선택 등)은 사람이 상태를 바꾼 뒤 같은 스크립트로 상태별로 따로 수집한다.

## 3. fixture 등록

`frontend/fixtures/dom-snapshots/<사이트>-<공고>-<상태>/`에 `sanitized.html`(검증한 바이트 그대로), `metadata.json`, `review.md`를 둔다.
형식은 우아한형제들 fixture를 따른다. 상태별 칸 수·후보 수와 변이 검사를 확인하는 테스트를 `frontend/src/autofill/workflow/dom-snapshot.<id>.test.ts`로 추가한다.

## 4. 정답 작성과 요청 기록

1. 상태마다 `backend/src/main/resources/evaluation/datasets/generic-matching/v<N>/ground-truth/<fixture-id>.json`을 만든다.
   - `sectionClassify`: 매핑 단계 섹션(gs1…)별 범주(PERSONAL, EDUCATION, CAREER, SENSITIVE, NONE 등)
   - `fieldMapping`: 칸(field-N)별 `key`(지원 필드 또는 null)
   - `preparation.sectionClassify`: 준비 루프 섹션(ls1…)별 범주, `preparation.interactionDecisions`: 결정 ID별 정답 후보 또는 null
   - 칸 번호와 섹션 번호는 제품 수집기 출력에서 확인한다. AI가 초안을 만들고 사람이 칸마다 승인한다.
2. `frontend/src/evaluation/capture/woowahan-dataset.test.ts`를 본떠 사이트별 테스트를 만든다. 제품 범용 흐름(준비 루프 → 섹션 분류 → 필드 매핑)을 fixture에 실행하고, 후속 요청은 정답으로 만든다.
3. `CF356_WRITE_DATASET=1 npx vitest run <테스트> --project unit`으로 사례 파일과 manifest 해시를 쓰고, 환경 변수 없이 다시 실행해 저장본과 같은지 확인한다.
4. manifest의 `review`에 사람 검토 결과를 적는다. `privacy`, `structure`는 PASSED, `mappingTruth`, `preparationTruth`는 HUMAN_REVIEWED, `inputIdentity`는 SOURCE_PIPELINE_VERIFIED여야 평가에 쓰인다. 하나라도 아니면 백엔드 등록 검사가 거부한다.
5. 확정한 버전 디렉터리는 고치지 않는다. 사례를 더할 때는 직전 버전의 사례·정답 파일을 바이트 그대로 복사한 새 버전(`v<N+1>`)을 만들고 새 사례를 더한다.
6. manifest의 사례마다 `split`(`tuning` 또는 `final`)은 형식상 적는다. 같은 화면 상태를 두 분할에 넣지 않는다. 평가 화면은 분할을 나누지 않고 항상 전체(`all`)를 실행한다.
7. 평가 화면이 새 버전을 쓰도록 `backend/src/main/resources/static/evaluations/app.js`의 `DATASET.version`, 화면 이름(`STATE_NAMES`)과 설명(`STATE_NOTES`)을 갱신한다. `DatasetLoaderTest`, `EvaluationEnabledContextTest`의 버전·사례 수 기대값도 함께 바꾼다.
8. 지원 필드 목록에 없는 의미(예: 검정고시 합격연월)는 `key`를 null로 두고 `backend/docs/model-evaluation.md`에 이유를 적는다.

## 5. PR

`backend/src/test/.../DatasetLoaderTest`, 프론트엔드 사례 테스트, `./gradlew check`, `.venv/bin/python harness/scripts/verify.py`를 통과시키고 PR로 올린다.
평가 실행은 사람이 평가 화면(`/evaluations/`)에서 등록한다. 실제 모델 호출에는 비용이 든다.
점수는 모든 화면·호출의 항목을 합친 항목 가중 정확도(`item-weighted-exact-v2`)다. 이전 결과와 비교할 때는 같은 데이터셋 버전에서 이전 코드와 새 코드를 각각 실행한다.
