(function () {
  if (
    new URLSearchParams(window.location.search).get("view") !== "subscriptions"
  )
    return;
  const root = document.getElementById("adminWorkZoneContent");
  const status = document.getElementById("adminWorkZoneStatus");
  const token = CMCENUtils.requireAuthToken();

  async function api(path, options = {}) {
    return CMCENUtils.apiJson(path, {
      ...options,
      token,
      redirectOnUnauthorized: true,
    });
  }
  function button(label, action, variant = "is-secondary") {
    const value = document.createElement("button");
    value.type = "button";
    value.className = `admin-work-zone-button ${variant}`;
    value.textContent = label;
    value.addEventListener("click", action);
    return value;
  }
  async function download() {
    const response = await fetch("/api/admin/subscriptions/export.csv", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Could not export subscribers");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    link.download = "cmcen-subscribers.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function render(data) {
    root.replaceChildren();
    const panel = document.createElement("section");
    panel.className = "admin-subscriptions-panel";
    const heading = document.createElement("div");
    heading.className = "admin-panel-heading";
    const title = document.createElement("h2");
    title.textContent = "Subscriptions";
    heading.append(
      title,
      button("Export subscribed users (CSV)", async () => {
        try {
          await download();
          CMCENUtils.showToast("Subscriber export downloaded", {
            color: "success",
          });
        } catch (error) {
          CMCENUtils.showToast(error.message, { color: "error" });
        }
      }),
    );
    panel.append(heading);
    const table = document.createElement("table");
    table.className = "admin-subscriptions-table";
    table.innerHTML =
      "<thead><tr><th>Name</th><th>Email</th><th>Weekly brief</th><th>News announcements</th></tr></thead>";
    const body = document.createElement("tbody");
    data.subscribers.forEach((item) => {
      const row = document.createElement("tr");
      [
        item.name,
        item.email,
        item.weeklyBrief ? "Subscribed" : "—",
        item.newsAnnouncements ? "Subscribed" : "—",
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
    table.append(body);
    panel.append(table);
    const history = document.createElement("section");
    const historyTitle = document.createElement("h3");
    historyTitle.textContent = "Sent newsletters";
    const select = document.createElement("select");
    data.newsletters.forEach((item) => {
      const option = document.createElement("option");
      option.value = item._id;
      option.textContent = item.label;
      option.dataset.details = `${item.sentCount || 0} sent · ${item.failedCount || 0} failed · ${new Date(item.completedAt || item.sentAt || item.createdAt).toLocaleString()}`;
      select.append(option);
    });
    const details = document.createElement("p");
    details.textContent =
      select.selectedOptions[0]?.dataset.details ||
      "No newsletters have been sent yet.";
    select.addEventListener("change", () => {
      details.textContent = select.selectedOptions[0]?.dataset.details || "";
    });
    history.append(historyTitle, select, details);
    panel.append(history);
    const blast = document.createElement("section");
    const blastTitle = document.createElement("h3");
    blastTitle.textContent = "Send news blast";
    const subject = document.createElement("input");
    subject.placeholder = "Subject";
    subject.maxLength = 180;
    const message = document.createElement("textarea");
    message.placeholder = "News announcement";
    message.maxLength = 10000;
    const send = button(
      "Send to news-announcement subscribers",
      async () => {
        if (!subject.value.trim() || !message.value.trim()) return;
        if (
          !(await CMCENModal.confirm(
            `Send this news blast to ${data.subscribers.filter((item) => item.newsAnnouncements).length} opted-in members?`,
            { title: "Send news blast", confirmText: "Send" },
          ))
        )
          return;
        send.disabled = true;
        try {
          const result = await api("/api/admin/subscriptions/news-blasts", {
            method: "POST",
            body: { subject: subject.value, body: message.value },
          });
          CMCENUtils.showToast(`${result.blast.sentCount} announcements sent`, {
            color: "success",
          });
          await load();
        } catch (error) {
          CMCENUtils.showToast(error.message, { color: "error" });
          send.disabled = false;
        }
      },
      "is-primary",
    );
    blast.append(blastTitle, subject, message, send);
    panel.append(blast);
    root.append(panel);
  }
  async function load() {
    try {
      const data = await api("/api/admin/subscriptions");
      status.hidden = true;
      document.getElementById("adminWorkZone").hidden = false;
      render(data);
    } catch (error) {
      status.textContent = error.message || "Could not load subscriptions";
    }
  }
  load();
})();
