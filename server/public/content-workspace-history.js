"use strict";
window.ContentWorkspaceHistory = {
  create({
    getText,
    setWorkspaceTranslatedText,
    contentWorkspaceApiJson,
    getSelectedContentWorkspaceItem,
    formatWorkspaceDate,
  }) {
    function getRevisionActor(revision) {
      const actor = revision?.actorSnapshot || {};
      return (
        actor.accountName ||
        actor.username ||
        getText("unknown_user", "Unknown user")
      );
    }

    function getRevisionFieldTranslation(field) {
      return {
        title: ["content_workspace_field_title", "Title"],
        location: ["content_workspace_field_location", "Location"],
        description: ["content_workspace_field_description", "Description"],
        registration: [
          "content_workspace_field_registration",
          "Registration details",
        ],
        message: ["content_workspace_field_message", "Message"],
        content: ["content_workspace_field_content", "Story"],
        imagePath: ["content_workspace_event_image_url", "Event image URL"],
        photoUrl: ["content_workspace_photo_url", "Full photo URL"],
        photoDisplayUrl: [
          "content_workspace_display_photo_url",
          "Display photo URL",
        ],
        imageUrl: ["content_workspace_image_url", "Full image URL"],
        imageDisplayUrl: [
          "content_workspace_display_image_url",
          "Display image URL",
        ],
        status: ["content_workspace_status", "Status"],
      }[field];
    }

    function setRevisionFieldLabel(element, field) {
      const translation = getRevisionFieldTranslation(field);

      if (translation) {
        setWorkspaceTranslatedText(element, ...translation);
        return;
      }

      element.textContent = field;
    }

    function getRevisionChanges(revision) {
      const before = revision.before || {};
      const after = revision.after || {};
      const fields = new Set([
        ...(Array.isArray(revision.fields) ? revision.fields : []),
        ...Object.keys(before),
        ...Object.keys(after),
      ]);

      return [...fields]
        .map((field) => ({
          field,
          before: String(before[field] || ""),
          after: String(after[field] || ""),
        }))
        .filter((change) => change.before !== change.after);
    }

    function createRevisionValue(value) {
      const element = document.createElement("p");
      element.className = "content-workspace-revision-value";

      if (value) {
        element.textContent = value;
      } else {
        setWorkspaceTranslatedText(
          element,
          "content_workspace_empty_value",
          "No value",
        );
        element.classList.add("is-empty");
      }

      return element;
    }

    function createRevisionChanges(revision) {
      const changes = document.createElement("div");
      changes.className = "content-workspace-revision-changes";
      const changedFields = getRevisionChanges(revision);

      if (!changedFields.length) {
        const empty = document.createElement("p");
        empty.className = "content-workspace-revision-empty";
        setWorkspaceTranslatedText(
          empty,
          "content_workspace_no_text_changes",
          "No public copy changed in this revision.",
        );
        changes.append(empty);
        return changes;
      }

      changedFields.forEach((change) => {
        const section = document.createElement("section");
        section.className = "content-workspace-revision-change";
        const heading = document.createElement("h3");
        setRevisionFieldLabel(heading, change.field);

        const values = document.createElement("div");
        values.className = "content-workspace-revision-change-values";

        const before = document.createElement("div");
        before.className = "content-workspace-revision-change-value is-before";
        const beforeLabel = document.createElement("span");
        beforeLabel.className = "content-workspace-revision-change-label";
        setWorkspaceTranslatedText(
          beforeLabel,
          "content_workspace_before",
          "Before",
        );
        before.append(beforeLabel, createRevisionValue(change.before));

        const arrow = document.createElement("span");
        arrow.className = "content-workspace-revision-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";

        const after = document.createElement("div");
        after.className = "content-workspace-revision-change-value is-after";
        const afterLabel = document.createElement("span");
        afterLabel.className = "content-workspace-revision-change-label";
        setWorkspaceTranslatedText(
          afterLabel,
          "content_workspace_after",
          "After",
        );
        after.append(afterLabel, createRevisionValue(change.after));

        values.append(before, arrow, after);
        section.append(heading, values);
        changes.append(section);
      });

      return changes;
    }

    async function loadRevisionHistory(item, container) {
      container.setAttribute("aria-busy", "true");
      const loading = document.createElement("span");
      loading.className = "visually-hidden";
      setWorkspaceTranslatedText(
        loading,
        "content_workspace_history_loading",
        "Loading revision history…",
      );
      container.replaceChildren(loading);

      try {
        const data = await contentWorkspaceApiJson(
          `/api/admin/content/${encodeURIComponent(item.type)}/${encodeURIComponent(item._id)}/revisions`,
        );

        if (getSelectedContentWorkspaceItem()?._id !== item._id) return false;

        container.replaceChildren();
        const revisions = Array.isArray(data.revisions) ? data.revisions : [];

        if (!revisions.length) {
          setWorkspaceTranslatedText(
            container,
            "content_workspace_history_empty",
            "No staff revisions have been recorded yet.",
          );
          return true;
        }

        revisions.forEach((revision) => {
          const details = document.createElement("details");
          details.className = "content-workspace-revision";
          const summary = document.createElement("summary");
          summary.className = "content-workspace-revision-summary";
          const language = document.createElement("span");
          language.className = "content-workspace-revision-language";
          if (revision.language === "en" || revision.language === "fr") {
            setWorkspaceTranslatedText(
              language,
              revision.language === "en" ? "language_en" : "language_fr",
              revision.language === "en" ? "English" : "French",
            );
          } else {
            language.textContent = getText(
              "content_workspace_history",
              "Revision history",
            );
          }

          const actor = document.createElement("span");
          actor.className = "content-workspace-revision-actor";
          const actorLabel = document.createElement("span");
          actorLabel.className = "content-workspace-revision-actor-label";
          setWorkspaceTranslatedText(
            actorLabel,
            "content_workspace_edited_by",
            "Edited by",
          );
          actor.append(
            actorLabel,
            document.createTextNode(` ${getRevisionActor(revision)}`),
          );

          const date = document.createElement("span");
          date.className = "content-workspace-revision-date";
          date.dataset.revisionCreatedAt = String(revision.createdAt || "");
          date.textContent = formatWorkspaceDate(revision.createdAt);

          summary.append(language, actor, date);

          const body = document.createElement("div");
          body.className = "content-workspace-revision-body";
          const changesHeading = document.createElement("h3");
          setWorkspaceTranslatedText(
            changesHeading,
            "content_workspace_changes",
            "Changes",
          );
          body.append(changesHeading, createRevisionChanges(revision));

          if (revision.note) {
            const note = document.createElement("section");
            note.className = "content-workspace-revision-note";
            const noteHeading = document.createElement("h3");
            setWorkspaceTranslatedText(
              noteHeading,
              "content_workspace_revision_note",
              "Editorial note",
            );
            const noteText = document.createElement("p");
            noteText.textContent = revision.note;
            note.append(noteHeading, noteText);
            body.append(note);
          }

          details.append(summary, body);
          container.append(details);
        });
        return true;
      } catch (error) {
        if (getSelectedContentWorkspaceItem()?._id !== item._id) return false;
        container.textContent = error.message;
        return false;
      } finally {
        if (getSelectedContentWorkspaceItem()?._id === item._id) {
          container.setAttribute("aria-busy", "false");
        }
      }
    }

    return { loadRevisionHistory };
  },
};
