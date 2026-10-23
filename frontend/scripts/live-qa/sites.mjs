// Site profiles: the site-specific facts the harness needs, as data. Only
// fixed UI identity (selectors, captions) lives here, never values.
//
// Test-account mode: the harness exists to test the extension, not to write
// real applications. Tabs whose host is listed in <state dir>/test-accounts.json
// ({"hosts": ["www.skcareers.com", "*.recruiter.co.kr", ...]}) are treated as
// test accounts: values are recorded instead of hidden, and `reset` may clear
// and temp-save their forms. Submitting, consent and identity verification
// stay blocked everywhere.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// tempSave: the site's own temp-save control. confirm: the in-page dialog
// button that confirms it (and closes the "saved" notice), when the site
// asks. Captions are regex sources matched against the control's text.
export const SITES = [
  {
    id: "hplace",
    host: /(^|\.)recruiter\.co\.kr$/i,
    steps: true,
    tempSave: {
      selector: 'button[data-type="tempSave"], button.btn-ng',
      caption: "^임시\\s*저장$",
      // "설정을 임시저장하시겠습니까?" → 확인
      confirm: {
        selector: '#wrapDialog button[data-button="ok"]',
        caption: "^확인$",
      },
    },
  },
  {
    id: "sk",
    host: /^www\.skcareers\.com$/i,
    // Saves through POST /Application/ApplicationSave, then shows
    // #temporarySavePopup ("임시저장되었습니다") with a 확인 close button.
    tempSave: {
      selector: "button.btnTempSave, a.btnTempSave",
      caption: "^임시\\s*저장$",
      confirm: {
        selector: "#temporarySavePopup #btnPopClose, #systemConfirmPopup_Confirm",
        caption: "^(?:확인|승인\\s*완료)$",
      },
    },
  },
  {
    id: "hyundai",
    host: /^talent\.hyundai\.com$|^career\.hyundai-autoever\.com$/i,
    tempSave: {
      selector: "button.tmpBtn",
      caption: "^임시\\s*저장$",
      confirm: { selector: '[data-button="ok"], .btn.btn-primary', caption: "^확인$" },
    },
  },
  // Greeting keeps no server draft: nothing to reset.
  {
    id: "greeting",
    host: /(^|\.)greetinghr\.com$|^recruit\.kakaogames\.com$/i,
    tempSave: null,
  },
];

export function siteFor(url) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  return SITES.find((s) => s.host.test(host)) ?? null;
}

// Account identity fields: a pre-run value here that is not a synthetic
// profile value comes from the test account's login and stays masked. "name"
// counts only when the field is not a school, company, major or similar name.
export const IDENTITY_FIELD =
  /email|phone|mobile|\btel\b|birth|주민|생년|성명|이름|연락처|휴대|전화|메일|^(?!.*(?:school|edu|company|corp|employer|major|organ|univ|cert|licen|exam|dept|team|position|activit|project|skill|lang|job|file|course|category|title|award|paper|thesis|nation|region|address|zip|product|brand|site)).*name/i;

export const TEST_ACCOUNTS_FILE = "test-accounts.json";

export async function readTestAccounts(root) {
  try {
    const parsed = JSON.parse(
      await readFile(join(root, TEST_ACCOUNTS_FILE), "utf8"),
    );
    return Array.isArray(parsed?.hosts)
      ? parsed.hosts.filter((h) => typeof h === "string")
      : [];
  } catch {
    return [];
  }
}

// "*.recruiter.co.kr" matches the domain and its subdomains; anything else
// must match the host exactly.
export function isTestAccount(url, hosts) {
  let host;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((pattern) => {
    const p = pattern.toLowerCase();
    if (p.startsWith("*.")) {
      const domain = p.slice(2);
      return host === domain || host.endsWith("." + domain);
    }
    return host === p;
  });
}
