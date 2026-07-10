const form = document.querySelector("#refundForm");
const status = document.querySelector("#refundStatus");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Submitting…";
  const data = Object.fromEntries(new FormData(form));
  data.accurate = form.elements.accurate.checked;
  try {
    const response = await fetch("/api/refund-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const body = await response.json().catch(() => ({}));
    if (body.setup_mode) {
      status.innerHTML = `Online delivery is being configured. Please email <a href="mailto:localfiletools.support@gmail.com">localfiletools.support@gmail.com</a> directly.`;
      return;
    }
    if (!response.ok) throw new Error("request failed");
    form.reset();
    status.textContent = "Your refund request has been submitted for review.";
  } catch {
    status.textContent = "We could not submit the form. Please email localfiletools.support@gmail.com directly.";
  }
});
