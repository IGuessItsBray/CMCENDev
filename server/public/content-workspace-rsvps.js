"use strict";
window.ContentWorkspaceRsvps = {
  create({
    getText,
    setWorkspaceTranslatedText,
    contentWorkspaceApiJson,
    getSelectedContentWorkspaceItem,
    canManageContentWorkspaceRsvps,
  }) {
    function setContentWorkspaceRsvpSummary(summary, accepted, declined) {
      summary.dataset.contentWorkspaceRsvpAccepted = String(accepted);
      summary.dataset.contentWorkspaceRsvpDeclined = String(declined);
      summary.textContent = getText(
        "content_workspace_rsvp_summary",
        "{accepted} accepted · {declined} declined",
        { accepted, declined },
      );
    }

    function getContentWorkspaceRsvpResponseLabel(response) {
      return response === "accepted"
        ? getText("content_workspace_rsvp_response_accepted", "Accepted")
        : getText("content_workspace_rsvp_response_declined", "Declined");
    }

    function createContentWorkspaceRsvpTable(rsvps) {
      const wrapper = document.createElement("div");
      wrapper.className = "content-workspace-rsvp-table-wrap";
      const table = document.createElement("table");
      table.className = "content-workspace-rsvp-table";
      const head = document.createElement("thead");
      const headerRow = document.createElement("tr");
      [
        ["content_workspace_rsvp_response", "Response"],
        ["content_workspace_rsvp_attendee", "Attendee"],
        ["email", "Email"],
        ["content_workspace_rsvp_unit_or_status", "Unit or status"],
        ["phone", "Phone number"],
      ].forEach(([key, label]) => {
        const heading = document.createElement("th");
        heading.scope = "col";
        setWorkspaceTranslatedText(heading, key, label);
        headerRow.append(heading);
      });
      head.append(headerRow);

      const body = document.createElement("tbody");
      rsvps.forEach((rsvp) => {
        const row = document.createElement("tr");
        const response = document.createElement("td");
        response.className = `is-${rsvp.response === "accepted" ? "accepted" : "declined"}`;
        response.textContent = getContentWorkspaceRsvpResponseLabel(
          rsvp.response,
        );
        const attendee = document.createElement("td");
        attendee.textContent =
          [rsvp.rank, rsvp.firstName, rsvp.lastName]
            .filter(Boolean)
            .join(" ") || "—";
        const email = document.createElement("td");
        email.textContent = rsvp.email || "—";
        const unitOrStatus = document.createElement("td");
        unitOrStatus.textContent = rsvp.unitOrStatus || "—";
        const phone = document.createElement("td");
        phone.textContent = rsvp.phone || "—";
        row.append(response, attendee, email, unitOrStatus, phone);
        body.append(row);
      });

      table.append(head, body);
      wrapper.append(table);
      return wrapper;
    }

    function createContentWorkspaceRsvpExport(item) {
      const download = document.createElement("button");
      download.type = "button";
      download.className = "admin-work-zone-button is-secondary is-compact";
      setWorkspaceTranslatedText(
        download,
        "event_rsvp_export",
        "Download RSVP CSV",
      );
      download.addEventListener("click", async () => {
        download.disabled = true;
        try {
          const response = await contentWorkspaceApiJson(
            `/api/events/${encodeURIComponent(item._id)}/rsvps.csv`,
            { parseJson: false },
          );
          if (!response.ok) throw new Error("Could not download RSVP CSV");
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "event-rsvps.csv";
          link.click();
          URL.revokeObjectURL(url);
        } catch {
          // The RSVP panel is intentionally silent when its access is unavailable.
        } finally {
          download.disabled = false;
        }
      });
      return download;
    }

    async function loadContentWorkspaceRsvps(item, panel, content) {
      try {
        const result = await contentWorkspaceApiJson(
          `/api/events/${encodeURIComponent(item._id)}/rsvps`,
        );
        if (
          String(getSelectedContentWorkspaceItem()?._id) !== String(item._id)
        ) {
          return;
        }

        const rsvps = Array.isArray(result.rsvps) ? result.rsvps : [];
        content.replaceChildren();
        if (!rsvps.length) {
          const empty = document.createElement("p");
          empty.className = "content-workspace-rsvp-empty";
          setWorkspaceTranslatedText(
            empty,
            "content_workspace_rsvp_empty",
            "No RSVP responses yet.",
          );
          content.append(empty);
          return;
        }

        const accepted = rsvps.filter(
          (rsvp) => rsvp.response === "accepted",
        ).length;
        const summary = document.createElement("p");
        summary.className = "content-workspace-rsvp-summary";
        setContentWorkspaceRsvpSummary(
          summary,
          accepted,
          rsvps.length - accepted,
        );
        const actions = document.createElement("div");
        actions.className = "content-workspace-rsvp-actions";
        actions.append(createContentWorkspaceRsvpExport(item));
        content.append(
          summary,
          createContentWorkspaceRsvpTable(rsvps),
          actions,
        );
      } catch (error) {
        if (
          String(getSelectedContentWorkspaceItem()?._id) === String(item._id)
        ) {
          if (error.status === 403) {
            panel.hidden = true;
            return;
          }
          content.replaceChildren();
          const message = document.createElement("p");
          message.className = "content-workspace-rsvp-empty";
          setWorkspaceTranslatedText(
            message,
            "content_workspace_rsvp_load_error",
            "Could not load RSVP responses.",
          );
          content.append(message);
        }
      }
    }

    function createContentWorkspaceRsvpPanel(item) {
      if (
        item.type !== "event" ||
        item.content?.rsvpEnabled !== true ||
        !canManageContentWorkspaceRsvps()
      ) {
        return null;
      }

      const panel = document.createElement("section");
      panel.className = "content-workspace-rsvp-panel";
      const heading = document.createElement("h2");
      setWorkspaceTranslatedText(
        heading,
        "content_workspace_rsvp_heading",
        "RSVPs",
      );
      const content = document.createElement("div");
      content.className = "content-workspace-rsvp-content";
      const loading = document.createElement("p");
      setWorkspaceTranslatedText(
        loading,
        "content_workspace_rsvp_loading",
        "Loading RSVP responses…",
      );
      content.append(loading);
      panel.append(heading, content);
      void loadContentWorkspaceRsvps(item, panel, content);
      return panel;
    }

    return { setContentWorkspaceRsvpSummary, createContentWorkspaceRsvpPanel };
  },
};
