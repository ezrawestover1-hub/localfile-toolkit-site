// Public Paddle configuration. Client-side tokens and price IDs are designed to be publishable.
// Never place a Paddle API key or webhook secret in this file.
window.LOCALFILE_PADDLE = Object.freeze({
  environment: "sandbox", // change to "production" after live approval
  checkoutEnabled: false, // Keep checkout disabled after the supervised sandbox verification pass.
  clientToken: "test_e1fd568107eae84a07b7a054c97", // Sandbox client-side token; safe for Paddle.js, never use an API key here.
  prices: Object.freeze({
    ledgerlift: Object.freeze({ standard: "pri_01kxbnrr880w3zyzznnfhc153h", plus: "pri_01kxbnrrjv6b6fr4m5p55pg75v" }),
    pixelport: Object.freeze({ standard: "pri_01kxbnrrxjb758mwa6x2gjkhna", plus: "pri_01kxbnrs79exw36hg6w69cq27e" }),
    contactcraft: Object.freeze({ standard: "pri_01kxbnrshd2h7stwjgbnc9eyrt", plus: "pri_01kxbnrsw2fnjsejndvahz25j1" }),
    calendarflow: Object.freeze({ standard: "pri_01kxbnrt5dr469wk6naevt2dh4", plus: "pri_01kxbnrthvj72219amwy5wpa70" }),
    captionshift: Object.freeze({ standard: "pri_01kxbnrtv57ejmy6b0nvp6pfvp", plus: "pri_01kxbnrv3ewpe5rff8nh33cctg" }),
    suite: Object.freeze({ bundle: "pri_01kxbnrvd8mf8edt7gbcqh96hv" })
  })
});
