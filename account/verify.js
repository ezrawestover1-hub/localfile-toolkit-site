const form = document.querySelector("#verify-form");
const message = document.querySelector("#verify-message");
const resend = document.querySelector("#resend-button");
const email = sessionStorage.getItem("lft_pending_email") || "";
if (!email) message.textContent = "Start from the account creation page so we know which email to verify.";
const codeInput = document.querySelector("#code");
codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!email) return;
  message.textContent = "Verifying…";
  const response = await fetch("/api/account/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: new FormData(form).get("code") }) }).catch(() => null);
  if (response?.redirected) { sessionStorage.removeItem("lft_pending_email"); location.assign(response.url); return; }
  message.textContent = (await response?.json().catch(() => ({})))?.message || "Unable to verify the code.";
});
resend.addEventListener("click", async () => {
  if (!email) return;
  resend.disabled = true; message.textContent = "Sending a new code…";
  const response = await fetch("/api/account/resend-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
  message.textContent = (await response?.json().catch(() => ({})))?.message || "Unable to resend the code.";
  setTimeout(() => { resend.disabled = false; }, 30000);
});
