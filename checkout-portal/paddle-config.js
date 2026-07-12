// Public Paddle configuration. Client-side tokens and price IDs are designed to be publishable.
// Never place a Paddle API key or webhook secret in this file.
window.LOCALFILE_PADDLE = Object.freeze({
  environment: "sandbox", // change to "production" after live approval
  checkoutEnabled: false, // keep disabled until licensing, fulfillment, legal, and support setup are complete
  clientToken: "", // Add an operator-supplied sandbox token only when sandbox checkout is ready to test.
  prices: Object.freeze({
    ledgerlift: Object.freeze({ standard: "", plus: "" }),
    pixelport: Object.freeze({ standard: "", plus: "" }),
    contactcraft: Object.freeze({ standard: "", plus: "" }),
    calendarflow: Object.freeze({ standard: "", plus: "" }),
    captionshift: Object.freeze({ standard: "", plus: "" }),
    suite: Object.freeze({ bundle: "" })
  })
});
