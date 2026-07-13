const form = document.querySelector("#register-form");
const message = document.querySelector("#register-message");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const password = String(data.get("password") || "");
  if (password !== String(data.get("confirm_password") || "")) { message.textContent = "Passwords do not match."; return; }
  message.textContent = "Sending verification code…";
  const response = await fetch("/api/account/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password }) }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  message.textContent = result?.message || "Unable to create the account right now.";
  if (response?.ok) { sessionStorage.setItem("lft_pending_email", String(data.get("email") || "")); location.assign("/account/verify.html"); }
});
