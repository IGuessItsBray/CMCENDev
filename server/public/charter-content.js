(function () {
  const charterRoot = document.getElementById("charterContent");
  let charterData;

  const ui = {
    en: {
      comments: "Comments",
      date: "Date",
      documentManagement: "Document change history",
      historyIntro:
        "This table records who revised the charter, when each revision was made, and what changed.",
      page: "PDF page",
      pages: "PDF pages",
      author: "Author",
      version: "Version",
    },
    fr: {
      comments: "Commentaires",
      date: "Date",
      documentManagement: "Historique des modifications",
      historyIntro:
        "Ce tableau indique qui a révisé la Charte, la date de chaque révision et les modifications apportées.",
      page: "Page du PDF",
      pages: "Pages du PDF",
      author: "Auteur",
      version: "Version",
    },
  };

  const frenchSectionTitles = {
    Introduction: "Introduction",
    "Part 1 – The C&E Family And Its Structure":
      "Partie 1 – La famille des C et E et sa structure",
    "Part 2 - C&E Senate Functions": "Partie 2 – Fonctions du Sénat des C et E",
    "Section 1 - General": "Section 1 – Généralités",
    "Section 2 – C&E Senate Membership And Structure":
      "Section 2 – Composition et structure du Sénat des C et E",
    "Section 3 – C&E Senate Management Functions":
      "Section 3 – Fonctions de gestion du Sénat des C et E",
    "Section 4 – C&E Senate Methods Of Work":
      "Section 4 – Méthodes de travail du Sénat des C et E",
    "Section 5 - Meetings Of The C&E Senate":
      "Section 5 – Réunions du Sénat des C et E",
    "Section 6 – Indemnification And Remuneration":
      "Section 6 – Indemnisation et rémunération",
  };

  const inlineHeadings = [
    "1. UNDERSTANDING GOVERNANCE",
    "2. HOW GOVERNANCE WORKS",
    "2.1 - DEFINES ORGANIZATIONAL DIRECTION AND EXPECTATIONS",
    "2.2 - GRANTS AND ASSIGNS POWER",
    "2.3 - VERIFIES PERFORMANCE",
    "3. GOVERNANCE AND THE C&E FAMILY",
    "3.1 Governing the C&E Family",
    "3.2 C&E Senate Basic Role",
    "3.3 C&E Senate Functions",
    "3.4 Example",
    "4. C&E SENATE METHOD OF WORK",
    "5. C&E MEETINGS",
    "C&E FAMILY STRUCTURE",
    "C&E FAMILY ORGANIZATION",
    "STATUS AS NOT-FOR PROFIT CORPORATION",
    "STATUS AS A REGISTERED CHARITY",
    "COMPLIANCE",
    "MOUs WITH AFFILIATES WHERE NECESSARY",
    "1. STRATEGIC GUIDANCE",
    "2. POLICY AND ISSUE MANAGEMENT",
    "3. FINANCIAL STEWARDSHIP",
    "4. HUMAN RESOURCE STEWARDSHIP",
    "5. STAKEHOLDER COMMUNICATION",
    "Responsibility",
    "Approach",
    "Specific Tasks",
    "1.01 Interpretation of Wording",
    "1.02 Financial Year",
    "1.03 Head Office",
    "1.04 Amendment of the C&E Senate Charter",
    "1.05 Invalidity of the Charter",
    "2.01 C&E Senate Membership",
    "2.02 Executive Committee",
    "2.03 Chair and Co-Chair of the C&E Senate",
    "2.04 Secretary",
    "2.05 Executive Director",
    "2.06 Treasurer",
    "2.07 Advisors",
    "3.01 C&E Senate Rules and Regulations",
    "3.02 C&E Senate Management Responsibilities",
    "3.03 C&E Senate Financial Management Responsibilities",
    "3.04 Finance Committee of the C&E Senate",
    "3.05 Additional Committees and Project Teams",
    "3.06 Management Review of Books and Records",
    "4.01 Business Methods of Work",
    "4.02 Execution of Documents by Signing Officers",
    "4.03 Use of Electronic Media And Services",
    "4.04 Banking Arrangements",
    "4.05 Annual Financial Statements",
    "5.01 Convening C&E Senate Meetings",
    "5.02 Participating in C&E Senate Meetings",
    "5.03 Notice of C&E Senate Meetings",
    "5.04 Mandatory Business to be Transacted at Annual C&E Senate Meetings",
    "5.05 Agenda of Meetings of Members",
    "5.06 Quorum",
    "5.07 Voting and Method of Voting",
    "5.08 Proxy Voting",
    "5.09 Records Of Decisions – Development And Publication",
    "5.10 Use of Auditors",
    "6.01 Indemnification of C&E Senate Members – Insurance vs Liabilities, Errors or Omissions",
    "6.02 C&E Senate Agents and Employees",
  ].sort((left, right) => right.length - left.length);

  const inlineHeadingPattern = new RegExp(
    `(${inlineHeadings
      .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
      .join("|")})`,
    "gu",
  );

  if (!charterRoot) return;

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function appendBlock(container, block) {
    if (block.type === "major") return;

    if (block.type === "heading") {
      container.append(element("h4", "charter-subheading", block.text));
      return;
    }

    const parts = block.text.split(inlineHeadingPattern).filter(Boolean);
    const hasInlineHeading = parts.some((part) =>
      inlineHeadings.includes(part),
    );

    if (hasInlineHeading) {
      parts.forEach((part, index) => {
        if (inlineHeadings.includes(part)) {
          container.append(element("h4", "charter-subheading", part));
          return;
        }

        const text = part.trim();
        if (!text) return;

        if (block.type === "list" && index === 0) {
          let list = container.lastElementChild;
          if (!list || !list.matches("ul.charter-list")) {
            list = element("ul", "charter-list");
            container.append(list);
          }
          list.append(element("li", "", text));
        } else {
          container.append(element("p", "", text));
        }
      });
      return;
    }

    if (block.type === "list") {
      let list = container.lastElementChild;
      if (!list || !list.matches("ul.charter-list")) {
        list = element("ul", "charter-list");
        container.append(list);
      }
      list.append(element("li", "", block.text));
      return;
    }

    container.append(element("p", "", block.text));
  }

  function getUi() {
    return ui[document.documentElement.lang === "fr" ? "fr" : "en"];
  }

  function createHistory(history, labels) {
    const wrapper = element("div", "charter-table-wrap");
    const table = element("table", "charter-history-table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");

    [labels.version, labels.date, labels.author, labels.comments].forEach(
      (label) => {
        headRow.append(element("th", "", label));
      },
    );
    head.append(headRow);
    table.append(head);

    const body = document.createElement("tbody");
    history.forEach((entry) => {
      const row = document.createElement("tr");
      [entry.version, entry.date, entry.author, entry.comments].forEach(
        (value) => row.append(element("td", "", value)),
      );
      body.append(row);
    });
    table.append(body);
    wrapper.append(table);
    return wrapper;
  }

  function createSection(section, index, labels, isFrench) {
    const details = element("details", "charter-accordion");
    if (index === 0) details.open = true;

    const summary = document.createElement("summary");
    const title = element(
      "span",
      "charter-accordion-title",
      isFrench
        ? frenchSectionTitles[section.title] || section.title
        : section.title,
    );
    const pages = element(
      "span",
      "charter-source-pages",
      `${section.sourcePages.includes("-") ? labels.pages : labels.page} ${section.sourcePages}`,
    );
    summary.append(title, pages);

    const body = element("div", "charter-accordion-body");
    section.blocks.forEach((block) => appendBlock(body, block));
    details.append(summary, body);
    return details;
  }

  function renderCharter(charter) {
    const labels = getUi();
    const isFrench = document.documentElement.lang === "fr";
    const fragment = document.createDocumentFragment();
    const historyDetails = element("details", "charter-accordion");
    const historySummary = document.createElement("summary");
    historySummary.append(
      element("span", "charter-accordion-title", labels.documentManagement),
      element("span", "charter-source-pages", `${labels.page} 2`),
    );
    const historyBody = element("div", "charter-accordion-body");
    historyBody.append(
      element("p", "charter-history-intro", labels.historyIntro),
    );
    historyBody.append(createHistory(charter.history, labels));
    historyDetails.append(historySummary, historyBody);
    fragment.append(historyDetails);

    charter.sections.forEach((section, index) => {
      fragment.append(createSection(section, index, labels, isFrench));
    });
    charterRoot.replaceChildren(fragment);
  }

  async function loadCharter() {
    try {
      const response = await fetch("/page-content/ce-senate-charter.en.json");
      if (!response.ok) throw new Error("Could not load the charter text");
      charterData = await response.json();
      renderCharter(charterData);
    } catch (error) {
      charterRoot.replaceChildren(
        element("p", "charter-load-error", error.message),
      );
    }
  }

  document.addEventListener("languagechange", () => {
    if (charterData) renderCharter(charterData);
  });
  loadCharter();
})();
