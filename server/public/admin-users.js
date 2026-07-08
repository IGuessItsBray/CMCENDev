const adminToken = CMCENUtils.requireAuthToken();
const createLoadingSpinner = CMCENUtils.createLoadingSpinner;
const adminWorkZone = document.getElementById("adminWorkZone");
const adminWorkZoneContent = document.getElementById("adminWorkZoneContent");
const adminWorkZoneStatus = document.getElementById("adminWorkZoneStatus");

let adminWorkZoneState = {
  activeView: new URLSearchParams(window.location.search).get("view") === "media"
    ? "media"
    : "users",
  currentUserId: "",
  currentUserRole: "",
  users: [],
  roles: [],
  contentAreas: [],
  selectedUserId: "",
  selectedUser: null,
  posts: [],
  media: [],
  mediaNextCursor: "",
  mediaIsTruncated: false,
  mediaBucket: "",
  mediaIsLoading: false,
  isLoading: false,
  message: "",
  searchQuery: ""
};
let adminSearchTimeout = 0;
let shouldRestoreAdminSearchFocus = false;

async function adminApiJson(path, options = {}) {
  try {
    return await CMCENUtils.apiJson(path, {
      ...options,
      token: adminToken,
      redirectOnUnauthorized: true,
      unauthorizedMessage: translate("admin_verify_error")
    });
  } catch (error) {
    if (error.status === 403) {
      window.location.href = "/dashboard.html";
    }

    throw error;
  }
}

function setAdminStatus(message, state = "") {
  CMCENUtils.setStatusMessage(adminWorkZoneStatus, message, state);
}

function showAdminLoading(message = translate("admin_users_loading")) {
  CMCENUtils.setStatusLoading(adminWorkZoneStatus, message);
  adminWorkZone.hidden = true;
}

function showAdminWorkZone() {
  adminWorkZoneStatus.hidden = true;
  adminWorkZoneStatus.removeAttribute("aria-label");
  adminWorkZone.hidden = false;
}

function formatAdminContentArea(contentArea) {
  return CMCENUtils.formatTitleCaseValue(contentArea);
}

function formatAdminDate(value) {
  return CMCENUtils.formatDate(value);
}

function formatAdminFileSize(value) {
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

function getAdminDisplayName(user) {
  return CMCENUtils.getUserDisplayName(user, translate("unknown_user"));
}

function createAdminRoleBadge(role) {
  const badge = document.createElement("span");
  const roleKey = role || "subscriber";
  badge.className = `admin-user-role-badge role-${roleKey}`;
  badge.textContent = translate(`role_${roleKey}`);

  return badge;
}

function isSelectedAdminSelf(user) {
  return Boolean(
    user?._id &&
    adminWorkZoneState.currentUserId &&
    String(user._id) === String(adminWorkZoneState.currentUserId)
  );
}

function isDeveloperUser(user) {
  return user?.role === "developer";
}

function getStandardAdminRoles() {
  return adminWorkZoneState.roles.filter(role => role !== "developer");
}

function setAdminWorkZoneState(nextState) {
  adminWorkZoneState = {
    ...adminWorkZoneState,
    ...nextState
  };
  renderAdminWorkZone();
}

function createAdminMessage() {
  const message = document.createElement("p");
  message.className = "admin-work-zone-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.hidden = !adminWorkZoneState.message;
  message.textContent = adminWorkZoneState.message;

  return message;
}

function createAdminUserButton(user) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-user-row";
  button.classList.toggle(
    "is-selected",
    adminWorkZoneState.selectedUserId === String(user._id)
  );

  const name = document.createElement("strong");
  name.textContent = getAdminDisplayName(user);

  const meta = document.createElement("span");
  meta.textContent = user.email || user.username || "";

  const count = document.createElement("span");
  count.className = "admin-user-post-count";
  count.textContent = translate("admin_users_post_count", {
    count: user.postSummary?.total || 0
  });

  button.append(name, meta, createAdminRoleBadge(user.role), count);
  button.addEventListener("click", () => loadAdminUserDetail(user._id));

  return button;
}

function createAdminUserList() {
  const panel = document.createElement("div");
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
  searchInput.value = adminWorkZoneState.searchQuery;
  searchInput.placeholder = translate("admin_users_search_placeholder");
  searchInput.autocomplete = "off";
  searchInput.addEventListener("input", event => {
    scheduleAdminUserSearch(event.target.value);
  });

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "admin-work-zone-button is-secondary";
  refresh.textContent = translate("admin_refresh");
  refresh.addEventListener("click", () => loadAdminUsers());

  search.append(searchLabel, searchInput);
  header.append(title, refresh);
  panel.append(header, search);

  const list = document.createElement("div");
  list.className = "admin-user-list";

  if (adminWorkZoneState.isLoading && !adminWorkZoneState.users.length) {
    list.append(createLoadingSpinner(translate("admin_users_loading")));
  } else if (!adminWorkZoneState.users.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = adminWorkZoneState.searchQuery
      ? translate("admin_users_search_empty")
      : translate("admin_users_empty");
    list.append(empty);
  } else {
    adminWorkZoneState.users.forEach(user => {
      list.append(createAdminUserButton(user));
    });
  }

  panel.append(list);

  if (shouldRestoreAdminSearchFocus) {
    window.requestAnimationFrame(() => {
      searchInput.focus();
      searchInput.setSelectionRange(
        searchInput.value.length,
        searchInput.value.length
      );
      shouldRestoreAdminSearchFocus = false;
    });
  }

  return panel;
}

function scheduleAdminUserSearch(value) {
  window.clearTimeout(adminSearchTimeout);
  shouldRestoreAdminSearchFocus = true;
  adminSearchTimeout = window.setTimeout(() => {
    loadAdminUsers({
      query: value,
      preserveSelection: false,
      restoreSearchFocus: true
    });
  }, 250);
}

function createAdminRoleSelect(user) {
  const select = document.createElement("select");
  select.id = "adminUserRole";
  select.name = "role";
  select.disabled = isSelectedAdminSelf(user) || isDeveloperUser(user);

  const roles = isDeveloperUser(user)
    ? ["developer"]
    : getStandardAdminRoles();

  roles.forEach(role => {
    const option = document.createElement("option");
    option.value = role;
    option.textContent = translate(`role_${role}`);
    select.append(option);
  });

  select.value = user?.role || "subscriber";

  return select;
}

function createAdminContentAreaOptions(user) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-content-area-options";
  const selectedAreas = new Set(user?.contentAreas || []);

  adminWorkZoneState.contentAreas.forEach(area => {
    const label = document.createElement("label");
    label.className = "admin-content-area-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = area;
    input.checked = selectedAreas.has(area);

    const text = document.createElement("span");
    text.textContent = formatAdminContentArea(area);

    label.append(input, text);
    wrapper.append(label);
  });

  return wrapper;
}

function getSelectedAdminContentAreas(form) {
  return Array
    .from(form.querySelectorAll(".admin-content-area-option input:checked"))
    .map(input => input.value);
}

function createAdminPostItem(post) {
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
    post.contentArea ? formatAdminContentArea(post.contentArea) : "",
    formatAdminDate(post.updatedAt || post.createdAt)
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
  deleteButton.addEventListener("click", () => {
    deleteAdminPost(post);
  });

  item.append(deleteButton);

  return item;
}

function createAdminEditor() {
  const panel = document.createElement("div");
  panel.className = "admin-user-detail-panel";

  const user = adminWorkZoneState.selectedUser;

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
  title.textContent = getAdminDisplayName(user);

  const meta = document.createElement("p");
  meta.textContent = [
    user.email || user.username || "",
    translate("admin_users_joined", {
      date: formatAdminDate(user.createdAt)
    })
  ].filter(Boolean).join(" · ");

  identity.append(title, createAdminRoleBadge(user.role), meta);
  header.append(identity);

  const form = document.createElement("form");
  form.className = "admin-user-editor";

  const roleField = document.createElement("label");
  roleField.className = "admin-editor-field";

  const roleLabel = document.createElement("span");
  roleLabel.textContent = translate("admin_users_role_label");

  roleField.append(roleLabel, createAdminRoleSelect(user));

  if (isSelectedAdminSelf(user)) {
    const roleHelp = document.createElement("small");
    roleHelp.className = "admin-editor-help";
    roleHelp.textContent = translate("admin_users_self_role_help");
    roleField.append(roleHelp);
  } else if (isDeveloperUser(user)) {
    const roleHelp = document.createElement("small");
    roleHelp.className = "admin-editor-help";
    roleHelp.textContent = translate("admin_users_developer_role_help");
    roleField.append(roleHelp);
  }

  const contentField = document.createElement("fieldset");
  contentField.className = "admin-editor-fieldset";

  const legend = document.createElement("legend");
  legend.textContent = translate("admin_users_content_areas_label");

  contentField.append(legend, createAdminContentAreaOptions(user));

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "admin-work-zone-button is-primary";
  save.textContent = translate("admin_users_save");

  form.append(roleField, contentField, save);

  if (!isDeveloperUser(user)) {
    const promoteDeveloper = document.createElement("button");
    promoteDeveloper.type = "button";
    promoteDeveloper.className = "admin-work-zone-button is-danger";
    promoteDeveloper.textContent = translate("admin_users_promote_developer");
    promoteDeveloper.addEventListener("click", () => {
      promoteAdminUserToDeveloper(user);
    });
    form.append(promoteDeveloper);
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const payload = {
      contentAreas: getSelectedAdminContentAreas(form)
    };

    if (!isDeveloperUser(user)) {
      payload.role = form.elements.role.value;
    }

    saveAdminUser(user._id, payload);
  });

  const postsPanel = document.createElement("div");
  postsPanel.className = "admin-posts-panel";

  const postsHeading = document.createElement("h4");
  postsHeading.textContent = translate("admin_users_posts_heading", {
    count: adminWorkZoneState.posts.length
  });
  postsPanel.append(postsHeading);

  if (!adminWorkZoneState.posts.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = translate("admin_users_posts_empty");
    postsPanel.append(empty);
  } else {
    adminWorkZoneState.posts.forEach(post => {
      postsPanel.append(createAdminPostItem(post));
    });
  }

  panel.append(header, form, postsPanel);

  return panel;
}

function createAdminMediaAttachment(attachment) {
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

function createAdminMediaCard(mediaItem) {
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
    formatAdminFileSize(mediaItem.size),
    mediaItem.lastModified
      ? translate("admin_media_modified", {
        date: formatAdminDate(mediaItem.lastModified)
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
      list.append(createAdminMediaAttachment(attachment));
    });
    attachments.append(list);
  }

  const actions = document.createElement("div");
  actions.className = "admin-media-actions";

  const open = document.createElement("a");
  open.className = "admin-work-zone-button is-secondary";
  open.href = mediaItem.url;
  open.target = "_blank";
  open.rel = "noopener";
  open.textContent = translate("admin_media_open");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "admin-work-zone-button is-danger";
  remove.textContent = attachmentCount ? translate("admin_media_in_use") : translate("admin_delete");
  remove.disabled = Boolean(attachmentCount);
  remove.addEventListener("click", () => deleteAdminMedia(mediaItem));

  actions.append(open, remove);
  body.append(title, meta, attachments, actions);
  card.append(previewLink, body);

  return card;
}

function createAdminMediaLibrary() {
  const panel = document.createElement("div");
  panel.className = "admin-media-library";

  const header = document.createElement("div");
  header.className = "admin-media-heading";

  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = translate("admin_media_heading");

  const intro = document.createElement("p");
  intro.textContent = adminWorkZoneState.mediaBucket
    ? translate("admin_media_intro_bucket", {
      bucket: adminWorkZoneState.mediaBucket
    })
    : translate("admin_media_intro");

  copy.append(title, intro);

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "admin-work-zone-button is-secondary";
  refresh.textContent = translate("admin_refresh");
  refresh.disabled = adminWorkZoneState.mediaIsLoading;
  refresh.addEventListener("click", () => loadAdminMedia());

  header.append(copy, refresh);
  panel.append(header);

  if (adminWorkZoneState.mediaIsLoading && !adminWorkZoneState.media.length) {
    panel.append(createLoadingSpinner(translate("admin_media_loading")));
    return panel;
  }

  if (!adminWorkZoneState.media.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = translate("admin_media_empty");
    panel.append(empty);
    return panel;
  }

  const grid = document.createElement("div");
  grid.className = "admin-media-grid";
  adminWorkZoneState.media.forEach(mediaItem => {
    grid.append(createAdminMediaCard(mediaItem));
  });
  panel.append(grid);

  if (adminWorkZoneState.mediaIsTruncated) {
    const loadMore = document.createElement("button");
    loadMore.type = "button";
    loadMore.className = "admin-work-zone-button is-secondary admin-media-load-more";
    loadMore.textContent = adminWorkZoneState.mediaIsLoading
      ? translate("loading_text")
      : translate("admin_media_load_more");
    loadMore.disabled = adminWorkZoneState.mediaIsLoading;
    loadMore.addEventListener("click", () => loadAdminMedia({
      append: true,
      cursor: adminWorkZoneState.mediaNextCursor
    }));
    panel.append(loadMore);
  }

  return panel;
}

function renderAdminWorkZone() {
  const content = [
    createAdminMessage()
  ];

  if (adminWorkZoneState.activeView === "media") {
    content.push(createAdminMediaLibrary());
  } else {
    content.push(createAdminUserList(), createAdminEditor());
  }

  adminWorkZoneContent.replaceChildren(...content);
}

async function loadAdminUsers({
  query = adminWorkZoneState.searchQuery,
  preserveSelection = true,
  restoreSearchFocus = false
} = {}) {
  const cleanQuery = String(query || "").trim();

  if (restoreSearchFocus) {
    shouldRestoreAdminSearchFocus = true;
  }

  setAdminWorkZoneState({
    isLoading: true,
    message: "",
    searchQuery: cleanQuery
  });

  try {
    const params = new URLSearchParams();

    if (cleanQuery) {
      params.set("query", cleanQuery);
    }

    const requestUrl = params.toString()
      ? `/api/admin/users?${params}`
      : "/api/admin/users";

    const data = await adminApiJson(requestUrl, {
      errorMessage: translate("admin_users_load_error")
    });

    const selectedUserId = preserveSelection &&
      data.users?.some(user => String(user._id) === adminWorkZoneState.selectedUserId)
      ? adminWorkZoneState.selectedUserId
      : data.users?.[0]?._id || "";
    const selectionChanged =
      selectedUserId !== adminWorkZoneState.selectedUserId;

    if (restoreSearchFocus) {
      shouldRestoreAdminSearchFocus = true;
    }

    setAdminWorkZoneState({
      users: data.users || [],
      roles: data.roles || [],
      contentAreas: data.contentAreas || [],
      selectedUserId,
      selectedUser: selectedUserId && !selectionChanged
        ? adminWorkZoneState.selectedUser
        : null,
      posts: selectedUserId && !selectionChanged
        ? adminWorkZoneState.posts
        : [],
      isLoading: false
    });
    showAdminWorkZone();

    if (selectedUserId) {
      await loadAdminUserDetail(selectedUserId, {
        restoreSearchFocus
      });
    }
  } catch (error) {
    showAdminWorkZone();

    if (restoreSearchFocus) {
      shouldRestoreAdminSearchFocus = true;
    }

    setAdminWorkZoneState({
      isLoading: false,
      message: error.message || translate("admin_users_load_error")
    });
  }
}

async function loadAdminMedia({
  append = false,
  cursor = ""
} = {}) {
  setAdminWorkZoneState({
    mediaIsLoading: true,
    message: ""
  });

  try {
    const params = new URLSearchParams();
    params.set("limit", "100");

    if (cursor) {
      params.set("cursor", cursor);
    }

    const data = await adminApiJson(`/api/admin/media?${params}`, {
      errorMessage: translate("admin_media_load_error")
    });

    setAdminWorkZoneState({
      media: append
        ? [...adminWorkZoneState.media, ...(data.media || [])]
        : data.media || [],
      mediaNextCursor: data.nextCursor || "",
      mediaIsTruncated: Boolean(data.isTruncated),
      mediaBucket: data.bucket || "",
      mediaIsLoading: false
    });
  } catch (error) {
    setAdminWorkZoneState({
      mediaIsLoading: false,
      message: error.message || translate("admin_media_load_error")
    });
  }
}

async function deleteAdminMedia(mediaItem) {
  if (mediaItem.attachedPostCount) {
    setAdminWorkZoneState({
      message: translate("admin_media_delete_attached_error")
    });
    return;
  }

  if (
    !window.confirm(
      translate("admin_media_delete_confirm", {
        key: mediaItem.key
      })
    )
  ) {
    return;
  }

  setAdminWorkZoneState({
    message: ""
  });

  try {
    const data = await adminApiJson(
      `/api/admin/media/${encodeURIComponent(mediaItem.key)}`,
      {
        method: "DELETE",
        errorMessage: translate("admin_media_delete_error")
      }
    );

    setAdminWorkZoneState({
      media: adminWorkZoneState.media.filter(item => item.key !== mediaItem.key),
      message: data.message || translate("admin_media_delete_success")
    });
  } catch (error) {
    const attachedCount = error.data?.attachedPosts?.length || 0;
    const fallback = attachedCount
      ? translate(
        attachedCount === 1
          ? "admin_media_delete_attached_count_singular"
          : "admin_media_delete_attached_count_plural",
        { count: attachedCount }
      )
      : translate("admin_media_delete_error");

    setAdminWorkZoneState({
      message: attachedCount ? fallback : error.message || fallback
    });
  }
}

async function loadCurrentAdmin() {
  const user = await adminApiJson("/api/me", {
    errorMessage: translate("admin_verify_error")
  });

  if (user.permissions?.canManageUsers !== true) {
    window.location.href = "/dashboard.html";
    return null;
  }

  setAdminWorkZoneState({
    currentUserId: user._id || user.id || "",
    currentUserRole: user.role || ""
  });

  window.updateAdminWorkZoneTabsForUser(user);

  return user;
}

async function loadAdminUserDetail(userId, {
  restoreSearchFocus = false
} = {}) {
  if (!userId) return;

  if (restoreSearchFocus) {
    shouldRestoreAdminSearchFocus = true;
  }

  setAdminWorkZoneState({
    selectedUserId: String(userId),
    message: ""
  });

  try {
    const data = await adminApiJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
      errorMessage: translate("admin_users_detail_load_error")
    });

    if (restoreSearchFocus) {
      shouldRestoreAdminSearchFocus = true;
    }

    setAdminWorkZoneState({
      selectedUser: data.user,
      posts: data.posts || [],
      roles: data.roles || adminWorkZoneState.roles,
      contentAreas: data.contentAreas || adminWorkZoneState.contentAreas
    });
  } catch (error) {
    if (restoreSearchFocus) {
      shouldRestoreAdminSearchFocus = true;
    }

    setAdminWorkZoneState({
      message: error.message || translate("admin_users_detail_load_error")
    });
  }
}

async function saveAdminUser(userId, payload) {
  setAdminWorkZoneState({
    message: ""
  });

  try {
    const data = await adminApiJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: payload,
      errorMessage: translate("admin_users_save_error")
    });

    setAdminWorkZoneState({
      selectedUser: data.user,
      users: adminWorkZoneState.users.map(user =>
        String(user._id) === String(data.user._id)
          ? data.user
          : user
      ),
      message: translate("admin_users_save_success")
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || translate("admin_users_save_error")
    });
  }
}

async function promoteAdminUserToDeveloper(user) {
  const displayName = getAdminDisplayName(user);

  if (
    !window.confirm(
      translate("admin_users_promote_confirm", {
        name: displayName
      })
    )
  ) {
    return;
  }

  if (
    !window.confirm(
      translate("admin_users_promote_access_confirm")
    )
  ) {
    return;
  }

  const confirmation = window.prompt(
    translate("admin_users_promote_prompt")
  );

  if (confirmation !== "DEVELOPER") {
    setAdminWorkZoneState({
      message: translate("admin_users_promote_cancelled")
    });
    return;
  }

  setAdminWorkZoneState({
    message: ""
  });

  try {
    const data = await adminApiJson(
      `/api/admin/users/${encodeURIComponent(user._id)}/developer`,
      {
        method: "PATCH",
        body: {
          confirmed: true,
          confirmation
        },
        errorMessage: translate("admin_users_promote_error")
      }
    );

    setAdminWorkZoneState({
      selectedUser: data.user,
      users: adminWorkZoneState.users.map(existingUser =>
        String(existingUser._id) === String(data.user._id)
          ? data.user
          : existingUser
      ),
      message: translate("admin_users_promote_success")
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || translate("admin_users_promote_error")
    });
  }
}

function getAdminDeleteEndpoint(post) {
  const encodedId = encodeURIComponent(post._id);

  if (post.type === "event") {
    return `/api/admin/events/${encodedId}`;
  }

  if (post.type === "retirementMessage") {
    return `/api/admin/retirement-messages/${encodedId}`;
  }

  if (post.type === "retirementComment") {
    return `/api/admin/retirement-comments/${encodedId}`;
  }

  return "";
}

async function deleteAdminPost(post) {
  const endpoint = getAdminDeleteEndpoint(post);

  if (!endpoint) {
    setAdminWorkZoneState({
      message: translate("admin_content_delete_type_error")
    });
    return;
  }

  if (
    !window.confirm(
      translate("admin_content_delete_confirm", {
        title: post.title || translate("admin_content_this_item")
      })
    )
  ) {
    return;
  }

  setAdminWorkZoneState({
    message: ""
  });

  try {
    const data = await adminApiJson(endpoint, {
      method: "DELETE",
      errorMessage: translate("admin_content_delete_error")
    });

    setAdminWorkZoneState({
      posts: adminWorkZoneState.posts.filter(
        item => String(item._id) !== String(post._id)
      ),
      message: data.message || translate("admin_content_delete_success")
    });

    await loadAdminUsers({
      preserveSelection: true
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || translate("admin_content_delete_error")
    });
  }
}

document.addEventListener("languagechange", () => {
  renderAdminWorkZone();
});

window.addEventListener("pageshow", () => {
  if (!CMCENUtils.requireAuthToken()) {
    window.location.replace("/login.html");
  }
});

async function initializeAdminUsersPage() {
  showAdminLoading();

  try {
    const user = await loadCurrentAdmin();

    if (!user) return;

    await loadAdminUsers();

    if (adminWorkZoneState.activeView === "media") {
      await loadAdminMedia();
    }
  } catch (error) {
    setAdminStatus(error.message || translate("admin_work_zone_load_error"), "error");
  }
}

if (adminToken) {
  initializeAdminUsersPage();
} else {
  setAdminStatus(translate("sign_in_to_continue"));
}
