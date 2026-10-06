(() => {
  "use strict";
  const app = document.getElementById("archiveStaffApp");
  const message = document.getElementById("archiveStaffMessage");
  const typeSelect = document.getElementById("archiveStaffType");
  const statusSelect = document.getElementById("archiveStaffStatus");
  const queue = document.getElementById("archiveStaffQueue");
  const progress = document.getElementById("archiveStaffProgress");
  const detail = document.getElementById("archiveStaffDetail");
  const more = document.getElementById("archiveStaffMore");
  const ui = (english, french) =>
    CMCENUtils.getCurrentLanguage() === "fr" ? french : english;
  const dateText = (value) =>
    new Date(value).toLocaleDateString(
      CMCENUtils.getCurrentLanguage() === "fr" ? "fr-CA" : "en-CA",
    );
  const typeLabels = {
    newsArticle: ui("News", "Nouvelles"),
    retirementMessage: ui("Retirement", "Retraite"),
    lastPost: ui("Last Post", "Dernier appel"),
    event: ui("Events", "Événements"),
    comment: ui("Comments", "Commentaires"),
    page: "Pages",
    archiveDocument: "Documents",
  };
  const checkLabels = {
    source: ui("The imported text includes the legacy content", "Le texte importé comprend le contenu d’origine"),
    translation: ui("The existing translations are accurate; missing translations are noted", "Les traductions présentes sont exactes; les traductions manquantes sont signalées"),
    categorization: ui("The category and placement are correct", "La catégorie et l’emplacement sont exacts"),
    media: ui("Images, files, links and layout were checked", "Les images, fichiers, liens et la mise en page ont été vérifiés"),
  };
  const categoryLabels = {
    news: ui("News", "Nouvelles"),
    newsletter: ui("Newsletter", "Bulletin"),
    "unit-updates": ui("Unit updates", "Nouvelles des unités"),
    "history-heritage": ui("History and heritage", "Histoire et patrimoine"),
    "museum-foundation": ui("Museum and foundation", "Musée et fondation"),
  };
  const fieldLabels = {
    title: ["Title", "Titre"], content: ["Body", "Texte"],
    newsletterBlocks: ["Newsletter blocks", "Blocs du bulletin"],
    messages: ["Message", "Message"], description: ["Description", "Description"],
    summary: ["Summary", "Résumé"], location: ["Location", "Lieu"],
    dateLabel: ["Date label", "Libellé de date"], languageLabel: ["Language label", "Libellé de langue"],
    "retiree.rank": ["Rank", "Grade"], "retiree.firstName": ["First name", "Prénom"],
    "retiree.lastName": ["Last name", "Nom"], "retiree.tradeRole": ["Trade or role", "Métier ou rôle"],
    "deceased.fullRank": ["Rank", "Grade"], "deceased.firstName": ["First name", "Prénom"],
    "deceased.surname": ["Surname", "Nom"],
    category: ["Category", "Catégorie"], city: ["City", "Ville"],
    organizingEntity: ["Organizing entity", "Organisme organisateur"], eventType: ["Event type", "Type d’événement"],
    startDate: ["Start date", "Date de début"], endDate: ["End date", "Date de fin"],
    imageUrl: ["Main image", "Image principale"], imageDisplayUrl: ["Display image", "Image affichée"],
    photoUrl: ["Main photo", "Photo principale"], photoDisplayUrl: ["Display photo", "Photo affichée"],
    imagePath: ["Main image", "Image principale"], body: ["Comment", "Commentaire"],
    "newsletter.headerCrest": ["Show cover in article header", "Afficher l’image de couverture dans l’en-tête"],
    blocks: ["Page blocks", "Blocs de page"], organization: ["Organization", "Organisation"],
    type: ["Document type", "Type de document"], fileKey: ["Document media key", "Clé du média"],
    pageUrl: ["Page URL", "Adresse de la page"],
  };
  const fieldLabel = (field) => {
    const path = field.path.replace(/\.(en|fr)$/u, "");
    const names = fieldLabels[path];
    return names ? ui(...names) : field.label;
  };
  const base = "/api/admin/archive-staff-review";
  let selected = null;
  let nextOffset = null;
  let pendingMediaSelections = [];
  const publicationChoices = new Map();

  function notice(value, error = false) {
    message.textContent = value;
    message.classList.toggle("is-error", error);
  }
  async function api(path, options = {}) {
    return CMCENUtils.apiJson(`${base}${path}`, {
      auth: true,
      cache: "no-store",
      ...options,
    });
  }
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function button(text, className, handler) {
    const element = node("button", text, className);
    element.type = "button";
    element.addEventListener("click", handler);
    return element;
  }
  function openMediaPicker(onSelect) {
    const overlay = node("div", undefined, "archive-staff-media-overlay");
    const dialog = node("section", undefined, "archive-staff-media-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", ui("Choose existing image", "Choisir une image existante"));
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = ui("Search media library", "Rechercher dans la médiathèque");
    const results = node("div", undefined, "archive-staff-media-results");
    const moreMedia = button(ui("Load more", "Afficher davantage"), "", () => void load(true));
    moreMedia.hidden = true;
    let cursor = null;
    const close = () => overlay.remove();
    async function load(append = false) {
      try {
        const query = new URLSearchParams({ search: search.value });
        if (append && cursor !== null) query.set("cursor", String(cursor));
        const response = await api(`/media?${query}`);
        if (!append) results.replaceChildren();
        for (const asset of response.media) {
          const choice = button(asset.name, "archive-staff-media-item", () => {
            onSelect(asset);
            close();
          });
          const preview = document.createElement("img");
          preview.src = asset.url;
          preview.alt = "";
          preview.loading = "lazy";
          choice.prepend(preview);
          choice.append(node("small", asset.key));
          results.append(choice);
        }
        if (!results.children.length)
          results.append(node("p", ui("No existing images found.", "Aucune image existante trouvée.")));
        cursor = response.nextCursor;
        moreMedia.hidden = cursor === null;
      } catch (error) {
        results.replaceChildren(node("p", error.message || ui("Could not load media.", "Impossible de charger les médias.")));
      }
    }
    const submit = button(ui("Search", "Rechercher"), "", () => void load());
    const cancel = button(ui("Cancel", "Annuler"), "", close);
    dialog.append(search, submit, cancel, results, moreMedia);
    overlay.append(dialog);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    document.body.append(overlay);
    search.focus();
    void load();
  }
  function setBusy(value) {
    app.setAttribute("aria-busy", String(value));
    app.inert = value;
  }
  function displayError(error) {
    if (error.status === 401) {
      CMCENUtils.clearAuthToken();
      window.location.replace("/login");
      return;
    }
    const fallback = error.status === 409
      ? ui("This draft changed. Reload it before continuing.", "Ce brouillon a changé. Rechargez-le avant de continuer.")
      : error.status === 400
        ? ui("Check the selected fields and date, then try again.", "Vérifiez les champs et la date, puis réessayez.")
        : ui("Could not load archive review.", "Révision non disponible.");
    notice(CMCENUtils.getCurrentLanguage() === "fr" && error.status
      ? fallback
      : error.message || fallback, true);
  }
  function sourceLink(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.hostname !== "cmcen-rcmce.ca")
        return null;
      const anchor = node("a", url);
      anchor.href = parsed.href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      return anchor;
    } catch {
      return null;
    }
  }

  function refreshProgress() {
    const entries = [...queue.querySelectorAll("button[data-id]")];
    const ready = entries.filter(
      (entry) => Number(entry.dataset.checks) === 4,
    ).length;
    progress.textContent =
      statusSelect.value === "draft"
        ? ui(`${ready} of ${entries.length} loaded drafts checked`, `${ready} brouillons vérifiés sur ${entries.length} chargés`)
        : ui(`${entries.length} records loaded`, `${entries.length} contenus chargés`);
  }

  function updateQueueEntry(record) {
    const entry = [...queue.querySelectorAll("button[data-id]")].find(
      (button) => button.dataset.id === record.id,
    );
    if (!entry) return;
    const completed = record.verification?.current
      ? Object.values(record.verification.checks || {}).filter(Boolean).length
      : 0;
    entry.dataset.checks = String(completed);
    entry.firstChild.textContent = record.title;
    entry.querySelector("small").textContent =
      `${record.layout === "newsletter" ? `${categoryLabels.newsletter} · ` : ""}${completed}/4 ${ui("checks", "vérifications")} · ${dateText(record.updatedAt)}`;
    refreshProgress();
  }

  async function loadQueue(append = false) {
    setBusy(true);
    try {
      const offset = append ? nextOffset : 0;
      const query = new URLSearchParams({
        status: statusSelect.value,
        offset: String(offset || 0),
      });
      const response = await api(
        `/${encodeURIComponent(typeSelect.value)}?${query}`,
      );
      if (!append) queue.replaceChildren();
      for (const item of response.items) {
        const entry = button(
          item.title,
          "",
          () => void loadDetail(item.type, item.id),
        );
        entry.dataset.id = item.id;
        entry.dataset.checks = String(item.checksCompleted || 0);
        entry.dataset.status = item.status;
        entry.append(
          node(
            "small",
            `${item.layout === "newsletter" ? `${categoryLabels.newsletter} · ` : ""}${item.status === "published" ? ui("Published", "Publié") : `${item.checksCompleted || 0}/4 ${ui("checks", "vérifications")}`} · ${dateText(item.updatedAt)}`,
          ),
        );
        queue.append(entry);
      }
      refreshProgress();
      if (!queue.children.length)
        queue.append(
          node(
            "p",
            ui("No imported records in this queue.", "Aucun contenu importé dans cette liste."),
          ),
        );
      nextOffset = response.nextOffset;
      more.hidden = nextOffset === null;
      if (!append) {
        selected = null;
        detail.replaceChildren(
          node(
            "p",
            ui("Select an imported record.", "Sélectionnez un contenu importé."),
          ),
        );
      }
      notice("");
    } catch (error) {
      displayError(error);
    } finally {
      setBusy(false);
    }
  }

  function createField(field, readonly) {
    const label = node("label", fieldLabel(field), "archive-staff-field");
    label.dataset.kind = field.kind;
    let control;
    if (field.options) {
      control = document.createElement("select");
      if (field.kind === "category") {
        const current = String(field.value || "");
        if (!field.options.some((option) => option.value === current)) {
          const existing = node(
            "option",
            current
              ? ui(`Current category: ${current}`, `Catégorie actuelle : ${current}`)
              : ui("Category not set", "Catégorie non définie"),
          );
          existing.value = current;
          control.append(existing);
        }
      }
      for (const option of field.options) {
        const child = node(
          "option",
          field.kind === "category"
            ? categoryLabels[option.value] || option.label
            : option.label,
        );
        child.value = option.value;
        control.append(child);
      }
      control.value = field.kind === "boolean" ? String(field.value === true) : String(field.value || "");
    } else if (["long", "blocks", "json"].includes(field.kind)) {
      control = document.createElement("textarea");
      control.value = ["blocks", "json"].includes(field.kind)
        ? JSON.stringify(field.value || [], null, 2)
        : String(field.value || "");
    } else {
      control = document.createElement("input");
      control.type = field.kind === "date" ? "datetime-local" : "text";
      control.value =
        field.kind === "date" && field.value
          ? new Date(field.value).toISOString().slice(0, 16)
          : String(field.value || "");
    }
    control.dataset.path = field.path;
    control.disabled = readonly;
    label.append(control);
    if (["imageDisplayUrl", "photoDisplayUrl"].includes(field.path)) {
      label.hidden = true;
      return label;
    }
    if (["imageUrl", "photoUrl", "imagePath"].includes(field.path)) {
      control.hidden = true;
      const image = document.createElement("img");
      image.className = "archive-staff-preview-image";
      image.alt = "";
      const displayPath = field.path === "photoUrl" ? "photoDisplayUrl" : "imageDisplayUrl";
      const displayField = selected?.fields.find((item) => item.path === displayPath);
      const showImage = (url) => {
        image.hidden = !url;
        if (url) image.src = url;
        else image.removeAttribute("src");
      };
      showImage(displayField?.value || control.value);
      label.append(image);
      const current = node("small", control.value
        ? ui("Current image selected", "Image actuelle sélectionnée")
        : ui("No image selected", "Aucune image sélectionnée"));
      label.append(current);
      if (readonly) return label;
      label.append(button(ui("Choose existing image", "Choisir une image existante"), "", () => {
        openMediaPicker((asset) => {
          control.value = asset.url;
          current.textContent = ui(`Selected: ${asset.name}. Save corrections to apply.`, `Sélection : ${asset.name}. Enregistrez les corrections pour appliquer.`);
          const display = label.closest(".archive-staff-fields")?.querySelector(`[data-path="${displayPath}"]`);
          if (display) display.value = asset.url;
          showImage(asset.url);
        });
      }));
      return label;
    }
    return label;
  }

  function createBlockField(field, readonly) {
    const wrapper = node("div", undefined, "archive-staff-block-field");
    const blocks = Array.isArray(field.value) ? field.value : [];
    const heading = node("h4", fieldLabel(field));
    wrapper.append(heading);
    const advanced = node("details", undefined, "archive-staff-advanced");
    advanced.append(
      node("summary", ui("Advanced block data", "Données avancées des blocs")),
    );
    const raw = document.createElement("textarea");
    raw.dataset.path = field.path;
    raw.setAttribute("aria-label", `${fieldLabel(field)} JSON`);
    raw.value = JSON.stringify(blocks, null, 2);
    raw.disabled = readonly;
    advanced.append(raw);
    if (field.kind === "blocks") {
      const list = node("div", undefined, "archive-staff-block-list");
      blocks.forEach((block, index) => {
        const item = node("div", undefined, "archive-staff-block-item");
        const plainParagraph =
          block.type === "paragraph" &&
          Array.isArray(block.children) &&
          block.children.every(
            (child) => typeof child === "string" || child?.type === "br",
          );
        if (block.type === "heading" || plainParagraph) {
          const label = node(
            "label",
            `${index + 1}. ${block.type === "heading" ? ui("Heading", "Titre") : ui("Paragraph", "Paragraphe")}`,
          );
          const input = document.createElement("textarea");
          input.value =
            block.type === "heading"
              ? block.text || ""
              : block.children
                  .map((child) => (typeof child === "string" ? child : "\n"))
                  .join("");
          input.disabled = readonly;
          input.addEventListener("input", () => {
            // Update only the edited text; preserve pair IDs and every other block.
            const current = JSON.parse(raw.value);
            if (block.type === "heading") current[index].text = input.value;
            else
              current[index].children = input.value
                .split(/(\n)/)
                .map((part) => (part === "\n" ? { type: "br" } : part));
            raw.value = JSON.stringify(current, null, 2);
          });
          label.append(input);
          item.append(label);
        } else if (block.type === "figure" && block.image) {
          item.append(node("p", ui(`Figure ${index + 1} — image and caption below`, `Figure ${index + 1} — image et légende ci-dessous`)));
        } else {
          item.append(
            node(
              "p",
              ui(`${index + 1}. ${block.type || "Block"} — review media, links, and formatting in the draft preview. Use advanced block data to edit this block.`, `${index + 1}. ${block.type || "Bloc"} — vérifiez les médias, liens et la mise en page dans l’aperçu.`),
            ),
          );
        }
        list.append(item);
      });
      if (!blocks.length) list.append(node("p", ui("No blocks", "Aucun bloc")));
      wrapper.append(list);
    } else {
      wrapper.append(
        node(
          "p",
          ui("Review page blocks in the draft preview. Open advanced block data only if a correction is needed.", "Vérifiez les blocs dans l’aperçu du brouillon. N’ouvrez les données avancées que si une correction est nécessaire."),
        ),
      );
    }
    advanced.addEventListener("toggle", () => {
      // A technical edit changes the block structure; avoid applying stale
      // visual controls to the wrong block after the advanced view opens.
      for (const input of wrapper.querySelectorAll(
        ".archive-staff-block-item textarea",
      ))
        input.disabled = readonly || advanced.open;
    });
    wrapper.append(advanced);
    return wrapper;
  }

  function renderFigureGallery(fields, definitions, readonly) {
    const gallery = node("section", undefined, "archive-staff-figure-gallery");
    gallery.append(node("h4", ui("Body images", "Images du contenu")));
    const read = (language) => {
      const raw = fields.querySelector(`[data-path="newsletterBlocks.${language}"]`);
      try { return { raw, blocks: JSON.parse(raw?.value || "[]") }; }
      catch { return { raw, blocks: [] }; }
    };
    function draw() {
      const en = read("en"), fr = read("fr");
      gallery.querySelectorAll(".archive-staff-figure-row").forEach((row) => row.remove());
      const paired = window.NewsletterFormat.pairBlocks(en.blocks, fr.blocks);
      for (const pair of paired) {
        const figures = ["en", "fr"].flatMap((language) => {
          const block = pair[language];
          if (block?.type !== "figure" || !block.image) return [];
          const source = language === "en" ? en : fr;
          const index = source.blocks.indexOf(block);
          const pending = pendingMediaSelections.find((entry) => entry.language === language && entry.index === index);
          return [{ language, index, block, source, url: pending?.url || block.image.url || "" }];
        });
        if (!figures.length) continue;
        const row = node("div", undefined, "archive-staff-figure-row");
        const shared = figures.length === 2 && figures[0].url === figures[1].url;
        const imagePreview = (figure) => {
          const image = document.createElement("img");
          image.className = "archive-staff-preview-image";
          image.alt = figure.block.image.alt || "";
          if (figure.url) image.src = figure.url;
          else image.hidden = true;
          return image;
        };
        if (shared) {
          row.append(imagePreview(figures[0]));
          if (!readonly) row.append(button(ui("Choose image for both languages", "Choisir l’image pour les deux langues"), "", () => {
            openMediaPicker((asset) => {
              for (const figure of figures) {
                pendingMediaSelections = pendingMediaSelections.filter((entry) => entry.language !== figure.language || entry.index !== figure.index);
                pendingMediaSelections.push({ language: figure.language, index: figure.index, key: asset.key, url: asset.url });
              }
              draw();
            });
          }));
        }
        const languages = node("div", undefined, "archive-staff-figure-languages");
        for (const figure of figures) {
          const panel = node("div", undefined, "archive-staff-figure-language");
          panel.lang = figure.language;
          panel.append(node("h5", figure.language === "en" ? "English" : "Français"));
          if (!shared) panel.append(imagePreview(figure));
          if (!readonly) panel.append(button(ui(`Choose ${figure.language.toUpperCase()} image`, `Choisir l’image ${figure.language.toUpperCase()}`), "", () => {
            openMediaPicker((asset) => {
              pendingMediaSelections = pendingMediaSelections.filter((entry) => entry.language !== figure.language || entry.index !== figure.index);
              pendingMediaSelections.push({ language: figure.language, index: figure.index, key: asset.key, url: asset.url });
              draw();
            });
          }));
          for (const [property, label] of [["alt", ui("Alt text", "Texte alternatif")], ["caption", ui("Caption", "Légende")]]) {
            const control = document.createElement("textarea");
            control.value = property === "alt" ? figure.block.image.alt || "" : figure.block.caption || "";
            control.disabled = readonly;
            control.addEventListener("input", () => {
              const current = JSON.parse(figure.source.raw.value);
              if (property === "alt") current[figure.index].image.alt = control.value;
              else current[figure.index].caption = control.value;
              figure.source.raw.value = JSON.stringify(current, null, 2);
            });
            const field = node("label", label, "archive-staff-field");
            field.append(control);
            panel.append(field);
          }
          languages.append(panel);
        }
        row.append(languages);
        gallery.append(row);
      }
    }
    fields.append(gallery);
    draw();
    if (!gallery.querySelector(".archive-staff-figure-row")) gallery.remove();
  }

  function renderFields(fields, definitions, readonly) {
    const localized = definitions.filter((field) =>
      /\.(en|fr)$/.test(field.path),
    );
    const shared = definitions.filter(
      (field) => !/\.(en|fr)$/.test(field.path),
    );
    if (localized.length) {
      const columns = node("div", undefined, "archive-staff-language-columns");
      for (const [language, heading] of [
        ["en", "English"],
        ["fr", "Français"],
      ]) {
        const column = node("div", undefined, "archive-staff-language-column");
        column.lang = language;
        column.append(node("h4", heading));
        for (const field of localized.filter((item) =>
          item.path.endsWith(`.${language}`),
        ))
          column.append(
            ["blocks", "json"].includes(field.kind)
              ? createBlockField(field, readonly)
              : createField(field, readonly),
          );
        columns.append(column);
      }
      fields.append(columns);
      if (definitions.some((field) => field.path.startsWith("newsletterBlocks.")))
        renderFigureGallery(fields, definitions, readonly);
    }
    if (shared.length) {
      const section = node("div", undefined, "archive-staff-shared-fields");
      section.append(
        node(
          "h4",
          ui("Placement and other details", "Classement et autres détails"),
        ),
      );
      for (const field of shared)
        section.append(
          ["blocks", "json"].includes(field.kind)
            ? createBlockField(field, readonly)
            : createField(field, readonly),
        );
      fields.append(section);
    }
  }

  function collectChanges(fields, form) {
    const changes = {};
    for (const field of fields) {
      const control = [...form.querySelectorAll("[data-path]")].find(
        (element) => element.dataset.path === field.path,
      );
      if (!control) continue;
      let value = control.value;
      if (field.kind === "boolean") value = value === "true";
      if (["blocks", "json"].includes(field.kind)) value = JSON.parse(value);
      if (field.kind === "date")
        value = value ? new Date(value).toISOString() : null;
      if (
        JSON.stringify(value) !==
        JSON.stringify(field.value ?? (field.kind === "date" ? null : ""))
      )
        changes[field.path] = value;
    }
    return changes;
  }

  function renderSimplePreview(record) {
    if (record.previewUrl) return null;
    const preview = node("section", undefined, "archive-staff-source");
    preview.append(
      node("h3", ui("Content and media preview", "Aperçu du contenu et des médias")),
    );
    const values = Object.fromEntries(
      record.fields.map((field) => [field.path, field.value]),
    );
    for (const language of ["en", "fr"]) {
      const title = values[`title.${language}`];
      const body =
        values[`messages.${language}`] || values[`description.${language}`];
      if (!title && !body) continue;
      preview.append(node("h4", language === "en" ? "English" : "Français"));
      if (title) preview.append(node("h5", String(title)));
      if (body) preview.append(node("p", String(body)));
    }
    if (record.type === "comment")
      preview.append(node("p", String(values.body || "")));
    for (const path of ["photoUrl", "imageUrl", "imagePath"]) {
      const url = values[path];
      if (!url) continue;
      try {
        const parsed = new URL(url, window.location.origin);
        if (
          parsed.protocol !== "https:" &&
          parsed.origin !== window.location.origin
        )
          continue;
        const image = document.createElement("img");
        image.src = parsed.href;
        image.alt = record.title;
        image.loading = "lazy";
        image.className = "archive-staff-preview-image";
        preview.append(image);
      } catch {}
    }
    if (record.type === "archiveDocument" && values.fileKey) {
      const link = node("a", ui("Open document", "Ouvrir le document"));
      link.href = `/${values.fileKey}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      preview.append(link);
    }
    return preview;
  }

  function render(record) {
    selected = record;
    pendingMediaSelections = [];
    const readonly = record.status !== "draft";
    detail.replaceChildren();
    detail.append(node("h2", record.title));
    detail.append(node("p", `${typeLabels[record.type]} · ${record.status === "published" ? ui("Published", "Publié") : ui("Draft", "Brouillon")}`));
    if (record.previewUrl && record.status === "draft") {
      const preview = node(
        "a",
        ui("Open draft preview", "Ouvrir l’aperçu du brouillon"),
      );
      preview.href = record.previewUrl;
      preview.target = "_blank";
      preview.rel = "noopener noreferrer";
      detail.append(preview);
    }

    const source = node("details", undefined, "archive-staff-source");
    source.append(
      node("summary", ui("Open original source", "Ouvrir la source originale")),
    );
    source.append(
      node(
        "p",
        ui(`Source IDs: ${record.source.sourceIds.join(", ") || "—"}`, `Identifiants source : ${record.source.sourceIds.join(", ") || "—"}`),
      ),
    );
    if (record.source.originalStatus)
      source.append(
        node(
          "p",
          ui(`Original status: ${record.source.originalStatus}`, `Statut d’origine : ${record.source.originalStatus}`),
        ),
      );
    const originalDate = record.publicationDate?.originalPublishedAt;
    source.append(node("p", originalDate
      ? ui(`Original publication date: ${dateText(originalDate)}`, `Date de publication d’origine : ${dateText(originalDate)}`)
      : ui("Original publication date unavailable in source evidence.", "Date de publication d’origine absente de la source.")));
    if (record.type === "comment" && record.source.originalStatus === "0")
      source.append(
        node(
          "p",
          ui("This comment was unapproved in WordPress. Record the publication decision in the review note.", "Ce commentaire n’était pas approuvé dans WordPress. Consignez la décision de publication dans la note."),
        ),
      );
    for (const url of record.source.urls) {
      const link = sourceLink(url);
      if (link) source.append(link, node("br"));
    }
    for (const snapshot of record.source.sourceRecords) {
      source.append(
        node(
          "h4",
          [snapshot.language, snapshot.title, snapshot.id]
            .filter(Boolean)
            .join(" · "),
        ),
      );
      const link = sourceLink(snapshot.url);
      if (link) source.append(link);
      if (snapshot.body) source.append(node("pre", snapshot.body));
    }
    if (!record.source.urls.length && !record.source.sourceRecords.length)
      source.append(
        node(
          "p",
          ui("Source text or link was not supplied with this import. Ask the import team to add it before verifying completeness.", "La source est absente; demandez à l’équipe d’importation de l’ajouter."),
        ),
      );
    const editor = node("section", undefined, "archive-staff-editor");
    editor.append(
      node("h3", ui("Review and correct content", "Réviser et corriger le contenu")),
    );
    const fields = node("div", undefined, "archive-staff-fields");
    const editableFields = record.fields.filter((field) => {
      if (record.type !== "newsArticle") return true;
      if (record.layout === "newsletter")
        return !field.path.startsWith("content.");
      return !field.path.startsWith("newsletterBlocks.");
    });
    renderFields(fields, editableFields, readonly);
    editor.append(fields);
    if (record.missingFrench?.length)
      editor.append(
        node(
          "p",
          ui(`French text is missing in: ${record.missingFrench.join(", ")}. Record why this is acceptable or what follow-up is needed.`, `Texte français manquant : ${record.missingFrench.join(", ")}. Consignez la raison ou le suivi nécessaire.`),
        ),
      );
    if (!readonly) {
      editor.append(
        button(
          ui("Save corrections", "Enregistrer les corrections"),
          "is-primary",
          async () => {
            try {
              const changes = collectChanges(editableFields, fields);
              if (!Object.keys(changes).length && !pendingMediaSelections.length)
                return notice(
                  ui("No changes to save.", "Aucune modification à enregistrer."),
                );
              setBusy(true);
              const response = await api(`/${record.type}/${record.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  expectedUpdatedAt: record.updatedAt,
                  changes,
                  mediaSelections: pendingMediaSelections,
                }),
              });
              render(response.record);
              updateQueueEntry(response.record);
              notice(
                ui("Corrections saved. Recheck the updated draft before publishing.", "Corrections enregistrées. Vérifiez de nouveau le brouillon."),
              );
            } catch (error) {
              displayError(
                error instanceof SyntaxError
                  ? new Error(
                      ui("Invalid JSON in blocks", "JSON invalide dans les blocs"),
                    )
                  : error,
              );
            } finally {
              setBusy(false);
            }
          },
        ),
      );
    }
    detail.append(editor);
    const simplePreview = renderSimplePreview(record);
    if (simplePreview) detail.append(simplePreview);
    detail.append(source);

    const review = node("section", undefined, "archive-staff-verification");
    review.append(node("h3", ui("Verification", "Vérification")));
    if (record.verification && !record.verification.current)
      review.append(
        node(
          "p",
          ui("The draft changed since these checks. Review it again.", "Le brouillon a changé depuis ces vérifications. Révisez-le."),
        ),
      );
    const checks = {};
    for (const [key, label] of Object.entries(checkLabels)) {
      const wrapper = node("label", undefined, "archive-staff-check");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = record.verification?.current
        ? record.verification.checks?.[key] === true
        : false;
      input.disabled = readonly;
      wrapper.append(input, node("span", label));
      review.append(wrapper);
      checks[key] = input;
    }
    const note = document.createElement("textarea");
    note.className = "archive-staff-note";
    note.setAttribute("aria-label", ui("Review note", "Note de révision"));
    note.placeholder =
      ui("Questions, missing translation, or follow-up", "Questions, traduction manquante ou suivi");
    note.value = record.verification?.note || "";
    note.disabled = readonly;
    review.append(note);
    if (!readonly) {
      const actions = node("div", undefined, "archive-staff-actions");
      actions.append(
        button(
          ui("Save checks", "Enregistrer les vérifications"),
          "is-primary",
          async () => {
            try {
              setBusy(true);
              const response = await api(
                `/${record.type}/${record.id}/verification`,
                {
                  method: "PUT",
                  body: JSON.stringify({
                    expectedUpdatedAt: record.updatedAt,
                    checks: Object.fromEntries(
                      Object.entries(checks).map(([key, input]) => [
                        key,
                        input.checked,
                      ]),
                    ),
                    note: note.value,
                  }),
                },
              );
              render(response.record);
              updateQueueEntry(response.record);
              notice(ui("Checks saved.", "Vérifications enregistrées."));
            } catch (error) {
              displayError(error);
            } finally {
              setBusy(false);
            }
          },
        ),
      );
      const ready =
        record.verification?.current &&
        Object.keys(checkLabels).every(
          (key) => record.verification.checks?.[key] === true,
        );
      const dateChoice = document.createElement("select");
      const originalValue = record.publicationDate.originalPublishedAt;
      const originalDate =
        typeof originalValue === "string" ? new Date(originalValue) : null;
      const hasOriginal =
        originalDate &&
        Number.isFinite(originalDate.getTime()) &&
        originalDate.getTime() <= Date.now();
      const recordKey = JSON.stringify([record.type, String(record.id)]);
      const savedChoice = publicationChoices.get(recordKey);
      dateChoice.setAttribute(
        "aria-label",
        ui("Publication date", "Date de publication"),
      );
      const datePrompt = node(
        "option",
        ui("Choose publication date", "Choisir la date de publication"),
      );
      datePrompt.value = "";
      dateChoice.append(datePrompt);
      for (const [value, label] of [
        ...(hasOriginal
          ? [
              [
                "original",
                ui(`Use original publication date (${dateText(record.publicationDate.originalPublishedAt)})`, `Utiliser la date d’origine (${dateText(record.publicationDate.originalPublishedAt)})`),
              ],
            ]
          : []),
        ["now", ui("Use today’s date", "Utiliser la date du jour")],
        ["custom", ui("Use a custom date", "Utiliser une date personnalisée")],
      ]) {
        const option = node("option", label);
        option.value = value;
        dateChoice.append(option);
      }
      dateChoice.value = [
        "now", "custom", ...(hasOriginal ? ["original"] : []),
      ].includes(savedChoice?.value)
        ? savedChoice.value
        : hasOriginal
          ? "original"
          : "now";
      actions.append(dateChoice);
      const customDate = document.createElement("input");
      customDate.type = "datetime-local";
      customDate.setAttribute("aria-label", ui("Custom publication date", "Date de publication personnalisée"));
      customDate.value = savedChoice?.customDate || "";
      customDate.hidden = dateChoice.value !== "custom";
      function rememberPublicationChoice() {
        publicationChoices.set(recordKey, {
          value: dateChoice.value,
          customDate: customDate.value,
        });
      }
      dateChoice.addEventListener("change", () => {
        customDate.hidden = dateChoice.value !== "custom";
        rememberPublicationChoice();
      });
      customDate.addEventListener("input", rememberPublicationChoice);
      actions.append(customDate);
      const publish = button(ui("Publish", "Publier"), "is-publish", async () => {
        if (!dateChoice.value || (dateChoice.value === "custom" && !customDate.value)) {
          return notice(
            ui("Choose the publication date first.", "Choisissez d’abord la date de publication."),
            true,
          );
        }
        const chosenDate = dateChoice.value === "custom"
          ? new Date(customDate.value)
          : null;
        if (chosenDate && (!Number.isFinite(chosenDate.getTime()) || chosenDate > new Date()))
          return notice(ui("Choose a valid date no later than today.", "Choisissez une date valide au plus tard aujourd’hui."), true);
        const customPublishedAt = chosenDate?.toISOString();
        if (
          !window.confirm(
            ui("Publish this verified imported record with the selected date?", "Publier ce contenu importé et vérifié avec la date choisie ?"),
          )
        )
          return;
        try {
          setBusy(true);
          const response = await api(`/${record.type}/${record.id}/publish`, {
            method: "POST",
            body: JSON.stringify({
              expectedUpdatedAt: record.updatedAt,
              publicationDateChoice: dateChoice.value,
              ...(customPublishedAt ? { customPublishedAt } : {}),
            }),
          });
          await loadQueue();
          render(response.record);
          notice(ui("Published.", "Publié."));
        } catch (error) {
          displayError(error);
        } finally {
          setBusy(false);
        }
      });
      publish.disabled = !ready;
      actions.prepend(node("p", originalDate
        ? ui(`Original publication date: ${dateText(originalDate)}`, `Date de publication d’origine : ${dateText(originalDate)}`)
        : ui("Original publication date unavailable; choose today or a custom date.", "Date d’origine indisponible; choisissez aujourd’hui ou une date personnalisée.")));
      actions.append(publish);
      review.append(actions);
    }
    detail.append(review);
  }

  async function loadDetail(type, id) {
    setBusy(true);
    try {
      const response = await api(`/${type}/${id}`);
      render(response.record);
      queue.querySelectorAll("button[data-id]").forEach((entry) => {
        if (entry.dataset.id === id) entry.setAttribute("aria-current", "true");
        else entry.removeAttribute("aria-current");
      });
      notice("");
    } catch (error) {
      displayError(error);
    } finally {
      setBusy(false);
    }
  }

  async function init() {
    try {
      if (!CMCENUtils.getStoredAuthToken())
        return window.location.replace("/login");
      const user = await CMCENUtils.apiJson("/api/me", {
        auth: true,
        cache: "no-store",
      });
      if (user?.permissions?.canVerifyArchive !== true && user?.permissions?.canManagePages !== true)
        return notice(
          ui("This account cannot verify imported archives.", "Ce compte ne peut pas vérifier les archives importées."),
          true,
        );
      const params = new URLSearchParams(window.location.search);
      const ordinaryType = params.get("type");
      if (
        ((!ordinaryType || ordinaryType === "newsArticle") && user.permissions?.canManageNews) ||
        (["event", "retirementMessage", "lastPost", "comment"].includes(ordinaryType) && user.permissions?.canReviewAndPublish)
      ) {
        const destination = new URL("/dashboard-next", window.location.origin);
        destination.searchParams.set("area", !ordinaryType || ordinaryType === "newsArticle" ? "articles" : "content");
        destination.searchParams.set("origin", "imported");
        if (ordinaryType && ordinaryType !== "newsArticle") destination.searchParams.set("type", ordinaryType);
        if (params.get("id")) destination.searchParams.set("id", params.get("id"));
        window.location.replace(destination.pathname + destination.search);
        return;
      }
      const response = await api("/types");
      for (const type of response.types) {
        const option = node("option", typeLabels[type] || type);
        option.value = type;
        typeSelect.append(option);
      }
      app.hidden = false;
      if (response.types.includes(params.get("type")))
        typeSelect.value = params.get("type");
      await loadQueue();
      if (params.get("id") && /^[a-f0-9]{24}$/iu.test(params.get("id")))
        await loadDetail(typeSelect.value, params.get("id"));
    } catch (error) {
      displayError(error);
    }
  }
  typeSelect.addEventListener("change", () => void loadQueue());
  statusSelect.addEventListener("change", () => void loadQueue());
  more.addEventListener("click", () => void loadQueue(true));
  void init();
})();
