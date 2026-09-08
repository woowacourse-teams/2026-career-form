import type {
  AddressExecutionOptions,
  AddressResult,
} from "../../address/types";
import { normalizeAddress } from "../../address/match";
import { splitRoadReference } from "../../address/road-reference";
const names = ["prsZipCode", "prsAddress", "prsAddressDtl"] as const;
function visible(element: Element): boolean {
  for (let p: Element | null = element; p; p = p.parentElement) {
    if (
      p.hasAttribute("hidden") ||
      p.hasAttribute("inert") ||
      p.getAttribute("aria-hidden") === "true"
    )
      return false;
    const style = getComputedStyle(p);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return element.isConnected;
}
export async function runSkAddress({
  document,
  button,
  expected,
  loadCurrent,
  signal,
  search,
}: AddressExecutionOptions): Promise<AddressResult> {
  const manual = (
    reason = "주소 검색 결과를 확정하지 못했습니다. 우편번호 찾기에서 직접 확인해 주세요.",
  ): AddressResult => ({ status: "manual", reason });
  const root = document.querySelector("#applyContentUserInfo");
  const fields = names.map((name) => {
    const all = document.querySelectorAll(`#${name},[name="${name}"]`);
    return all.length === 1 ? all[0] : undefined;
  });
  if (
    document.location?.host !== "www.skcareers.com" ||
    !document.location.pathname.startsWith("/Application/Index/") ||
    document.querySelectorAll("#applyContentUserInfo").length !== 1 ||
    !root ||
    !root.contains(button) ||
    document.querySelectorAll("#btnSearchAddress").length !== 1 ||
    document.querySelector("#btnSearchAddress") !== button ||
    !(button instanceof HTMLButtonElement) ||
    button.type !== "button" ||
    button.disabled ||
    !visible(button) ||
    !fields.every(
      (f, i) =>
        f instanceof HTMLInputElement &&
        f.type === "text" &&
        f.id === names[i] &&
        f.name === names[i] &&
        root.contains(f) &&
        !f.disabled &&
        visible(f) &&
        f.readOnly === i < 2,
    )
  )
    return manual();
  const [zip, address, detail] = fields as HTMLInputElement[];
  const layer = document.querySelector<HTMLElement>("#layer");
  if (
    !layer ||
    document.querySelectorAll("#layer").length !== 1 ||
    visible(layer)
  )
    return manual();
  if (
    !/^\d{5}$/.test(expected.postalCode) ||
    !normalizeAddress(expected.address)
  )
    return manual("프로필의 기본주소와 우편번호를 먼저 확인해 주세요.");
  const reference = splitRoadReference(expected.address);
  const matchesBase = () =>
    normalizeAddress(address.value) === normalizeAddress(expected.address) ||
    (reference !== undefined &&
      normalizeAddress(address.value) === reference.road);
  const values = [expected.postalCode, expected.address, expected.detail];
  const originals = [zip.value, address.value, detail.value];
  if (
    originals.some(
      (v, i) =>
        v !== "" &&
        normalizeAddress(v) !== normalizeAddress(values[i]) &&
        !(i === 1 && matchesBase()),
    )
  )
    return manual("지원서에 다른 주소가 입력되어 있어 덮어쓰지 않았습니다.");
  const sameProfile = async () => {
    const latest = await loadCurrent();
    return (
      latest.address === expected.address &&
      latest.postalCode === expected.postalCode &&
      latest.detail === expected.detail
    );
  };
  const targets = () =>
    !signal.aborted &&
    button.isConnected &&
    document.querySelector("#btnSearchAddress") === button &&
    !button.disabled &&
    fields.every(
      (f, i) =>
        f === document.querySelector("#" + names[i]) &&
        f instanceof HTMLInputElement &&
        f.name === names[i] &&
        f.readOnly === i < 2 &&
        !f.disabled &&
        visible(f),
    );
  const unchanged = () =>
    targets() &&
    fields.every((f, i) => (f as HTMLInputElement).value === originals[i]);
  let opened = false;
  const closeControls =
    layer.querySelectorAll<HTMLImageElement>("img#btnCloseLayer");
  const close = closeControls.length === 1 ? closeControls[0] : undefined;
  try {
    if (!unchanged() || !(await sameProfile()) || !unchanged()) return manual();
    button.click();
    opened = true;
    const maySelect = async () => {
      const same = await sameProfile();
      return (
        same &&
        unchanged() &&
        visible(layer) &&
        layer.querySelectorAll('iframe[title="우편번호서비스 레이어 프레임"]')
          .length === 1
      );
    };
    const selected = await search(
      { address: expected.address, postalCode: expected.postalCode },
      maySelect,
      signal,
    );
    if (!selected) return manual();
    // A true search result proves the exact road/postcode and any legal-dong
    // reference in the Kakao row. Only then accept the site's bare-road callback.
    const deadline = Date.now() + 2000;
    while (
      !signal.aborted &&
      Date.now() < deadline &&
      (zip.value !== expected.postalCode || !matchesBase() || visible(layer))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (
      !(await sameProfile()) ||
      !targets() ||
      zip.value !== expected.postalCode ||
      !matchesBase() ||
      visible(layer) ||
      detail.value !== originals[2]
    )
      return manual();
    if (detail.value !== expected.detail) {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(detail, expected.detail);
      detail.dispatchEvent(new Event("input", { bubbles: true }));
      detail.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return targets() && detail.value === expected.detail
      ? {
          status: "written",
          reason: "주소 검색 선택과 지원서 반영을 확인했습니다.",
        }
      : manual();
  } catch {
    return manual();
  } finally {
    // Never close a pre-existing layer or one the user has changed.
    if (
      opened &&
      close &&
      layer.isConnected &&
      document.querySelector("#layer") === layer &&
      close.isConnected &&
      layer.querySelectorAll("#btnCloseLayer").length === 1 &&
      layer.querySelector("#btnCloseLayer") === close &&
      visible(layer) &&
      unchanged()
    ) {
      try {
        if ((await sameProfile()) && unchanged() && visible(layer))
          close.click();
      } catch {
        /* Leave a changed or disconnected search to the user. */
      }
    }
  }
}
