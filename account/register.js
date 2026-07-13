const form = document.querySelector("#register-form");
const message = document.querySelector("#register-message");
const purchaseLink = document.querySelector("#register-purchase-link");
const requestedNext = new URLSearchParams(location.search).get("next") || "";
const safeNext = /^\/(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)\/index\.html\?mode=(standard|plus)$/.test(requestedNext) ? requestedNext : "/account/";
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  if (password !== String(data.get("confirm_password") || "")) { message.textContent = "Passwords do not match."; return; }
  message.textContent = "Sending verification code…";
  const response = await fetch("/api/account/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  if (response?.status === 402 || result?.error === "purchase_required") {
    message.textContent = result?.message || "Complete a LocalFile Toolkit purchase before creating an account.";
    if (purchaseLink) purchaseLink.hidden = false;
    return;
  }
  message.textContent = result?.message || "Unable to create the account right now.";
  if (response?.ok) { sessionStorage.setItem("lft_pending_email", email); sessionStorage.setItem("lft_pending_next", safeNext); location.assign("/account/verify.html"); }
});
