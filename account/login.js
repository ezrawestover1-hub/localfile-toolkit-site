const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  message.textContent = "Signing in…";
  const response = await fetch("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  message.textContent = result?.message || "Unable to sign in right now.";
  if (response?.redirected) location.assign(response.url);
});
