(function () {
  const search = document.getElementById("professionalAwardsSearch");
  const tabs = document.getElementById("professionalAwardsTabs");
  const select = document.getElementById("professionalAwardsSelect");
  const panel = document.getElementById("professionalAwardsPanel");
  const highlights = document.getElementById("professionalAwardsHighlights");
  const manageLink = document.getElementById("professionalAwardsManageLink");
  let awards = [];
  let selectedAwardSlug = "";

  function addText(section, title, value) {
    if (!value) return;
    const heading = document.createElement("h3");
    heading.textContent = title;
    const text = document.createElement("p");
    text.textContent = value;
    section.append(heading, text);
  }

  function archiveColumn(award) {
    if (award.slug === "colonel-in-chief-commendation") {
      return { label: "Medallion no.", key: "medallionNumber" };
    }
    if (award.slug === "branch-bursary") {
      return { label: "Amount", key: "amount" };
    }
    return null;
  }

  function renderRecipientsTable(award, recipients) {
    const wrapper = document.createElement("div");
    wrapper.className = "professional-awards-table-wrap";
    const table = document.createElement("table");
    table.className = "professional-awards-table";
    const column = archiveColumn(award);
    const header = table.createTHead().insertRow();
    ["Year", "Member name, postnominals", column?.label]
      .filter(Boolean)
      .forEach((label) => {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        header.append(cell);
      });
    const body = table.createTBody();
    recipients.forEach((recipient) => {
      const row = body.insertRow();
      [recipient.year, recipient.name, column ? recipient[column.key] : null]
        .filter((value, index) => index < 2 || column)
        .forEach((value) => {
          const cell = row.insertCell();
          cell.textContent = value || "—";
        });
    });
    wrapper.append(table);
    return wrapper;
  }

  function renderAward(award) {
    const section = document.createElement("section");
    section.className = "about-family-section";
    const title = document.createElement("h2");
    title.textContent = award.title;
    section.append(title);
    addText(section, "Summary", award.summary);
    addText(section, "Eligibility", award.eligibility);
    addText(section, "How to apply", award.applicationDetails);
    addText(section, "Submission deadline", award.deadline);

    if (award.links?.length) {
      const heading = document.createElement("h3");
      heading.textContent = "Instructions and nomination documents";
      const list = document.createElement("ul");
      list.className = "about-family-pillar-list";
      award.links.forEach((item) => {
        const row = document.createElement("li");
        const link = document.createElement("a");
        link.href = item.url;
        link.textContent = item.label;
        link.target = "_blank";
        link.rel = "noopener";
        row.append(link);
        list.append(row);
      });
      section.append(heading, list);
    }

    if (award.recipients?.length) {
      const heading = document.createElement("h3");
      heading.textContent = "Past recipients";
      section.append(heading, renderRecipientsTable(award, award.recipients));
    }
    return section;
  }

  function renderRecipientResults(query) {
    const section = document.createElement("section");
    section.className = "about-family-section professional-awards-results";
    const title = document.createElement("h2");
    title.textContent = "Recipient search results";
    const intro = document.createElement("p");
    const matches = awards.flatMap((award) =>
      (award.recipients || [])
        .filter((recipient) =>
          `${recipient.name} ${recipient.role || ""}`
            .toLocaleLowerCase()
            .includes(query),
        )
        .map((recipient) => ({ award, recipient })),
    );
    intro.textContent = matches.length
      ? `${matches.length} recipient${matches.length === 1 ? "" : "s"} found across all awards.`
      : "No recipients match that search.";
    section.append(title, intro);

    if (matches.length) {
      const list = document.createElement("ul");
      list.className = "about-family-pillar-list";
      matches.forEach(({ award, recipient }) => {
        const row = document.createElement("li");
        row.textContent = `${recipient.year} — ${recipient.name} · ${award.title}${recipient.medallionNumber ? ` (Medallion ${recipient.medallionNumber})` : ""}`;
        list.append(row);
      });
      section.append(list);
    }
    return section;
  }

  function renderTabs() {
    const query = search.value.trim().toLocaleLowerCase();

    if (!awards.some((award) => award.slug === selectedAwardSlug)) {
      selectedAwardSlug = awards[0]?.slug || "";
    }

    tabs.replaceChildren(
      ...awards.map((award) => {
        const tab = document.createElement("button");
        const isSelected = award.slug === selectedAwardSlug;
        tab.type = "button";
        tab.className = "professional-awards-tab";
        tab.textContent = award.title;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(isSelected));
        tab.tabIndex = isSelected ? 0 : -1;
        tab.addEventListener("click", () => {
          selectedAwardSlug = award.slug;
          renderTabs();
        });
        return tab;
      }),
    );

    select.replaceChildren(
      ...awards.map((award) => {
        const option = document.createElement("option");
        option.value = award.slug;
        option.textContent = award.title;
        option.selected = award.slug === selectedAwardSlug;
        return option;
      }),
    );

    const selectedAward = awards.find(
      (award) => award.slug === selectedAwardSlug,
    );
    panel.replaceChildren(
      query
        ? renderRecipientResults(query)
        : selectedAward
          ? renderAward(selectedAward)
          : Object.assign(document.createElement("p"), {
              textContent: "No awards are available.",
            }),
    );
  }

  function renderHighlight(title, recipient) {
    if (!recipient) return null;
    const card = document.createElement("article");
    card.className = "professional-awards-highlight";
    const image = document.createElement("img");
    image.src = recipient.imageUrl || "/images/logo.png";
    image.alt = recipient.imageUrl ? recipient.name : "";
    card.append(image);
    const copy = document.createElement("div");
    const label = document.createElement("p");
    label.textContent = title;
    const name = document.createElement("h2");
    name.textContent = recipient.name;
    copy.append(label, name);
    if (recipient.role) {
      const role = document.createElement("p");
      role.textContent = recipient.role;
      copy.append(role);
    }
    card.append(copy);
    return card;
  }

  search.addEventListener("input", renderTabs);
  select.addEventListener("change", () => {
    selectedAwardSlug = select.value;
    renderTabs();
  });

  async function showManageLink() {
    const token = CMCENUtils.getStoredAuthToken();
    if (!token) return;
    try {
      const user = await CMCENUtils.apiJson("/api/me", { token });
      manageLink.hidden = user.permissions?.canReviewAndPublish !== true;
    } catch {
      manageLink.hidden = true;
    }
  }

  fetch("/api/professional-awards")
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load awards.");
      awards = data.awards || [];
      selectedAwardSlug = awards[0]?.slug || "";
      highlights.replaceChildren(
        ...[
          renderHighlight(
            "Subaltern of the Year",
            data.featuredRecipients?.subaltern,
          ),
          renderHighlight(
            "Member of the Year",
            data.featuredRecipients?.member,
          ),
        ].filter(Boolean),
      );
      renderTabs();
    })
    .catch((error) => {
      tabs.replaceChildren();
      panel.textContent = error.message || "Could not load awards.";
    });

  showManageLink();
})();
