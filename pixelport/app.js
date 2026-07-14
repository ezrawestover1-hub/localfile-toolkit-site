(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { file: null, img: null, url: null, source: false };
  const input = $("fileInput"), drop = $("dropZone"), status = $("fileStatus");
  const work = $("work"), preview = $("preview"), width = $("width"), height = $("height"), quality = $("quality");
  let ratio = 1;

  function currentOptions(overrides = {}) {
    return { format: $("format")?.value || "image/png", width: Math.min(12000, Math.max(1, Number(width?.value) || 1)), height: Math.min(12000, Math.max(1, Number(height?.value) || 1)), quality: Math.min(100, Math.max(10, Number(quality?.value) || 90)) / 100, background: $("background")?.value || "transparent", ...(window.PixelPortPlusConfig || {}), ...overrides };
  }
  function outputName(name, options = {}) {
    const base = String(name || "image").replace(/\.[^.]+$/, "");
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif" }[options.format] || "png";
    return `${options.prefix || ""}${base}${options.suffix || ""}.${ext}`;
  }
  function canvasBlob(image, options) {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas"); canvas.width = options.width; canvas.height = options.height;
      const context = canvas.getContext("2d");
      if (options.background !== "transparent") { context.fillStyle = options.background.startsWith("#") ? options.background : options.background; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, options.format, options.quality);
    });
  }
  async function exportImage(image, options) {
    let blob = await canvasBlob(image, options);
    if (!blob || !options.optimize || !options.maxKB || !/^image\/(jpeg|webp|avif)$/.test(options.format)) return blob;
    let qualityValue = options.quality;
    while (blob.size > options.maxKB * 1024 && qualityValue > 0.1) { qualityValue = Math.max(0.1, qualityValue - 0.08); blob = await canvasBlob(image, { ...options, quality: qualityValue }); }
    return blob;
  }
  function downloadBlob(blob, name) { const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); }
  function imageFromFile(file) { return new Promise((resolve, reject) => { const url = URL.createObjectURL(file), image = new Image(); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(Error("This browser could not decode that image format.")); }; image.src = url; }); }
  function clear() { if (state.url) URL.revokeObjectURL(state.url); state.file = state.img = state.url = null; input.value = ""; status.textContent = "No file selected"; work.classList.add("hidden"); preview.removeAttribute("src"); window.SuiteGate.setActive(false); }
  function load(file, sample = false) {
    if (!sample && !window.SuiteGate.mayOpenRealDocument()) { window.SuiteGate.showUpgrade(); return; }
    if (!file || file.size > 20 * 1024 * 1024) { window.SuiteGate.message("Choose an image smaller than 20 MB."); return; }
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => { if (state.url) URL.revokeObjectURL(state.url); Object.assign(state, { file, img: image, url, source: sample }); ratio = image.naturalWidth / image.naturalHeight; width.value = image.naturalWidth; height.value = image.naturalHeight; preview.src = url; status.textContent = `${file.name} · ${image.naturalWidth}×${image.naturalHeight}`; $("imageInfo").textContent = `Source: ${file.type || "image"} · ${(file.size / 1024).toFixed(1)} KB`; work.classList.remove("hidden"); window.SuiteGate.update(sample); window.dispatchEvent(new CustomEvent("pixelport:data-loaded")); };
    image.onerror = () => { URL.revokeObjectURL(url); window.SuiteGate.message("This browser could not decode that image format."); };
    image.src = url;
  }
  quality.addEventListener("input", () => $("qLabel").textContent = `${quality.value}%`);
  width.addEventListener("input", () => { if (state.img && document.activeElement === width) height.value = Math.max(1, Math.round(Number(width.value) / ratio)); });
  height.addEventListener("input", () => { if (state.img && document.activeElement === height) width.value = Math.max(1, Math.round(Number(height.value) * ratio)); });
  input.addEventListener("change", (event) => load(event.target.files[0]));
  drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (event) => { event.preventDefault(); drop.classList.remove("drag"); load(event.dataTransfer.files[0]); });
  $("sampleBtn").addEventListener("click", () => { const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 540; const context = canvas.getContext("2d"), gradient = context.createLinearGradient(0, 0, 900, 540); gradient.addColorStop(0, "#24366f"); gradient.addColorStop(1, "#f0ad4e"); context.fillStyle = gradient; context.fillRect(0, 0, 900, 540); context.fillStyle = "#fff"; context.font = "bold 72px system-ui"; context.fillText("PixelPort", 250, 260); context.font = "32px system-ui"; context.fillText("Private image conversion", 260, 320); canvas.toBlob((blob) => load(new File([blob], "pixelport-sample.png", { type: "image/png" }), true), "image/png"); });
  $("clearBtn").addEventListener("click", clear);
  $("download").addEventListener("click", async () => { if (!state.img) return; if (!state.source && window.SuiteGate.used()) { window.SuiteGate.showUpgrade(); return; } const blob = await exportImage(state.img, currentOptions()); if (!blob) { window.SuiteGate.message("That output format is not supported by this browser."); return; } downloadBlob(blob, outputName(state.file.name, currentOptions())); if (!state.source) window.SuiteGate.markUsed(); });
  window.PixelPortCore = { state, currentOptions, exportImage, downloadBlob, outputName, imageFromFile };
  window.dispatchEvent(new Event("pixelport:ready"));
})();
