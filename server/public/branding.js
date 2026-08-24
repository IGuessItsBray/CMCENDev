(function () {
  function createFontCard(font) {
    const card = document.createElement("article");
    card.className = "branding-font-card";

    const name = document.createElement("h3");
    name.textContent = font.name;

    const usage = document.createElement("p");
    usage.textContent = font.usage;

    const family = document.createElement("code");
    family.textContent = font.family;

    const token = document.createElement("span");
    token.className = "branding-token";
    token.textContent = font.token;

    card.append(name, usage, family, token);
    return card;
  }

  function createColourCard([token, value, label]) {
    const card = document.createElement("article");
    card.className = "branding-colour-card";

    const swatch = document.createElement("span");
    swatch.className = "branding-colour-swatch";
    swatch.style.backgroundColor = value;
    swatch.setAttribute("aria-hidden", "true");

    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = label;
    const details = document.createElement("code");
    details.textContent = `${token} · ${value}`;
    copy.append(name, details);

    card.append(swatch, copy);
    return card;
  }

  function render(container, items, createItem) {
    if (!container) return;
    container.replaceChildren(...items.map(createItem));
  }

  async function loadBranding() {
    const response = await fetch("/api/branding");
    if (!response.ok) throw new Error("Could not load branding data.");
    return response.json();
  }

  loadBranding()
    .then((branding) => {
      render(
        document.getElementById("brandingFonts"),
        branding.fonts,
        createFontCard,
      );
      render(
        document.getElementById("brandingLightColours"),
        branding.colors.light,
        createColourCard,
      );
      render(
        document.getElementById("brandingDarkColours"),
        branding.colors.dark,
        createColourCard,
      );
    })
    .catch(() => {
      document
        .querySelectorAll(".branding-font-grid, .branding-colour-grid")
        .forEach((container) => {
          container.textContent = "Branding data could not be loaded.";
        });
    });
})();
