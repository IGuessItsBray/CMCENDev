"use strict";
(() => {
  const auditActions = [
    ["", "audit_action_all"],
    ["audit.exported", "audit_action_audit_exported"],
    ["user.created", "audit_action_user_created"],
    ["user.invited", "audit_action_user_invited"],
    ["user.invitation_resent", "audit_action_user_invitation_resent"],
    [
      "user.invitation_delivery_failed",
      "audit_action_user_invitation_delivery_failed",
    ],
    ["user.login", "audit_action_user_login"],
    ["user.login_rejected", "audit_action_user_login_rejected"],
    ["user.login_mfa_required", "audit_action_mfa_required"],
    ["user.mfa_rejected", "audit_action_mfa_rejected"],
    ["diagnostic.request_failed", "audit_action_request_failed"],
    ["user.exported", "audit_action_user_exported"],
    ["user.mfa_reset", "audit_action_user_mfa_reset"],
    ["user.email_verified", "audit_action_email_verified"],
    ["user.ghost_verified", "audit_action_ghost_verified"],
    ["user.ghost_upgraded", "audit_action_ghost_upgraded"],
    ["user.password_reset_requested", "audit_action_password_reset_requested"],
    ["user.password_reset_completed", "audit_action_password_reset_completed"],
    ["contact.submitted", "audit_action_contact_submitted"],
    ["content.created", "audit_action_content_created"],
    ["content.published", "audit_action_content_published"],
    ["content.publish_scheduled", "audit_action_content_publish_scheduled"],
    [
      "content.publish_schedule_cancelled",
      "audit_action_content_publish_schedule_cancelled",
    ],
    ["content.rejected", "audit_action_content_rejected"],
    ["content.drafted", "audit_action_content_drafted"],
    ["content.deleted", "audit_action_content_deleted"],
    ["content.hidden", "audit_action_content_hidden"],
    ["content.restored", "audit_action_content_restored"],
    [
      "content.staff_content_updated",
      "audit_action_content_staff_content_updated",
    ],
    ["analytics.purged", "audit_action_analytics_purged"],
    ["config.access_requested", "audit_action_config_access_requested"],
    ["config.token_accepted", "audit_action_config_token_accepted"],
    ["config.token_rejected", "audit_action_config_token_rejected"],
    ["config.updated", "audit_action_config_updated"],
    ["media.deleted", "audit_action_media_deleted"],
    ["media.bulk_deleted", "audit_action_media_bulk_deleted"],
    [
      "migration.retirement.dry-run",
      "audit_action_migration_retirement_dry_run",
    ],
    ["migration.retirement.apply", "audit_action_migration_retirement_apply"],
    ["migration.comments.dry-run", "audit_action_migration_comments_dry_run"],
    ["migration.comments.apply", "audit_action_migration_comments_apply"],
    ["migration.lastPost.dry-run", "audit_action_migration_last_post_dry_run"],
    ["migration.lastPost.apply", "audit_action_migration_last_post_apply"],
    ["page.created", "audit_action_page_created"],
    ["page.updated", "audit_action_page_updated"],
    ["page.published", "audit_action_page_published"],
    ["page.status_changed", "audit_action_page_status_changed"],
    ["page.deleted", "audit_action_page_deleted"],
    ["navigation.created", "audit_action_navigation_created"],
    ["navigation.updated", "audit_action_navigation_updated"],
    ["navigation.deleted", "audit_action_navigation_deleted"],
    ["timer.created", "audit_action_timer_created"],
    ["timer.updated", "audit_action_timer_updated"],
    ["timer.deleted", "audit_action_timer_deleted"],
    ["role.created", "audit_action_role_created"],
    ["role.updated", "audit_action_role_updated"],
    ["role.permissions_changed", "audit_action_role_permissions_changed"],
    ["role.deleted", "audit_action_role_deleted"],
    ["translation.updated", "audit_action_translation_updated"],
    ["user.role_changed", "audit_action_role_changed"],
    ["user.custom_roles_changed", "audit_action_custom_roles_changed"],
    ["user.custom_role_added", "audit_action_custom_role_added"],
    ["user.custom_role_removed", "audit_action_custom_role_removed"],
    ["user.content_areas_changed", "audit_action_content_areas_changed"],
  ];

  const auditTargetTypes = [
    ["", "audit_target_all"],
    ["audit", "audit_target_audit"],
    ["analytics", "audit_target_analytics"],
    ["user", "audit_target_users"],
    ["request", "audit_target_requests"],
    ["event", "audit_target_events"],
    ["config", "audit_target_config"],
    ["migration", "audit_target_migration"],
    ["media", "audit_target_media"],
    ["page", "audit_target_pages"],
    ["navigation", "audit_target_navigation"],
    ["timer", "audit_target_timers"],
    ["role", "audit_target_roles"],
    ["translation", "audit_target_translations"],
    ["contactMessage", "audit_target_contact_messages"],
    ["retirementMessage", "audit_target_retirement_posts"],
    ["retirementComment", "audit_target_comments"],
  ];

  function mount({
    api,
    onDenied,
    root = document.getElementById("adminAuditBody"),
  }) {
    const CMCENUtils = window.CMCENUtils;
    const translate = (key, values) => window.translate(key, values);
    const auditDuplicateWindowMs = 60000;
    const lifecycle = new AbortController();
    let disposed = false,
      loading = false,
      exporting = false,
      failed = false;
    let request,
      generation = 0,
      logs = [],
      messageKey = "";
    const values = {
      user: "",
      action: "",
      targetType: "",
      startDate: "",
      endDate: "",
    };
    const controls = {},
      pickers = [],
      urls = new Set();
    function node(tag, key, className) {
      const el = document.createElement(tag);
      if (key) {
        el.dataset.i18n = key;
        el.textContent = translate(key);
      }
      if (className) el.className = className;
      return el;
    }
    function button(key, action) {
      const el = node("button", key);
      el.type = "button";
      el.addEventListener("click", action, { signal: lifecycle.signal });
      return el;
    }
    const form = node("form", null, "audit-log-filters");
    const fields = node("fieldset");
    const dateFields = [];
    function field(name, key, type, options) {
      const wrapper = node(
        type === "date" ? "div" : "label",
        null,
        "audit-log-field",
      );
      wrapper.append(node("span", key));
      if (type === "date" && window.CMCENDateTimePicker?.create) {
        dateFields.push({ wrapper, name, key });
      } else {
        const control = node(
          options ? "select" : "input",
          null,
          "cmcen-control",
        );
        control.name = name;
        control.id = `audit-${name}`;
        if (options)
          for (const [value, label] of options) {
            const option = node("option", label);
            option.value = value;
            control.append(option);
          }
        else {
          control.type = type;
          if (name === "user") control.maxLength = 100;
        }
        control.value = "";
        control.setAttribute("aria-label", translate(key));
        control.dataset.i18nAriaLabel = key;
        control.addEventListener(
          options ? "change" : "input",
          () => {
            values[name] = control.value;
          },
          { signal: lifecycle.signal },
        );
        controls[name] = control;
        wrapper.append(control);
      }
      fields.append(wrapper);
    }
    field("user", "audit_filter_user", "search");
    field("action", "audit_filter_action", null, auditActions);
    field("targetType", "audit_filter_target", null, auditTargetTypes);
    field("startDate", "audit_filter_start_date", "date");
    field("endDate", "audit_filter_end_date", "date");
    function renderDates() {
      pickers.splice(0).forEach((picker) => picker.destroy());
      for (const { wrapper, name, key } of dateFields) {
        const picker = window.CMCENDateTimePicker.create({
          name,
          date: values[name],
          includeTime: false,
          label: translate(key),
          placeholder: translate(key),
          onInput: ({ date }) => {
            values[name] = date;
          },
        });
        wrapper.append(picker);
        pickers.push(picker);
      }
    }
    const apply = button("audit_filter_submit", () => {});
    apply.type = "submit";
    const clear = button("admin_next_audit_clear", () => {
      if (exporting) return;
      for (const name of Object.keys(values)) {
        values[name] = "";
        if (controls[name]) controls[name].value = "";
      }
      renderDates();
      return load();
    });
    const exportButton = button("audit_export_csv", exportCsv);
    const actions = node("div", null, "audit-log-actions");
    actions.append(apply, clear, exportButton);
    fields.append(actions);
    form.append(fields);
    const heading = node("div", null, "audit-log-heading"),
      count = node("h2");
    const refresh = button("admin_refresh", () => {
      if (!exporting) return load();
    });
    heading.append(count, refresh);
    const status = node("p");
    status.setAttribute("role", "status");
    const exportHelp = node(
      "p",
      "admin_next_audit_export_help",
      "audit-log-help",
    );
    const list = node("div", null, "audit-log-list");
    root.replaceChildren(form, exportHelp, heading, status, list);
    renderDates();
    function update() {
      fields.disabled = exporting;
      exportButton.disabled = loading || exporting;
      refresh.disabled = loading || exporting;
      refresh.textContent = translate(
        failed ? "admin_next_retry" : "admin_refresh",
      );
      status.textContent = translate(
        exporting
          ? "admin_next_audit_exporting"
          : loading
            ? "audit_entries_loading"
            : messageKey || "admin_next_audit_ready",
      );
      status.hidden = !loading && !exporting && !messageKey;
      list.setAttribute("aria-busy", String(loading));
    }
    function render() {
      if (disposed) return;
      const visible = collapseDuplicateAuditLogs(logs);
      count.textContent = translate("audit_entries_heading", {
        count: visible.length,
      });
      list.replaceChildren(...visible.map(createAuditRow));
      if (!visible.length && !loading && !failed)
        list.append(node("p", "audit_entries_empty"));
      update();
    }
    function query() {
      if (
        values.startDate &&
        values.endDate &&
        values.startDate > values.endDate
      ) {
        messageKey = "admin_next_audit_dates_invalid";
        update();
        return null;
      }
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(values))
        if (value.trim()) params.set(key, value.trim());
      return params.toString();
    }
    async function load() {
      if (disposed || exporting) return;
      const params = query();
      if (params === null) return;
      request?.abort();
      request = new AbortController();
      const token = ++generation;
      loading = true;
      failed = false;
      messageKey = "";
      logs = [];
      render();
      try {
        const data = await api(`/api/audit-logs${params ? `?${params}` : ""}`, {
          signal: AbortSignal.any([request.signal, lifecycle.signal]),
        });
        if (disposed || token !== generation) return;
        if (!Array.isArray(data.logs))
          throw new Error("Invalid audit log response");
        logs = data.logs;
      } catch (error) {
        if (disposed || token !== generation) return;
        if (error.status === 403) {
          onDenied();
          return;
        }
        failed = true;
        messageKey = "audit_log_load_error";
      } finally {
        if (!disposed && token === generation) {
          loading = false;
          render();
        }
      }
    }
    async function exportCsv() {
      if (disposed || exporting || loading) return;
      const params = query();
      if (params === null) return;
      exporting = true;
      messageKey = "";
      update();
      try {
        const response = await api(
          `/api/audit-logs/export.csv${params ? `?${params}` : ""}`,
          { parseJson: false, timeoutMs: null, signal: lifecycle.signal },
        );
        const blob = await response.blob();
        if (disposed) return;
        const header = response.headers.get("Content-Disposition") || "";
        const filename =
          header.match(/filename="([^"\/]+)"/i)?.[1] ||
          `cmcen-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
        const url = URL.createObjectURL(blob);
        urls.add(url);
        const link = node("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => {
          if (urls.delete(url)) URL.revokeObjectURL(url);
        }, 1000);
        messageKey = "audit_action_audit_exported";
      } catch (error) {
        if (disposed) return;
        if (error.status === 403) {
          onDenied();
          return;
        }
        messageKey = "audit_log_export_error";
      } finally {
        if (!disposed) {
          exporting = false;
          update();
        }
      }
    }
    function formatAuditDate(value) {
      return CMCENUtils.formatDate(value, {
        timeStyle: "short",
      });
    }

    function getAuditActor(log) {
      const actor = log.actorSnapshot || {};

      return (
        actor.accountName ||
        actor.username ||
        actor.email ||
        translate("audit_actor_system")
      );
    }

    function formatLocalizedAuditValue(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return "";
      }

      const language = document.documentElement.lang || "en";
      const candidates = [value[language], value.en, value.fr];

      return String(
        candidates.find((item) => typeof item === "string" && item.trim()) ||
          "",
      );
    }

    function formatAuditValue(value) {
      if (value === undefined || value === null || value === "") {
        return translate("admin_none");
      }

      if (Array.isArray(value)) {
        return value.length
          ? value.map(formatAuditValue).join(", ")
          : translate("admin_none");
      }

      if (value && typeof value === "object") {
        const localizedValue = formatLocalizedAuditValue(value);

        if (localizedValue) {
          return localizedValue;
        }

        const preferredValue =
          value.label ||
          value.title ||
          value.name ||
          value.slug ||
          value.key ||
          value.route ||
          value.username ||
          value.email;

        if (preferredValue) {
          return formatAuditValue(preferredValue);
        }

        const entries = Object.entries(value)
          .filter(
            ([, item]) => item !== undefined && item !== null && item !== "",
          )
          .filter(([key]) => !["id", "_id", "__v"].includes(key));

        return entries.length
          ? entries
              .map(
                ([key, item]) =>
                  `${formatMetadataLabel(key)}: ${formatAuditValue(item)}`,
              )
              .join("; ")
          : translate("admin_none");
      }

      const text = String(value);

      if (text.length > 520) {
        return `${text.slice(0, 520)}... (${text.length} characters)`;
      }

      return text;
    }

    function getAuditTarget(log) {
      const target = log.targetSnapshot || {};

      const preferredValue =
        target.title ||
        target.key ||
        target.name ||
        target.slug ||
        target.accountName ||
        target.username ||
        target.email;

      if (preferredValue) {
        return formatAuditValue(preferredValue);
      }

      return log.targetType
        ? formatAuditTargetType(log.targetType)
        : translate("audit_unknown_target");
    }

    function getActorId(value) {
      if (!value) return "";

      if (typeof value === "string") return value;

      if (typeof value === "object") {
        return value._id || value.id || "";
      }

      return "";
    }

    function getTargetId(value) {
      if (!value) return "";

      if (typeof value === "string") return value;

      if (typeof value === "object") {
        return value._id || value.id || "";
      }

      return "";
    }

    function getAuditActorGroupKey(log) {
      const actorId = getActorId(log.actor);

      if (actorId) {
        return `id:${normalizeAuditIdentity(actorId)}`;
      }

      const actor = log.actorSnapshot || {};
      return `snapshot:${normalizeAuditIdentity(
        actor.accountName || actor.username || actor.email,
      )}`;
    }

    function getAuditTargetGroupKey(log) {
      const targetId = getTargetId(log.target);

      if (targetId) {
        return `id:${normalizeAuditIdentity(targetId)}`;
      }

      const target = log.targetSnapshot || {};
      return `snapshot:${normalizeAuditIdentity(
        target.slug || target.key || target.title || target.name,
      )}`;
    }

    function getAuditDuplicateGroupKey(log) {
      return [
        log.action || "",
        log.targetType || "",
        getAuditActorGroupKey(log),
        getAuditTargetGroupKey(log),
        JSON.stringify([log.actorSnapshot, log.targetSnapshot, log.metadata]),
      ].join("|");
    }

    function getAuditTimestamp(log) {
      const timestamp = new Date(log.createdAt).getTime();
      return Number.isNaN(timestamp) ? null : timestamp;
    }

    function collapseDuplicateAuditLogs(logs) {
      return logs.reduce((collapsed, log) => {
        const previous = collapsed.at(-1);
        const previousTimestamp = previous ? getAuditTimestamp(previous) : null;
        const timestamp = getAuditTimestamp(log);
        const matchesPrevious =
          previous &&
          previous._duplicateGroupKey === getAuditDuplicateGroupKey(log) &&
          previousTimestamp !== null &&
          timestamp !== null &&
          previousTimestamp - timestamp >= 0 &&
          previousTimestamp - timestamp <= auditDuplicateWindowMs;

        if (matchesPrevious) {
          previous.duplicateCount = (previous.duplicateCount || 1) + 1;
          return collapsed;
        }

        collapsed.push({
          ...log,
          duplicateCount: 1,
          _duplicateGroupKey: getAuditDuplicateGroupKey(log),
        });
        return collapsed;
      }, []);
    }

    function normalizeAuditIdentity(value) {
      return String(value || "")
        .trim()
        .toLowerCase();
    }

    function hasSameUserIdentity(actor, target) {
      const actorId = normalizeAuditIdentity(getActorId(actor));
      const targetId = normalizeAuditIdentity(getTargetId(target));

      if (actorId && targetId) {
        return actorId === targetId;
      }

      return false;
    }

    function shouldRenderAuditTarget(log) {
      if (log.targetType !== "user") {
        return true;
      }

      return !hasSameUserIdentity(log.actor, log.target);
    }

    function getAuditTargetHref(log) {
      if (["content.deleted", "content.hidden"].includes(log.action)) {
        return "";
      }

      const targetId = getTargetId(log.target);
      const snapshot = log.targetSnapshot || {};

      if (log.targetType === "event" && targetId) {
        return log.action === "content.published"
          ? `/event?id=${encodeURIComponent(targetId)}`
          : `/content-workspace?id=${encodeURIComponent(targetId)}`;
      }

      if (log.targetType === "retirementMessage" && targetId) {
        return `/retirement-message?id=${encodeURIComponent(targetId)}`;
      }

      if (log.targetType === "retirementComment") {
        const messageId = getTargetId(snapshot.retirementMessage);

        if (messageId) {
          return `/retirement-message?id=${encodeURIComponent(messageId)}`;
        }
      }

      return "";
    }

    function formatAuditAction(action) {
      const translationKey = auditActions.find(
        (item) => item[0] === action,
      )?.[1];
      return translationKey
        ? translate(translationKey)
        : titleCaseAuditIdentifier(action);
    }

    function formatAuditTargetType(targetType) {
      const translationKey = auditTargetTypes.find(
        (item) => item[0] === targetType,
      )?.[1];
      return translationKey
        ? translate(translationKey)
        : titleCaseAuditIdentifier(targetType) ||
            translate("audit_target_target");
    }

    function titleCaseAuditIdentifier(value) {
      return String(value || "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[._-]+/g, " ")
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase());
    }

    function getAuditActionClass(action) {
      return `is-${String(action || "unknown")
        .replace(/\./g, "-")
        .replace(/[^a-z0-9-]/gi, "")}`;
    }

    function formatMetadataLabel(key) {
      const knownLabels = {
        previousRole: "audit_metadata_previous_role",
        newRole: "audit_metadata_new_role",
        previousContentAreas: "audit_metadata_previous_content_areas",
        newContentAreas: "audit_metadata_new_content_areas",
        commentContent: "audit_metadata_comment_content",
        deletedBy: "audit_metadata_deleted_by",
        rejectionReason: "audit_metadata_rejection_reason",
        status: "audit_metadata_status",
        source: "audit_metadata_source",
        method: "audit_metadata_method",
        methods: "audit_metadata_methods",
        mfaMethod: "audit_metadata_mfa_method",
        previousMfa: "audit_metadata_previous_mfa",
        previousMethods: "audit_metadata_previous_methods",
        previousPasskeyCount: "audit_metadata_previous_passkey_count",
        previousTotpEnabled: "audit_metadata_previous_totp_enabled",
        ipAddress: "audit_metadata_ip_address",
        deletedComments: "audit_metadata_deleted_comments",
        changedLanguages: "audit_metadata_changed_languages",
        previousValues: "audit_metadata_previous_values",
        newValues: "audit_metadata_new_values",
        previousPage: "audit_metadata_previous_page",
        newPage: "audit_metadata_new_page",
        previousNavigation: "audit_metadata_previous_navigation",
        newNavigation: "audit_metadata_new_navigation",
        previousPermissions: "audit_metadata_previous_permissions",
        newPermissions: "audit_metadata_new_permissions",
        addedPermissions: "audit_metadata_added_permissions",
        removedPermissions: "audit_metadata_removed_permissions",
        previousRoles: "audit_metadata_previous_roles",
        newRoles: "audit_metadata_new_roles",
        role: "audit_metadata_role",
        permissions: "audit_metadata_permissions",
        format: "audit_metadata_format",
        entryCount: "audit_metadata_entry_count",
        action: "audit_filter_action",
        targetType: "audit_filter_target",
        user: "audit_filter_user",
        startDate: "audit_filter_start_date",
        endDate: "audit_filter_end_date",
        userCount: "audit_metadata_user_count",
        includedRoles: "audit_metadata_included_roles",
        includedAccountTypes: "audit_metadata_included_account_types",
        excludedRoles: "audit_metadata_excluded_roles",
        excludedAccountTypes: "audit_metadata_excluded_account_types",
        deletedCount: "audit_metadata_deleted_count",
        skippedCount: "audit_metadata_skipped_count",
        missingCount: "audit_metadata_missing_count",
        deletedKeys: "audit_metadata_deleted_keys",
        skippedKeys: "audit_metadata_skipped_keys",
        missingKeys: "audit_metadata_missing_keys",
        output: "audit_metadata_output",
        mode: "audit_metadata_mode",
        limit: "audit_metadata_limit",
        exitCode: "audit_metadata_exit_code",
        route: "audit_metadata_route",
        reason: "audit_metadata_reason",
        hasSubmittedToken: "audit_metadata_has_submitted_token",
        keys: "audit_metadata_keys",
        manifestPath: "audit_metadata_manifest_path",
        retirementMessages: "audit_metadata_retirement_messages",
        lastPostMessages: "audit_metadata_last_post_messages",
        comments: "audit_metadata_comments",
      };

      if (knownLabels[key]) {
        return translate(knownLabels[key]);
      }

      return String(key || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
    }

    function formatMetadataValue(value) {
      return formatAuditValue(value);
    }

    function normalizeDisplayIp(value) {
      const text = String(value || "").trim();

      if (!text) {
        return "";
      }

      if (text.startsWith("::ffff:")) {
        return text.slice(7);
      }

      if (text === "::1") {
        return "127.0.0.1";
      }

      return text;
    }

    function getAuditIpDisplay(metadata = {}) {
      const values = [
        metadata.ipAddress,
        ...(Array.isArray(metadata.ipAddresses) ? metadata.ipAddresses : []),
      ];
      const normalized = [];

      values.forEach((value) => {
        const displayValue = normalizeDisplayIp(value);

        if (displayValue && !normalized.includes(displayValue)) {
          normalized.push(displayValue);
        }

        if (
          String(value || "").trim() === "::1" &&
          !normalized.includes("::1")
        ) {
          normalized.push("::1");
        }
      });

      if (normalized.includes("127.0.0.1") && normalized.includes("::1")) {
        return "127.0.0.1 (::1)";
      }

      return normalized.join(", ");
    }

    function getAuditMetadataEntries(metadata = {}) {
      const ipDisplay = getAuditIpDisplay(metadata);

      return Object.entries(metadata)
        .filter(
          ([key, value]) =>
            key !== "ipAddresses" &&
            value !== undefined &&
            value !== null &&
            value !== "",
        )
        .map(([key, value]) =>
          key === "ipAddress" && ipDisplay ? [key, ipDisplay] : [key, value],
        );
    }

    function createAuditRow(log) {
      const item = document.createElement("article");
      item.className = `admin-post-item audit-log-entry ${getAuditActionClass(log.action)}`;

      const header = document.createElement("div");
      header.className = "admin-post-header";

      const title = document.createElement("strong");
      title.textContent = formatAuditAction(log.action);

      const badges = document.createElement("div");
      badges.className = "admin-post-badges";

      const type = document.createElement("span");
      type.className = `admin-post-type type-${log.targetType || "content"}`;
      type.textContent = formatAuditTargetType(log.targetType);

      badges.append(type);

      if (log.duplicateCount > 1) {
        const duplicateCount = document.createElement("span");
        duplicateCount.className = "audit-log-duplicate-count";
        duplicateCount.textContent = `×${log.duplicateCount}`;
        duplicateCount.setAttribute("aria-label", `×${log.duplicateCount}`);
        badges.append(duplicateCount);
      }

      header.append(title, badges);

      const details = document.createElement("p");
      details.className = "admin-post-details";
      details.append(
        document.createTextNode(
          `${formatAuditDate(log.createdAt)} · ${translate("audit_by_actor", {
            actor: getAuditActor(log),
          })}`,
        ),
      );

      if (shouldRenderAuditTarget(log)) {
        details.append(document.createTextNode(" · "));

        const targetHref = getAuditTargetHref(log);
        const targetLabel = getAuditTarget(log);

        if (targetHref) {
          const targetLink = document.createElement("a");
          targetLink.href = targetHref;
          targetLink.textContent = targetLabel;
          details.append(targetLink);
        } else {
          details.append(document.createTextNode(targetLabel));
        }
      }

      item.append(header, details);

      const metadata = log.metadata || {};
      const metadataEntries = getAuditMetadataEntries(metadata);

      if (metadataEntries.length) {
        const metadataList = document.createElement("div");
        metadataList.className = "audit-log-metadata";

        metadataEntries.forEach(([key, value]) => {
          const chip = document.createElement("span");
          chip.className = "audit-log-metadata-chip";
          chip.dataset.metadataKey = key;

          const label = document.createElement("strong");
          label.textContent = `${formatMetadataLabel(key)}:`;

          const valueText = document.createElement("span");
          valueText.className = "audit-log-metadata-value";
          valueText.textContent = formatMetadataValue(value);

          chip.append(label, valueText);
          metadataList.append(chip);
        });

        item.append(metadataList);
      }

      return item;
    }

    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        return load();
      },
      { signal: lifecycle.signal },
    );
    document.addEventListener(
      "languagechange",
      () => {
        if (disposed) return;
        renderDates();
        render();
      },
      { signal: lifecycle.signal },
    );
    const ready = load();
    return {
      ready,
      canNavigate: () => !exporting,
      hasUnsavedChanges: () => exporting,
      dispose() {
        disposed = true;
        generation++;
        request?.abort();
        lifecycle.abort();
        pickers.forEach((picker) => picker.destroy());
        for (const url of urls) URL.revokeObjectURL(url);
        urls.clear();
        logs = [];
        root.replaceChildren();
      },
    };
  }
  window.AuditLogController = { mount };
})();
