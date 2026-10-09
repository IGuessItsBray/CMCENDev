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
    let reloadRequested = false;
    let running = false;
    async function load() {
      if (disposed) return;
      if (loading) {
        reloadRequested = true;
        return;
      }
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
        if (reloadRequested && !disposed) {
          reloadRequested = false;
          void load();
        }
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
      root.className = "admin-backups-layout";
      running = data.running;
      const ready =
        data.readiness.encryptionConfigured && data.readiness.mongoConfigured;
      const readiness = node("section");
      readiness.className = "admin-backups-readiness";
      for (const [name, configured, missing] of [
        [
          "Encryption",
          data.readiness.encryptionConfigured,
          "Password required (16+ characters)",
        ],
        ["MongoDB", data.readiness.mongoConfigured, "Connection required"],
        [
          "PostgreSQL",
          data.readiness.postgresConfigured,
          "Backup connection required",
        ],
        [
          "ClickHouse",
          data.readiness.clickhouseConfigured,
          "Backup connection required",
        ],
      ]) {
        const card = node("div");
        card.className = "admin-backups-readiness-card";
        card.append(
          node("strong", name),
          node(
            "p",
            configured
              ? name === "Encryption"
                ? "Password configured"
                : "Included in backups"
              : missing,
          ),
        );
        readiness.append(card);
      }
      root.append(readiness);
      if (data.readiness.analyticsReportingConfigured) {
        root.append(
          node(
            "p",
            "Plausible reporting is configured. Database backups use direct connections to your PostgreSQL and ClickHouse services.",
          ),
        );
      }
      if (
        !data.readiness.postgresConfigured ||
        !data.readiness.clickhouseConfigured
      ) {
        root.append(
          node(
            "p",
            "To include analytics databases, set BACKUP_POSTGRES_URI and BACKUP_CLICKHOUSE_URL in server/.env, or share PLAUSIBLE_DATABASE_URL and PLAUSIBLE_CLICKHOUSE_DATABASE_URL with this app. Reporting and share URLs do not supply database credentials.",
          ),
        );
      }
      root.append(
        node(
          "p",
          `Last result: ${data.lastResult || "none"}. Next scheduled run: ${data.nextRunAt ? new Date(data.nextRunAt).toLocaleString(undefined, { timeZone: data.timeZone || "America/Toronto", timeZoneName: "short" }) : "disabled"}.`,
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
      controls.className = "admin-backups-card";
      controls.append(node("h2", "Schedule"));
      const form = node("form");
      form.className = "admin-backups-form";
      const labelFor = (text, input) => {
        const label = node("label", text);
        label.append(input);
        return label;
      };
      const enabled = node("input");
      enabled.type = "checkbox";
      enabled.name = "enabled";
      enabled.checked = data.enabled;
      const enabledLabel = node("label", "Enable automatic backups ");
      enabledLabel.append(enabled);
      const mode = node("select");
      mode.name = "mode";
      for (const value of ["daily", "weekly", "custom"]) {
        const option = node("option", value[0].toUpperCase() + value.slice(1));
        option.value = value;
        mode.append(option);
      }
      mode.value = ["daily", "weekly", "custom"].includes(data.mode)
        ? data.mode
        : "daily";
      const time = node("input");
      time.type = "time";
      time.name = "time";
      time.required = true;
      time.step = "60";
      time.value = data.time || "02:00";
      const timeZone = node("input");
      timeZone.name = "timeZone";
      timeZone.required = true;
      timeZone.value = data.timeZone || "America/Toronto";
      const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const weekly = node("select");
      weekly.name = "weekday";
      days.forEach((day, index) => {
        const option = node("option", day);
        option.value = index;
        weekly.append(option);
      });
      weekly.value = data.mode === "weekly" ? data.days[0] : 1;
      const weeklyLabel = labelFor("Day of the week", weekly);
      const custom = node("fieldset");
      custom.className = "admin-backups-days";
      custom.append(node("legend", "Days to back up"));
      const checkboxes = days.map((day, index) => {
        const checkbox = node("input");
        checkbox.type = "checkbox";
        checkbox.name = "days";
        checkbox.value = index;
        checkbox.checked = (data.days || [1, 2, 3, 4, 5]).includes(index);
        custom.append(labelFor(day, checkbox));
        return checkbox;
      });
      const syncDays = () => {
        weeklyLabel.hidden = mode.value !== "weekly";
        weekly.disabled = mode.value !== "weekly";
        custom.hidden = mode.value !== "custom";
        checkboxes.forEach((checkbox) => {
          checkbox.disabled = mode.value !== "custom";
        });
      };
      mode.addEventListener("change", syncDays);
      syncDays();
      const save = node("button", "Save schedule");
      save.type = "submit";
      save.disabled = busy || data.running;
      form.append(
        enabledLabel,
        labelFor("Frequency", mode),
        labelFor("Backup time", time),
        labelFor("Time zone", timeZone),
        weeklyLabel,
        custom,
        save,
      );
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const selectedDays =
          mode.value === "weekly"
            ? [Number(weekly.value)]
            : mode.value === "custom"
              ? checkboxes
                  .filter((checkbox) => checkbox.checked)
                  .map((checkbox) => Number(checkbox.value))
              : [];
        if (mode.value === "custom" && !selectedDays.length) {
          feedback.textContent = "Choose at least one backup day.";
          return;
        }
        try {
          new Intl.DateTimeFormat("en", {
            timeZone: timeZone.value.trim(),
          }).format();
        } catch {
          feedback.textContent =
            "Enter a valid time zone, such as America/Toronto or UTC.";
          timeZone.focus();
          return;
        }
        void action(save, "/api/admin/backups/schedule", {
          method: "PATCH",
          body: {
            enabled: enabled.checked,
            mode: mode.value,
            time: time.value,
            timeZone: timeZone.value.trim(),
            days: selectedDays,
          },
        });
      });
      controls.append(
        form,
        node(
          "p",
          "Runs at the selected local time. Manual backups keep this calendar schedule. The server must be running; a missed run is attempted once after restart. Times skipped by daylight saving are skipped; repeated times run once.",
        ),
      );
      if (data.mode === "interval")
        controls.append(
          node(
            "p",
            `Your existing ${data.intervalMinutes}-minute schedule remains active until you save a calendar schedule.`,
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
      history.className = "admin-backups-card admin-backups-history";
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
      if (busy || running) void load();
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
