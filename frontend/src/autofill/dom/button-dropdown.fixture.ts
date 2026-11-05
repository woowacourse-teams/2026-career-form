export function mountButtonDropdowns({
  count = 4,
  mode = "owned",
  reflectSelection = true,
  deferSelection = false,
}: {
  count?: number;
  mode?: "owned" | "ambiguous" | "detached" | "search";
  reflectSelection?: boolean;
  deferSelection?: boolean;
} = {}) {
  document.body.innerHTML = `
    <div id="application-root">
      <input aria-label="기존 입력" value="기존 합성값" />
      <div id="dropdown-fields"></div>
      <div id="popup-root"></div>
    </div>`;
  const fields = document.getElementById("dropdown-fields");
  const root = document.getElementById("popup-root");
  if (!fields || !root) throw new Error("Missing fixture containers");
  const triggers: HTMLElement[] = [];
  const menus: HTMLElement[] = [];
  document.body.onmousedown = (event) => {
    if (event.target === document.body)
      menus.forEach((menu) => {
        menu.hidden = true;
      });
  };
  const labels = ["지원경로", "재직 이력", "보훈구분", "장애구분"];
  for (let index = 0; index < count; index += 1) {
    const field = document.createElement("div");
    field.id = `question-${index}`;
    const wrapper = document.createElement("div");
    const trigger = document.createElement("div");
    trigger.className = "ant-dropdown-trigger";
    trigger.setAttribute("aria-label", labels[index] ?? "선택 필드");
    trigger.innerHTML = "<span>선택해주세요.</span><svg></svg>";
    wrapper.append(trigger);
    field.append(wrapper);
    fields.append(field);
    const menu = document.createElement("ul");
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    menu.innerHTML =
      '<li role="menuitem" tabindex="-1">해당</li><li role="menuitem" tabindex="-1">비해당</li>';
    if (mode === "search") menu.append(document.createElement("input"));
    root.append(menu);
    triggers.push(trigger);
    menus.push(menu);
    trigger.getBoundingClientRect = () =>
      new DOMRect(20, 40 + index * 60, 200, 40);
    menu.getBoundingClientRect = () =>
      new DOMRect(mode === "detached" ? 600 : 20, 80 + index * 60, 200, 80);
    trigger.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      if (mode === "ambiguous") {
        const second = menus.find((peer) => peer !== menu);
        if (second) second.hidden = menu.hidden;
      }
    });
    menu.addEventListener("click", (event) => {
      const option =
        event.target instanceof Element
          ? event.target.closest('[role="menuitem"]')
          : null;
      if (!option) return;
      const select = () => {
        if (reflectSelection) {
          const display = trigger.querySelector("span");
          if (display) display.textContent = option.textContent;
        }
        menu.hidden = true;
      };
      if (deferSelection) queueMicrotask(select);
      else select();
    });
  }
  return { triggers, menus };
}
