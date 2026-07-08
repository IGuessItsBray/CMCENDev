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
      message.className = "app-status admin-work-zone-message";
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

      button.append(name, meta, createRoleBadge(user.role), count);
      button.addEventListener("click", () => actions.loadUserDetail(user._id));

      return button;
    }

    function createUserList() {
      const panel = document.createElement("div");
      const state = getState();
      panel.className = "app-panel admin-user-list-panel";

      const header = document.createElement("div");
      header.className = "app-panel-heading admin-panel-heading";

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
      refresh.className =
        "app-button is-secondary is-small admin-work-zone-button";
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

    function getSelectedContentAreas(form) {
      return Array
        .from(form.querySelectorAll(".admin-content-area-option input:checked"))
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
      deleteButton.className =
        "app-button is-danger is-small admin-work-zone-button";
      deleteButton.textContent = translate("admin_delete");
      deleteButton.addEventListener("click", () => actions.deletePost(post));

      item.append(deleteButton);

      return item;
    }

    function createEditor() {
      const panel = document.createElement("div");
      const state = getState();
      panel.className = "app-panel admin-user-detail-panel";

      const user = state.selectedUser;

      if (!user) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = translate("admin_users_select_empty");
        panel.append(empty);
        return panel;
      }

      const header = document.createElement("div");
      header.className = "app-panel-heading admin-user-detail-heading";

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

      identity.append(title, createRoleBadge(user.role), meta);
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

      const save = document.createElement("button");
      save.type = "submit";
      save.className =
        "app-button is-primary is-small admin-work-zone-button";
      save.textContent = translate("admin_users_save");

      form.append(roleField, contentField, save);

      if (!isDeveloper(user)) {
        const promoteDeveloper = document.createElement("button");
        promoteDeveloper.type = "button";
        promoteDeveloper.className =
          "app-button is-danger is-small admin-work-zone-button";
        promoteDeveloper.textContent = translate("admin_users_promote_developer");
        promoteDeveloper.addEventListener("click", () => {
          actions.promoteDeveloper(user);
        });
        form.append(promoteDeveloper);
      }

      form.addEventListener("submit", event => {
        event.preventDefault();
        const payload = {
          contentAreas: getSelectedContentAreas(form)
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
      title.textContent = mediaItem.key;

      const meta = document.createElement("p");
      meta.className = "admin-media-meta";
      meta.textContent = [
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
      open.className =
        "app-button is-secondary is-small admin-work-zone-button";
      open.href = mediaItem.url;
      open.target = "_blank";
      open.rel = "noopener";
      open.textContent = translate("admin_media_open");

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className =
        "app-button is-danger is-small admin-work-zone-button";
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

      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className =
        "app-button is-secondary is-small admin-work-zone-button";
      refresh.textContent = translate("admin_refresh");
      refresh.disabled = state.mediaIsLoading;
      refresh.addEventListener("click", actions.refreshMedia);

      header.append(copy, refresh);
      panel.append(header);

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
        loadMore.className =
          "app-button is-secondary is-small admin-work-zone-button admin-media-load-more";
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

      if (state.activeView === "media") {
        content.push(createMediaLibrary());
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
