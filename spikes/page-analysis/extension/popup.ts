const analyzeButton = document.querySelector<HTMLButtonElement>('#analyze');
const resultElement = document.querySelector<HTMLElement>('#result');

analyzeButton?.addEventListener('click', async () => {
  if (resultElement === null) return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) {
    resultElement.textContent = '현재 탭을 확인할 수 없습니다.';
    return;
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['probe.js'] });
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (globalThis as typeof globalThis & {
      runCareerFormPageAnalysisProbe(): unknown;
    }).runCareerFormPageAnalysisProbe(),
  });
  resultElement.textContent = JSON.stringify(results[0]?.result ?? { error: '분석 결과 없음' }, null, 2);
});
