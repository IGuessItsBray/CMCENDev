(function () {
  const directorsRoot = document.getElementById("associationDirectors");
  const advisorsRoot = document.getElementById("associationAdvisors");
  if (!directorsRoot || !advisorsRoot) return;

  let contentPromise;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function emailLink(email) {
    const link = element("a", "association-email", email);
    link.href = `mailto:${email}`;
    return link;
  }

  function directorCard(person) {
    const card = element("article", "association-director");
    card.id = person.id;
    const image = element("img", "association-portrait");
    image.src = person.image;
    image.alt = person.placeholder ? "" : person.name;
    image.width = person.imageWidth;
    image.height = person.imageHeight;
    image.loading = "lazy";
    image.decoding = "async";
    if (person.placeholder) image.classList.add("association-portrait--crest");
    const copy = element("div", "association-director-copy");
    copy.append(
      element("p", "association-role", person.role),
      element("h3", "", person.name),
    );
    if (person.email) copy.append(emailLink(person.email));
    if (person.bio.length) {
      const biography = element("div", "association-biography");
      person.bio.forEach((paragraph) =>
        biography.append(element("p", "", paragraph)),
      );
      copy.append(biography);
    }
    card.append(image, copy);
    return card;
  }

  async function render() {
    try {
      if (!contentPromise) {
        contentPromise = fetch("/page-content/association-directors.json").then(
          (response) => {
            if (!response.ok)
              throw new Error("Could not load association directors");
            return response.json();
          },
        );
      }
      const content = await contentPromise;
      const localized =
        content[document.documentElement.lang === "fr" ? "fr" : "en"];
      directorsRoot.replaceChildren(...localized.directors.map(directorCard));
      advisorsRoot.replaceChildren(
        ...localized.advisors.map((person) => {
          const item = element("li", "association-advisor");
          item.append(
            element("h3", "", person.role),
            element("p", "", person.name),
          );
          if (person.email) item.append(emailLink(person.email));
          return item;
        }),
      );
    } catch (error) {
      contentPromise = null;
      const message =
        document.documentElement.lang === "fr"
          ? "Impossible de charger les directeurs et conseillers. Veuillez recharger la page."
          : "The directors and advisors could not be loaded. Please reload the page.";
      directorsRoot.replaceChildren(element("p", "", message));
      console.error(error);
    }
  }

  document.addEventListener("languagechange", render);
  render();
})();
