// User-entered USD rates per one million tokens. No assumed provider prices.
export function validRate(value) {
  if (value == null || String(value).trim() === '') return null;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1000000) {
    throw new RangeError('단가는 0 이상 1,000,000 이하의 숫자로 입력해 주세요.');
  }
  return rate;
}

export function estimateCost(inputTokens, outputTokens, rates) {
  if (!rates || rates.input == null || rates.output == null) return null;
  if (![inputTokens, outputTokens].every(value => Number.isFinite(value) && value >= 0)) return null;
  const input = validRate(rates.input);
  const output = validRate(rates.output);
  return (inputTokens * input + outputTokens * output) / 1000000;
}

export function formatUsd(value) {
  if (value == null) return '단가 미설정';
  if (value > 0 && value < 0.000001) return '< $0.000001';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6,
  }).format(value);
}
