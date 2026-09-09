const LAUNCHER_ATTRIBUTE = "data-career-form-side-panel-launcher";

export function setFloatingSidePanelLauncherVisibility(
  document: Document,
  visible: boolean,
): void {
  const launcher = document.querySelector<HTMLElement>(
    `[${LAUNCHER_ATTRIBUTE}]`,
  );
  if (launcher) launcher.style.display = visible ? "" : "none";
}

export function mountFloatingSidePanelLauncher(
  document: Document,
  onOpenSidePanel: () => void,
  logoUrl = "",
): () => void {
  const host = document.createElement("div");
  host.setAttribute(LAUNCHER_ATTRIBUTE, "");
  const shadow = host.attachShadow({ mode: "open" });
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "프로필 사이드바 열기");
  button.style.cssText = [
    "position: fixed",
    "right: 44px",
    "top: 120px",
    "z-index: 2147483647",
    "width: 44px",
    "height: 44px",
    "border: 0",
    "border-radius: 12px",
    "padding: 0",
    "overflow: hidden",
    "box-shadow: 0 4px 14px rgb(0 0 0 / 25%)",
    "cursor: pointer",
    "touch-action: none",
    "user-select: none",
  ].join(";");
  const logo = document.createElement("img");
  logo.src = logoUrl;
  logo.alt = "";
  logo.draggable = false;
  logo.style.cssText = [
    "display: block",
    "width: 100%",
    "height: 100%",
    "object-fit: cover",
    "object-position: 58% 38%",
    "pointer-events: none",
  ].join(";");
  let offsetX = 0;
  let offsetY = 0;
  let startX: number | undefined;
  let startY: number | undefined;
  let suppressClick = false;
  const move = (event: PointerEvent) => {
    if (startX === undefined || startY === undefined) return;
    offsetX += event.clientX - startX;
    offsetY += event.clientY - startY;
    startX = event.clientX;
    startY = event.clientY;
    suppressClick ||= Math.abs(offsetX) > 4 || Math.abs(offsetY) > 4;
    button.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  };
  const stop = () => {
    startX = undefined;
    startY = undefined;
  };
  const start = (event: PointerEvent) => {
    startX = event.clientX;
    startY = event.clientY;
  };
  const click = () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    onOpenSidePanel();
  };
  button.addEventListener("pointerdown", start);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", stop);
  button.addEventListener("click", click);
  button.append(logo);
  shadow.append(button);
  document.documentElement.append(host);

  return () => {
    button.removeEventListener("pointerdown", start);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", stop);
    button.removeEventListener("click", click);
    host.remove();
  };
}
