"use strict";

(() => {
  const t = (key, replacements) => window.translate(key, replacements);
  const photoAwards = ["subaltern-of-the-year", "member-of-the-year"];

  function recipientPayload(form, slug) {
    const value = (name) => form.elements.namedItem(name).value.trim();
    return {
      year: Number(value("year")),
      name: value("name"),
      role: value("role"),
      medallionNumber:
        slug === "colonel-in-chief-commendation"
          ? value("medallionNumber")
          : "",
      amount: slug === "branch-bursary" ? value("amount") : "",
      imageUrl: photoAwards.includes(slug) ? value("imageUrl") : "",
      featured: false,
    };
  }

  function sortedRecipients(recipients, query = "") {
    const term = query.trim().toLocaleLowerCase();
    return recipients
      .filter((recipient) =>
        `${recipient.year} ${recipient.name} ${recipient.role || ""} ${recipient.medallionNumber || ""}`
          .toLocaleLowerCase()
          .includes(term),
      )
      .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  }

  function mount({ api, permissions, onDenied, navigate }) {
    const el = (id) => document.getElementById(id);
    const root = el("adminAwards");
    const list = el("awardList");
    const detail = el("awardDetail");
    const archive = el("awardRecipientList");
    const search = el("awardRecipientSearch");
    const add = el("awardRecipientNew");
    const form = el("awardRecipientForm");
    const fields = el("awardRecipientFields");
    const inputs = el("awardRecipientInputs");
    const save = el("awardRecipientSave");
    const news = el("awardRecipientNews");
    const retry = el("awardsRetry");
    const events = new AbortController();
    let awards = [];
    let award = null;
    let recipient = null;
    let baseline = "";
    let busy = false;
    let disposed = false;
    let confirming = false;
    let validationAttempted = false;
    let messageKey = "";
    let canUpload = permissions.canUploadMedia === true;
    const field = (name) => form.elements.namedItem(name);
    const listen = (node, type, fn) =>
      node.addEventListener(type, fn, { signal: events.signal });
    const snapshot = () => JSON.stringify(recipientPayload(form, award?.slug));
    const dirty = () =>
      !form.hidden &&
      (snapshot() !== baseline || Boolean(field("imageFile").files?.length));
    const canLeave = async () => {
      if (busy || disposed || confirming) return false;
      if (!dirty()) return true;
      confirming = true;
      try {
        const accepted = await window.CMCENModal.confirm(
          t("admin_next_awards_discard"),
          {
            title: t("content_workspace_unsaved_changes_title"),
            confirmText: t("content_workspace_discard_changes"),
            destructive: true,
          },
        );
        return accepted && !disposed && !busy;
      } finally {
        confirming = false;
      }
    };

    function message(key) {
      messageKey = key;
      el("awardsStatus").textContent = form.hidden && key ? t(key) : "";
      el("awardRecipientFeedback").textContent =
        !form.hidden && key ? t(key) : "";
    }
    function updateLabels() {
      el("awardRecipientHeading").textContent = t(
        recipient ? "admin_next_recipient_edit" : "admin_next_recipient_new",
      );
      save.textContent = t(
        busy
          ? "admin_next_recipient_saving"
          : recipient
            ? "admin_next_recipient_save"
            : "admin_next_recipient_new",
      );
      news.hidden = !recipient || permissions.canManageNews !== true;
      news.disabled = busy;
      news.textContent = t(
        recipient?.newsArticleId
          ? "admin_next_recipient_news_open"
          : "admin_next_recipient_news_create",
      );
      el("awardRecipientNewsHelp").hidden = news.hidden;
      message(messageKey);
    }
    function setBusy(value) {
      busy = value;
      root.setAttribute("aria-busy", String(value));
      fields.disabled = value;
      add.disabled = value || !award;
      search.disabled = value;
      retry.disabled = value;
      list.querySelectorAll("button").forEach((button) => {
        button.disabled = value;
      });
      archive.querySelectorAll("button").forEach((button) => {
        button.disabled = value;
      });
      updateLabels();
    }
    function fail(error, key) {
      if (disposed) return;
      if (error.status === 403) onDenied();
      else message(key);
    }
    function createField(name, key, type = "text", maxLength) {
      const { field, control } = window.CMCENForms.createField({
        id: `award-${name}`,
        name,
        labelKey: key,
        type,
        ...(maxLength ? { maxLength } : {}),
      });
      inputs.append(field);
      return control;
    }
    inputs.replaceChildren();
    const year = createField("year", "admin_next_recipient_year", "number");
    year.min = "1900";
    year.max = "3000";
    year.step = "1";
    year.required = true;
    createField("name", "admin_next_recipient_name", "text", 300).required =
      true;
    createField("role", "admin_next_recipient_role", "text", 240);
    createField(
      "medallionNumber",
      "admin_next_recipient_medallion",
      "text",
      80,
    );
    createField("amount", "admin_next_recipient_amount", "text", 80);
    createField("imageUrl", "admin_next_recipient_photo_url", "url", 2000);
    createField(
      "imageFile",
      "admin_next_recipient_photo_upload",
      "file",
    ).accept = "image/*";

    function renderList() {
      list.replaceChildren();
      awards.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.id = item._id;
        button.textContent = item.title;
        button.disabled = busy;
        if (item._id === award?._id)
          button.setAttribute("aria-current", "true");
        list.append(button);
      });
    }
    function renderArchive() {
      archive.replaceChildren();
      const recipients = sortedRecipients(
        award?.recipients || [],
        search.value,
      );
      if (!recipients.length) {
        const empty = document.createElement("p");
        empty.textContent = t("admin_next_recipient_no_matches");
        archive.append(empty);
      }
      recipients.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.id = item._id;
        button.textContent = `${item.year} — ${item.name}`;
        button.disabled = busy;
        if (item._id === recipient?._id)
          button.setAttribute("aria-current", "true");
        archive.append(button);
      });
    }
    function selectRecipient(item, focus = false, creating = false) {
      validationAttempted = false;
      window.CMCENForms.clearErrors(form);
      recipient = item;
      form.hidden = !item && !creating;
      el("awardRecipientEmpty").hidden = !form.hidden;
      if (!form.hidden) {
        [
          "year",
          "name",
          "role",
          "medallionNumber",
          "amount",
          "imageUrl",
        ].forEach((name) => {
          field(name).value =
            item?.[name] ?? (name === "year" ? new Date().getFullYear() : "");
          field(name).setCustomValidity("");
        });
        field("imageFile").value = "";
        const photo = photoAwards.includes(award.slug);
        for (const [name, visible] of [
          ["medallionNumber", award.slug === "colonel-in-chief-commendation"],
          ["amount", award.slug === "branch-bursary"],
          ["imageUrl", photo],
          ["imageFile", photo && canUpload],
        ]) {
          field(name).closest("label").hidden = !visible;
          field(name).disabled = !visible;
        }
        el("awardPhotoNote").hidden = !photo;
        baseline = snapshot();
        if (focus) field("name").focus();
      }
      message("");
      updateLabels();
      renderArchive();
    }
    function selectAward(item) {
      award = item;
      detail.hidden = !item;
      search.value = "";
      if (item) {
        el("awardTitle").textContent = item.title;
        selectRecipient(sortedRecipients(item.recipients || [])[0] || null);
      } else form.hidden = true;
      renderList();
    }
    async function load() {
      retry.hidden = true;
      setBusy(true);
      message("admin_next_awards_loading");
      try {
        const data = await api("/api/admin/professional-awards");
        if (disposed) return;
        if (!Array.isArray(data.awards))
          throw new Error("Invalid awards response");
        awards = data.awards;
        selectAward(awards[0] || null);
        message(awards.length ? "" : "admin_next_awards_empty");
      } catch (error) {
        fail(error, "admin_next_awards_load_error");
        retry.hidden = error.status === 403;
      } finally {
        if (!disposed) setBusy(false);
      }
    }
    listen(list, "click", async (event) => {
      const id = event.target.closest("button[data-id]")?.dataset.id;
      if (!id || id === award?._id || !(await canLeave())) return;
      selectAward(awards.find((item) => item._id === id));
    });
    listen(archive, "click", async (event) => {
      const id = event.target.closest("button[data-id]")?.dataset.id;
      if (!id || id === recipient?._id || !(await canLeave())) return;
      selectRecipient(
        award.recipients.find((item) => item._id === id),
        true,
      );
    });
    listen(add, "click", async () => {
      if (award && (await canLeave())) {
        search.value = "";
        selectRecipient(null, true, true);
      }
    });
    listen(search, "input", renderArchive);
    listen(retry, "click", load);
    listen(news, "click", async () => {
      if (busy || disposed || !recipient || permissions.canManageNews !== true)
        return;
      if (dirty()) {
        message("admin_next_recipient_news_save_first");
        return;
      }
      setBusy(true);
      message("");
      try {
        const data = await api(
          `/api/admin/professional-awards/${encodeURIComponent(award._id)}/recipients/${encodeURIComponent(recipient._id)}/news`,
          { method: "POST" },
        );
        if (disposed) return;
        if (!data.newsArticleId) throw new Error("Invalid news response");
        recipient.newsArticleId = data.newsArticleId;
        // A clean editor may leave; release the shell's in-flight guard first.
        setBusy(false);
        await navigate(
          `/dashboard-next?area=articles&id=${encodeURIComponent(data.newsArticleId)}`,
        );
      } catch (error) {
        if (!disposed)
          message(
            error.status === 403
              ? "admin_next_recipient_news_denied"
              : "admin_next_recipient_news_error",
          );
      } finally {
        if (!disposed) setBusy(false);
      }
    });
    listen(form, "input", () => {
      field("name").setCustomValidity("");
      field("imageUrl").setCustomValidity("");
      message("");
      if (validationAttempted) validateRecipient(false);
    });
    function validateRecipient(focus = true) {
      field("name").setCustomValidity(
        field("name").value.trim() ? "" : t("admin_next_required"),
      );
      const photoUrl = field("imageUrl").value.trim();
      field("imageUrl").setCustomValidity(
        photoUrl && !/^https?:\/\//iu.test(photoUrl)
          ? t("admin_next_recipient_url_error")
          : "",
      );
      return window.CMCENForms.validate(form, { focus });
    }
    listen(form, "submit", async (event) => {
      event.preventDefault();
      if (busy || disposed || !award) return;
      validationAttempted = true;
      if (!validateRecipient()) return;
      const editing = Boolean(recipient);
      const id = recipient?._id;
      const awardId = award._id;
      setBusy(true);
      message("admin_next_recipient_saving");
      try {
        const file = field("imageFile").files?.[0];
        if (file && canUpload && photoAwards.includes(award.slug)) {
          const upload = new FormData();
          upload.append("image", await CMCENUtils.prepareImageUploadFile(file));
          if (disposed) return;
          upload.append("uploadSource", "professionalAwards");
          upload.append("uploadContext", "professional-award-recipient");
          let result;
          try {
            result = await api("/api/upload", { method: "POST", body: upload });
          } catch (error) {
            if (error.status === 403) {
              canUpload = false;
              field("imageFile").disabled = true;
              message("admin_next_recipient_upload_denied");
              return;
            }
            throw error;
          }
          if (disposed) return;
          if (!result.url) throw new Error("Invalid upload response");
          field("imageUrl").value = result.url;
          field("imageFile").value = "";
        }
        const data = await api(
          `/api/admin/professional-awards/${encodeURIComponent(awardId)}/recipients${editing ? `/${encodeURIComponent(id)}` : ""}`,
          {
            method: editing ? "PATCH" : "POST",
            body: recipientPayload(form, award.slug),
          },
        );
        if (disposed) return;
        if (
          data.award?._id !== awardId ||
          !Array.isArray(data.award.recipients)
        )
          throw new Error("Invalid saved award");
        const saved = editing
          ? data.award.recipients.find((item) => item._id === id)
          : data.award.recipients.at(-1);
        if (!saved?._id) throw new Error("Invalid saved recipient");
        award = data.award;
        awards = awards.map((item) => (item._id === awardId ? award : item));
        selectRecipient(saved);
        message(
          editing ? "admin_next_recipient_saved" : "admin_next_recipient_added",
        );
      } catch (error) {
        fail(
          error,
          editing
            ? "admin_next_recipient_save_error"
            : "admin_next_recipient_add_error",
        );
      } finally {
        if (!disposed) {
          setBusy(false);
          save.focus();
        }
      }
    });
    listen(document, "languagechange", () => {
      renderArchive();
      updateLabels();
      if (validationAttempted && !busy) validateRecipient(false);
    });
    form.hidden = true;
    detail.hidden = true;
    list.replaceChildren();
    load();
    return {
      canLeave,
      canNavigate: () => !busy && !confirming,
      hasUnsavedChanges: () => busy || dirty(),
      dispose() {
        disposed = true;
        events.abort();
        inputs.replaceChildren();
        list.replaceChildren();
        archive.replaceChildren();
        form.hidden = true;
        detail.hidden = true;
      },
    };
  }
  window.DashboardNextAwards = Object.freeze({
    mount,
    recipientPayload,
    sortedRecipients,
  });
})();
