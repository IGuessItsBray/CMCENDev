"use strict";
(() => {
  const copy = {
    en: {
      title: "Adopt a Display",
      public: "View public catalogue",
      reload: "Reload",
      new: "New display",
      details: "Display details",
      save: "Save display",
      delete: "Delete display",
      published: "Published",
      draft: "Draft",
      note: "Drafts are private. Publish only reviewed details; availability and expiry are descriptive fields.",
      titleField: "Title",
      description: "Description",
      displayNumber: "Display number",
      imageUrl: "Image URL",
      imageFile: "Upload image",
      adoptionAmount: "Adoption amount",
      availability: "Availability",
      recognition: "Recognition",
      expiry: "Expiry",
      empty: "No displays yet.",
      loading: "Loading…",
      failed: "Could not load displays. Try again.",
      saved: "Display saved.",
      deleted: "Display deleted.",
      error: "Could not save changes. Try again.",
      required: "Enter a title in at least one language.",
      discard: "Discard unsaved display changes?",
      remove: "Permanently delete this display?",
      upload:
        "Image upload failed. Check your upload permission and try again.",
    },
    fr: {
      title: "Adopter une exposition",
      public: "Consulter le catalogue public",
      reload: "Recharger",
      new: "Nouvelle exposition",
      details: "Détails de l’exposition",
      save: "Enregistrer",
      delete: "Supprimer",
      published: "Publiée",
      draft: "Brouillon",
      note: "Les brouillons sont privés. Publiez uniquement les détails vérifiés; la disponibilité et l’expiration sont des renseignements descriptifs.",
      titleField: "Titre",
      description: "Description",
      displayNumber: "Numéro d’exposition",
      imageUrl: "URL de l’image",
      imageFile: "Téléverser une image",
      adoptionAmount: "Montant d’adoption",
      availability: "Disponibilité",
      recognition: "Reconnaissance",
      expiry: "Expiration",
      empty: "Aucune exposition pour le moment.",
      loading: "Chargement…",
      failed: "Impossible de charger les expositions. Réessayez.",
      saved: "Exposition enregistrée.",
      deleted: "Exposition supprimée.",
      error: "Impossible d’enregistrer les modifications. Réessayez.",
      required: "Saisissez un titre dans au moins une langue.",
      discard: "Abandonner les modifications non enregistrées?",
      remove: "Supprimer définitivement cette exposition?",
      upload:
        "Échec du téléversement. Vérifiez votre autorisation et réessayez.",
    },
  };
  const bilingual = [
    "title",
    "description",
    "adoptionAmount",
    "availability",
    "recognition",
    "expiry",
  ];
  function mount({ api, permissions, onDenied }) {
    const el = (id) => document.getElementById(id);
    const root = el("adminAdopt"),
      form = el("adoptAdminForm"),
      list = el("adoptAdminList");
    const fields = el("adoptAdminFields"),
      events = new AbortController();
    let items = [],
      selected = null,
      busy = false,
      disposed = false,
      baseline = "",
      messageKey = "",
      confirming = false;
    const lang = () => (document.documentElement.lang === "fr" ? "fr" : "en");
    const t = (key) => copy[lang()][key];
    const field = (name) => form.elements.namedItem(name);
    const listen = (node, event, fn) =>
      node.addEventListener(event, fn, { signal: events.signal });
    const labels = [];
    function input(name, key, locale, multiline = false) {
      const label = document.createElement("label"),
        span = document.createElement("span");
      const control = document.createElement(multiline ? "textarea" : "input");
      label.className = "cmcen-field";
      span.className = "cmcen-field-label";
      control.className = "cmcen-control";
      control.name = name;
      if (name === "imageFile") {
        control.type = "file";
        control.accept = "image/*";
        control.disabled = !permissions.canUploadMedia;
      } else if (name === "imageUrl") control.type = "url";
      else if (!multiline) control.type = "text";
      if (locale) control.lang = locale;
      control.maxLength =
        name === "displayNumber"
          ? 80
          : name === "imageUrl" || key === "recognition"
            ? 2000
            : key === "description"
              ? 8000
              : 240;
      labels.push({ span, key, locale });
      label.append(span, control);
      el("adoptAdminInputs").append(label);
    }
    input("displayNumber", "displayNumber");
    for (const key of bilingual)
      for (const locale of ["en", "fr"])
        input(
          `${key}.${locale}`,
          key === "title" ? "titleField" : key,
          locale,
          ["description", "recognition"].includes(key),
        );
    input("imageUrl", "imageUrl");
    input("imageFile", "imageFile");
    const publishedLabel = form.querySelector('label:has([name="published"])');
    const publishedText = publishedLabel.lastChild;
    function payload() {
      const result = {
        displayNumber: field("displayNumber").value.trim(),
        imageUrl: field("imageUrl").value.trim(),
        published: field("published").checked,
      };
      for (const key of bilingual)
        result[key] = Object.fromEntries(
          ["en", "fr"].map((locale) => [
            locale,
            field(`${key}.${locale}`).value.trim(),
          ]),
        );
      return result;
    }
    function dirty() {
      return (
        !form.hidden &&
        (JSON.stringify(payload()) !== baseline ||
          field("imageFile").files.length > 0)
      );
    }
    async function canLeave() {
      if (busy || disposed || confirming) return false;
      if (!dirty()) return true;
      confirming = true;
      try {
        return await window.CMCENModal.confirm(t("discard"), {
          destructive: true,
        });
      } finally {
        confirming = false;
      }
    }
    function message(key) {
      messageKey = key;
      el("adoptAdminStatus").textContent = key ? t(key) : "";
    }
    function setBusy(value) {
      busy = value;
      fields.disabled = value;
      root.setAttribute("aria-busy", String(value));
      el("adoptAdminNew").disabled = value;
      el("adoptAdminRetry").disabled = value;
      list.querySelectorAll("button").forEach((button) => {
        button.disabled = value;
      });
    }
    function renderList() {
      list.replaceChildren();
      for (const item of items) {
        const button = document.createElement("button");
        button.type = "button";
        button.disabled = busy;
        button.dataset.id = item._id;
        button.textContent = `${item.displayNumber ? item.displayNumber + " — " : ""}${item.title[lang()] || item.title.en || item.title.fr} (${t(item.published ? "published" : "draft")})`;
        button.setAttribute("aria-pressed", String(selected?._id === item._id));
        list.append(button);
      }
      if (!items.length) {
        const p = document.createElement("p");
        p.textContent = t("empty");
        list.append(p);
      }
    }
    function labelsChanged() {
      el("adminAdoptTitle").textContent = t("title");
      el("adminAdoptLink").textContent = t("title");
      root.querySelector('a[href="/foundation-adopt"]').textContent =
        t("public");
      el("adoptAdminRetry").textContent = t("reload");
      el("adoptAdminNew").textContent = t("new");
      el("adoptAdminHeading").textContent = t("details");
      form.querySelector('[type="submit"]').textContent = t("save");
      el("adoptAdminDelete").textContent = t("delete");
      publishedText.textContent = " " + t("published");
      fields.querySelector("p").textContent = t("note");
      labels.forEach(({ span, key, locale }) => {
        span.textContent =
          t(key) + (locale ? ` (${locale.toUpperCase()})` : "");
      });
      message(messageKey);
      renderList();
    }
    function open(item) {
      selected = item;
      form.reset();
      for (const key of bilingual)
        for (const locale of ["en", "fr"])
          field(`${key}.${locale}`).value = item?.[key]?.[locale] || "";
      for (const key of ["displayNumber", "imageUrl"])
        field(key).value = item?.[key] || "";
      field("published").checked = item?.published === true;
      el("adoptAdminDelete").hidden = !item;
      form.hidden = false;
      baseline = JSON.stringify(payload());
      message("");
      renderList();
    }
    async function load() {
      if (busy || disposed || !(await canLeave())) return;
      setBusy(true);
      message("loading");
      try {
        const data = await api("/api/admin/adopt-displays");
        if (disposed) return;
        items = data.displays;
        form.hidden = true;
        selected = null;
        message("");
        renderList();
      } catch (error) {
        if (!disposed) {
          if (error.status === 403) onDenied();
          else message("failed");
        }
      } finally {
        if (!disposed) setBusy(false);
      }
    }
    listen(list, "click", async (event) => {
      const button = event.target.closest("button[data-id]");
      if (button && (await canLeave()) && !disposed)
        open(items.find((item) => item._id === button.dataset.id));
    });
    listen(el("adoptAdminNew"), "click", async () => {
      if ((await canLeave()) && !disposed) open(null);
    });
    listen(el("adoptAdminRetry"), "click", load);
    listen(form, "submit", async (event) => {
      event.preventDefault();
      if (busy || disposed || !form.reportValidity()) return;
      const updates = payload();
      if (!updates.title.en && !updates.title.fr) {
        message("required");
        return;
      }
      setBusy(true);
      try {
        const file = field("imageFile").files[0];
        if (file) {
          const upload = new FormData();
          upload.append("image", await CMCENUtils.prepareImageUploadFile(file));
          if (disposed) return;
          upload.append("uploadSource", "adoptDisplay");
          upload.append("uploadContext", "adopt-display");
          if (selected) upload.append("sourceId", selected._id);
          let result;
          try {
            result = await api("/api/upload", { method: "POST", body: upload });
          } catch {
            if (!disposed) message("upload");
            return;
          }
          if (disposed) return;
          if (!result.url) throw new Error("Missing upload URL");
          updates.imageUrl = result.url;
          field("imageUrl").value = result.url;
          field("imageFile").value = "";
        }
        const data = await api(
          `/api/admin/adopt-displays${selected ? "/" + selected._id : ""}`,
          {
            method: selected ? "PATCH" : "POST",
            body: JSON.stringify(updates),
            headers: { "Content-Type": "application/json" },
          },
        );
        if (disposed) return;
        const index = items.findIndex((item) => item._id === data.display._id);
        if (index < 0) items.push(data.display);
        else items[index] = data.display;
        open(data.display);
        message("saved");
      } catch (error) {
        if (!disposed) {
          if (error.status === 403) onDenied();
          else message("error");
        }
      } finally {
        if (!disposed) setBusy(false);
      }
    });
    listen(el("adoptAdminDelete"), "click", async () => {
      if (busy || disposed || !selected || confirming) return;
      confirming = true;
      let accepted;
      try {
        accepted = await window.CMCENModal.confirm(t("remove"), {
          destructive: true,
        });
      } finally {
        confirming = false;
      }
      if (!accepted || disposed || busy) return;
      setBusy(true);
      try {
        await api(`/api/admin/adopt-displays/${selected._id}`, {
          method: "DELETE",
        });
        if (disposed) return;
        items = items.filter((item) => item._id !== selected._id);
        selected = null;
        form.hidden = true;
        renderList();
        message("deleted");
      } catch (error) {
        if (!disposed) {
          if (error.status === 403) onDenied();
          else message("error");
        }
      } finally {
        if (!disposed) setBusy(false);
      }
    });
    listen(document, "languagechange", labelsChanged);
    labelsChanged();
    load();
    return {
      canLeave,
      canNavigate: () => !busy && !confirming,
      hasUnsavedChanges: () => busy || dirty(),
      dispose() {
        disposed = true;
        events.abort();
        el("adoptAdminInputs").replaceChildren();
      },
    };
  }
  window.DashboardNextAdopt = { mount };
})();
