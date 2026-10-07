const assert = require('node:assert/strict');
const { chromium } = require(process.env.QUALITY_PLAYWRIGHT_MODULE);

async function verify() {
  const config = JSON.parse(process.argv[2]);
  const launch = { headless: true };
  if (process.env.QUALITY_BROWSER_EXECUTABLE) launch.executablePath = process.env.QUALITY_BROWSER_EXECUTABLE;
  const browser = await chromium.launch(launch);
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const unauthorized = await context.request.get(config.url + '/api/v1/quality/sites');
    assert.equal(unauthorized.status(), 401);
    await page.goto(config.url + '/quality/');
    await page.getByLabel('공용 비밀번호').fill(config.password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/quality/');
    try { await page.locator('[data-candidate-id]').first().waitFor(); }
    catch (error) { throw new Error(error.message + '\n' + await page.locator('body').innerText()); }
    await page.getByLabel('담당 별칭').fill('합성 담당자');
    const card = page.locator('[data-candidate-id]').first();
    const id = await card.getAttribute('data-candidate-id');
    await card.getByRole('button', { name: '담당하기', exact: true }).click();
    try { await card.getByText('합성 담당자', { exact: true }).waitFor(); }
    catch (error) { throw new Error(error.message + '\n' + await page.locator('body').innerText()); }
    const secondTab = await context.newPage();
    await secondTab.goto(config.url + '/quality/?candidate=' + id);
    await secondTab.locator('[data-candidate-id="' + id + '"][data-selected="true"]').waitFor();
    await secondTab.locator('[data-candidate-id="' + id + '"]').getByText('합성 담당자', { exact: true }).waitFor();
    assert.equal(await secondTab.evaluate(() => sessionStorage.getItem('quality-csrf')), null);
    await secondTab.close();
    const rejected = await context.request.post(config.url + '/api/v1/quality/sites/' + id + '/confirm', { data: { fieldCount: 3 } });
    assert.equal(rejected.status(), 403);
    await card.getByRole('button', { name: '필드 수 등록', exact: true }).click();
    await page.getByLabel('입력 가능한 칸 수').fill('3');
    await page.getByLabel('지금 확인한 지원서와 후보의 화면 범위가 같습니다.').check();
    await page.getByRole('button', { name: '확인 완료', exact: true }).click();
    await page.getByRole('button', { name: '완료 목록', exact: true }).click();
    const completed = page.locator('[data-candidate-id="' + id + '"]');
    await completed.getByText('3칸', { exact: true }).waitFor();
    await completed.getByRole('button', { name: '확인 이력', exact: true }).click();
    await page.getByRole('dialog').getByText('3칸', { exact: true }).waitFor();
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.waitForURL(url => url.pathname.endsWith('/login.html'));
    assert.equal((await context.request.get(config.url + '/api/v1/quality/sites')).status(), 401);
    console.log('Quality login, CSRF, voluntary claim, confirmation, history and logout verified');
  } finally {
    await browser.close();
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
