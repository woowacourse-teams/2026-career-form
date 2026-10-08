import { setAccess } from "./access.js";

if (location.pathname.endsWith("/login.html")) {
  location.replace("/quality/" + location.search);
} else {
  const form = document.getElementById("login-form");
  const message = document.getElementById("login-message");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const password = document.getElementById("password");
    button.disabled = true;
    message.textContent = "로그인 중입니다.";
    try {
      const response = await fetch("/api/v1/quality/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.value }), credentials: "omit",
      });
      if (response.ok) {
        const result = await response.json();
        setAccess(password.value, result.claimant);
        password.value = "";
        document.getElementById("login-panel").hidden = true;
        document.getElementById("management-panel").hidden = false;
        await import("./app.js");
        return;
      }
      message.textContent = response.status === 429
        ? "시도가 많습니다. 10분 뒤 다시 로그인해 주세요."
        : response.status === 503 ? "로그인 설정이 준비되지 않았습니다." : "비밀번호를 확인해 주세요.";
    } catch {
      message.textContent = "연결을 확인한 뒤 다시 시도해 주세요.";
    } finally {
      password.value = "";
      button.disabled = false;
    }
  });
}
