const form = document.querySelector("#verify-form");
const message = document.querySelector("#verify-message");
const email = sessionStorage.getItem("lft_pending_email") || "";
if (!email) message.textContent = "Start from the account creation page so we know which email to verify.";
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!email) return;
  message.textContent = "Verifying…";
  const response = await fetch("/api/account/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: new FormData(form).get("code") }) }).catch(() => null);
  if (response?.redirected) { sessionStorage.removeItem("lft_pending_email"); location.assign(response.url); return; }
  message.textContent = (await response?.json().catch(() => ({})))?.message || "Unable to verify the code.";
});
