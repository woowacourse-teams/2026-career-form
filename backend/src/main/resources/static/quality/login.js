const form = document.getElementById("login-form");
const message = document.getElementById("message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  const password = document.getElementById("password");
  button.disabled = true;
  message.textContent = "로그인 중입니다.";
  try {
    const response = await fetch("/api/v1/quality/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password.value }),
      credentials: "same-origin",
    });
    password.value = "";
    if (response.ok) {
      const result = await response.json();
      sessionStorage.setItem("quality-csrf", result.csrf);
      location.replace("/quality/");
      return;
    }
    message.textContent = response.status === 429
      ? "시도가 많습니다. 10분 뒤 다시 로그인해 주세요."
      : response.status === 503 ? "로그인 설정이 준비되지 않았습니다." : "비밀번호를 확인해 주세요.";
  } catch {
    password.value = "";
    message.textContent = "연결을 확인한 뒤 다시 시도해 주세요.";
  } finally {
    button.disabled = false;
  }
});
