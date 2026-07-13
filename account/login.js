const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const codeForm = document.querySelector("#code-form");
const message = document.querySelector("#login-message");
const showRegister = document.querySelector("#show-register");
let pendingEmail = "";
const read = async (response) => response?.json().catch(() => ({}));

showRegister.addEventListener("click", () => { registerForm.hidden = false; showRegister.hidden = true; message.textContent = "Create a password, then verify your email with the code we send."; });
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(loginForm);
  message.textContent = "Signing in…";
  const response = await fetch("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) }).catch(() => null);
  const result = await read(response);
  message.textContent = result?.message || "Unable to sign in right now.";
  if (response?.redirected) location.assign(response.url);
});
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const loginData = new FormData(loginForm);
  const registerData = new FormData(registerForm);
  pendingEmail = String(loginData.get("email") || "");
  message.textContent = "Sending verification code…";
  const response = await fetch("/api/account/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: pendingEmail, password: registerData.get("password") }) }).catch(() => null);
  const result = await read(response);
  message.textContent = result?.message || "Unable to create the account right now.";
  if (response?.ok) { registerForm.hidden = true; codeForm.hidden = false; }
});
codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(codeForm);
  message.textContent = "Verifying…";
  const response = await fetch("/api/account/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: pendingEmail || new FormData(loginForm).get("email"), code: data.get("code") }) }).catch(() => null);
  if (response?.redirected) location.assign(response.url); else message.textContent = (await read(response))?.message || "Unable to verify the code.";
});
