(() => {
  const list = document.getElementById("heritageList");
  const message = document.getElementById("heritageMessage");
  const more = document.getElementById("heritageMore");
  const copy = {
    en: {
      heading: "History & Heritage",
      eyebrow: "C&E Branch",
      intro:
        "Discover the people, places, and moments that shaped our C&E heritage.",
      loading: "Loading heritage stories…",
      empty: "Heritage stories will appear here as they are published.",
      error: "Could not load heritage stories. Please try again.",
      more: "Load more",
      archive: "From the archive",
      unknown: "Year not recorded",
      page: "Heritage event",
      article: "Heritage moment",
      year: "Published",
    },
    fr: {
      heading: "Histoire et patrimoine",
      eyebrow: "Branche des C et E",
      intro:
        "Découvrez les personnes, les lieux et les moments qui ont façonné notre patrimoine des C et E.",
      loading: "Chargement des récits…",
      empty:
        "Les récits du patrimoine apparaîtront ici au fil de leur publication.",
      error: "Impossible de charger les récits. Veuillez réessayer.",
      more: "Afficher plus",
      archive: "Archives",
      unknown: "Année non documentée",
      page: "Événement patrimonial",
      article: "Moment du patrimoine",
      year: "Publié en",
    },
  };
  let items = [],
    offset = 0,
    loading = false,
    generation = 0;
  const language = () =>
    CMCENUtils.getCurrentLanguage() === "fr" ? "fr" : "en";
  const localized = (value) =>
    CMCENUtils.getLocalizedText(value, language()) ||
    CMCENUtils.getLocalizedText(value, language() === "fr" ? "en" : "fr");
  function render() {
    const labels = copy[language()];
    document.title = `${labels.heading} | CMCEN / RCMCE`;
    document.getElementById("heritageHeading").textContent = labels.heading;
    document.getElementById("heritageEyebrow").textContent = labels.eyebrow;
    document.getElementById("heritageIntro").textContent = labels.intro;
    list.setAttribute("aria-label", labels.heading);
    more.textContent = labels.more;
    list.replaceChildren();
    for (const item of items) {
      const card = document.createElement("a");
      card.className = "news-card";
      card.href = item.url;
      if (item.imageUrl) {
        const media = document.createElement("span");
        media.className = "news-card-media";
        if (CMCENUtils.isSitePlaceholderImage(item.imageUrl)) {
          media.classList.add("news-card-media--crest");
        }
        const image = document.createElement("img");
        image.src = item.imageUrl;
        image.alt = "";
        image.loading = "lazy";
        media.append(image);
        card.append(media);
      } else card.classList.add("news-card--without-image");
      const content = document.createElement("div");
      content.className = "news-card-content";
      const meta = document.createElement("p");
      meta.className = "news-card-date";
      meta.textContent = [
        labels[item.type],
        item.archive ? labels.archive : "",
        item.year
          ? `${item.archive ? "" : `${labels.year} `}${item.year}`
          : labels.unknown,
      ]
        .filter(Boolean)
        .join(" · ");
      const title = document.createElement("h2");
      title.textContent = localized(item.title);
      content.append(meta, title);
      const excerpt = localized(item.excerpt);
      if (excerpt) {
        const text = document.createElement("p");
        text.textContent = excerpt;
        content.append(text);
      }
      card.append(content);
      list.append(card);
    }
  }
  async function load(reset = false) {
    if (loading && !reset) return;
    const requestGeneration = ++generation;
    loading = true;
    more.disabled = true;
    if (reset) {
      items = [];
      offset = 0;
      more.hidden = true;
      render();
    }
    message.hidden = false;
    message.textContent = copy[language()].loading;
    try {
      const token = CMCENUtils.getStoredAuthToken();
      const response = await fetch(
        `/api/history-heritage?limit=24&offset=${offset}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok) throw new Error("Feed unavailable");
      const data = await response.json();
      if (requestGeneration !== generation) return;
      items.push(...data.items);
      offset += data.items.length;
      render();
      message.hidden = items.length > 0;
      message.textContent = copy[language()].empty;
      more.hidden = !data.hasMore;
    } catch {
      if (requestGeneration !== generation) return;
      message.textContent = copy[language()].error;
    } finally {
      if (requestGeneration === generation) {
        loading = false;
        more.disabled = false;
      }
    }
  }
  more.addEventListener("click", () => load());
  document.addEventListener("languagechange", () => load(true));
  load(true);
})();
