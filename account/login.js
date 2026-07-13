const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");
const requestedNext = new URLSearchParams(location.search).get("next") || "";
const safeNext = /^\/(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)\/index\.html\?mode=(standard|plus)$/.test(requestedNext) ? requestedNext : "";
async function sessionIsActive() {
  const response = await fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
  return !!response?.ok;
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  message.textContent = "Signing in…";
  const response = await fetch("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }), credentials: "same-origin", cache: "no-store" }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  if (response?.redirected || (result?.ok && result.redirect)) {
    if (!(await sessionIsActive())) {
      message.textContent = "Your password was accepted, but the sign-in session could not be confirmed. Refresh this page and try again.";
      return;
    }
    location.assign(safeNext || result.redirect || response.url);
  }
  else message.textContent = result?.message || "Unable to sign in right now.";
});
