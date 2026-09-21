"use strict";

(() => {
  const t = (key, values) => window.translate(key, values);
  const nameOf = (user) =>
    CMCENUtils.getUserDisplayName(user, t("unknown_user"));
  const actions = window.DashboardNextUserActions;
  function node(tag, key, className) {
    const element = document.createElement(tag);
    if (key) {
      element.dataset.i18n = key;
      element.textContent = t(key);
    }
    if (className) element.className = className;
    return element;
  }
  function button(key, fn) {
    const element = node("button", key);
    element.type = "button";
    element.addEventListener("click", fn);
    return element;
  }
  function field(parent, name, key, attributes = {}) {
    const result = window.CMCENForms.createField({
      id: `users-${name}`,
      name,
      labelKey: key,
      ...attributes,
    });
    parent.append(result.field);
    return result.control;
  }
  function choices(parent, name, key, options, selected, disabled = false) {
    const group = node("fieldset", null, "cmcen-field-group");
    group.disabled = disabled;
    const legend = node("legend", key);
    function render(nextOptions, nextSelected) {
      group.replaceChildren(legend);
      for (const option of nextOptions) {
        const label = node("label", null, "cmcen-choice");
        const input = node("input");
        Object.assign(input, {
          type: "checkbox",
          name,
          value: option.value,
          checked: nextSelected.includes(option.value),
        });
        const title = node("span", option.labelKey, "cmcen-field-label");
        if (!option.labelKey) title.textContent = option.label;
        label.append(input, title);
        group.append(label);
      }
    }
    render(options, selected);
    parent.append(group);
    const values = () =>
      [...group.querySelectorAll("input:checked")].map((input) => input.value);
    values.update = render;
    return values;
  }
  const roleOptions = (roles) =>
    roles.map((role) => ({ value: role, labelKey: `role_${role}` }));
  const typeOptions = ["member", "invited", "ghost"].map((type) => ({
    value: type,
    labelKey: `admin_users_account_${type}`,
  }));

  function mount({ api, permissions, user: actor, navigate, onDenied }) {
    const root = document.getElementById("adminUsersBody");
    const invite = document.getElementById("adminUsersInvite");
    const events = new AbortController();
    let disposed = false,
      busy = false,
      confirming = false;
    let users = [],
      catalog = null,
      nextCursor = "",
      selected = null;
    let listRequest, detailRequest, contentRequest, timer;
    let listVersion = 0,
      detailVersion = 0;
    let form = null,
      getValues = null,
      baseline = "",
      save = null,
      feedback = null;
    let attempted = false,
      mode = "empty";
    let detailLabels = [],
      listPending = false,
      listError = false;
    let latestRoles = null,
      customRoleChoices = null;
    function updateRoles(roles) {
      if (disposed) return;
      latestRoles = roles;
      if (catalog) catalog.customRoles = roles;
      if (!customRoleChoices) return;
      const ids = new Set(roles.map((role) => role._id));
      const retained = (values) => values.filter((id) => ids.has(id)).sort();
      const values = retained(customRoleChoices());
      const previous = JSON.parse(baseline);
      previous.customRoleIds = retained(previous.customRoleIds);
      baseline = JSON.stringify(previous);
      customRoleChoices.update(
        roles.map((role) => ({ value: role._id, label: role.name })),
        values,
      );
      updateBusy();
    }
    const dynamicText = (element, label) => {
      const update = () => {
        element.textContent = label();
      };
      detailLabels.push(update);
      update();
    };
    const dirty = () =>
      Boolean(form && JSON.stringify(getValues()) !== baseline);
    const listen = (element, type, fn) =>
      element.addEventListener(type, fn, { signal: events.signal });
    const toast = (key) => CMCENUtils.showToast(t(key), { color: "success" });
    const fail = (element, error) => {
      if (!disposed && element)
        element.textContent = error.message || t("admin_next_users_error");
    };
    async function canLeave() {
      if (busy || disposed || confirming) return false;
      if (!dirty()) return true;
      confirming = true;
      try {
        return (
          (await window.CMCENModal.confirm(t("admin_next_users_discard"), {
            title: t("content_workspace_unsaved_changes_title"),
            confirmText: t("content_workspace_discard_changes"),
            destructive: true,
          })) && !disposed
        );
      } finally {
        confirming = false;
      }
    }
    function updateBusy() {
      invite.disabled = busy || !catalog;
      if (form) form.querySelector(".admin-users-fields").disabled = busy;
      if (save) save.disabled = busy || !dirty();
      detail
        .querySelectorAll("button[data-account-action]")
        .forEach((control) => {
          control.disabled = busy;
        });
      list.querySelectorAll("button").forEach((control) => {
        control.disabled = busy;
      });
    }
    const sidebar = node("aside", null, "admin-users-list-panel");
    const search = field(sidebar, "search", "admin_users_search_label", {
      type: "search",
      maxLength: 120,
    });
    const filters = node("div", null, "admin-users-filters");
    const roleFilter = field(filters, "role-filter", "admin_users_role_label", {
      options: [{ value: "", labelKey: "admin_next_users_all_roles" }],
    });
    const typeFilter = field(filters, "type-filter", "admin_next_users_type", {
      options: [
        { value: "", labelKey: "admin_next_users_all_types" },
        ...typeOptions,
      ],
    });
    sidebar.append(
      filters,
      node("p", "admin_next_users_newest", "admin-users-muted"),
    );
    const listStatus = node("p", null, "admin-users-feedback");
    listStatus.setAttribute("role", "status");
    const retry = button("admin_next_retry", () => loadList());
    retry.hidden = true;
    const list = node("div", null, "admin-users-list");
    const more = button("admin_next_users_more", () => loadList(true));
    more.hidden = true;
    const exportPanel = node("details", null, "admin-users-export");
    exportPanel.append(node("summary", "admin_users_export_heading"));
    sidebar.append(listStatus, retry, list, more, exportPanel);
    const detail = node("div", null, "admin-users-detail");
    detail.append(node("p", "admin_next_users_select", "admin-users-empty"));
    root.replaceChildren(sidebar, detail);
    invite.hidden = !actions.capabilities(actor, null).invite;
    invite.disabled = true;

    function renderList() {
      list.replaceChildren(
        ...users.map((user) => {
          const item = button(null, (event) =>
            selectUser(user._id, event.detail === 0),
          );
          item.className = "admin-user-row";
          item.dataset.userId = user._id;
          item.disabled = busy;
          if (user._id === selected?._id)
            item.setAttribute("aria-current", "true");
          const name = node("strong");
          name.textContent = nameOf(user);
          const email = node("span", null, "admin-users-muted");
          email.textContent = user.email || user.username;
          const meta = node("span", null, "admin-users-muted");
          meta.textContent = `${t(`role_${user.role}`)} · ${t(`admin_users_account_${user.accountType || "member"}`)}`;
          item.append(name, email, meta);
          return item;
        }),
      );
    }
    function markSelection() {
      list.querySelectorAll("button").forEach((item) => {
        if (item.dataset.userId === selected?._id)
          item.setAttribute("aria-current", "true");
        else item.removeAttribute("aria-current");
      });
    }
    function labelListStatus() {
      if (listError) return;
      listStatus.textContent = listPending
        ? t("admin_users_loading")
        : users.length
          ? t("admin_next_users_loaded", { count: users.length })
          : t("admin_users_empty");
    }
    function replaceUser(user) {
      users = users.map((item) => (item._id === user._id ? user : item));
      renderList();
    }
    function invalidateList() {
      ++listVersion;
      listRequest?.abort();
      clearTimeout(timer);
      more.disabled = true;
      timer = setTimeout(() => loadList(), 250);
    }
    async function loadList(append = false) {
      clearTimeout(timer);
      const version = ++listVersion;
      listRequest?.abort();
      listRequest = new AbortController();
      retry.hidden = true;
      more.disabled = true;
      listPending = true;
      listError = false;
      labelListStatus();
      list.setAttribute("aria-busy", "true");
      const query = new URLSearchParams({
        limit: "40",
        query: search.value.trim(),
        includeOptions: String(!catalog),
      });
      if (roleFilter.value) query.set("role", roleFilter.value);
      if (typeFilter.value) query.set("accountType", typeFilter.value);
      if (append && nextCursor) query.set("cursor", nextCursor);
      try {
        const data = await api(`/api/admin/users?${query}`, {
          signal: listRequest.signal,
        });
        if (disposed || version !== listVersion) return;
        if (!catalog) {
          catalog = data;
          if (latestRoles) catalog.customRoles = latestRoles;
          for (const option of roleOptions(data.roles || [])) {
            const item = node("option", option.labelKey);
            item.value = option.value;
            roleFilter.append(item);
          }
          buildExport();
          updateBusy();
        }
        users = append
          ? [
              ...users,
              ...data.users.filter(
                (user) => !users.some((item) => item._id === user._id),
              ),
            ]
          : data.users;
        nextCursor = data.nextCursor || "";
        more.hidden = !nextCursor;
        renderList();
      } catch (error) {
        if (disposed || version !== listVersion) return;
        if (error.status === 403) {
          onDenied();
          return;
        }
        listError = true;
        fail(listStatus, error);
        retry.hidden = false;
        more.hidden = true;
      } finally {
        if (!disposed && version === listVersion) {
          listPending = false;
          labelListStatus();
          list.setAttribute("aria-busy", "false");
          more.disabled = false;
        }
      }
    }
    function resetEditor() {
      contentRequest?.abort();
      form = null;
      getValues = null;
      save = null;
      feedback = null;
      baseline = "";
      attempted = false;
      detailLabels = [];
      customRoleChoices = null;
      detail.replaceChildren();
    }
    async function selectUser(id, focus = false) {
      if (selected?._id === id && mode === "edit") return;
      if (!(await canLeave())) return;
      const version = ++detailVersion;
      detailRequest?.abort();
      detailRequest = new AbortController();
      resetEditor();
      mode = "loading";
      selected = { _id: id };
      markSelection();
      const status = node(
        "p",
        "admin_next_users_loading_detail",
        "admin-users-empty",
      );
      status.setAttribute("role", "status");
      detail.append(status);
      try {
        const data = await api(
          `/api/admin/users/${encodeURIComponent(id)}?includePosts=false&includeOptions=false`,
          { signal: detailRequest.signal },
        );
        if (disposed || version !== detailVersion) return;
        editUser(data.user);
        if (focus || window.matchMedia("(max-width: 850px)").matches)
          detail.querySelector("h2").focus({ preventScroll: false });
      } catch (error) {
        if (disposed || version !== detailVersion) return;
        if (error.status === 403) {
          onDenied();
          return;
        }
        fail(status, error);
        detail.append(button("admin_next_retry", () => selectUser(id)));
      }
    }
    function editor(titleKey) {
      form = node("form", null, "admin-users-form");
      form.noValidate = true;
      const fields = node("fieldset", null, "admin-users-fields");
      if (titleKey) fields.append(node("h2", titleKey));
      feedback = node("p", null, "admin-users-feedback");
      feedback.setAttribute("role", "status");
      form.append(fields, feedback);
      detail.append(form);
      form.addEventListener("input", () => {
        feedback.textContent = "";
        if (attempted) window.CMCENForms.validate(form, { focus: false });
        updateBusy();
      });
      form.addEventListener("change", updateBusy);
      return fields;
    }
    function editUser(user) {
      resetEditor();
      selected = user;
      mode = "edit";
      const allowed = actions.capabilities(actor, user);
      const heading = node("h2");
      heading.tabIndex = -1;
      heading.textContent = nameOf(user);
      const email = node("p", null, "admin-users-muted");
      email.textContent = user.email || user.username;
      detail.append(heading, email);
      if (!allowed.edit)
        detail.append(
          node("p", "admin_next_users_read_only", "admin-users-note"),
        );
      const fields = editor();
      const roles = allowed.role
        ? actions.assignableRoles(catalog.roles, actor, user)
        : [user.role];
      const role = field(fields, "role", "admin_users_role_label", {
        options: roleOptions(roles),
        value: user.role,
        disabled: !allowed.role,
      });
      const customRoles = choices(
        fields,
        "customRoleIds",
        "admin_next_users_custom_roles",
        (catalog.customRoles || []).map((item) => ({
          value: item._id,
          label: item.name,
        })),
        user.customRoleIds || [],
        !allowed.customRoles,
      );
      customRoleChoices = customRoles;
      const contentAreas = choices(
        fields,
        "contentAreas",
        "admin_users_content_areas_label",
        (catalog.contentAreas || []).map((area) => ({
          value: area,
          labelKey: `admin_next_users_area_${area}`,
        })),
        user.contentAreas || [],
        !allowed.edit,
      );
      getValues = () => ({
        role: role.value,
        customRoleIds: customRoles().sort(),
        contentAreas: contentAreas(),
      });
      baseline = JSON.stringify(getValues());
      if (allowed.edit) {
        save = node("button", "admin_users_save", "admin-users-save");
        save.type = "submit";
        fields.append(save);
      }
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy || !allowed.edit) return;
        attempted = true;
        if (!window.CMCENForms.validate(form)) return;
        const body = actions.changes(
          JSON.parse(baseline),
          getValues(),
          allowed,
        );
        if (!Object.keys(body).length) return;
        busy = true;
        updateBusy();
        feedback.textContent = "";
        try {
          const data = await api(
            `/api/admin/users/${encodeURIComponent(user._id)}`,
            { method: "PATCH", body },
          );
          if (disposed) return;
          selected = data.user;
          baseline = JSON.stringify(getValues());
          replaceUser(data.user);
          feedback.textContent = t("admin_users_save_success");
          toast("admin_users_save_success");
        } catch (error) {
          fail(feedback, error);
        } finally {
          busy = false;
          if (!disposed) updateBusy();
        }
      });
      buildAccountDetails(user);
      buildContent(user);
      updateBusy();
      markSelection();
    }
    function buildAccountDetails(user) {
      const info = node("section", null, "admin-users-section");
      info.append(node("h3", "admin_next_users_account"));
      const status = node("p");
      dynamicText(
        status,
        () =>
          `${t(`admin_users_account_${user.accountType || "member"}`)} · ${t(user.emailVerification?.verified ? "admin_users_email_verified" : "admin_next_users_unverified")}`,
      );
      info.append(status);
      if (user.createdAt) {
        const joined = node("p", null, "admin-users-muted");
        dynamicText(joined, () =>
          t("admin_users_joined", {
            date: new Date(user.createdAt).toLocaleDateString(
              CMCENUtils.getCurrentLocale(),
            ),
          }),
        );
        info.append(joined);
      }
      const mfa = node("p");
      dynamicText(
        mfa,
        () =>
          `${t("admin_users_mfa_heading")}: ${t(user.mfa?.hasTotp ? "admin_users_mfa_totp_enabled" : "admin_users_mfa_totp_not_enabled")} · ${t("admin_users_mfa_passkeys", { count: user.mfa?.passkeyCount || 0 })}`,
      );
      info.append(mfa);
      if (user.invitation) {
        const delivery = node("p");
        dynamicText(
          delivery,
          () =>
            `${t("admin_next_users_invitation")}: ${t(`admin_next_users_delivery_${user.invitation.delivery?.status || "pending"}`)}`,
        );
        info.append(delivery);
        if (user.invitation.delivery?.error) {
          const error = node("p", null, "admin-users-feedback");
          error.textContent = user.invitation.delivery.error;
          info.append(error);
        }
      }
      const toolbar = node("div", null, "admin-users-actions");
      const allowed = actions.capabilities(actor, user);
      for (const [action, key] of [
        ["resend", "admin_next_users_resend"],
        ["resetMfa", "admin_users_mfa_reset"],
        ["promote", "admin_users_promote_developer"],
        ["remove", "admin_next_users_delete"],
      ]) {
        if (!allowed[action]) continue;
        const control = button(key, () => accountAction(action));
        control.dataset.accountAction = action;
        if (action === "remove") control.className = "admin-users-danger";
        toolbar.append(control);
      }
      info.append(toolbar);
      detail.append(info);
    }
    async function accountAction(action) {
      if (busy || disposed) return;
      if (dirty()) {
        feedback.textContent = t("admin_next_users_save_first");
        return;
      }
      busy = true;
      updateBusy();
      feedback.textContent = "";
      try {
        const result = await actions.perform(action, selected, {
          api,
          actor,
          isCurrent: () => !disposed,
        });
        if (!result || disposed) return;
        if (action === "remove") {
          users = users.filter((user) => user._id !== selected._id);
          selected = null;
          resetEditor();
          mode = "empty";
          detail.append(
            node("p", "admin_next_users_select", "admin-users-empty"),
          );
          renderList();
        } else if (result.user) {
          replaceUser(result.user);
          editUser(result.user);
        }
        toast("admin_next_users_action_done");
      } catch (error) {
        if (!disposed && error.data?.user) {
          replaceUser(error.data.user);
          editUser(error.data.user);
        }
        fail(feedback, error);
      } finally {
        busy = false;
        if (!disposed) updateBusy();
      }
    }
    function buildContent(user) {
      const version = detailVersion;
      const panel = node("details", null, "admin-users-section");
      panel.append(node("summary", "admin_next_users_content"));
      const output = node("div", null, "admin-users-posts");
      panel.append(output);
      detail.append(panel);
      let loaded = false,
        loading = false;
      async function load() {
        if (loading || loaded || disposed || selected?._id !== user._id) return;
        loading = true;
        contentRequest = new AbortController();
        output.replaceChildren(node("p", "admin_next_users_loading_content"));
        try {
          const data = await api(
            `/api/admin/users/${encodeURIComponent(user._id)}?includeOptions=false`,
            { signal: contentRequest.signal },
          );
          if (disposed || version !== detailVersion || !panel.isConnected)
            return;
          loaded = true;
          output.replaceChildren();
          if (!data.posts.length)
            output.append(node("p", "admin_users_posts_empty"));
          for (const post of data.posts) {
            const row = node("p");
            const link = node("a");
            link.textContent = post.title || t("admin_content_untitled");
            const href = permissions.canReviewAndPublish
              ? `/content-workspace?id=${encodeURIComponent(post._id)}`
              : post.href;
            if (href) {
              link.href = href;
              link.addEventListener("click", (event) => {
                if (
                  event.button ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                navigate(href);
              });
            }
            row.append(link);
            output.append(row);
          }
        } catch (error) {
          if (disposed || version !== detailVersion || !panel.isConnected)
            return;
          if (error.status === 403) {
            onDenied();
            return;
          }
          output.replaceChildren();
          const status = node("p");
          fail(status, error);
          output.append(status, button("admin_next_retry", load));
        } finally {
          loading = false;
        }
      }
      panel.addEventListener("toggle", () => {
        if (panel.open) load();
      });
    }
    async function newInvitation() {
      if (!catalog || !(await canLeave())) return;
      ++detailVersion;
      detailRequest?.abort();
      resetEditor();
      selected = null;
      mode = "invite";
      renderList();
      const fields = editor("admin_next_users_invite");
      const controls = {};
      for (const [name, type, maxLength] of [
        ["firstName", "text", 100],
        ["lastName", "text", 100],
        ["email", "email", 254],
        ["message", "textarea", 2000],
      ]) {
        controls[name] = field(fields, name, `admin_next_users_${name}`, {
          type,
          maxLength,
          required: name !== "message",
        });
      }
      controls.role = field(fields, "invite-role", "admin_users_role_label", {
        options: roleOptions(
          actions.assignableRoles(catalog.roles, actor, null, true),
        ),
        value: "subscriber",
        required: true,
      });
      getValues = () =>
        Object.fromEntries(
          Object.entries(controls).map(([name, input]) => [
            name,
            input.value.trim(),
          ]),
        );
      baseline = JSON.stringify(getValues());
      save = node(
        "button",
        "admin_next_users_send_invitation",
        "admin-users-save",
      );
      save.type = "submit";
      fields.append(save);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        attempted = true;
        if (!window.CMCENForms.validate(form)) return;
        busy = true;
        updateBusy();
        feedback.textContent = "";
        try {
          const data = await api("/api/admin/users", {
            method: "POST",
            body: getValues(),
          });
          if (disposed) return;
          editUser(data.user);
          toast("admin_next_users_invited");
          loadList();
        } catch (error) {
          if (disposed) return;
          // Mail failure can still create the account. Show its resend action instead of creating it twice.
          if (error.data?.user) {
            editUser(error.data.user);
            loadList();
          }
          fail(feedback, error);
        } finally {
          busy = false;
          if (!disposed) updateBusy();
        }
      });
      updateBusy();
      controls.firstName.focus({ preventScroll: true });
    }
    function buildExport() {
      const roles = choices(
        exportPanel,
        "exportRoles",
        "admin_users_export_include_roles",
        roleOptions(catalog.roles),
        catalog.roles.filter(
          (role) => !["administrator", "developer"].includes(role),
        ),
      );
      const types = choices(
        exportPanel,
        "exportTypes",
        "admin_users_export_include_account_types",
        typeOptions,
        ["member"],
      );
      const status = node("p", null, "admin-users-feedback");
      status.setAttribute("role", "status");
      const controls = node("div", null, "admin-users-actions");
      let exporting = false;
      for (const format of ["csv", "pdf"])
        controls.append(
          button(`admin_users_export_${format}`, async () => {
            if (exporting) return;
            if (!roles().length || !types().length) {
              status.textContent = t("admin_next_users_export_required");
              return;
            }
            exporting = true;
            controls.querySelectorAll("button").forEach((control) => {
              control.disabled = true;
            });
            status.textContent = t("admin_users_export_preparing");
            try {
              const query = new URLSearchParams({
                format,
                includeRoles: roles().join(","),
                includeAccountTypes: types().join(","),
              });
              const response = await api(`/api/admin/users/export?${query}`, {
                parseJson: false,
              });
              const blob = await response.blob();
              if (disposed) return;
              const url = URL.createObjectURL(blob);
              const link = node("a");
              link.href = url;
              link.download = `cmcen-users.${format}`;
              document.body.append(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              status.textContent = t("admin_users_export_success");
            } catch (error) {
              fail(status, error);
            } finally {
              exporting = false;
              controls.querySelectorAll("button").forEach((control) => {
                control.disabled = false;
              });
            }
          }),
        );
      exportPanel.append(controls, status);
    }
    listen(search, "input", invalidateList);
    listen(roleFilter, "change", invalidateList);
    listen(typeFilter, "change", invalidateList);
    listen(invite, "click", newInvitation);
    listen(document, "languagechange", () => {
      renderList();
      labelListStatus();
      detailLabels.forEach((update) => update());
      if (form && attempted) window.CMCENForms.validate(form, { focus: false });
    });
    loadList();
    return {
      updateRoles,
      canNavigate: () => !busy && !confirming,
      hasUnsavedChanges: () => busy || (mode !== "empty" && dirty()),
      dispose() {
        disposed = true;
        ++listVersion;
        ++detailVersion;
        clearTimeout(timer);
        events.abort();
        listRequest?.abort();
        detailRequest?.abort();
        contentRequest?.abort();
        root.replaceChildren();
      },
    };
  }
  window.DashboardNextUsers = Object.freeze({ mount });
})();
