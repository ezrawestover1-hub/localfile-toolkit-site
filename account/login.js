const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");
const requestedNext = new URLSearchParams(location.search).get("next") || "";
const safeNext = /^\/(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)\/index\.html\?mode=plus$/.test(requestedNext) ? requestedNext : "";
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  message.textContent = "Signing in…";
  const response = await fetch("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  if (response?.redirected) location.assign(safeNext || response.url);
  else if (result?.ok && result.redirect) location.assign(safeNext || result.redirect);
  else message.textContent = result?.message || "Unable to sign in right now.";
});
