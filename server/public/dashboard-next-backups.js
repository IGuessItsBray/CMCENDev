"use strict";

(() => {
  const node = (tag, text) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    return element;
  };
  function mount({ api, onDenied }) {
    const root = document.getElementById("adminBackupsBody");
    const feedback = node("p");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    let disposed = false;
    let busy = false;
    let loading = false;
    async function load() {
      if (disposed || loading) return;
      loading = true;
      try {
        const data = await api("/api/admin/backups");
        if (!disposed) render(data);
      } catch (error) {
        if (error.status === 403) onDenied();
        else
          feedback.textContent = error.message || "Backup status unavailable";
      } finally {
        loading = false;
      }
    }
    async function action(button, path, options) {
      busy = true;
      button.disabled = true;
      feedback.textContent = "Working…";
      try {
        await api(path, options);
        feedback.textContent = "Completed.";
      } catch (error) {
        if (error.status === 403) onDenied();
        else feedback.textContent = error.message || "Backup operation failed";
      } finally {
        busy = false;
        if (!disposed) await load();
      }
    }
    function render(data) {
      root.replaceChildren();
      root.className = "admin-email-layout";
      const ready =
        data.readiness.encryptionConfigured && data.readiness.mongoConfigured;
      root.append(
        node(
          "p",
          `Encryption password: ${data.readiness.encryptionConfigured ? "configured" : "missing (minimum 16 characters)"}. MongoDB: ${data.readiness.mongoConfigured ? "configured" : "missing"}. PostgreSQL: ${data.readiness.postgresConfigured ? "included" : "not configured"}. ClickHouse: ${data.readiness.clickhouseConfigured ? "included" : "not configured"}.`,
        ),
      );
      root.append(
        node(
          "p",
          `Last result: ${data.lastResult || "none"}. Next scheduled run: ${data.nextRunAt ? new Date(data.nextRunAt).toLocaleString() : "disabled"}.`,
        ),
      );
      if (data.running)
        root.append(
          node(
            "p",
            "A backup operation is running, or a recovery lock needs operator attention.",
          ),
        );
      const controls = node("section");
      controls.className = "admin-email-card";
      controls.append(node("h2", "Schedule"));
      const form = node("form");
      const enabled = node("input");
      enabled.type = "checkbox";
      enabled.checked = data.enabled;
      const enabledLabel = node("label", "Enable automatic backups ");
      enabledLabel.append(enabled);
      const interval = node("input");
      interval.type = "number";
      interval.min = "60";
      interval.max = "525600";
      interval.step = "1";
      interval.required = true;
      interval.value = data.intervalMinutes;
      const intervalLabel = node("label", "Run every (minutes; 1440 = daily) ");
      intervalLabel.append(interval);
      const save = node("button", "Save schedule");
      save.type = "submit";
      save.disabled = busy || data.running;
      form.append(enabledLabel, intervalLabel, save);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        void action(save, "/api/admin/backups/schedule", {
          method: "PATCH",
          body: {
            enabled: enabled.checked,
            intervalMinutes: Number(interval.value),
          },
        });
      });
      controls.append(
        form,
        node(
          "p",
          "Scheduling starts one interval after saving. The server must be running. The password is configured on the server and is never shown here.",
        ),
      );
      const run = node("button", "Back up now");
      run.type = "button";
      run.disabled = !ready || busy || data.running;
      run.addEventListener(
        "click",
        () =>
          void action(run, "/api/admin/backups/run", {
            method: "POST",
            body: {},
            timeoutMs: null,
          }),
      );
      controls.append(run);
      const history = node("section");
      history.className = "admin-email-card admin-email-history";
      history.append(
        node("h2", "Completed backups"),
        node(
          "p",
          "Keep the encryption password safely: changing it does not re-encrypt older backups. Backups are retained until an operator removes them from storage.",
        ),
      );
      const list = node("ul");
      for (const backup of data.backups) {
        const item = node(
          "li",
          `${new Date(backup.createdAt).toLocaleString()} `,
        );
        for (const file of backup.files) {
          const download = node("button", `Download ${file}`);
          download.type = "button";
          download.addEventListener("click", async () => {
            download.disabled = true;
            try {
              const response = await api(
                `/api/admin/backups/${encodeURIComponent(backup.id)}/${encodeURIComponent(file)}`,
                { parseJson: false, timeoutMs: null },
              );
              const blob = await response.blob();
              if (disposed) return;
              const link = node("a");
              const url = URL.createObjectURL(blob);
              link.href = url;
              link.download = `${backup.id}-${file}`;
              root.append(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (error) {
              if (error.status === 403) onDenied();
              else feedback.textContent = "Download failed.";
            } finally {
              download.disabled = false;
            }
          });
          item.append(download);
        }
        list.append(item);
      }
      if (!data.backups.length)
        list.append(node("li", "No completed backups."));
      history.append(list);
      root.append(controls, history, feedback);
    }
    root.replaceChildren(feedback);
    void load();
    // Poll while an operation is in progress; preserve unsaved schedule edits otherwise.
    const poll = setInterval(() => {
      if (busy) void load();
    }, 15000);
    return {
      dispose() {
        disposed = true;
        clearInterval(poll);
        root.replaceChildren();
      },
    };
  }
  window.DashboardNextBackups = { mount };
})();
