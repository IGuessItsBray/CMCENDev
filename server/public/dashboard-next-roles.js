"use strict";

(() => {
  const t = (key, values) => window.translate(key, values);
  const permissionKey = (key, part) =>
    `admin_next_permission_${key.replaceAll(".", "_")}_${part}`;
  function node(tag, key, className) {
    const element = document.createElement(tag);
    if (key) {
      element.dataset.i18n = key;
      element.textContent = t(key);
    }
    if (className) element.className = className;
    return element;
  }
  function button(key, action, className) {
    const element = node("button", key, className);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
  }
  function mount({ api, onDenied, onRolesChanged }) {
    const root = document.getElementById("adminRolesBody");
    const create = document.getElementById("adminRolesNew");
    const events = new AbortController();
    let roles = [],
      catalog = [],
      selected = null;
    let disposed = false,
      busy = false,
      confirming = false,
      loaded = false;
    let form,
      fields,
      getValues,
      save,
      baseline = "",
      attempted = false;
    let validateForm = null;
    let statusKey = "",
      feedbackKey = "";
    const dirty = () =>
      Boolean(form && JSON.stringify(getValues()) !== baseline);
    const listen = (element, type, fn) =>
      element.addEventListener(type, fn, { signal: events.signal });
    const sidebar = node("aside", null, "admin-users-list-panel");
    const status = node("p", null, "admin-users-feedback");
    status.setAttribute("role", "status");
    const retry = button("admin_next_retry", load);
    retry.hidden = true;
    const list = node("div", null, "admin-users-list");
    const detail = node("div", null, "admin-users-detail");
    const feedback = node("p", null, "admin-users-feedback");
    feedback.setAttribute("role", "status");
    sidebar.append(status, retry, list);
    root.replaceChildren(sidebar, detail);

    function updateBusy() {
      create.disabled = busy || confirming || !loaded;
      if (fields) fields.disabled = busy || confirming;
      if (save) save.disabled = busy || confirming || (selected && !dirty());
      list.querySelectorAll("button").forEach((item) => {
        item.disabled = busy || confirming;
      });
    }
    function renderList() {
      list.replaceChildren(
        ...roles.map((role) => {
          const item = button(
            null,
            (event) => select(role, event.detail === 0),
            "admin-user-row",
          );
          if (role._id === selected?._id)
            item.setAttribute("aria-current", "true");
          const title = node("strong");
          const swatch = node("span", null, "admin-role-swatch");
          swatch.style.backgroundColor = role.color;
          swatch.setAttribute("aria-hidden", "true");
          const name = node("span");
          name.textContent = role.name;
          title.append(swatch, name);
          const count = node("span", null, "admin-users-muted");
          count.textContent = t("admin_next_roles_count", {
            count: role.permissions.filter((key) => key !== "review.bypass")
              .length,
          });
          item.append(title, count);
          return item;
        }),
      );
      updateBusy();
    }
    async function canLeave() {
      if (busy || confirming || disposed) return false;
      if (!dirty()) return true;
      confirming = true;
      updateBusy();
      try {
        return (
          (await window.CMCENModal.confirm(t("admin_next_roles_discard"), {
            title: t("content_workspace_unsaved_changes_title"),
            confirmText: t("content_workspace_discard_changes"),
            destructive: true,
          })) && !disposed
        );
      } finally {
        confirming = false;
        if (!disposed) updateBusy();
      }
    }
    async function select(role, focus = false) {
      if (role && role._id === selected?._id) return;
      if (!(await canLeave())) return;
      edit(role);
      if (focus) detail.querySelector("input")?.focus();
    }
    function fail(error, target) {
      if (disposed) return;
      if (error.status === 403) {
        onDenied();
        return;
      }
      target.textContent = error.message || t("admin_next_roles_error");
    }
    async function load() {
      if (busy || disposed) return;
      busy = true;
      retry.hidden = true;
      statusKey = "admin_next_roles_loading";
      status.textContent = t(statusKey);
      updateBusy();
      try {
        const data = await api("/api/admin/roles", { signal: events.signal });
        if (disposed) return;
        roles = data.roles;
        catalog = data.permissionCatalog;
        loaded = true;
        statusKey = roles.length ? "" : "admin_next_roles_empty";
        status.textContent = statusKey ? t(statusKey) : "";
        detail.replaceChildren(
          node("p", "admin_next_roles_select", "admin-users-empty"),
        );
        renderList();
      } catch (error) {
        statusKey = "";
        fail(error, status);
        retry.hidden = false;
      } finally {
        busy = false;
        if (!disposed) updateBusy();
      }
    }
    function edit(role) {
      selected = role;
      attempted = false;
      feedbackKey = "";
      feedback.textContent = "";
      form = node("form", null, "admin-users-form");
      form.noValidate = true;
      fields = node("fieldset", null, "admin-users-fields");
      const heading = node("h2", role ? null : "admin_next_roles_new");
      if (role) heading.textContent = role.name;
      detail.replaceChildren(heading, form);
      form.append(fields, feedback);
      const controls = {};
      for (const [name, attributes] of Object.entries({
        name: { required: true, maxLength: 80 },
        slug: { maxLength: 100 },
        color: { type: "color" },
        description: { type: "textarea", maxLength: 240, rows: 3 },
      })) {
        const field = window.CMCENForms.createField({
          id: `roles-${name}`,
          name,
          labelKey: `admin_next_roles_${name}`,
          ...attributes,
          value: role?.[name] || (name === "color" ? "#4f46e5" : ""),
        });
        fields.append(field.field);
        controls[name] = field.control;
        if (name === "slug") {
          const hint = node(
            "small",
            "admin_next_roles_slug_hint",
            "admin-users-muted",
          );
          hint.id = "roles-slug-hint";
          field.control.setAttribute("aria-describedby", hint.id);
          field.field.append(hint);
        }
      }
      const permissions = node("div", null, "admin-role-permissions");
      const groups = new Map();
      const checkboxes = [];
      for (const permission of catalog) {
        let group = groups.get(permission.group);
        if (!group) {
          group = node("fieldset", null, "cmcen-field-group");
          const groupKey = `admin_next_permission_group_${permission.group.toLowerCase().replaceAll(" ", "_")}`;
          const legend = node("legend");
          legend.dataset.permissionLabel = groupKey;
          legend.dataset.fallback = permission.group;
          group.append(legend);
          groups.set(permission.group, group);
          permissions.append(group);
        }
        const label = node("label", null, "admin-role-permission");
        const input = node("input");
        input.type = "checkbox";
        input.name = "permissions";
        input.value = permission.key;
        input.checked = role?.permissions.includes(permission.key) || false;
        // The permission resolver never grants this through custom roles.
        input.disabled = permission.key === "review.bypass";
        checkboxes.push(input);
        const text = node("span");
        const title = node("span");
        title.dataset.permissionLabel = permissionKey(permission.key, "label");
        title.dataset.fallback = permission.label;
        const description = node("small");
        description.dataset.permissionLabel = input.disabled
          ? "admin_next_roles_bypass"
          : permissionKey(permission.key, "description");
        description.dataset.fallback = permission.description;
        text.append(title, description);
        label.append(input, text);
        group.append(label);
      }
      fields.append(permissions);
      getValues = () => ({
        name: controls.name.value,
        slug: controls.slug.value,
        color: controls.color.value,
        description: controls.description.value,
        permissions: checkboxes
          .filter((input) => input.checked)
          .map((input) => input.value)
          .sort(),
      });
      baseline = JSON.stringify(getValues());
      const actions = node("div", null, "admin-users-actions");
      save = node(
        "button",
        role ? "admin_next_roles_save" : "admin_next_roles_create",
        "admin-users-save",
      );
      save.type = "submit";
      actions.append(save);
      if (role)
        actions.append(
          button("admin_next_roles_delete", remove, "admin-users-danger"),
        );
      fields.append(actions);
      const validate = (focus = true) =>
        window.CMCENForms.validate(form, {
          focus,
          errors: controls.name.value.trim()
            ? []
            : [
                {
                  control: controls.name,
                  message: t("validation_field_required"),
                },
              ],
        });
      validateForm = validate;
      form.addEventListener("input", () => {
        feedbackKey = "";
        feedback.textContent = "";
        if (attempted) validate(false);
        updateBusy();
      });
      form.addEventListener("change", updateBusy);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy || confirming || disposed) return;
        attempted = true;
        if (!validate() || (role && !dirty())) return;
        busy = true;
        updateBusy();
        feedbackKey = "";
        feedback.textContent = "";
        try {
          const data = await api(
            role
              ? `/api/admin/roles/${encodeURIComponent(role._id)}`
              : "/api/admin/roles",
            {
              method: role ? "PATCH" : "POST",
              body: getValues(),
              signal: events.signal,
            },
          );
          if (disposed) return;
          roles = data.roles;
          onRolesChanged(roles);
          edit(data.role);
          statusKey = "";
          status.textContent = "";
          feedbackKey = role
            ? "admin_next_roles_saved"
            : "admin_next_roles_created";
          feedback.textContent = t(feedbackKey);
          CMCENUtils.showToast(t(feedbackKey), { color: "success" });
        } catch (error) {
          fail(error, feedback);
        } finally {
          busy = false;
          if (!disposed) {
            updateBusy();
            if (feedbackKey) detail.querySelector("input")?.focus();
          }
        }
      });
      translatePermissions();
      renderList();
    }
    async function remove() {
      if (busy || confirming || disposed || !selected) return;
      const role = selected;
      confirming = true;
      updateBusy();
      let accepted;
      try {
        accepted = await window.CMCENModal.confirm(
          t("admin_next_roles_delete_confirm", { name: role.name }),
          {
            title: t("admin_next_roles_delete"),
            confirmText: t("admin_next_roles_delete"),
            destructive: true,
          },
        );
      } finally {
        confirming = false;
        if (!disposed) updateBusy();
      }
      if (!accepted || disposed) return;
      busy = true;
      updateBusy();
      feedbackKey = "";
      feedback.textContent = "";
      try {
        const data = await api(
          `/api/admin/roles/${encodeURIComponent(role._id)}`,
          { method: "DELETE", signal: events.signal },
        );
        if (disposed) return;
        roles = data.roles;
        onRolesChanged(roles);
        selected = form = fields = getValues = save = null;
        validateForm = null;
        baseline = "";
        detail.replaceChildren(
          node("p", "admin_next_roles_select", "admin-users-empty"),
        );
        statusKey = roles.length ? "" : "admin_next_roles_empty";
        status.textContent = statusKey ? t(statusKey) : "";
        renderList();
        CMCENUtils.showToast(t("admin_next_roles_deleted"), {
          color: "success",
        });
      } catch (error) {
        fail(error, feedback);
      } finally {
        busy = false;
        if (!disposed) {
          updateBusy();
          if (!form) create.focus();
        }
      }
    }
    function translatePermissions() {
      detail.querySelectorAll("[data-permission-label]").forEach((label) => {
        const translated = t(label.dataset.permissionLabel);
        label.textContent =
          translated === label.dataset.permissionLabel
            ? label.dataset.fallback
            : translated;
      });
    }
    listen(create, "click", () => select(null, true));
    listen(document, "languagechange", () => {
      renderList();
      translatePermissions();
      if (statusKey) status.textContent = t(statusKey);
      if (feedbackKey) feedback.textContent = t(feedbackKey);
      if (attempted) validateForm?.(false);
    });
    load();
    return {
      canNavigate: () => !busy && !confirming,
      hasUnsavedChanges: () => busy || dirty(),
      dispose() {
        disposed = true;
        events.abort();
        root.replaceChildren();
      },
    };
  }
  window.DashboardNextRoles = Object.freeze({ mount });
})();
