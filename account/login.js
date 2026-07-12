const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");
const params = new URLSearchParams(location.search);
if (params.get("error")) message.textContent = params.get("error") === "expired" ? "That sign-in link expired. Request a new one." : "That sign-in link is invalid. Request a new one.";
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "Sending…";
  const response = await fetch("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: new FormData(form).get("email") }) }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  message.textContent = result?.message || "If that address can receive mail, a sign-in link is on its way.";
  if (result?.development_login_url) { const link = document.createElement("a"); link.href = result.development_login_url; link.textContent = " Open development sign-in link"; message.append(link); }
  if (response?.ok) form.reset();
});
