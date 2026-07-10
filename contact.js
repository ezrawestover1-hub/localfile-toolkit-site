const form = document.querySelector("#contactForm");
const status = document.querySelector("#formStatus");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Sending…";
  const data = Object.fromEntries(new FormData(form));
  data.consent = form.elements.consent.checked;
  try {
    const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const body = await response.json().catch(() => ({}));
    if (body.setup_mode) {
      status.innerHTML = `Online delivery is being configured. Please email <a href="mailto:localfiletools.support@gmail.com">localfiletools.support@gmail.com</a> directly.`;
      return;
    }
    if (!response.ok) throw new Error("request failed");
    form.reset();
    status.textContent = "Your message has been sent to LocalFile Toolkit support.";
  } catch {
    status.textContent = "We could not submit the form. Please email localfiletools.support@gmail.com directly.";
  }
});
