const form = document.querySelector("#restore-form");
const message = document.querySelector("#restore-message");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await fetch("/api/license/restore/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: new FormData(form).get("email") }) });
  message.textContent = "If an account matches, restore instructions will be sent.";
  form.reset();
});
