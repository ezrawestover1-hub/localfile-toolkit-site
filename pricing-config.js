window.LOCALFILE_PRICING = Object.freeze({
  ledgerlift: Object.freeze({
    name: "LedgerLift",
    standard: 1999,
    plus: 2499,
    upgrade: 500,
    checkout: "ledgerlift"
  }),
  pixelport: Object.freeze({
    name: "PixelPort",
    standard: 299,
    plus: 599,
    upgrade: 300,
    checkout: "pixelport"
  }),
  contactcraft: Object.freeze({
    name: "ContactCraft",
    standard: 999,
    plus: 1299,
    upgrade: 300,
    checkout: "contactcraft"
  }),
  calendarflow: Object.freeze({
    name: "CalendarFlow",
    standard: 999,
    plus: 1299,
    upgrade: 300,
    checkout: "calendarflow"
  }),
  captionshift: Object.freeze({
    name: "CaptionShift",
    standard: 699,
    plus: 999,
    upgrade: 300,
    checkout: "captionshift"
  }),
  bundle: Object.freeze({
    name: "Complete Plus Bundle",
    plus: 3999,
    separatePlusTotal: 6695,
    savings: 2696,
    savingsPercent: 40,
    checkout: "suite"
  })
});

window.formatLocalFilePrice = function formatLocalFilePrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
};

window.formatLocalFileDifference = function formatLocalFileDifference(cents) {
  return `$${(cents / 100).toFixed(0)}`;
};
