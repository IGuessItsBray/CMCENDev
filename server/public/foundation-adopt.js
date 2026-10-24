(function () {
  const campaignLink = document.getElementById("adoptCampaignLink");
  if (!campaignLink) return;
  const search = document.getElementById("adoptCatalogueSearch");
  const list = document.getElementById("adoptCatalogue");
  const head = document.getElementById("adoptCatalogueHead");
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
  function cell(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function row(item) {
    const tr = document.createElement("tr");
    tr.append(cell("td", item.displayNumber || ""));
    const picture = document.createElement("td");
    if (item.imageUrl && /^https?:\/\//i.test(item.imageUrl)) {
      const image = document.createElement("img");
      image.className = "adopt-catalogue-image";
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.src = item.imageUrl;
      picture.append(image);
    }
    tr.append(picture);
    const description = document.createElement("th");
    description.scope = "row";
    description.append(cell("span", value(item.title)));
    if (
      value(item.description) &&
      value(item.description) !== value(item.title)
    ) {
      const p = document.createElement("p");
      p.textContent = value(item.description);
      description.append(p);
    }
    tr.append(description);
    for (const field of [
      value(item.availability),
      value(item.adoptionAmount),
      value(item.recognition),
      value(item.expiry),
    ]) {
      tr.append(cell("td", field));
    }
    return tr;
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
    if (head) {
      const headings = document.createElement("tr");
      for (const key of [
        "catalogueNumber",
        "cataloguePicture",
        "catalogueDescription",
        "catalogueStatus",
        "catalogueAmount",
        "catalogueCredit",
        "catalogueExpiry",
      ]) {
        const heading = cell("th", label(key));
        heading.scope = "col";
        headings.append(heading);
      }
      head.replaceChildren(headings);
    }
    list.replaceChildren(...matches.slice(0, visible).map(row));
    if (!state && !matches.length) {
      const message = document.createElement("tr");
      const p = document.createElement("td");
      p.colSpan = 7;
      p.textContent = label(
        items.length ? "catalogueNoResults" : "catalogueEmpty",
      );
      message.append(p);
      list.append(message);
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
