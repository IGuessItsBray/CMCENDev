(function initializeAdminUsersView(global) {
  function create({
    root,
    getState,
    actions
  }) {
    let shouldRestoreSearchFocus = false;

    function formatContentArea(contentArea) {
      return CMCENUtils.formatTitleCaseValue(contentArea);
    }

    function formatDate(value) {
      return CMCENUtils.formatDate(value);
    }

    function getText(key, fallback, replacements = {}) {
      const translated = typeof translate === "function"
        ? translate(key, replacements)
        : key;

      return translated === key ? fallback : translated;
    }

    function formatFileSize(value) {
      const bytes = Number(value || 0);

      if (!bytes) return "0 B";

      const units = ["B", "KB", "MB", "GB"];
      const unitIndex = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
      );
      const amount = bytes / (1024 ** unitIndex);

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
      badge.textContent = role?.name || getText("admin_roles_custom_role", "Custom role");

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
        String(user._id) === String(state.currentUserId)
      );
    }

    function isDeveloper(user) {
      return user?.role === "developer";
    }

    function getStandardRoles() {
      return getState().roles.filter(role => role !== "developer");
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
        state.selectedUserId === String(user._id)
      );

      const name = document.createElement("strong");
      name.textContent = getDisplayName(user);

      const meta = document.createElement("span");
      meta.textContent = user.email || user.username || "";

      const count = document.createElement("span");
      count.className = "admin-user-post-count";
      count.textContent = translate("admin_users_post_count", {
        count: user.postSummary?.total || 0
      });

      button.append(
        name,
        meta,
        createAccountTypeBadge(user) || createRoleBadge(user.role)
      );

      const emailVerificationBadge = createEmailVerificationBadge(user);
      if (emailVerificationBadge) {
        button.append(emailVerificationBadge);
      }

      (user.customRoles || []).slice(0, 3).forEach(role => {
        button.append(createCustomRoleBadge(role));
      });

      button.append(count);
      button.addEventListener("click", () => actions.loadUserDetail(user._id));

      return button;
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
      searchInput.addEventListener("input", event => {
        actions.searchUsers(event.target.value);
      });

      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "admin-work-zone-button is-secondary";
      refresh.textContent = translate("admin_refresh");
      refresh.addEventListener("click", actions.refreshUsers);

      search.append(searchLabel, searchInput);
      header.append(title, refresh);
      panel.append(header, search);

      const list = document.createElement("div");
      list.className = "admin-user-list";

      if (state.isLoading && !state.users.length) {
        list.append(CMCENUtils.createLoadingSpinner(translate("admin_users_loading")));
      } else if (!state.users.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = state.searchQuery
          ? translate("admin_users_search_empty")
          : translate("admin_users_empty");
        list.append(empty);
      } else {
        state.users.forEach(user => {
          list.append(createUserButton(user));
        });
      }

      panel.append(list);

      if (shouldRestoreSearchFocus) {
        window.requestAnimationFrame(() => {
          searchInput.focus();
          searchInput.setSelectionRange(
            searchInput.value.length,
            searchInput.value.length
          );
          shouldRestoreSearchFocus = false;
        });
      }

      return panel;
    }

    function createRoleSelect(user) {
      const select = document.createElement("select");
      select.id = "adminUserRole";
      select.name = "role";
      select.disabled = isSelectedSelf(user) || isDeveloper(user);

      const roles = isDeveloper(user)
        ? ["developer"]
        : getStandardRoles();

      roles.forEach(role => {
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

      state.contentAreas.forEach(area => {
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
          "No custom roles have been created yet."
        );
        wrapper.append(empty);
        return wrapper;
      }

      state.customRoles.forEach(role => {
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

    function getSelectedContentAreas(form) {
      return Array
        .from(form.querySelectorAll(".admin-content-area-option input:checked"))
        .map(input => input.value);
    }

    function getSelectedCustomRoleIds(form) {
      return Array
        .from(form.querySelectorAll(".admin-custom-role-option input:checked"))
        .map(input => input.value);
    }

    function getSelectedPermissions(form) {
      return Array
        .from(form.querySelectorAll(".admin-permission-option input:checked"))
        .map(input => input.value);
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

      const typeLabel = {
        event: translate("admin_content_type_event"),
        retirementMessage: translate("admin_content_type_post"),
        retirementComment: translate("admin_content_type_comment")
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
        formatDate(post.updatedAt || post.createdAt)
      ].filter(Boolean).join(" · ");

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

      getState().permissionCatalog.forEach(permission => {
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

        permissions.forEach(permission => {
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

          const detail = document.createElement("small");
          detail.textContent = [
            permission.action,
            permission.description
          ].filter(Boolean).join(" · ");

          label.append(input, text, detail);
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
        String(role._id) === String(state.selectedRoleId)
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
          permissions: []
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
          "Create a role to start assigning custom permissions."
        );
        list.append(empty);
      } else {
        state.customRoles.forEach(role => {
          list.append(createRoleDefinitionButton(role));
        });
      }

      const selectedRole =
        state.customRoles.find(role => String(role._id) === String(state.selectedRoleId)) ||
        state.customRoles[0] ||
        null;

      const form = document.createElement("form");
      form.className = "admin-role-form";

      if (!selectedRole) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = getText(
          "admin_roles_select_empty",
          "No custom role selected."
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
          label: "Badge color"
        });
        colorField.append(colorLabel, colorInput);

        const descriptionField = document.createElement("label");
        descriptionField.className = "admin-editor-field admin-role-field-description";
        const descriptionLabel = document.createElement("span");
        descriptionLabel.textContent = "Description";
        const descriptionInput = document.createElement("textarea");
        descriptionInput.name = "description";
        descriptionInput.maxLength = 240;
        descriptionInput.rows = 3;
        descriptionInput.value = selectedRole.description || "";
        descriptionField.append(descriptionLabel, descriptionInput);

        const permissionField = document.createElement("fieldset");
        permissionField.className = "admin-editor-fieldset admin-role-field-permissions";
        const permissionLegend = document.createElement("legend");
        permissionLegend.textContent = "Permissions";
        permissionField.append(permissionLegend, createPermissionOptions(selectedRole));

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
        remove.addEventListener("click", () => actions.deleteRole(selectedRole));

        actionsRow.append(save, remove);
        form.append(
          nameField,
          slugField,
          colorField,
          descriptionField,
          permissionField,
          actionsRow
        );

        form.addEventListener("submit", event => {
          event.preventDefault();
          actions.saveRole(selectedRole._id, {
            name: form.elements.name.value,
            slug: form.elements.slug.value,
            color: form.elements.color.value,
            description: form.elements.description.value,
            permissions: getSelectedPermissions(form)
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
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = translate("admin_users_select_empty");
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
          date: formatDate(user.createdAt)
        })
      ].filter(Boolean).join(" · ");

      const identityBadges = [
        createAccountTypeBadge(user) || createRoleBadge(user.role),
        createEmailVerificationBadge(user)
      ].filter(Boolean);

      identity.append(
        title,
        ...identityBadges,
        meta
      );
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
        "Custom roles"
      );

      customRolesField.append(customRolesLegend, createCustomRoleOptions(user));

      const save = document.createElement("button");
      save.type = "submit";
      save.className = "admin-work-zone-button is-primary";
      save.textContent = translate("admin_users_save");

      form.append(roleField, customRolesField, contentField, save);

      if (!isDeveloper(user)) {
        const promoteDeveloper = document.createElement("button");
        promoteDeveloper.type = "button";
        promoteDeveloper.className = "admin-work-zone-button is-danger";
        promoteDeveloper.textContent = translate("admin_users_promote_developer");
        promoteDeveloper.addEventListener("click", () => {
          actions.promoteDeveloper(user);
        });
        form.append(promoteDeveloper);
      }

      form.addEventListener("submit", event => {
        event.preventDefault();
        const payload = {
          contentAreas: getSelectedContentAreas(form),
          customRoleIds: getSelectedCustomRoleIds(form)
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
        count: state.posts.length
      });
      postsPanel.append(postsHeading);

      if (!state.posts.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = translate("admin_users_posts_empty");
        postsPanel.append(empty);
      } else {
        state.posts.forEach(post => {
          postsPanel.append(createPostItem(post));
        });
      }

      panel.append(header, form, postsPanel);

      return panel;
    }

    function createMediaAttachment(attachment) {
      const item = document.createElement("li");
      item.className = "admin-media-attachment";

      const link = document.createElement(attachment.href ? "a" : "span");
      link.textContent = attachment.title || translate("admin_content_untitled_content");

      if (attachment.href) {
        link.href = attachment.href;
      }

      const meta = document.createElement("span");
      meta.textContent = [
        attachment.type === "event"
          ? translate("admin_content_type_event")
          : translate("admin_content_type_retirement_message"),
        attachment.status || "",
        attachment.field || ""
      ].filter(Boolean).join(" · ");

      item.append(link, meta);

      return item;
    }

    function createMediaCard(mediaItem) {
      const card = document.createElement("article");
      card.className = "admin-media-card";

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
      title.textContent = mediaItem.name || mediaItem.originalName || mediaItem.key;

      const meta = document.createElement("p");
      meta.className = "admin-media-meta";
      meta.textContent = [
        mediaItem.name && mediaItem.name !== mediaItem.key ? mediaItem.key : "",
        formatFileSize(mediaItem.size),
        mediaItem.lastModified
          ? translate("admin_media_modified", {
            date: formatDate(mediaItem.lastModified)
          })
          : ""
      ].filter(Boolean).join(" · ");

      const attachmentCount = Number(mediaItem.attachedPostCount || 0);
      const attachments = document.createElement("div");
      attachments.className = "admin-media-attachments";

      const attachmentHeading = document.createElement("strong");
      attachmentHeading.textContent = attachmentCount
        ? translate(
          attachmentCount === 1
            ? "admin_media_attached_count_singular"
            : "admin_media_attached_count_plural",
          { count: attachmentCount }
        )
        : translate("admin_media_not_attached");
      attachments.append(attachmentHeading);

      if (attachmentCount) {
        const list = document.createElement("ul");
        (mediaItem.attachedPosts || []).forEach(attachment => {
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
      remove.textContent = attachmentCount
        ? translate("admin_media_in_use")
        : translate("admin_delete");
      remove.disabled = Boolean(attachmentCount);
      remove.addEventListener("click", () => actions.deleteMedia(mediaItem));

      actionsWrapper.append(open, remove);
      body.append(title, meta, attachments, actionsWrapper);
      card.append(previewLink, body);

      return card;
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
          bucket: state.mediaBucket
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
        ["size", "Largest first"]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        sortSelect.append(option);
      });
      sortSelect.value = state.mediaSort || "newest";
      sortSelect.disabled = state.mediaIsLoading || state.mediaIsUploading;
      sortSelect.addEventListener("change", () => {
        actions.setMediaSort(sortSelect.value);
      });
      sortLabel.append(sortText, sortSelect);

      const uploadLabel = document.createElement("label");
      uploadLabel.className = "admin-work-zone-button is-primary admin-media-upload-button";
      uploadLabel.textContent = state.mediaIsUploading ? "Uploading..." : "Upload images";

      const uploadInput = document.createElement("input");
      uploadInput.type = "file";
      uploadInput.accept = "image/*";
      uploadInput.multiple = true;
      uploadInput.hidden = true;
      uploadInput.disabled = state.mediaIsUploading;
      uploadInput.addEventListener("change", () => {
        actions.uploadMediaFiles(uploadInput.files);
        uploadInput.value = "";
      });
      uploadLabel.append(uploadInput);

      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "admin-work-zone-button is-secondary";
      refresh.textContent = translate("admin_refresh");
      refresh.disabled = state.mediaIsLoading || state.mediaIsUploading;
      refresh.addEventListener("click", actions.refreshMedia);

      headerActions.append(sortLabel, uploadLabel, refresh);
      header.append(copy, headerActions);
      header.addEventListener("dragover", event => {
        event.preventDefault();
        header.classList.add("is-dragging");
      });
      header.addEventListener("dragleave", () => {
        header.classList.remove("is-dragging");
      });
      header.addEventListener("drop", event => {
        event.preventDefault();
        header.classList.remove("is-dragging");
        actions.uploadMediaFiles(event.dataTransfer?.files || []);
      });
      panel.append(header);

      if (state.mediaUploadQueue?.length) {
        const uploads = document.createElement("div");
        uploads.className = "admin-media-upload-list";

        state.mediaUploadQueue.forEach(item => {
          const row = document.createElement("div");
          row.className = `admin-media-upload-row is-${item.status}`;

          const details = document.createElement("div");
          details.className = "admin-media-upload-details";

          const name = document.createElement("strong");
          name.textContent = item.name;

          const meta = document.createElement("span");
          const sizeLabel = item.originalSize && item.originalSize > item.size
            ? `${formatFileSize(item.originalSize)} -> ${formatFileSize(item.size)}`
            : formatFileSize(item.size);
          meta.textContent = [
            sizeLabel,
            item.status === "error"
              ? item.message || "Upload failed"
              : item.status === "complete"
                ? "Uploaded"
                : item.message || `${item.progress || 0}%`
          ].filter(Boolean).join(" · ");

          const progress = document.createElement("span");
          progress.className = "admin-media-upload-progress";
          progress.style.setProperty("--upload-progress", `${Math.max(0, Math.min(item.progress || 0, 100))}%`);

          details.append(name, meta);
          row.append(details, progress);
          uploads.append(row);
        });

        panel.append(uploads);
      }

      if (state.mediaIsLoading && !state.media.length) {
        panel.append(CMCENUtils.createLoadingSpinner(translate("admin_media_loading")));
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
      state.media.forEach(mediaItem => {
        grid.append(createMediaCard(mediaItem));
      });
      panel.append(grid);

      if (state.mediaIsTruncated) {
        const loadMore = document.createElement("button");
        loadMore.type = "button";
        loadMore.className = "admin-work-zone-button is-secondary admin-media-load-more";
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
      restoreSearchFocus
    };
  }

  global.CMCENAdminUsersView = {
    create
  };
})(window);
