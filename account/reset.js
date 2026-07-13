const form = document.querySelector("#reset-form");
const requestButton = document.querySelector("#request-code");
const message = document.querySelector("#reset-message");
const email = document.querySelector("#email");
requestButton.addEventListener("click", async () => {
  if (!email.reportValidity()) return;
  requestButton.disabled = true; message.textContent = "Sending reset code…";
  const response = await fetch("/api/account/password-reset/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.value }) }).catch(() => null);
  message.textContent = (await response?.json().catch(() => ({})))?.message || "Unable to send the reset code.";
  setTimeout(() => { requestButton.disabled = false; }, 30000);
});
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const data = new FormData(form);
  if (data.get("password") !== data.get("confirm_password")) { message.textContent = "Passwords do not match."; return; }
  message.textContent = "Resetting password…";
  const response = await fetch("/api/account/password-reset/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), code: data.get("code"), password: data.get("password") }) }).catch(() => null);
  if (response?.redirected) location.assign(response.url); else message.textContent = (await response?.json().catch(() => ({})))?.message || "Unable to reset the password.";
});
