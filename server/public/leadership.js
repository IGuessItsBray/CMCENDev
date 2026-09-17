(function () {
  const rosterRoot = document.getElementById("leadershipRosters");

  if (!rosterRoot) return;

  let contentPromise;

  function getLanguage() {
    return document.documentElement.lang === "fr" ? "fr" : "en";
  }

  function loadContent() {
    if (!contentPromise) {
      contentPromise = fetch("/page-content/leadership.json").then(
        (response) => {
          if (!response.ok) {
            throw new Error("Could not load leadership content");
          }

          return response.json();
        },
      );
    }

    return contentPromise;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
      element.className = className;
    }

    if (text) {
      element.textContent = text;
    }

    return element;
  }

  function openBiography(card, labels) {
    if (!window.CMCENModal?.alert) return;

    document.body.classList.add("leadership-biography-open");
    const biographyDialog = window.CMCENModal.alert(card.bio, {
      closeLabel: labels.biographyCloseLabel,
      title: `${labels.biographyLabel}: ${card.name}`,
    }).finally(() =>
      document.body.classList.remove("leadership-biography-open"),
    );

    window.requestAnimationFrame(() => {
      const message = document.getElementById("cmcenModalMessage");

      if (message) {
        const portrait = document.createElement("img");
        portrait.className = "leadership-biography-portrait";
        portrait.src = card.image;
        portrait.alt = card.imageAlt;
        portrait.decoding = "async";
        message.classList.add("leadership-biography-copy");
        message.replaceChildren(portrait, document.createTextNode(card.bio));
      }

      window.requestAnimationFrame(() => {
        document.querySelector(".cmcen-modal-body")?.scrollTo({ top: 0 });
        document.querySelector(".cmcen-modal-close")?.focus();
      });
    });

    return biographyDialog;
  }

  function createCard(card, featured, labels) {
    if (card.bioKey && !card.bio) {
      card = { ...card, bio: labels.bios?.[card.bioKey] };
    }

    const article = createElement(
      "article",
      featured ? "leadership-featured-card" : "leadership-card",
    );
    const image = document.createElement("img");
    const copy = createElement("div", "leadership-card-copy");
    let portrait = image;

    if (card.placeholder) {
      article.classList.add("leadership-card--placeholder");
    }

    image.src = card.image;
    image.alt = card.imageAlt;
    image.loading = featured ? "eager" : "lazy";
    image.decoding = "async";

    if (card.bio) {
      const biographyButton = createElement(
        "button",
        "leadership-portrait-button",
      );
      const action = createElement(
        "span",
        "leadership-portrait-action",
        labels.biographyAction,
      );

      biographyButton.type = "button";
      biographyButton.setAttribute(
        "aria-label",
        `${labels.biographyAction}: ${card.name}`,
      );
      biographyButton.append(image, action);
      biographyButton.addEventListener("click", () =>
        openBiography(card, labels),
      );
      portrait = biographyButton;
      article.classList.add("leadership-card--has-biography");
    } else if (card.profileUrl) {
      const profileLink = createElement("a", "leadership-portrait-link");

      profileLink.href = card.profileUrl;
      profileLink.target = "_blank";
      profileLink.rel = "noopener noreferrer";
      profileLink.setAttribute("aria-label", `Official profile: ${card.name}`);
      profileLink.append(image);
      portrait = profileLink;
    }

    if (featured) {
      const portraitFrame = createElement(
        "div",
        "leadership-featured-portrait",
      );

      portraitFrame.append(portrait);
      portrait = portraitFrame;
    }

    copy.append(
      createElement("p", "leadership-rank", card.rank),
      createElement("h3", "", card.name),
      createElement("p", "leadership-role", card.role),
    );
    article.append(portrait, copy);

    return article;
  }

  function renderSections(content) {
    const language = getLanguage();
    const localized = content[language] || content.en;

    rosterRoot.replaceChildren();

    localized.sections.forEach((section, index) => {
      const sectionElement = createElement(
        "section",
        index === 0
          ? "about-family-section leadership-section leadership-section--senior"
          : "about-family-section leadership-section",
      );
      const heading = createElement("div", "leadership-section-heading");
      const label = createElement(
        "p",
        "leadership-section-label",
        section.label,
      );
      const title = createElement("h2", "", section.heading);
      const description = section.description
        ? createElement(
            "p",
            "leadership-section-description",
            section.description,
          )
        : null;
      const grid = createElement("div", "leadership-card-grid");
      const featuredCard = section.cards.find((card) => card.featured);

      heading.append(label, title);
      if (description) heading.append(description);
      sectionElement.append(heading);

      if (featuredCard) {
        sectionElement.append(createCard(featuredCard, true, localized));
      }

      section.cards
        .filter((card) => !card.featured)
        .forEach((card) => grid.append(createCard(card, false, localized)));

      sectionElement.append(grid);
      rosterRoot.append(sectionElement);
    });
  }

  function updateRoster() {
    loadContent()
      .then(renderSections)
      .catch((error) => console.error(error));
  }

  document.addEventListener("languagechange", updateRoster);
  updateRoster();
})();
