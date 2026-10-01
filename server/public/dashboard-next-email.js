"use strict";

(() => {
  const t = (key) => window.translate(key);
  const node = (tag, key) => {
    const element = document.createElement(tag);
    if (key) {
      element.dataset.i18n = key;
      element.textContent = t(key);
    }
    return element;
  };

  function mount({ api, onDenied }) {
    const root = document.getElementById("adminEmailBody");
    let disposed = false;
    const status = node("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    root.replaceChildren(status);

    async function load() {
      try {
        const data = await api("/api/admin/email");
        if (disposed) return;
        render(data);
      } catch (error) {
        if (error.status === 403) onDenied();
        else status.textContent = t("admin_email_load_error");
      }
    }

    function render(data) {
      root.replaceChildren();
      root.className = "admin-email-layout";
      const note = node("p");
      note.textContent = data.globalDisabled
        ? t("admin_email_global_off")
        : data.readiness.transport
          ? t("admin_email_transport_ready")
          : t("admin_email_transport_missing");
      root.append(note);
      if (!data.readiness.subscriptions)
        root.append(node("p", "admin_email_subscription_missing"));
      const controls = node("section");
      controls.className = "admin-email-card";
      controls.append(node("h2", "admin_email_controls"));
      for (const category of ["account", "operational", "weekly", "news"]) {
        const row = node("p");
        const label = node("label");
        const checkbox = node("input");
        checkbox.type = "checkbox";
        checkbox.checked = data.controls[category] === true;
        checkbox.addEventListener("change", async () => {
          checkbox.disabled = true;
          try {
            await api("/api/admin/email/controls", {
              method: "PATCH",
              body: { category, enabled: checkbox.checked },
            });
            status.textContent = t("admin_email_saved");
            await load();
          } catch (error) {
            checkbox.checked = !checkbox.checked;
            checkbox.disabled = false;
            status.textContent = t("admin_email_save_error");
          }
        });
        const labelText = node("span");
        labelText.textContent = `${t(`admin_email_${category}`)} — ${data.effective[category] ? t("admin_email_effective_on") : t("admin_email_effective_off")}`;
        label.append(checkbox, labelText);
        row.append(label);
        controls.append(row);
      }
      root.append(controls);
      const test = node("section");
      test.className = "admin-email-card";
      test.append(
        node("h2", "admin_email_test"),
        node("p", "admin_email_test_help"),
      );
      const form = node("form");
      const label = node("label", "admin_email_recipient");
      const input = node("input");
      input.type = "email";
      input.required = true;
      input.autocomplete = "off";
      label.append(input);
      const button = node("button", "admin_email_send_test");
      button.type = "submit";
      button.disabled = data.globalDisabled || !data.readiness.transport;
      form.append(label, button);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        button.disabled = true;
        try {
          await api("/api/admin/email/test", {
            method: "POST",
            body: { recipient: input.value.trim() },
          });
          status.textContent = t("admin_email_test_accepted");
          await load();
        } catch (error) {
          status.textContent = t("admin_email_test_error");
          button.disabled = false;
        }
      });
      test.append(form);
      root.append(test);
      const history = node("section");
      history.className = "admin-email-card admin-email-history";
      history.append(
        node("h2", "admin_email_history"),
        node("p", "admin_email_history_help"),
      );
      const list = node("ul");
      for (const item of data.attempts) {
        const entry = node("li");
        entry.textContent = `${new Date(item.createdAt).toLocaleString()} · ${item.workflow} · ${item.status} · ${item.recipientMasked || "—"} · ${item.reason || "—"} · ${item.correlationId}`;
        list.append(entry);
      }
      if (!data.attempts.length)
        list.append(node("li", "admin_email_no_history"));
      history.append(list);
      root.append(history, status);
    }

    void load();
    return {
      dispose() {
        disposed = true;
        root.replaceChildren();
      },
    };
  }

  window.DashboardNextEmail = { mount };
})();
