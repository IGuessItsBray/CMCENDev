(() => {
  "use strict";
  const app = document.getElementById("archiveStaffApp");
  const message = document.getElementById("archiveStaffMessage");
  const typeSelect = document.getElementById("archiveStaffType");
  const statusSelect = document.getElementById("archiveStaffStatus");
  const queue = document.getElementById("archiveStaffQueue");
  const detail = document.getElementById("archiveStaffDetail");
  const more = document.getElementById("archiveStaffMore");
  const typeLabels = {
    newsArticle: "News / Nouvelles",
    retirementMessage: "Retirement / Retraite",
    lastPost: "Last Post / Dernier appel",
    event: "Events / Événements",
    comment: "Comments / Commentaires",
    page: "Pages",
    archiveDocument: "Documents",
  };
  const checkLabels = {
    source:
      "The imported text includes the legacy content / Le texte importé comprend le contenu d’origine",
    translation:
      "The existing translations are accurate; missing translations are noted / Les traductions présentes sont exactes; les traductions manquantes sont signalées",
    categorization:
      "The category and placement are correct / La catégorie et l’emplacement sont exacts",
    media:
      "Images, files, links and layout were checked / Les images, fichiers, liens et la mise en page ont été vérifiés",
  };
  const base = "/api/admin/archive-staff-review";
  let selected = null;
  let nextOffset = null;

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
    notice(
      error.message ||
        "Could not load archive review / Révision non disponible",
      true,
    );
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
        entry.append(
          node(
            "small",
            `${item.status} · ${new Date(item.updatedAt).toLocaleDateString()}`,
          ),
        );
        queue.append(entry);
      }
      if (!queue.children.length)
        queue.append(
          node(
            "p",
            "No imported records in this queue. / Aucun contenu importé dans cette liste.",
          ),
        );
      nextOffset = response.nextOffset;
      more.hidden = nextOffset === null;
      if (!append) {
        selected = null;
        detail.replaceChildren(
          node(
            "p",
            "Select an imported record. / Sélectionnez un contenu importé.",
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
    const label = node("label", field.label, "archive-staff-field");
    label.dataset.kind = field.kind;
    let control;
    if (field.options) {
      control = document.createElement("select");
      for (const option of field.options) {
        const child = node("option", option.label);
        child.value = option.value;
        control.append(child);
      }
      control.value = String(field.value || "");
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
    return label;
  }

  function collectChanges(fields, form) {
    const changes = {};
    for (const field of fields) {
      const control = [...form.querySelectorAll("[data-path]")].find(
        (element) => element.dataset.path === field.path,
      );
      if (!control) continue;
      let value = control.value;
      if (["blocks", "json"].includes(field.kind)) value = JSON.parse(value);
      if (field.kind === "date")
        value = value ? new Date(value).toISOString() : null;
      if (
        JSON.stringify(value) !==
        JSON.stringify(field.value || (field.kind === "date" ? null : ""))
      )
        changes[field.path] = value;
    }
    return changes;
  }

  function renderSimplePreview(record) {
    if (record.previewUrl) return null;
    const preview = node("section", undefined, "archive-staff-source");
    preview.append(
      node("h3", "Content and media preview / Aperçu du contenu et des médias"),
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
      const link = node("a", "Open document / Ouvrir le document");
      link.href = `/${values.fileKey}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      preview.append(link);
    }
    return preview;
  }

  function render(record) {
    selected = record;
    const readonly = record.status !== "draft";
    detail.replaceChildren();
    detail.append(node("h2", record.title));
    detail.append(node("p", `${typeLabels[record.type]} · ${record.status}`));
    if (record.previewUrl && record.status === "draft") {
      const preview = node(
        "a",
        "Open draft preview / Ouvrir l’aperçu du brouillon",
      );
      preview.href = record.previewUrl;
      preview.target = "_blank";
      preview.rel = "noopener noreferrer";
      detail.append(preview);
    }

    const source = node("section", undefined, "archive-staff-source");
    source.append(node("h3", "Original source / Source originale"));
    source.append(
      node(
        "p",
        `Source IDs / Identifiants : ${record.source.sourceIds.join(", ") || "—"}`,
      ),
    );
    if (record.source.originalStatus)
      source.append(
        node(
          "p",
          `Original status / Statut d’origine : ${record.source.originalStatus}`,
        ),
      );
    if (record.type === "comment" && record.source.originalStatus === "0")
      source.append(
        node(
          "p",
          "This comment was unapproved in WordPress. Record the publication decision in the review note. / Ce commentaire n’était pas approuvé dans WordPress. Consignez la décision de publication dans la note.",
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
          "Source text or link was not supplied with this import. Ask the import team to add it before verifying completeness. / La source est absente; demandez à l’équipe d’importation de l’ajouter.",
        ),
      );
    detail.append(source);

    const editor = node("section", undefined, "archive-staff-editor");
    editor.append(node("h3", "Imported draft / Brouillon importé"));
    const fields = node("div", undefined, "archive-staff-fields");
    record.fields.forEach((field) =>
      fields.append(createField(field, readonly)),
    );
    editor.append(fields);
    if (record.missingFrench?.length)
      editor.append(
        node(
          "p",
          `French text is missing in: ${record.missingFrench.join(", ")}. Record why this is acceptable or what follow-up is needed. / Texte français manquant : ${record.missingFrench.join(", ")}. Consignez la raison ou le suivi nécessaire.`,
        ),
      );
    if (!readonly) {
      editor.append(
        button(
          "Save corrections / Enregistrer les corrections",
          "is-primary",
          async () => {
            try {
              const changes = collectChanges(record.fields, fields);
              if (!Object.keys(changes).length)
                return notice(
                  "No changes to save. / Aucune modification à enregistrer.",
                );
              setBusy(true);
              const response = await api(`/${record.type}/${record.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  expectedUpdatedAt: record.updatedAt,
                  changes,
                }),
              });
              render(response.record);
              notice(
                "Corrections saved. Recheck the updated draft before publishing. / Corrections enregistrées. Vérifiez de nouveau le brouillon.",
              );
            } catch (error) {
              displayError(
                error instanceof SyntaxError
                  ? new Error(
                      "Invalid JSON in blocks / JSON invalide dans les blocs",
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

    const review = node("section", undefined, "archive-staff-verification");
    review.append(node("h3", "Verification / Vérification"));
    if (record.verification && !record.verification.current)
      review.append(
        node(
          "p",
          "The draft changed since these checks. Review it again. / Le brouillon a changé depuis ces vérifications. Révisez-le.",
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
    note.setAttribute("aria-label", "Review note / Note de révision");
    note.placeholder =
      "Questions, missing translation, or follow-up / Questions, traduction manquante ou suivi";
    note.value = record.verification?.note || "";
    note.disabled = readonly;
    review.append(note);
    if (!readonly) {
      const actions = node("div", undefined, "archive-staff-actions");
      actions.append(
        button(
          "Save checks / Enregistrer les vérifications",
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
              notice("Checks saved. / Vérifications enregistrées.");
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
      dateChoice.setAttribute(
        "aria-label",
        "Publication date / Date de publication",
      );
      for (const [value, label] of [
        ["now", "Publish with today’s date / Publier avec la date du jour"],
        ...(record.publicationDate.originalPublishedAt
          ? [
              [
                "original",
                "Use original publication date / Utiliser la date d’origine",
              ],
            ]
          : []),
      ]) {
        const option = node("option", label);
        option.value = value;
        dateChoice.append(option);
      }
      if (!["page", "archiveDocument"].includes(record.type))
        actions.append(dateChoice);
      const publish = button("Publish / Publier", "is-publish", async () => {
        if (
          !window.confirm(
            "Publish this verified imported record now? / Publier ce contenu importé et vérifié maintenant ?",
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
            }),
          });
          await loadQueue();
          render(response.record);
          notice("Published. / Publié.");
        } catch (error) {
          displayError(error);
        } finally {
          setBusy(false);
        }
      });
      publish.disabled = !ready;
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
      if (user?.permissions?.canVerifyArchive !== true)
        return notice(
          "This account cannot verify imported archives. / Ce compte ne peut pas vérifier les archives importées.",
          true,
        );
      const response = await api("/types");
      for (const type of response.types) {
        const option = node("option", typeLabels[type] || type);
        option.value = type;
        typeSelect.append(option);
      }
      app.hidden = false;
      const params = new URLSearchParams(window.location.search);
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
