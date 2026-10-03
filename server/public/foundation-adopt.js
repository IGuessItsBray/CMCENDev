(function () {
  const campaignLink = document.getElementById("adoptCampaignLink");
  if (!campaignLink) return;
  const search = document.getElementById("adoptCatalogueSearch");
  const list = document.getElementById("adoptCatalogue");
  const count = document.getElementById("adoptCatalogueCount");
  const more = document.getElementById("adoptCatalogueMore");
  const status = document.getElementById("adoptCatalogueError");
  const retry = document.getElementById("adoptCatalogueRetry");
  let items = [],
    content,
    visible = 24,
    state = "catalogueLoading";
  const language = () => (document.documentElement.lang === "fr" ? "fr" : "en");
  const value = (field) => field?.[language()] || field?.en || field?.fr || "";
  function label(key, values = {}) {
    return (content?.[language()]?.[key] || content?.en?.[key] || "").replace(
      /\{(\w+)\}/g,
      (_, name) => values[name] ?? "",
    );
  }
  function card(item) {
    const article = document.createElement("article");
    article.className = "document-library-card adopt-catalogue-card";
    if (item.imageUrl && /^https?:\/\//i.test(item.imageUrl)) {
      const image = document.createElement("img");
      image.className = "adopt-catalogue-image";
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.src = item.imageUrl;
      article.append(image);
    }
    const title = document.createElement("h3");
    title.textContent = value(item.title);
    article.append(title);
    if (value(item.description)) {
      const p = document.createElement("p");
      p.textContent = value(item.description);
      article.append(p);
    }
    const details = document.createElement("dl");
    details.className = "adopt-catalogue-details";
    for (const [key, field] of [
      ["catalogueNumber", item.displayNumber],
      ["catalogueStatus", value(item.availability)],
      ["catalogueAmount", value(item.adoptionAmount)],
      ["catalogueCredit", value(item.recognition)],
      ["catalogueExpiry", value(item.expiry)],
    ]) {
      if (!field) continue;
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label(key);
      dd.textContent = field;
      details.append(dt, dd);
    }
    article.append(details);
    return article;
  }
  function render() {
    const locale = language() === "fr" ? "fr-CA" : "en-CA";
    campaignLink.href = `https://www.zeffy.com/${locale}/donation-form/adopt-an-exhibit`;
    if (!list) return;
    retry.hidden = state !== "catalogueLoadError";
    if (!content) {
      status.hidden = false;
      status.textContent =
        language() === "fr"
          ? state === "catalogueLoadError"
            ? "Impossible de charger le catalogue."
            : "Chargement…"
          : state === "catalogueLoadError"
            ? "Could not load the catalogue."
            : "Loading…";
      return;
    }
    status.textContent = state ? label(state) : "";
    status.hidden = !state;
    retry.hidden = state !== "catalogueLoadError";
    const query = search.value.trim().toLocaleLowerCase();
    const matches = items.filter((item) =>
      [
        item.displayNumber,
        value(item.title),
        value(item.description),
        value(item.availability),
      ].some((text) =>
        String(text || "")
          .toLocaleLowerCase()
          .includes(query),
      ),
    );
    list.replaceChildren(...matches.slice(0, visible).map(card));
    if (!state && !matches.length) {
      const p = document.createElement("p");
      p.textContent = label(
        items.length ? "catalogueNoResults" : "catalogueEmpty",
      );
      list.append(p);
    }
    count.textContent = state
      ? ""
      : label("catalogueCount", {
          shown: Math.min(visible, matches.length),
          total: matches.length,
        });
    more.textContent = label("catalogueMore");
    more.hidden = !!state || visible >= matches.length;
  }
  document.addEventListener("languagechange", render);
  render();
  if (!list) return;
  async function load() {
    retry.disabled = true;
    state = "catalogueLoading";
    render();
    try {
      if (!content) {
        const response = await fetch("/page-content/foundation-adopt.json");
        if (!response.ok) throw new Error();
        content = await response.json();
      }
      const response = await fetch("/api/adopt-displays");
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.displays)) throw new Error();
      items = data.displays;
      state = "";
    } catch {
      state = "catalogueLoadError";
      status.textContent =
        language() === "fr"
          ? "Impossible de charger le catalogue."
          : "Could not load the catalogue.";
      status.hidden = false;
    } finally {
      retry.disabled = false;
      render();
    }
  }
  search.addEventListener("input", () => {
    visible = 24;
    render();
  });
  more.addEventListener("click", () => {
    visible += 24;
    render();
  });
  retry.addEventListener("click", load);
  load();
})();
