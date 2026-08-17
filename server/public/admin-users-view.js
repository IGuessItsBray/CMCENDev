(function initializeAdminUsersView(global) {
  function create({ root, getState, actions }) {
    let shouldRestoreSearchFocus = false;
    let searchFocusSelection = null;
    let mediaSearchTimer = null;
    const USER_ROW_RENDER_LIMIT = 100;

    function formatContentArea(contentArea) {
      return CMCENUtils.formatTitleCaseValue(contentArea);
    }

    function formatDate(value) {
      return CMCENUtils.formatDate(value);
    }

    function getText(key, fallback, replacements = {}) {
      const translated =
        typeof translate === "function" ? translate(key, replacements) : key;

      return translated === key ? fallback : translated;
    }

    function formatFileSize(value) {
      const bytes = Number(value || 0);

      if (!bytes) return "0 B";

      const units = ["B", "KB", "MB", "GB"];
      const unitIndex = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
      );
      const amount = bytes / 1024 ** unitIndex;

      return `${amount.toFixed(amount >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

    function getDisplayName(user) {
      return CMCENUtils.getUserDisplayName(user, translate("unknown_user"));
    }

    function createRoleBadge(role) {
      const badge = document.createElement("span");
      const roleKey = role || "subscriber";
      badge.className = `admin-user-role-badge role-${roleKey}`;
      badge.textContent = translate(`role_${roleKey}`);

      return badge;
    }

    function createCustomRoleBadge(role) {
      const badge = document.createElement("span");
      badge.className = "admin-user-role-badge is-custom";
      badge.textContent =
        role?.name || getText("admin_roles_custom_role", "Custom role");

      if (role?.color) {
        badge.style.borderColor = role.color;
        badge.style.backgroundColor = role.color;
        badge.style.color = "#ffffff";
      }

      return badge;
    }

    function createEmailVerificationBadge(user) {
      const verification = user?.emailVerification || {};
      const isVerified = verification.verified === true;

      if (!isVerified) {
        return null;
      }

      const badge = document.createElement("span");
      badge.className = "admin-user-role-badge verification-verified";
      badge.textContent = getText("admin_users_email_verified", "Verified");

      return badge;
    }

    function createAccountTypeBadge(user) {
      if (user?.accountType === "invited") {
        const badge = document.createElement("span");
        badge.className = "admin-user-role-badge account-ghost";
        badge.textContent = "Invited";
        return badge;
      }

      if (user?.accountType !== "ghost" && user?.role !== "ghost") {
        return null;
      }

      const badge = document.createElement("span");
      badge.className = "admin-user-role-badge account-ghost";
      badge.textContent = getText("admin_users_account_ghost", "Ghost");

      return badge;
    }

    function isSelectedSelf(user) {
      const state = getState();

      return Boolean(
        user?._id &&
        state.currentUserId &&
        String(user._id) === String(state.currentUserId),
      );
    }

    function isDeveloper(user) {
      return user?.role === "developer";
    }

    function canPromoteToDeveloper(user) {
      return user?.role === "administrator";
    }

    function canResetMfa(user) {
      const state = getState();

      return Boolean(
        state.currentUserPermissions?.canResetUserMfa === true &&
        user?._id &&
        !isSelectedSelf(user),
      );
    }

    function canDeleteUser(user) {
      const state = getState();

      return Boolean(
        state.currentUserPermissions?.canDeleteAnyUser === true &&
        user?._id &&
        !isSelectedSelf(user),
      );
    }

    function canResendInvitation(user) {
      const state = getState();

      return Boolean(
        user?._id &&
          user.accountType === "invited" &&
          state.currentUserPermissions?.canProvisionUsers === true &&
          (user.role !== "internal_beta" ||
            state.currentUserRole === "developer"),
      );
    }

    function getStandardRoles() {
      return getState().roles.filter((role) => role !== "developer");
    }

    function createMessage() {
      const message = document.createElement("p");
      const state = getState();
      message.className = "admin-work-zone-message";
      message.setAttribute("role", "status");
      message.setAttribute("aria-live", "polite");
      message.hidden = !state.message;
      message.textContent = state.message;

      return message;
    }

    function createUserButton(user) {
      const button = document.createElement("button");
      const state = getState();
      button.type = "button";
      button.className = "admin-user-row";
      button.classList.toggle(
        "is-selected",
        state.selectedUserId === String(user._id),
      );

      const name = document.createElement("strong");
      name.textContent = getDisplayName(user);

      const meta = document.createElement("span");
      meta.textContent = user.email || user.username || "";

      const count = document.createElement("span");
      count.className = "admin-user-post-count";
      count.textContent = user.postSummary
        ? translate("admin_users_post_count", {
            count: user.postSummary.total || 0,
          })
        : getText("admin_users_row_select", "Open profile");

      button.append(
        name,
        meta,
        createAccountTypeBadge(user) || createRoleBadge(user.role),
      );

      const emailVerificationBadge = createEmailVerificationBadge(user);
      if (emailVerificationBadge) {
        button.append(emailVerificationBadge);
      }

      (user.customRoles || []).slice(0, 3).forEach((role) => {
        button.append(createCustomRoleBadge(role));
      });

      button.append(count);
      button.addEventListener("click", () => actions.loadUserDetail(user._id));

      return button;
    }

    function createExportCheckbox(name, value, labelText, checked = false) {
      const label = document.createElement("label");
      label.className = "admin-users-export-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = name;
      input.value = value;
      input.checked = checked;

      const text = document.createElement("span");
      text.textContent = labelText;

      label.append(input, text);

      return label;
    }

    function getExportOptions(panel) {
      return {
        includeRoles: Array.from(
          panel.querySelectorAll('input[name="includeRoles"]:checked'),
        ).map((input) => input.value),
        includeAccountTypes: Array.from(
          panel.querySelectorAll('input[name="includeAccountTypes"]:checked'),
        ).map((input) => input.value),
      };
    }

    function createUsersExportPanel() {
      const state = getState();
      const panel = document.createElement("details");
      panel.className = "admin-users-export-panel";

      const title = document.createElement("summary");
      title.textContent = getText("admin_users_export_heading", "Export users");

      const content = document.createElement("div");
      content.className = "admin-users-export-content";

      const filters = document.createElement("div");
      filters.className = "admin-users-export-filters";

      const roleGroup = document.createElement("div");
      roleGroup.className = "admin-users-export-group";
      const roleTitle = document.createElement("span");
      roleTitle.textContent = getText(
        "admin_users_export_include_roles",
        "Roles to include",
      );
      roleGroup.append(roleTitle);

      (state.roles || []).forEach((role) => {
        roleGroup.append(
          createExportCheckbox(
            "includeRoles",
            role,
            translate(`role_${role}`),
            !["developer", "administrator"].includes(role),
          ),
        );
      });

      const accountTypeGroup = document.createElement("div");
      accountTypeGroup.className = "admin-users-export-group";
      const accountTypeTitle = document.createElement("span");
      accountTypeTitle.textContent = getText(
        "admin_users_export_include_account_types",
        "Account types to include",
      );
      accountTypeGroup.append(accountTypeTitle);
      [
        ["member", getText("admin_users_account_member", "Member")],
        ["ghost", getText("admin_users_account_ghost", "Ghost")],
        ["invited", "Invited"],
      ].forEach(([value, label]) => {
        accountTypeGroup.append(
          createExportCheckbox(
            "includeAccountTypes",
            value,
            label,
            value === "member",
          ),
        );
      });

      filters.append(roleGroup, accountTypeGroup);

      const actionsWrapper = document.createElement("div");
      actionsWrapper.className = "admin-users-export-actions";

      [
        ["csv", getText("admin_users_export_csv", "Export CSV")],
        ["pdf", getText("admin_users_export_pdf", "Export PDF")],
      ].forEach(([format, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "admin-work-zone-button is-secondary";
        button.textContent = label;
        button.addEventListener("click", () => {
          actions.exportUsers(format, getExportOptions(panel));
        });
        actionsWrapper.append(button);
      });

      content.append(filters, actionsWrapper);
      panel.append(title, content);

      return panel;
    }

    function createUserList() {
      const panel = document.createElement("div");
      const state = getState();
      panel.className = "admin-user-list-panel";

      const header = document.createElement("div");
      header.className = "admin-panel-heading";

      const title = document.createElement("h3");
      title.textContent = translate("admin_users_heading");

      const search = document.createElement("label");
      search.className = "admin-user-search";

      const searchLabel = document.createElement("span");
      searchLabel.textContent = translate("admin_users_search_label");

      const searchInput = document.createElement("input");
      searchInput.type = "search";
      searchInput.value = state.searchQuery;
      searchInput.placeholder = translate("admin_users_search_placeholder");
      searchInput.autocomplete = "off";
      searchInput.addEventListener("input", (event) => {
        searchFocusSelection = {
          start: searchInput.selectionStart,
          end: searchInput.selectionEnd,
        };
        actions.searchUsers(event.target.value);
      });

      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "admin-work-zone-button is-secondary";
      refresh.textContent = translate("admin_refresh");
      refresh.addEventListener("click", actions.refreshUsers);

      const invite = document.createElement("button");
      invite.type = "button";
      invite.className = "admin-work-zone-button is-primary";
      invite.textContent = "Create account";
      invite.disabled =
        state.currentUserPermissions?.canProvisionUsers !== true;
      invite.addEventListener("click", actions.provisionUser);

      search.append(searchLabel, searchInput);
      header.append(title, invite, refresh);
      panel.append(header, search, createUsersExportPanel());

      const list = document.createElement("div");
      list.className = "admin-user-list";

      if (state.isLoading && !state.users.length) {
        list.append(
          CMCENUtils.createLoadingSpinner(translate("admin_users_loading")),
        );
      } else if (!state.users.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = state.searchQuery
          ? translate("admin_users_search_empty")
          : translate("admin_users_empty");
        list.append(empty);
      } else {
        state.users.slice(0, USER_ROW_RENDER_LIMIT).forEach((user) => {
          list.append(createUserButton(user));
        });
      }

      panel.append(list);

      if (state.userListHasMore || state.users.length > USER_ROW_RENDER_LIMIT) {
        const isAtListCap =
          state.userListHasMore &&
          (state.userListLimit || 0) >= USER_ROW_RENDER_LIMIT;
        const more = document.createElement("button");
        more.type = "button";
        more.className = "admin-work-zone-button is-secondary admin-users-more";
        more.textContent =
          isAtListCap || state.users.length > USER_ROW_RENDER_LIMIT
            ? getText(
                "admin_users_more_rendered",
                "Refine search to narrow results",
              )
            : getText("admin_users_more", "Show more users");
        more.disabled =
          isAtListCap ||
          state.users.length > USER_ROW_RENDER_LIMIT ||
          state.isLoading;
        more.addEventListener("click", actions.showMoreUsers);
        panel.append(more);
      }

      if (shouldRestoreSearchFocus) {
        window.requestAnimationFrame(() => {
          const selection = searchFocusSelection || {
            start: searchInput.value.length,
            end: searchInput.value.length,
          };

          searchInput.focus();
          searchInput.setSelectionRange(
            Math.min(
              selection.start ?? searchInput.value.length,
              searchInput.value.length,
            ),
            Math.min(
              selection.end ?? searchInput.value.length,
              searchInput.value.length,
            ),
          );
          shouldRestoreSearchFocus = false;
        });
      }

      return panel;
    }

    function createRoleSelect(user) {
      const select = document.createElement("select");
      const state = getState();
      const canManageInternalBeta = state.currentUserRole === "developer";
      const isInternalBetaUser = user?.role === "internal_beta";
      select.id = "adminUserRole";
      select.name = "role";
      select.disabled =
        isSelectedSelf(user) ||
        isDeveloper(user) ||
        (isInternalBetaUser && !canManageInternalBeta);

      const roles = isDeveloper(user)
        ? ["developer"]
        : getStandardRoles().filter(
            (role) => canManageInternalBeta || role !== "internal_beta",
          );

      if (isInternalBetaUser && !roles.includes("internal_beta")) {
        roles.push("internal_beta");
      }

      roles.forEach((role) => {
        const option = document.createElement("option");
        option.value = role;
        option.textContent = translate(`role_${role}`);
        select.append(option);
      });

      select.value = user?.role || "subscriber";

      return select;
    }

    function createContentAreaOptions(user) {
      const wrapper = document.createElement("div");
      const state = getState();
      wrapper.className = "admin-content-area-options";
      const selectedAreas = new Set(user?.contentAreas || []);

      state.contentAreas.forEach((area) => {
        const label = document.createElement("label");
        label.className = "admin-content-area-option";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = area;
        input.checked = selectedAreas.has(area);

        const text = document.createElement("span");
        text.textContent = formatContentArea(area);

        label.append(input, text);
        wrapper.append(label);
      });

      return wrapper;
    }

    function createCustomRoleOptions(user) {
      const wrapper = document.createElement("div");
      const state = getState();
      wrapper.className = "admin-custom-role-options";
      const selectedRoles = new Set((user?.customRoleIds || []).map(String));

      if (!state.customRoles.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = getText(
          "admin_roles_assignment_empty",
          "No custom roles have been created yet.",
        );
        wrapper.append(empty);
        return wrapper;
      }

      state.customRoles.forEach((role) => {
        const label = document.createElement("label");
        label.className = "admin-custom-role-option";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = role._id;
        input.checked = selectedRoles.has(String(role._id));

        const swatch = document.createElement("span");
        swatch.className = "admin-role-color-swatch";
        swatch.style.backgroundColor = role.color || "#4F46E5";

        const text = document.createElement("span");
        text.textContent = role.name;

        label.append(input, swatch, text);
        wrapper.append(label);
      });

      return wrapper;
    }

    function createMfaPanel(user) {
      const panel = document.createElement("div");
      panel.className = "admin-user-mfa-panel";
      const mfa = user?.mfa || {};

      const heading = document.createElement("div");
      heading.className = "admin-panel-heading";

      const title = document.createElement("h4");
      title.textContent = getText(
        "admin_users_mfa_heading",
        "Multi-factor authentication",
      );

      const status = document.createElement("span");
      status.className = `admin-user-mfa-status ${mfa.enabled ? "is-enabled" : "is-empty"}`;
      status.textContent = mfa.enabled
        ? getText("admin_users_mfa_enabled", "Enabled")
        : getText("admin_users_mfa_not_enabled", "Not enabled");

      heading.append(title, status);

      const details = document.createElement("p");
      details.className = "admin-post-details";
      details.textContent = [
        mfa.hasTotp
          ? getText("admin_users_mfa_totp_enabled", "Authenticator app enabled")
          : getText("admin_users_mfa_totp_not_enabled", "No authenticator app"),
        translate("admin_users_mfa_passkeys", {
          count: mfa.passkeyCount || 0,
        }),
      ].join(" · ");

      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "admin-work-zone-button is-danger";
      reset.textContent = getText("admin_users_mfa_reset", "Reset MFA");
      reset.disabled = !mfa.enabled || !canResetMfa(user);
      reset.addEventListener("click", () => actions.resetMfa(user));

      if (isSelectedSelf(user)) {
        const help = document.createElement("small");
        help.className = "admin-editor-help";
        help.textContent = getText(
          "admin_users_mfa_self_help",
          "You cannot reset your own MFA from this panel.",
        );
        panel.append(heading, details, reset, help);
        return panel;
      }

      panel.append(heading, details, reset);

      return panel;
    }

    function createInvitationPanel(user) {
      if (user?.accountType !== "invited") {
        return null;
      }

      const invitation = user.invitation || {};
      const delivery = invitation.delivery || {};
      const panel = document.createElement("section");
      panel.className = "admin-invitation-panel";

      const heading = document.createElement("div");
      heading.className = "admin-panel-heading";
      const title = document.createElement("h4");
      title.textContent = "Invitation delivery";
      const status = document.createElement("span");
      const statusValue = delivery.status || "pending";
      status.className = `admin-invitation-status is-${statusValue}`;
      status.textContent = statusValue.charAt(0).toUpperCase() + statusValue.slice(1);
      heading.append(title, status);

      const summary = document.createElement("p");
      summary.className = "admin-invitation-summary";
      summary.textContent =
        statusValue === "failed"
          ? "The mail service did not accept this invitation. Review the diagnostic, then resend it."
          : statusValue === "sent"
            ? "The activation link was handed to the mail service."
            : "This invitation has not been sent yet.";

      const details = document.createElement("div");
      details.className = "admin-invitation-details";
      [
        ["Delivery", invitation.sentAt ? `Sent ${formatDate(invitation.sentAt)}` : "Not sent"],
        [
          "Expires",
          invitation.expiresAt ? formatDate(invitation.expiresAt) : "No expiration set",
        ],
        [
          "Last attempt",
          delivery.attemptedAt ? formatDate(delivery.attemptedAt) : "No delivery attempt yet",
        ],
      ].forEach(([label, value]) => {
        const item = document.createElement("div");
        const itemLabel = document.createElement("span");
        itemLabel.textContent = label;
        const itemValue = document.createElement("strong");
        itemValue.textContent = value;
        item.append(itemLabel, itemValue);
        details.append(item);
      });

      panel.append(heading, summary, details);

      if (delivery.error) {
        const diagnostic = document.createElement("details");
        diagnostic.className = "admin-invitation-diagnostic";
        const diagnosticTitle = document.createElement("summary");
        diagnosticTitle.textContent = "View mail-service diagnostic";
        const error = document.createElement("code");
        error.textContent = delivery.error;
        diagnostic.append(diagnosticTitle, error);
        panel.append(diagnostic);
      }

      const actionsRow = document.createElement("div");
      actionsRow.className = "admin-invitation-actions";
      const resend = document.createElement("button");
      resend.type = "button";
      resend.className = "admin-work-zone-button is-secondary";
      resend.textContent = "Resend invitation";
      resend.disabled = !canResendInvitation(user);
      resend.addEventListener("click", () => actions.resendInvitation(user));
      actionsRow.append(resend);
      panel.append(actionsRow);

      return panel;
    }

    function createDangerZone(user) {
      if (!canDeleteUser(user)) {
        return null;
      }

      const panel = document.createElement("section");
      panel.className = "admin-user-danger-zone";

      const copy = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = "Danger Zone";
      const description = document.createElement("p");
      description.textContent =
        "Delete this account after choosing how to handle its submitted content and confirming with MFA.";
      copy.append(title, description);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "admin-work-zone-button is-danger";
      remove.textContent = "Delete account";
      remove.addEventListener("click", () => actions.deleteUser(user));

      panel.append(copy, remove);
      return panel;
    }

    function getSelectedContentAreas(form) {
      return Array.from(
        form.querySelectorAll(".admin-content-area-option input:checked"),
      ).map((input) => input.value);
    }

    function getSelectedCustomRoleIds(form) {
      return Array.from(
        form.querySelectorAll(".admin-custom-role-option input:checked"),
      ).map((input) => input.value);
    }

    function getSelectedPermissions(form) {
      return Array.from(
        form.querySelectorAll(".admin-permission-option input:checked"),
      ).map((input) => input.value);
    }

    function createPostItem(post) {
      const item = document.createElement("article");
      item.className = "admin-post-item";

      const header = document.createElement("div");
      header.className = "admin-post-header";

      const title = document.createElement(post.href ? "a" : "strong");
      title.textContent = post.title || translate("admin_content_untitled");

      if (post.href) {
        title.href = post.href;
      }

      const typeLabel =
        {
          event: translate("admin_content_type_event"),
          retirementMessage: translate("admin_content_type_post"),
          retirementComment: translate("admin_content_type_comment"),
          lastPost: getText("admin_content_type_last_post", "Last Post notice"),
        }[post.type] || translate("admin_content_type_content");

      const badges = document.createElement("div");
      badges.className = "admin-post-badges";

      const type = document.createElement("span");
      type.className = `admin-post-type type-${post.type || "content"}`;
      type.textContent = typeLabel;

      const status = document.createElement("span");
      status.className = `admin-post-status status-${post.status || "unknown"}`;
      status.textContent = post.status || "unknown";

      badges.append(type, status);
      header.append(title, badges);

      const details = document.createElement("p");
      details.className = "admin-post-details";
      details.textContent = [
        post.action,
        post.contentArea ? formatContentArea(post.contentArea) : "",
        formatDate(post.updatedAt || post.createdAt),
      ]
        .filter(Boolean)
        .join(" · ");

      item.append(header, details);

      if (post.excerpt) {
        const excerpt = document.createElement("p");
        excerpt.className = "admin-post-excerpt";
        excerpt.textContent = post.excerpt;
        item.append(excerpt);
      }

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "admin-work-zone-button is-danger";
      deleteButton.textContent = translate("admin_delete");
      deleteButton.addEventListener("click", () => actions.deletePost(post));

      item.append(deleteButton);

      return item;
    }

    function getPermissionGroups() {
      const groups = new Map();

      getState().permissionCatalog.forEach((permission) => {
        const groupName = permission.group || "Permissions";

        if (!groups.has(groupName)) {
          groups.set(groupName, []);
        }

        groups.get(groupName).push(permission);
      });

      return groups;
    }

    function createPermissionOptions(role) {
      const wrapper = document.createElement("div");
      wrapper.className = "admin-permission-groups";
      const selectedPermissions = new Set(role?.permissions || []);
      const groups = getPermissionGroups();

      if (!groups.size) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = "No permissions are configured yet.";
        wrapper.append(empty);
        return wrapper;
      }

      groups.forEach((permissions, groupName) => {
        const group = document.createElement("div");
        group.className = "admin-permission-group";

        const title = document.createElement("strong");
        title.textContent = groupName;
        group.append(title);

        permissions.forEach((permission) => {
          const label = document.createElement("label");
          label.className = "admin-permission-option";

          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = permission.key;
          input.checked = selectedPermissions.has(permission.key);
          label.classList.toggle("is-selected", input.checked);
          input.addEventListener("change", () => {
            label.classList.toggle("is-selected", input.checked);
          });

          const text = document.createElement("span");
          text.textContent = permission.label || permission.key;

          const action = document.createElement("em");
          action.textContent = permission.action || "";
          action.className = `permission-action-${String(
            permission.action || "other",
          )
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "-")}`;

          const detail = document.createElement("small");
          detail.textContent = permission.description || "";

          label.append(input, text, detail, action);
          group.append(label);
        });

        wrapper.append(group);
      });

      return wrapper;
    }

    function createRoleDefinitionButton(role) {
      const button = document.createElement("button");
      const state = getState();
      button.type = "button";
      button.className = "admin-role-row";
      button.classList.toggle(
        "is-selected",
        String(role._id) === String(state.selectedRoleId),
      );

      const swatch = document.createElement("span");
      swatch.className = "admin-role-color-swatch";
      swatch.style.backgroundColor = role.color || "#4F46E5";

      const name = document.createElement("strong");
      name.textContent = role.name;

      const meta = document.createElement("span");
      meta.textContent = `${role.permissions?.length || 0} permissions`;

      button.append(swatch, name, meta);
      button.addEventListener("click", () => actions.selectRole(role._id));

      return button;
    }

    function createRoleDefinitionsPanel() {
      const panel = document.createElement("div");
      const state = getState();
      panel.className = "admin-role-editor-panel";

      const header = document.createElement("div");
      header.className = "admin-panel-heading";

      const title = document.createElement("h3");
      title.textContent = getText("admin_roles_heading", "Custom roles");

      const createButton = document.createElement("button");
      createButton.type = "button";
      createButton.className = "admin-work-zone-button is-secondary";
      createButton.textContent = getText("admin_roles_new", "New role");
      createButton.addEventListener("click", () => {
        const roleNumber = state.customRoles.length + 1;

        actions.createRole({
          name: `New role ${roleNumber}`,
          color: "#4F46E5",
          permissions: [],
        });
      });

      header.append(title, createButton);
      panel.append(header);

      const body = document.createElement("div");
      body.className = "admin-role-editor-body";

      const list = document.createElement("div");
      list.className = "admin-role-list";

      if (!state.customRoles.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = getText(
          "admin_roles_empty",
          "Create a role to start assigning custom permissions.",
        );
        list.append(empty);
      } else {
        state.customRoles.forEach((role) => {
          list.append(createRoleDefinitionButton(role));
        });
      }

      const selectedRole =
        state.customRoles.find(
          (role) => String(role._id) === String(state.selectedRoleId),
        ) ||
        state.customRoles[0] ||
        null;

      const form = document.createElement("form");
      form.className = "admin-role-form";

      if (!selectedRole) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = getText(
          "admin_roles_select_empty",
          "No custom role selected.",
        );
        form.append(empty);
      } else {
        const nameField = document.createElement("label");
        nameField.className = "admin-editor-field admin-role-field-name";
        const nameLabel = document.createElement("span");
        nameLabel.textContent = "Name";
        const nameInput = document.createElement("input");
        nameInput.name = "name";
        nameInput.type = "text";
        nameInput.required = true;
        nameInput.maxLength = 80;
        nameInput.value = selectedRole.name || "";
        nameField.append(nameLabel, nameInput);

        const slugField = document.createElement("label");
        slugField.className = "admin-editor-field admin-role-field-slug";
        const slugLabel = document.createElement("span");
        slugLabel.textContent = "Slug";
        const slugInput = document.createElement("input");
        slugInput.name = "slug";
        slugInput.type = "text";
        slugInput.maxLength = 100;
        slugInput.value = selectedRole.slug || "";
        slugField.append(slugLabel, slugInput);

        const colorField = document.createElement("label");
        colorField.className = "admin-editor-field admin-role-field-color";
        const colorLabel = document.createElement("span");
        colorLabel.textContent = "Badge color";
        const colorInput = window.CMCENColorPicker.create({
          name: "color",
          value: selectedRole.color || "#4F46E5",
          fallback: "#4F46E5",
          label: "Badge color",
        });
        colorField.append(colorLabel, colorInput);

        const descriptionField = document.createElement("label");
        descriptionField.className =
          "admin-editor-field admin-role-field-description";
        const descriptionLabel = document.createElement("span");
        descriptionLabel.textContent = "Description";
        const descriptionInput = document.createElement("textarea");
        descriptionInput.name = "description";
        descriptionInput.maxLength = 240;
        descriptionInput.rows = 3;
        descriptionInput.value = selectedRole.description || "";
        descriptionField.append(descriptionLabel, descriptionInput);

        const permissionField = document.createElement("fieldset");
        permissionField.className =
          "admin-editor-fieldset admin-role-field-permissions";
        const permissionLegend = document.createElement("legend");
        permissionLegend.textContent = "Permissions";
        permissionField.append(
          permissionLegend,
          createPermissionOptions(selectedRole),
        );

        const actionsRow = document.createElement("div");
        actionsRow.className = "admin-role-form-actions";

        const save = document.createElement("button");
        save.type = "submit";
        save.className = "admin-work-zone-button is-primary";
        save.textContent = "Save role";

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "admin-work-zone-button is-danger";
        remove.textContent = "Delete role";
        remove.addEventListener("click", () =>
          actions.deleteRole(selectedRole),
        );

        actionsRow.append(save, remove);
        form.append(
          nameField,
          slugField,
          colorField,
          descriptionField,
          permissionField,
          actionsRow,
        );

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          actions.saveRole(selectedRole._id, {
            name: form.elements.name.value,
            slug: form.elements.slug.value,
            color: form.elements.color.value,
            description: form.elements.description.value,
            permissions: getSelectedPermissions(form),
          });
        });
      }

      body.append(list, form);
      panel.append(body);

      return panel;
    }

    function createRolesManager() {
      const wrapper = document.createElement("div");
      wrapper.className = "admin-roles-manager";
      wrapper.append(createRoleDefinitionsPanel());

      return wrapper;
    }

    function createEditor() {
      const panel = document.createElement("div");
      const state = getState();
      panel.className = "admin-user-detail-panel";

      const user = state.selectedUser;

      if (!user) {
        const empty = document.createElement("div");
        empty.className = "admin-user-empty-detail";

        const title = document.createElement("h3");
        title.textContent = getText(
          "admin_users_select_profile_title",
          "Select a user",
        );

        const copy = document.createElement("p");
        copy.textContent = getText(
          "admin_users_select_profile_body",
          "Choose a user from the list to edit roles, custom permissions, MFA, and submitted content.",
        );

        empty.append(title, copy);
        panel.append(empty);
        return panel;
      }

      const header = document.createElement("div");
      header.className = "admin-user-detail-heading";

      const identity = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = getDisplayName(user);

      const meta = document.createElement("p");
      meta.textContent = [
        user.email || user.username || "",
        translate("admin_users_joined", {
          date: formatDate(user.createdAt),
        }),
      ]
        .filter(Boolean)
        .join(" · ");

      const identityBadges = [
        createAccountTypeBadge(user) || createRoleBadge(user.role),
        createEmailVerificationBadge(user),
      ].filter(Boolean);

      identity.append(title, ...identityBadges, meta);
      header.append(identity);

      const form = document.createElement("form");
      form.className = "admin-user-editor";

      const roleField = document.createElement("label");
      roleField.className = "admin-editor-field";

      const roleLabel = document.createElement("span");
      roleLabel.textContent = translate("admin_users_role_label");

      roleField.append(roleLabel, createRoleSelect(user));

      if (isSelectedSelf(user)) {
        const roleHelp = document.createElement("small");
        roleHelp.className = "admin-editor-help";
        roleHelp.textContent = translate("admin_users_self_role_help");
        roleField.append(roleHelp);
      } else if (isDeveloper(user)) {
        const roleHelp = document.createElement("small");
        roleHelp.className = "admin-editor-help";
        roleHelp.textContent = translate("admin_users_developer_role_help");
        roleField.append(roleHelp);
      }

      const contentField = document.createElement("fieldset");
      contentField.className = "admin-editor-fieldset";

      const legend = document.createElement("legend");
      legend.textContent = translate("admin_users_content_areas_label");

      contentField.append(legend, createContentAreaOptions(user));

      const customRolesField = document.createElement("fieldset");
      customRolesField.className = "admin-editor-fieldset";

      const customRolesLegend = document.createElement("legend");
      customRolesLegend.textContent = getText(
        "admin_roles_assign_label",
        "Custom roles",
      );

      customRolesField.append(customRolesLegend, createCustomRoleOptions(user));

      const save = document.createElement("button");
      save.type = "submit";
      save.className = "admin-work-zone-button is-primary";
      save.textContent = translate("admin_users_save");

      form.append(roleField, customRolesField, contentField, save);

      if (canPromoteToDeveloper(user)) {
        const promoteDeveloper = document.createElement("button");
        promoteDeveloper.type = "button";
        promoteDeveloper.className = "admin-work-zone-button is-danger";
        promoteDeveloper.textContent = translate(
          "admin_users_promote_developer",
        );
        promoteDeveloper.addEventListener("click", () => {
          actions.promoteDeveloper(user);
        });
        form.append(promoteDeveloper);
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const payload = {
          contentAreas: getSelectedContentAreas(form),
          customRoleIds: getSelectedCustomRoleIds(form),
        };

        if (!isDeveloper(user)) {
          payload.role = form.elements.role.value;
        }

        actions.saveUser(user._id, payload);
      });

      const postsPanel = document.createElement("div");
      postsPanel.className = "admin-posts-panel";

      const postsHeading = document.createElement("h4");
      postsHeading.textContent = translate("admin_users_posts_heading", {
        count: state.posts.length,
      });
      postsPanel.append(postsHeading);

      if (!state.posts.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = translate("admin_users_posts_empty");
        postsPanel.append(empty);
      } else {
        state.posts.forEach((post) => {
          postsPanel.append(createPostItem(post));
        });
      }

      panel.append(header, form);
      const invitationPanel = createInvitationPanel(user);
      if (invitationPanel) {
        panel.append(invitationPanel);
      }
      panel.append(createMfaPanel(user));
      const dangerZone = createDangerZone(user);
      if (dangerZone) panel.append(dangerZone);
      panel.append(postsPanel);

      return panel;
    }

    function createMediaAttachment(attachment) {
      const item = document.createElement("li");
      item.className = "admin-media-attachment";

      const link = document.createElement(attachment.href ? "a" : "span");
      link.textContent =
        attachment.title || translate("admin_content_untitled_content");

      if (attachment.href) {
        link.href = attachment.href;
      }

      const meta = document.createElement("span");
      const typeLabel =
        {
          event: translate("admin_content_type_event"),
          retirementMessage: translate("admin_content_type_retirement_message"),
          lastPostMessage: translate("admin_content_type_last_post_message"),
        }[attachment.type] || translate("admin_content_type_content");

      meta.textContent = [
        typeLabel,
        attachment.status || "",
        attachment.field || "",
      ]
        .filter(Boolean)
        .join(" · ");

      item.append(link, meta);

      return item;
    }

    function createMediaCard(mediaItem) {
      const state = getState();
      const selectedKeys = new Set(state.selectedMediaKeys || []);
      const deletingKeys = new Set(state.mediaDeletingKeys || []);
      const isSelected = selectedKeys.has(mediaItem.key);
      const isDeleting = deletingKeys.has(mediaItem.key);
      const card = document.createElement("article");
      card.className = "admin-media-card";
      card.classList.toggle("is-selected", isSelected);
      card.classList.toggle("is-deleting", isDeleting);

      const selectLabel = document.createElement("label");
      selectLabel.className = "admin-media-select";

      const selectInput = document.createElement("input");
      selectInput.type = "checkbox";
      selectInput.checked = isSelected;
      selectInput.disabled = state.mediaIsDeleting || state.mediaIsLoading;
      selectInput.addEventListener("change", () => {
        actions.toggleMediaSelection(mediaItem, selectInput.checked);
      });

      const selectText = document.createElement("span");
      selectText.textContent = "Select";
      selectLabel.append(selectInput, selectText);

      const previewLink = document.createElement("a");
      previewLink.className = "admin-media-preview";
      previewLink.href = mediaItem.url;
      previewLink.target = "_blank";
      previewLink.rel = "noopener";

      const image = document.createElement("img");
      image.src = mediaItem.url;
      image.alt = mediaItem.key;
      image.loading = "lazy";

      previewLink.append(image);

      const body = document.createElement("div");
      body.className = "admin-media-body";

      const title = document.createElement("h4");
      title.textContent =
        mediaItem.name || mediaItem.originalName || mediaItem.key;

      const meta = document.createElement("p");
      meta.className = "admin-media-meta";
      meta.textContent = [
        mediaItem.name && mediaItem.name !== mediaItem.key ? mediaItem.key : "",
        formatFileSize(mediaItem.size),
        mediaItem.lastModified
          ? translate("admin_media_modified", {
              date: formatDate(mediaItem.lastModified),
            })
          : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const attachmentCount = Number(mediaItem.attachedPostCount || 0);
      const attachments = document.createElement("div");
      attachments.className = "admin-media-attachments";

      const attachmentHeading = document.createElement("strong");
      attachmentHeading.textContent = attachmentCount
        ? translate(
            attachmentCount === 1
              ? "admin_media_attached_count_singular"
              : "admin_media_attached_count_plural",
            { count: attachmentCount },
          )
        : translate("admin_media_not_attached");
      attachments.append(attachmentHeading);

      if (attachmentCount) {
        const list = document.createElement("ul");
        (mediaItem.attachedPosts || []).forEach((attachment) => {
          list.append(createMediaAttachment(attachment));
        });
        attachments.append(list);
      }

      const actionsWrapper = document.createElement("div");
      actionsWrapper.className = "admin-media-actions";

      const open = document.createElement("a");
      open.className = "admin-work-zone-button is-secondary";
      open.href = mediaItem.url;
      open.target = "_blank";
      open.rel = "noopener";
      open.textContent = translate("admin_media_open");

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "admin-work-zone-button is-danger";
      remove.disabled =
        Boolean(attachmentCount) ||
        state.mediaIsDeleting ||
        state.mediaIsLoading;
      if (isDeleting) {
        const deleting = document.createElement("span");
        deleting.className = "admin-media-sort-loading";
        deleting.textContent = "Deleting";
        remove.replaceChildren(deleting);
      } else {
        remove.textContent = attachmentCount
          ? translate("admin_media_in_use")
          : translate("admin_delete");
      }
      remove.addEventListener("click", () => actions.deleteMedia(mediaItem));

      actionsWrapper.append(open, remove);
      body.append(title, meta, attachments, actionsWrapper);
      card.append(selectLabel, previewLink, body);

      return card;
    }

    function createMediaBulkToolbar() {
      const state = getState();
      const selectedKeys = new Set(state.selectedMediaKeys || []);
      const deletingKeys = new Set(state.mediaDeletingKeys || []);
      const selectedItems = state.media.filter((item) =>
        selectedKeys.has(item.key),
      );
      const selectedCount = selectedItems.length;
      const removableCount = selectedItems.filter(
        (item) => !Number(item.attachedPostCount || 0),
      ).length;
      const isDeletingSelection =
        state.mediaIsDeleting &&
        selectedItems.some((item) => deletingKeys.has(item.key));

      if (!selectedCount) {
        return null;
      }

      const toolbar = document.createElement("div");
      toolbar.className = "admin-media-bulk-toolbar";

      const summary = document.createElement("p");
      summary.textContent = `${selectedCount} selected · ${removableCount} unattached removable`;

      const selectVisible = document.createElement("button");
      selectVisible.type = "button";
      selectVisible.className = "admin-work-zone-button is-secondary";
      selectVisible.textContent = "Select visible";
      selectVisible.disabled =
        state.mediaIsLoading || state.mediaIsDeleting || !state.media.length;
      selectVisible.addEventListener("click", actions.selectVisibleMedia);

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "admin-work-zone-button is-secondary";
      clear.textContent = "Clear";
      clear.disabled = state.mediaIsDeleting || !selectedCount;
      clear.addEventListener("click", actions.clearMediaSelection);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "admin-work-zone-button is-danger";
      remove.disabled =
        state.mediaIsLoading || state.mediaIsDeleting || !removableCount;
      if (isDeletingSelection) {
        const deleting = document.createElement("span");
        deleting.className = "admin-media-sort-loading";
        deleting.textContent = "Deleting";
        remove.replaceChildren(deleting);
      } else {
        remove.textContent = `Delete ${selectedCount} ${selectedCount === 1 ? "image" : "images"}`;
      }
      remove.addEventListener("click", actions.deleteSelectedMedia);

      toolbar.append(summary, selectVisible, clear, remove);
      return toolbar;
    }

    function createMediaLibrary() {
      const panel = document.createElement("div");
      const state = getState();
      panel.className = "admin-media-library";

      const header = document.createElement("div");
      header.className = "admin-media-heading";

      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = translate("admin_media_heading");

      const intro = document.createElement("p");
      intro.textContent = state.mediaBucket
        ? translate("admin_media_intro_bucket", {
            bucket: state.mediaBucket,
          })
        : translate("admin_media_intro");

      copy.append(title, intro);

      const headerActions = document.createElement("div");
      headerActions.className = "admin-media-heading-actions";

      const sortLabel = document.createElement("label");
      sortLabel.className = "admin-media-sort-field";
      const sortText = document.createElement("span");
      sortText.textContent = "Sort";
      const sortSelect = document.createElement("select");
      [
        ["newest", "Newest first"],
        ["oldest", "Oldest first"],
        ["name", "Name"],
        ["size", "Largest first"],
        ["orphaned", "Orphaned first"],
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        sortSelect.append(option);
      });
      sortSelect.value = state.mediaSort || "newest";
      sortSelect.disabled =
        state.mediaIsLoading || state.mediaIsUploading || state.mediaIsDeleting;
      sortSelect.addEventListener("change", () => {
        actions.setMediaSort(sortSelect.value);
      });
      sortLabel.append(sortText, sortSelect);

      const typeLabel = document.createElement("label");
      typeLabel.className = "admin-media-sort-field";
      const typeText = document.createElement("span");
      typeText.textContent = "Type";
      const typeSelect = document.createElement("select");
      [
        ["all", "All media"],
        ["retirement", "Retirement"],
        ["last-post", "Last Post"],
        ["event", "Events"],
        ["page", "Pages"],
        ["upload", "Uploads"],
        ["migration", "Migration"],
        ["unattached", "Unattached"],
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        typeSelect.append(option);
      });
      typeSelect.value = state.mediaType || "all";
      typeSelect.disabled = state.mediaIsLoading || state.mediaIsDeleting;
      typeSelect.addEventListener("change", () => {
        actions.setMediaType(typeSelect.value);
      });
      typeLabel.append(typeText, typeSelect);

      const searchLabel = document.createElement("label");
      searchLabel.className = "admin-media-slug-field";
      const searchText = document.createElement("span");
      searchText.textContent = "Search";
      const searchInput = document.createElement("input");
      searchInput.type = "search";
      searchInput.placeholder = "File or image name";
      searchInput.value = state.mediaSearch || "";
      searchInput.maxLength = 120;
      searchInput.autocomplete = "off";
      searchInput.disabled = state.mediaIsLoading || state.mediaIsDeleting;
      searchInput.addEventListener("input", () => {
        clearTimeout(mediaSearchTimer);
        mediaSearchTimer = setTimeout(() => {
          actions.setMediaSearch(searchInput.value);
        }, 250);
      });
      searchLabel.append(searchText, searchInput);

      if (state.mediaIsLoading) {
        const sortLoading = document.createElement("span");
        sortLoading.className = "admin-media-sort-loading";
        sortLoading.setAttribute("role", "status");
        sortLoading.textContent = "Loading";
        sortLabel.append(sortLoading);
      }

      const slugLabel = document.createElement("label");
      slugLabel.className = "admin-media-slug-field";
      const slugText = document.createElement("span");
      slugText.textContent = "CDN slug";
      const slugInput = document.createElement("input");
      slugInput.type = "text";
      slugInput.placeholder = "branch-crest";
      slugInput.pattern = "[a-z0-9]+(?:-[a-z0-9]+)*";
      slugInput.maxLength = 80;
      slugInput.autocomplete = "off";
      slugInput.disabled = state.mediaIsUploading || state.mediaIsDeleting;
      slugLabel.append(slugText, slugInput);

      const uploadLabel = document.createElement("label");
      uploadLabel.className =
        "admin-work-zone-button is-primary admin-media-upload-button";
      uploadLabel.textContent = state.mediaIsUploading
        ? "Uploading..."
        : "Upload images";

      const uploadInput = document.createElement("input");
      uploadInput.type = "file";
      uploadInput.accept =
        ".jpg,.jpeg,.png,.webp,.gif,.heic,image/jpeg,image/png,image/webp,image/gif,image/heic";
      uploadInput.multiple = true;
      uploadInput.hidden = true;
      uploadInput.disabled = state.mediaIsUploading || state.mediaIsDeleting;
      uploadInput.addEventListener("change", () => {
        actions.uploadMediaFiles(uploadInput.files, slugInput.value);
        uploadInput.value = "";
      });
      uploadLabel.append(uploadInput);

      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "admin-work-zone-button is-secondary";
      refresh.textContent = translate("admin_refresh");
      refresh.disabled =
        state.mediaIsLoading || state.mediaIsUploading || state.mediaIsDeleting;
      refresh.addEventListener("click", actions.refreshMedia);

      headerActions.append(
        sortLabel,
        typeLabel,
        searchLabel,
        slugLabel,
        uploadLabel,
        refresh,
      );
      header.append(copy, headerActions);
      header.addEventListener("dragover", (event) => {
        event.preventDefault();
        header.classList.add("is-dragging");
      });
      header.addEventListener("dragleave", () => {
        header.classList.remove("is-dragging");
      });
      header.addEventListener("drop", (event) => {
        event.preventDefault();
        header.classList.remove("is-dragging");
        actions.uploadMediaFiles(
          event.dataTransfer?.files || [],
          slugInput.value,
        );
      });
      panel.append(header);

      if (state.mediaUploadQueue?.length) {
        const uploads = document.createElement("div");
        uploads.className = "admin-media-upload-list";

        state.mediaUploadQueue.forEach((item) => {
          const row = document.createElement("div");
          row.className = `admin-media-upload-row is-${item.status}`;

          const details = document.createElement("div");
          details.className = "admin-media-upload-details";

          const name = document.createElement("strong");
          name.textContent = item.name;

          const meta = document.createElement("span");
          const sizeLabel =
            item.originalSize && item.originalSize > item.size
              ? `${formatFileSize(item.originalSize)} -> ${formatFileSize(item.size)}`
              : formatFileSize(item.size);
          meta.textContent = [
            sizeLabel,
            item.status === "error"
              ? item.message || "Upload failed"
              : item.status === "complete"
                ? "Uploaded"
                : item.message || `${item.progress || 0}%`,
          ]
            .filter(Boolean)
            .join(" · ");

          const progress = document.createElement("span");
          progress.className = "admin-media-upload-progress";
          progress.style.setProperty(
            "--upload-progress",
            `${Math.max(0, Math.min(item.progress || 0, 100))}%`,
          );

          details.append(name, meta);
          row.append(details, progress);
          uploads.append(row);
        });

        panel.append(uploads);
      }

      const bulkToolbar = createMediaBulkToolbar();
      if (bulkToolbar) {
        panel.append(bulkToolbar);
      }

      if (state.mediaIsLoading && !state.media.length) {
        panel.append(
          CMCENUtils.createLoadingSpinner(translate("admin_media_loading")),
        );
        return panel;
      }

      if (!state.media.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = translate("admin_media_empty");
        panel.append(empty);
        return panel;
      }

      const grid = document.createElement("div");
      grid.className = "admin-media-grid";
      state.media.forEach((mediaItem) => {
        grid.append(createMediaCard(mediaItem));
      });
      panel.append(grid);

      if (state.mediaIsTruncated) {
        const loadMore = document.createElement("button");
        loadMore.type = "button";
        loadMore.className =
          "admin-work-zone-button is-secondary admin-media-load-more";
        loadMore.textContent = state.mediaIsLoading
          ? translate("loading_text")
          : translate("admin_media_load_more");
        loadMore.disabled = state.mediaIsLoading;
        loadMore.addEventListener("click", () => {
          actions.loadMoreMedia(state.mediaNextCursor);
        });
        panel.append(loadMore);
      }

      return panel;
    }

    function render() {
      const state = getState();
      const content = [createMessage()];

      root.classList.toggle("is-users-view", state.activeView === "users");
      root.classList.toggle("is-roles-view", state.activeView === "roles");
      root.classList.toggle("is-media-view", state.activeView === "media");

      if (state.activeView === "media") {
        content.push(createMediaLibrary());
      } else if (state.activeView === "roles") {
        content.push(createRolesManager());
      } else {
        content.push(createUserList(), createEditor());
      }

      root.replaceChildren(...content);
    }

    function restoreSearchFocus() {
      shouldRestoreSearchFocus = true;
    }

    return {
      render,
      restoreSearchFocus,
    };
  }

  global.CMCENAdminUsersView = {
    create,
  };
})(window);
