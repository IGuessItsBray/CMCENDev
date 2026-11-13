"use strict";

(() => {
  function mountLeadership({
    api,
    permissions,
    root = document.getElementById("adminLeadership"),
  }) {
    const lifecycle = new AbortController();
    const signal = lifecycle.signal;
    const host = root.querySelector("[data-organization-editor]");
    let resources = [],
      selected = "",
      content = null,
      version = null;
    let portraitUrls = {};
    let dirty = false,
      busy = false,
      disposed = false,
      serial = 0;
    const french = () => document.documentElement.lang === "fr";
    const t = (en, fr) => (french() ? fr : en);
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const status = el("p", "organization-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const toolbar = el("div", "organization-toolbar");
    const pickerLabel = el(
      "label",
      "organization-field",
      t("Leadership page", "Page de direction"),
    );
    const picker = el("select");
    pickerLabel.append(picker);
    const save = el(
      "button",
      "organization-save",
      t("Save changes", "Enregistrer"),
    );
    save.type = "button";
    const reload = el("button", "", t("Reload", "Recharger"));
    reload.type = "button";
    const preview = el("a", "", t("View public page", "Voir la page publique"));
    preview.target = "_blank";
    preview.rel = "noopener";
    toolbar.append(pickerLabel, preview, reload, save);
    const form = el("div", "organization-form");
    host.replaceChildren(toolbar, status, form);

    function feedback(message, error = false) {
      status.textContent = message;
      status.classList.toggle("is-error", error);
    }
    function sync() {
      picker.disabled = busy;
      reload.disabled = busy || !content;
      save.disabled = busy || !dirty || !content;
      form.inert = busy;
      form.setAttribute("aria-busy", String(busy));
    }
    function markDirty() {
      dirty = true;
      sync();
      feedback(
        t(
          "Unsaved changes. Saving updates the public page.",
          "Modifications non enregistrées. L’enregistrement met à jour la page publique.",
        ),
      );
    }
    function title(key) {
      return (
        {
          pageTitle: t("Browser title", "Titre du navigateur"),
          kicker: t("Eyebrow", "Surtitre"),
          heroSubtitle: t("Introduction", "Introduction"),
          imageKey: t("Choose portrait", "Choisir un portrait"),
          imageAlt: t("Portrait description", "Description du portrait"),
          bio: t("Biography", "Biographie"),
          rank: t("Rank", "Grade"),
          name: t("Name and post-nominals", "Nom et titres honorifiques"),
          role: t("Appointment", "Poste"),
          profileUrl: t("Profile link", "Lien du profil"),
        }[key] ||
        key
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/^./, (c) => c.toUpperCase())
      );
    }
    function mediaPicker(object, language) {
      const panel = el("details", "organization-media-picker");
      panel.append(
        el(
          "summary",
          "",
          t("Choose from media library", "Choisir dans la médiathèque"),
        ),
      );
      const search = el("input");
      search.type = "search";
      search.setAttribute(
        "aria-label",
        `${t("Search portraits by name", "Rechercher des portraits par nom")} · ${language.toUpperCase()}`,
      );
      search.placeholder = t("Search by name…", "Rechercher par nom…");
      const submit = el("button", "", t("Search", "Rechercher"));
      submit.type = "button";
      const message = el("p");
      message.setAttribute("role", "status");
      const results = el("div", "organization-media-results");
      const more = el("button", "", t("Load more", "Afficher plus"));
      more.type = "button";
      more.hidden = true;
      panel.append(search, submit, message, results, more);
      let cursor = "",
        sequence = 0,
        loaded = false;
      async function load(append = false) {
        const current = ++sequence;
        submit.disabled = true;
        more.disabled = true;
        message.textContent = t("Loading images…", "Chargement des images…");
        try {
          const params = new URLSearchParams({
            q: search.value.trim(),
            limit: "24",
          });
          if (append && cursor) params.set("cursor", cursor);
          const data = await api(`/api/organization-content/media?${params}`, {
            signal,
          });
          if (disposed || current !== sequence) return;
          if (!append) results.replaceChildren();
          for (const item of data.media || []) {
            const button = el("button", "organization-media-item");
            button.type = "button";
            const image = el("img");
            image.src = item.variants?.thumb?.url || item.url;
            image.alt = "";
            image.loading = "lazy";
            button.append(
              image,
              el(
                "span",
                "",
                item.name || t("Uploaded image", "Image téléversée"),
              ),
            );
            button.addEventListener(
              "click",
              () => {
                object.imageKey = item.key;
                portraitUrls[item.key] = item.url;

                markDirty();
                render();
              },
              { signal },
            );
            results.append(button);
          }
          cursor = data.nextCursor || "";
          more.hidden = !cursor;
          loaded = true;
          message.textContent = results.children.length
            ? t(
                "Select an image to use it. Save changes to publish.",
                "Sélectionnez une image, puis enregistrez pour publier.",
              )
            : t("No images found.", "Aucune image trouvée.");
        } catch (error) {
          if (!disposed) message.textContent = error.message;
        } finally {
          if (!disposed && current === sequence) {
            submit.disabled = false;
            more.disabled = false;
          }
        }
      }
      panel.addEventListener(
        "toggle",
        () => {
          if (panel.open && !loaded) load();
        },
        { signal },
      );
      submit.addEventListener("click", () => load(), { signal });
      search.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            load();
          }
        },
        { signal },
      );
      more.addEventListener("click", () => load(true), { signal });
      return panel;
    }
    function field(parent, object, key, language, label = title(key)) {
      if (typeof object[key] !== "string" && typeof object[key] !== "boolean")
        return;
      const wrapper = el(
        key === "imageKey" ? "div" : "label",
        "organization-field",
      );
      wrapper.append(el("span", "", `${label} · ${language.toUpperCase()}`));
      const bool = typeof object[key] === "boolean";
      const multiline =
        key === "bio" ||
        /Body|Intro|Subtitle|description|testimonial|givingOptions/.test(key) ||
        object[key].length > 160;
      const input = el(bool || !multiline ? "input" : "textarea");
      input.lang = language;
      if (bool) {
        input.type = "checkbox";
        input.checked = object[key];
      } else {
        input.value = object[key];
        if (key === "name") input.maxLength = 200;
        if (multiline) input.rows = key === "bio" ? 10 : 4;
      }
      input.addEventListener(
        "input",
        () => {
          object[key] = bool ? input.checked : input.value;
          markDirty();
        },
        { signal },
      );
      if (key !== "imageKey") wrapper.append(input);
      parent.append(wrapper);
      if (key === "imageKey") {
        wrapper.append(mediaPicker(object, language));
        if (permissions.canUploadMedia) {
          const nameLabel = el(
            "label",
            "organization-field",
            t("Name for new portrait", "Nom du nouveau portrait"),
          );
          const uploadName = el("input");
          uploadName.type = "text";
          uploadName.maxLength = 160;
          uploadName.value = object.name || "";
          nameLabel.append(uploadName);
          wrapper.append(nameLabel);
          wrapper.append(
            el(
              "small",
              "",
              t(
                "Upload only portraits approved for public sharing. Files are public by link immediately; saving updates this page.",
                "Téléversez uniquement des portraits approuvés pour diffusion publique. Les fichiers sont accessibles par lien immédiatement; l’enregistrement met à jour cette page.",
              ),
            ),
          );
          const upload = el("input");
          upload.type = "file";
          upload.accept = "image/jpeg,image/png,image/webp";
          upload.setAttribute(
            "aria-label",
            t("Upload replacement portrait", "Téléverser un nouveau portrait"),
          );
          upload.addEventListener(
            "change",
            async () => {
              const file = upload.files?.[0];
              if (!file || busy) return;
              busy = true;
              sync();
              feedback(t("Uploading portrait…", "Téléversement du portrait…"));
              try {
                const body = new FormData();
                body.append("image", file);
                body.append("sourceName", uploadName.value.trim() || file.name);
                body.append("uploadContext", "leadership");
                body.append("sourceField", "portrait");
                const result = await api("/api/upload", {
                  method: "POST",
                  body,
                  timeoutMs: 120000,
                });
                if (disposed) return;
                if (!result.key)
                  throw new Error(
                    t(
                      "Upload did not return an image key.",
                      "Le téléversement n’a pas retourné de clé d’image.",
                    ),
                  );
                object[key] = result.key;
                if (result.url) portraitUrls[result.key] = result.url;
                input.value = result.key;
                dirty = true;

                render();
                feedback(
                  t(
                    "Portrait uploaded. Save changes to use it on the public page.",
                    "Portrait téléversé. Enregistrez pour l’utiliser sur la page publique.",
                  ),
                );
              } catch (error) {
                feedback(error.message, true);
              } finally {
                busy = false;
                upload.value = "";
                if (!disposed) sync();
              }
            },
            { signal },
          );
          wrapper.append(upload);
        }
      }
    }
    function pair(parent, objects, key) {
      const row = el("div", "organization-language-pair");
      for (const language of ["en", "fr"])
        if (objects[language]) field(row, objects[language], key, language);
      parent.append(row);
    }
    function disclosure(parent, heading, open = false) {
      const node = el("details", "organization-section");
      node.open = open;
      node.append(el("summary", "", heading));
      const body = el("div", "organization-section-body");
      node.append(body);
      parent.append(node);
      return body;
    }
    function render() {
      form.replaceChildren();
      const resource = resources.find((item) => item.key === selected);
      const page = {
        leadership: "leadership",
      }[selected];
      preview.href = `/${page}`;
      form.append(
        el(
          "p",
          "organization-help",
          t(
            "Update names and portraits only. Appointments and page text are fixed; review both languages before saving.",
            "Modifiez uniquement les noms et les portraits. Les postes et le texte de la page sont fixes; vérifiez les deux langues avant d’enregistrer.",
          ),
        ),
      );
      if (resource.kind === "leadership")
        content.en.sections.forEach((section, index) => {
          const localized = { en: section, fr: content.fr.sections[index] };
          const sectionBody = disclosure(
            form,
            `${index + 1}. ${localized[french() ? "fr" : "en"].heading}`,
            true,
          );
          section.cards.forEach((card, cardIndex) => {
            const cards = { en: card, fr: localized.fr.cards[cardIndex] };
            const body = disclosure(sectionBody, `${card.role} — ${card.name}`);
            const portraits = el("div", "organization-language-pair");
            for (const language of ["en", "fr"]) {
              const portraitCard = cards[language];
              const url =
                portraitUrls[portraitCard.imageKey] || portraitCard.image;
              const figure = el("figure", "organization-portrait");
              if (url && /^(https?:\/\/|\/(?!\/))/.test(url)) {
                const image = el("img");
                image.src = url;
                image.alt = portraitCard.imageAlt || portraitCard.name;
                image.loading = "lazy";
                figure.append(image);
              }
              figure.append(
                el(
                  "figcaption",
                  "",
                  `${t("Current portrait", "Portrait actuel")} · ${language.toUpperCase()}`,
                ),
              );
              portraits.append(figure);
            }
            body.append(portraits);
            for (const key of ["name", "imageKey"]) pair(body, cards, key);
          });
        });
    }
    async function load(key) {
      const requestId = ++serial;
      busy = true;
      sync();
      feedback(t("Loading…", "Chargement…"));
      try {
        const data = await api(
          `/api/organization-content/manage/${encodeURIComponent(key)}`,
        );
        if (disposed || requestId !== serial) return;
        selected = key;
        picker.value = key;
        content = data.content;
        version = data.version;
        portraitUrls = data.portraitUrls || {};
        dirty = false;
        render();
        feedback(
          t(
            "Ready to edit. Changes are recorded in the audit log.",
            "Prêt à modifier. Les changements sont consignés au journal d’audit.",
          ),
        );
      } catch (error) {
        if (!disposed) {
          picker.value = selected;
          feedback(error.message, true);
        }
      } finally {
        if (!disposed && requestId === serial) {
          busy = false;
          sync();
        }
      }
    }
    const discard = () =>
      !dirty ||
      window.confirm(
        t(
          "Discard your unsaved changes?",
          "Abandonner les modifications non enregistrées?",
        ),
      );
    picker.addEventListener(
      "change",
      () => {
        if (discard()) load(picker.value);
        else picker.value = selected;
      },
      { signal },
    );
    reload.addEventListener(
      "click",
      () => {
        if (discard()) load(selected);
      },
      { signal },
    );
    save.addEventListener(
      "click",
      async () => {
        if (busy || !dirty) return;
        busy = true;
        sync();
        feedback(t("Saving…", "Enregistrement…"));
        try {
          const result = await api(
            `/api/organization-content/manage/${encodeURIComponent(selected)}`,
            { method: "PUT", body: { content, version } },
          );
          if (disposed) return;
          content = result.content;
          version = result.version;
          if (result.portraitUrls) portraitUrls = result.portraitUrls;
          dirty = false;
          render();
          feedback(
            t(
              "Saved. The public page has been updated.",
              "Enregistré. La page publique a été mise à jour.",
            ),
          );
        } catch (error) {
          if (!disposed) feedback(error.message, true);
        } finally {
          busy = false;
          if (!disposed) sync();
        }
      },
      { signal },
    );
    (async () => {
      busy = true;
      sync();
      try {
        const result = await api("/api/organization-content/manage");
        if (disposed) return;
        resources = result.resources.filter(
          (resource) => resource.kind === "leadership",
        );
        for (const item of resources) {
          const option = el(
            "option",
            "",
            typeof item.label === "object"
              ? item.label[french() ? "fr" : "en"]
              : item.label,
          );
          option.value = item.key;
          picker.append(option);
        }
        if (resources.length) await load(resources[0].key);
        else
          feedback(
            t(
              "Ask an administrator for Branch leadership editing permission.",
              "Demandez à un administrateur l’autorisation de modifier la direction de la Branche.",
            ),
          );
      } catch (error) {
        if (!disposed) feedback(error.message, true);
      } finally {
        busy = false;
        if (!disposed) sync();
      }
    })();
    return {
      hasUnsavedChanges: () => dirty || busy,
      canNavigate: () => !busy && discard(),
      dispose: () => {
        disposed = true;
        lifecycle.abort();
      },
    };
  }
  window.OrganizationContentEditor = {
    mountLeadership,
  };
})();
