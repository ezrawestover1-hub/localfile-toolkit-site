const form = document.querySelector("#reset-form");
const requestButton = document.querySelector("#request-code");
const resendButton = document.querySelector("#resend-code");
const resetFields = document.querySelector("#reset-fields");
const message = document.querySelector("#reset-message");
const email = document.querySelector("#email");
const code = document.querySelector("#code");

code.addEventListener("input", () => { code.value = code.value.replace(/\D/g, "").slice(0, 6); });

async function requestCode(button) {
  if (!email.reportValidity()) return;
  button.disabled = true; message.textContent = "Sending reset code…";
  const response = await fetch("/api/account/password-reset/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.value }) }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  message.textContent = result?.message || "Unable to send the reset code.";
  if (response?.ok) resetFields.hidden = false;
  setTimeout(() => { button.disabled = false; }, 30000);
}

requestButton.addEventListener("click", () => requestCode(requestButton));
resendButton.addEventListener("click", () => requestCode(resendButton));
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const data = new FormData(form);
  if (String(data.get("code") || "").length !== 6) { message.textContent = "Enter the six-digit code from your email."; return; }
  if (data.get("password") !== data.get("confirm_password")) { message.textContent = "Passwords do not match."; return; }
  message.textContent = "Resetting password…";
  const response = await fetch("/api/account/password-reset/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), code: data.get("code"), password: data.get("password") }) }).catch(() => null);
  if (response?.redirected) location.assign(response.url); else { const result = await response?.json().catch(() => ({})); message.textContent = result?.message || `Unable to reset the password (server status ${response?.status || "unavailable"}).`; }
});
