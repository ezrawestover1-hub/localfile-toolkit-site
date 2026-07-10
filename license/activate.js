import { addStoredEntitlement, getInstallationId } from "/license.js";
const form = document.querySelector("#activation-form");
const message = document.querySelector("#activation-message");
form.addEventListener("submit", async (event) => {
  event.preventDefault(); message.textContent = "Activating…";
  const activation_code = new FormData(form).get("activation_code");
  const response = await fetch("/api/license/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activation_code, installation_id: getInstallationId() }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.entitlement) { message.textContent = "That code could not be activated. Check it and try again."; return; }
  addStoredEntitlement(result.entitlement); message.textContent = "Activation complete. You can now manage this browser's entitlements."; form.reset();
});
