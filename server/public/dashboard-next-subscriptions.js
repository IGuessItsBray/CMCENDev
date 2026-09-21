"use strict";

(() => {
  const t = (key, values) => window.translate(key, values);
  function node(tag, key, className) {
    const el = document.createElement(tag);
    if (key) {
      el.dataset.i18n = key;
      el.textContent = t(key);
    }
    if (className) el.className = className;
    return el;
  }
  function button(key, fn) {
    const el = node("button", key);
    el.type = "button";
    el.addEventListener("click", fn);
    return el;
  }
  function field(parent, name, key, attributes = {}) {
    const result = window.CMCENForms.createField({
      id: `subscriptions-${name}`,
      name,
      labelKey: key,
      ...attributes,
    });
    parent.append(result.field);
    return result.control;
  }
  function mount({ api, onDenied }) {
    const root = document.getElementById("adminSubscriptionsBody");
    const exportButton = document.getElementById("adminSubscriptionsExport");
    const events = new AbortController();
    let disposed = false,
      loading = false,
      exporting = false,
      confirming = false,
      sending = false;
    let data = null,
      attempted = false,
      uncertain = false;
    let statusKey = "",
      feedbackKey = "",
      feedbackValues;
    const listen = (el, type, fn) =>
      el.addEventListener(type, fn, { signal: events.signal });
    const toolbar = node("div", null, "admin-subscriptions-toolbar");
    const status = node("p", null, "admin-users-feedback");
    status.setAttribute("role", "status");
    const refresh = button("admin_next_subscriptions_refresh", load);
    toolbar.append(status, refresh);
    const layout = node("div", null, "admin-subscriptions-layout");
    const members = node("section");
    const heading = node("h2", "admin_next_subscriptions_members");
    members.append(heading);
    const search = field(members, "search", "admin_next_subscriptions_search", {
      type: "search",
      maxLength: 120,
    });
    const count = node("p", null, "admin-users-muted");
    count.setAttribute("role", "status");
    const tableWrap = node("div", null, "admin-subscriptions-table-wrap");
    tableWrap.tabIndex = 0;
    tableWrap.setAttribute("role", "region");
    tableWrap.setAttribute("aria-label", t("admin_next_subscriptions_members"));
    tableWrap.dataset.i18nAriaLabel = "admin_next_subscriptions_members";
    const table = node("table", null, "admin-subscriptions-table");
    const caption = node(
      "caption",
      "admin_next_subscriptions_members",
      "visually-hidden",
    );
    const thead = node("thead"),
      headerRow = node("tr"),
      tbody = node("tbody");
    for (const key of ["member", "weekly", "news"]) {
      const th = node("th", `admin_next_subscriptions_${key}`);
      th.scope = "col";
      headerRow.append(th);
    }
    thead.append(headerRow);
    table.append(caption, thead, tbody);
    tableWrap.append(table);
    members.append(count, tableWrap);
    const tools = node("section", null, "admin-users-detail");
    tools.append(
      node("h2", "admin_next_subscriptions_compose"),
      node("p", "admin_next_subscriptions_consent", "admin-users-muted"),
    );
    const form = node("form");
    form.noValidate = true;
    const fields = node("fieldset", null, "admin-users-fields");
    const subject = field(
      fields,
      "subject",
      "admin_next_subscriptions_subject",
      { required: true, maxLength: 180 },
    );
    const message = field(
      fields,
      "message",
      "admin_next_subscriptions_message",
      { type: "textarea", required: true, maxLength: 10000, rows: 8 },
    );
    const send = node(
      "button",
      "admin_next_subscriptions_send",
      "admin-users-save",
    );
    send.type = "submit";
    fields.append(send);
    const feedback = node("p", null, "admin-users-feedback");
    feedback.setAttribute("role", "status");
    form.append(fields, feedback);
    const history = node("section", null, "admin-subscriptions-history");
    history.append(node("h3", "admin_next_subscriptions_history"));
    const historySelect = field(
      history,
      "delivery",
      "admin_next_subscriptions_delivery",
      { options: [] },
    );
    const historyDetails = node("p", null, "admin-users-muted");
    historyDetails.setAttribute("role", "status");
    history.append(historyDetails);
    tools.append(form, history);
    layout.append(members, tools);
    root.replaceChildren(toolbar, layout);
    const dirty = () => Boolean(subject.value || message.value);
    function updateBusy() {
      refresh.disabled = loading || exporting || sending || confirming;
      exportButton.disabled =
        !data || loading || exporting || sending || confirming;
      fields.disabled = sending || confirming;
      send.disabled =
        !data ||
        loading ||
        exporting ||
        sending ||
        confirming ||
        !data.subscribers.some(
          (item) => item.newsAnnouncements && item.newsAnnouncementsConsentedAt,
        );
      members.setAttribute("aria-busy", String(loading));
      history.setAttribute("aria-busy", String(loading));
      form.setAttribute("aria-busy", String(sending));
    }
    function renderMembers() {
      const query = search.value.trim().toLocaleLowerCase();
      const subscribers = data?.subscribers || [];
      const visible = subscribers.filter((item) =>
        `${item.name} ${item.email}`.toLocaleLowerCase().includes(query),
      );
      count.textContent = data
        ? t(
            visible.length
              ? "admin_next_subscriptions_count"
              : "admin_next_subscriptions_empty",
            { count: visible.length, total: subscribers.length },
          )
        : "";
      tbody.replaceChildren(
        ...visible.map((item) => {
          const row = node("tr"),
            member = node("td"),
            name = node("strong"),
            email = node("small");
          name.textContent = item.name || item.email;
          email.textContent = item.email;
          member.append(name, email);
          row.append(member);
          for (const subscribed of [item.weeklyBrief, item.newsAnnouncements]) {
            row.append(
              node(
                "td",
                subscribed
                  ? "admin_next_subscriptions_subscribed"
                  : "admin_next_subscriptions_not_subscribed",
              ),
            );
          }
          return row;
        }),
      );
    }
    function renderHistory() {
      const previous = historySelect.value;
      historySelect.replaceChildren(
        ...(data?.newsletters || []).map((item) => {
          const option = node("option");
          option.value = item._id;
          option.textContent = t(
            item.type === "weeklyBrief"
              ? "admin_next_subscriptions_weekly_label"
              : "admin_next_subscriptions_news_label",
            {
              label: item.type === "weeklyBrief" ? item.weekKey : item.subject,
            },
          );
          return option;
        }),
      );
      historySelect.value = data?.newsletters.some(
        (item) => item._id === previous,
      )
        ? previous
        : data?.newsletters[0]?._id || "";
      historySelect.disabled = !data?.newsletters.length;
      updateHistoryDetails();
    }
    function updateHistoryDetails() {
      const item = data?.newsletters.find(
        (item) => item._id === historySelect.value,
      );
      if (!item) {
        historyDetails.textContent = t("admin_next_subscriptions_no_history");
        return;
      }
      const timestamp = item.completedAt || item.sentAt;
      historyDetails.textContent = timestamp
        ? t("admin_next_subscriptions_history_result", {
            sent: item.sentCount || 0,
            failed: item.failedCount || 0,
            total: item.recipientCount || 0,
            date: new Intl.DateTimeFormat(CMCENUtils.getCurrentLocale(), {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(timestamp)),
          })
        : t("admin_next_subscriptions_history_pending");
    }
    function setFeedback(key, values) {
      feedbackKey = key;
      feedbackValues = values;
      feedback.textContent = t(key, values);
    }
    function fail(error, target) {
      if (disposed) return;
      if (error.status === 403) {
        onDenied();
        return;
      }
      target.textContent = error.message || t("admin_next_subscriptions_error");
    }
    async function load() {
      if (loading || exporting || confirming || sending || disposed) return;
      loading = true;
      statusKey = "admin_next_subscriptions_loading";
      status.textContent = t(statusKey);
      updateBusy();
      try {
        const result = await api("/api/admin/subscriptions", {
          signal: events.signal,
        });
        if (disposed) return;
        data = result;
        statusKey = data.subscribers.some(
          (item) => item.newsAnnouncements && item.newsAnnouncementsConsentedAt,
        )
          ? ""
          : "admin_next_subscriptions_no_recipients";
        status.textContent = statusKey ? t(statusKey) : "";
        renderMembers();
        renderHistory();
      } catch (error) {
        statusKey = "";
        fail(error, status);
      } finally {
        loading = false;
        if (!disposed) updateBusy();
      }
    }
    async function download() {
      if (!data || loading || exporting || confirming || sending || disposed)
        return;
      exporting = true;
      statusKey = "admin_next_subscriptions_exporting";
      status.textContent = t(statusKey);
      updateBusy();
      try {
        const response = await api("/api/admin/subscriptions/export.csv", {
          parseJson: false,
          signal: events.signal,
        });
        const blob = await response.blob();
        if (disposed) return;
        const url = URL.createObjectURL(blob),
          link = node("a");
        link.href = url;
        link.download = "cmcen-subscribers.csv";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        statusKey = "admin_next_subscriptions_exported";
        status.textContent = t(statusKey);
      } catch (error) {
        statusKey = "";
        fail(error, status);
      } finally {
        exporting = false;
        if (!disposed) updateBusy();
      }
    }
    function validate(focus = true) {
      return window.CMCENForms.validate(form, {
        focus,
        errors: [subject, message]
          .filter((control) => !control.value.trim())
          .map((control) => ({
            control,
            message: t("validation_field_required"),
          })),
      });
    }
    listen(form, "submit", async (event) => {
      event.preventDefault();
      if (disposed || confirming || sending || send.disabled) return;
      attempted = true;
      if (!validate()) return;
      // Freeze the reviewed payload while confirmation is open.
      const body = {
        subject: subject.value.trim(),
        body: message.value.trim(),
      };
      confirming = true;
      updateBusy();
      let accepted;
      try {
        accepted = await window.CMCENModal.confirm(
          t(
            uncertain
              ? "admin_next_subscriptions_confirm_uncertain"
              : "admin_next_subscriptions_confirm",
            { subject: body.subject },
          ),
          {
            title: t("admin_next_subscriptions_compose"),
            confirmText: t("admin_next_subscriptions_send"),
          },
        );
      } finally {
        confirming = false;
        if (!disposed) updateBusy();
      }
      if (!accepted || disposed) return;
      sending = true;
      setFeedback("admin_next_subscriptions_sending");
      updateBusy();
      let completed = false;
      try {
        // Delivery is synchronous and can exceed the shell's normal read timeout.
        const result = await api("/api/admin/subscriptions/news-blasts", {
          method: "POST",
          body,
          signal: events.signal,
          timeoutMs: null,
        });
        if (disposed) return;
        if (result.skipped === true) {
          setFeedback("admin_next_subscriptions_skipped");
        } else if (result.blast?.sentAt) {
          const { sentCount = 0, failedCount = 0 } = result.blast;
          setFeedback("admin_next_subscriptions_result", {
            sent: sentCount,
            failed: failedCount,
          });
          CMCENUtils.showToast(
            t("admin_next_subscriptions_result", {
              sent: sentCount,
              failed: failedCount,
            }),
            { color: failedCount ? "warning" : "success" },
          );
          // Preserve the unsent draft if every recipient failed.
          if (sentCount > 0 || failedCount === 0)
            subject.value = message.value = "";
          attempted = false;
          uncertain = false;
          completed = true;
        } else {
          uncertain = true;
          setFeedback("admin_next_subscriptions_uncertain");
        }
      } catch (error) {
        if (disposed) return;
        // Network/server errors may occur after delivery has begun. Never retry automatically.
        if (!error.status || error.status >= 500) {
          uncertain = true;
          setFeedback("admin_next_subscriptions_uncertain");
        } else {
          feedbackKey = "";
          fail(error, feedback);
        }
      } finally {
        sending = false;
        if (!disposed) updateBusy();
      }
      if (completed && !disposed) await load();
    });
    listen(form, "input", () => {
      if (!uncertain) {
        feedbackKey = "";
        feedback.textContent = "";
      }
      if (attempted) validate(false);
    });
    listen(search, "input", renderMembers);
    listen(historySelect, "change", updateHistoryDetails);
    listen(exportButton, "click", download);
    listen(document, "languagechange", () => {
      renderMembers();
      renderHistory();
      if (statusKey) status.textContent = t(statusKey);
      if (feedbackKey) feedback.textContent = t(feedbackKey, feedbackValues);
      if (attempted) validate(false);
    });
    load();
    return {
      canNavigate: () => !sending && !confirming,
      hasUnsavedChanges: () => sending || dirty(),
      dispose() {
        disposed = true;
        events.abort();
        root.replaceChildren();
      },
    };
  }
  window.DashboardNextSubscriptions = Object.freeze({ mount });
})();
