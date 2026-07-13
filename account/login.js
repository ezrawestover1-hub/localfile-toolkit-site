const form = document.querySelector("#auth-form");
const credentialsStep = document.querySelector("#credentials-step");
const codeStep = document.querySelector("#code-step");
const email = document.querySelector("#email");
const password = document.querySelector("#password");
const code = document.querySelector("#code");
const submitButton = document.querySelector("#submit-button");
const registerButton = document.querySelector("#register-button");
const message = document.querySelector("#login-message");
let mode = "login";

const read = async (response) => response?.json().catch(() => ({}));
const setCodeStep = () => {
  mode = "verify";
  credentialsStep.hidden = true;
  email.disabled = true;
  password.disabled = true;
  codeStep.hidden = false;
  code.required = true;
  submitButton.textContent = "Verify email";
  registerButton.hidden = true;
  code.focus();
};

registerButton.addEventListener("click", async () => {
  mode = "register";
  if (!form.reportValidity()) return;
  message.textContent = "Sending verification code…";
  const response = await fetch("/api/account/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.value, password: password.value }) }).catch(() => null);
  const result = await read(response);
  message.textContent = result?.message || "Unable to create the account right now.";
  if (response?.ok) setCodeStep();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (mode === "verify") {
    message.textContent = "Verifying…";
    const response = await fetch("/api/account/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.value, code: code.value }) }).catch(() => null);
    if (response?.redirected) location.assign(response.url); else message.textContent = (await read(response))?.message || "Unable to verify the code.";
    return;
  }
  message.textContent = "Signing in…";
  const response = await fetch("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.value, password: password.value }) }).catch(() => null);
  const result = await read(response);
  message.textContent = result?.message || "Unable to sign in right now.";
  if (response?.redirected) location.assign(response.url);
});
