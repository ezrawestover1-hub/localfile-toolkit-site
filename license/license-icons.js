const iconRoot = document.querySelector("[data-license-icons]");
if (iconRoot && window.PRODUCT_ICONS) {
  Object.entries(window.PRODUCT_ICONS).forEach(([key, item]) => {
    const image = document.createElement("img");
    image.src = item.icon;
    image.width = 40;
    image.height = 40;
    image.alt = item.name;
    iconRoot.append(image);
  });
}
