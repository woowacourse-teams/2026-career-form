let access = null;

export function setAccess(password, claimant) {
  const bytes = new TextEncoder().encode(`quality:${password}`);
  const authorization = `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""))}`;
  access = { authorization, claimant };
}

export function accessHeaders() {
  if (!access) throw new Error("공용 비밀번호를 다시 입력해 주세요.");
  return { Authorization: access.authorization, "X-Quality-Claimant": access.claimant };
}

export function clearAccess() { access = null; }
