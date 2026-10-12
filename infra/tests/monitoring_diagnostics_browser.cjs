const assert = require('node:assert/strict');
const { chromium } = require(process.env.MONITORING_PLAYWRIGHT_MODULE);

async function verify() {
  const config = JSON.parse(process.argv[2]);
  const launch = { headless: true };
  if (process.env.MONITORING_BROWSER_EXECUTABLE) {
    launch.executablePath = process.env.MONITORING_BROWSER_EXECUTABLE;
  }
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(config.url + 'login');
    await page.getByRole('textbox', { name: 'Email or username' }).fill('admin');
    await page.getByRole('textbox', { name: 'Password' }).fill(config.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'));
    const from = Date.now() - 900000;
    const to = Date.now();
    const base = config.url + `d/career-form-monitoring?var-env=dev&from=${from}&to=${to}`;
    await page.goto(base + '&var-status=500&viewPanel=14');
    const row = page.getByText(/env=dev service=career-form-backend method=POST route=\/synthetic\/browser /);
    await row.waitFor();
    await row.click();
    const link = page.getByRole('link', { name: '관련 요청 로그' });
    const target = new URL(await link.getAttribute('href'), config.url);
    assert.equal(target.searchParams.get('var-env'), 'dev');
    assert.equal(target.searchParams.get('var-requestId'), config.requestId);
    assert.equal(target.searchParams.get('var-status'), '');
    assert.equal(Number(target.searchParams.get('from')), from);
    assert.equal(Number(target.searchParams.get('to')), to);
    const popup = page.waitForEvent('popup');
    await link.click();
    const related = await popup;
    await related.getByText('선택 요청의 관련 로그 (시간순)', { exact: true }).waitFor();
    await related.getByText(/EXTERNAL_RESULT provider=jev operation=analysis outcome=success durationMs=40/).waitFor();
    assert.ok((await related.locator('body').innerText()).includes('route=/synthetic/browser'));
    await related.goto(base + '&var-requestId=&var-status=&viewPanel=20');
    await related.getByText('No data', { exact: true }).waitFor();
    assert.ok(!(await related.locator('body').innerText()).includes('EXTERNAL_RESULT'));
    await page.goto(base + '&var-status=500&var-requestId=&viewPanel=21');
    await row.waitFor();
    await page.goto(base + '&var-status=&var-requestId=&viewPanel=21');
    await page.getByText('No data', { exact: true }).waitFor();
    console.log('Grafana request links, time/environment preservation and reset verified');
  } finally {
    await browser.close();
  }
}

verify().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
