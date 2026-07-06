function requireAdminToken() {
  const storedToken = String(
    localStorage.getItem("token") ||
    localStorage.getItem("api_token") ||
    ""
  ).trim().replace(/^Bearer\s+/i, "");

  if (!storedToken) {
    window.location.replace("/login.html");
    return null;
  }

  localStorage.setItem("token", storedToken);
  localStorage.setItem("api_token", storedToken);

  return storedToken;
}

const adminToken = requireAdminToken();
const adminWorkZone = document.getElementById("adminWorkZone");
const adminWorkZoneContent = document.getElementById("adminWorkZoneContent");
const adminWorkZoneStatus = document.getElementById("adminWorkZoneStatus");

let adminWorkZoneState = {
  currentUserId: "",
  users: [],
  roles: [],
  contentAreas: [],
  selectedUserId: "",
  selectedUser: null,
  posts: [],
  isLoading: false,
  message: "",
  searchQuery: ""
};
let adminSearchTimeout = 0;
let shouldRestoreAdminSearchFocus = false;

function setAdminStatus(message, state = "") {
  adminWorkZoneStatus.replaceChildren();
  adminWorkZoneStatus.className = "dashboard-status";
  adminWorkZoneStatus.hidden = false;
  adminWorkZoneStatus.removeAttribute("aria-label");

  if (state) {
    adminWorkZoneStatus.classList.add(`is-${state}`);
  }

  const text = document.createElement("p");
  text.textContent = message;
  adminWorkZoneStatus.append(text);
}

function showAdminLoading(message = "Loading users") {
  const spinner = document.createElement("span");
  const label = document.createElement("span");

  spinner.className = "loading-state-spinner";
  spinner.setAttribute("aria-hidden", "true");

  label.className = "visually-hidden";
  label.textContent = message;

  adminWorkZoneStatus.replaceChildren(spinner, label);
  adminWorkZoneStatus.className = "dashboard-status is-loading";
  adminWorkZoneStatus.setAttribute("aria-label", message);
  adminWorkZoneStatus.hidden = false;
  adminWorkZone.hidden = true;
}

function showAdminWorkZone() {
  adminWorkZoneStatus.hidden = true;
  adminWorkZoneStatus.removeAttribute("aria-label");
  adminWorkZone.hidden = false;
}

function formatAdminContentArea(contentArea) {
  return String(contentArea || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function formatAdminDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat(currentLang === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function getAdminDisplayName(user) {
  return user?.accountName || user?.username || user?.email || "Unknown user";
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

function createLoadingSpinner(label) {
  const loading = document.createElement("div");
  loading.className = "loading-state";
  loading.setAttribute("role", "status");
  loading.setAttribute("aria-label", label);

  const spinner = document.createElement("span");
  spinner.className = "loading-state-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "visually-hidden";
  text.textContent = label;

  loading.append(spinner, text);

  return loading;
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
  count.textContent = `${user.postSummary?.total || 0} posts`;

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
  title.textContent = "Users";

  const search = document.createElement("label");
  search.className = "admin-user-search";

  const searchLabel = document.createElement("span");
  searchLabel.textContent = "Search users";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.value = adminWorkZoneState.searchQuery;
  searchInput.placeholder = "Name, username, or email";
  searchInput.autocomplete = "off";
  searchInput.addEventListener("input", event => {
    scheduleAdminUserSearch(event.target.value);
  });

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "admin-work-zone-button is-secondary";
  refresh.textContent = "Refresh";
  refresh.addEventListener("click", () => loadAdminUsers());

  search.append(searchLabel, searchInput);
  header.append(title, refresh);
  panel.append(header, search);

  const list = document.createElement("div");
  list.className = "admin-user-list";

  if (adminWorkZoneState.isLoading && !adminWorkZoneState.users.length) {
    list.append(createLoadingSpinner("Loading users"));
  } else if (!adminWorkZoneState.users.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = adminWorkZoneState.searchQuery
      ? "No users matched your search."
      : "No users found.";
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
  title.textContent = post.title || "Untitled";

  if (post.href) {
    title.href = post.href;
  }

  const typeLabel = {
    event: "Event",
    retirementMessage: "Post",
    retirementComment: "Comment"
  }[post.type] || "Content";

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
  deleteButton.textContent = "Delete";
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
    empty.textContent =
      "Select a user to manage their role, content areas, and posts.";
    panel.append(empty);
    return panel;
  }

  const header = document.createElement("div");
  header.className = "admin-user-detail-heading";

  const identity = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = getAdminDisplayName(user);

  const meta = document.createElement("p");
  meta.textContent =
    `${user.email || user.username || ""} · Joined ${formatAdminDate(user.createdAt)}`;

  identity.append(title, createAdminRoleBadge(user.role), meta);
  header.append(identity);

  const form = document.createElement("form");
  form.className = "admin-user-editor";

  const roleField = document.createElement("label");
  roleField.className = "admin-editor-field";

  const roleLabel = document.createElement("span");
  roleLabel.textContent = "Role";

  roleField.append(roleLabel, createAdminRoleSelect(user));

  if (isSelectedAdminSelf(user)) {
    const roleHelp = document.createElement("small");
    roleHelp.className = "admin-editor-help";
    roleHelp.textContent = "You cannot remove your own administrator access.";
    roleField.append(roleHelp);
  } else if (isDeveloperUser(user)) {
    const roleHelp = document.createElement("small");
    roleHelp.className = "admin-editor-help";
    roleHelp.textContent =
      "Developer accounts are managed outside the standard role dropdown.";
    roleField.append(roleHelp);
  }

  const contentField = document.createElement("fieldset");
  contentField.className = "admin-editor-fieldset";

  const legend = document.createElement("legend");
  legend.textContent = "Content areas";

  contentField.append(legend, createAdminContentAreaOptions(user));

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "admin-work-zone-button is-primary";
  save.textContent = "Save user";

  form.append(roleField, contentField, save);

  if (!isDeveloperUser(user)) {
    const promoteDeveloper = document.createElement("button");
    promoteDeveloper.type = "button";
    promoteDeveloper.className = "admin-work-zone-button is-danger";
    promoteDeveloper.textContent = "Promote to developer";
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
  postsHeading.textContent = `Posts (${adminWorkZoneState.posts.length})`;
  postsPanel.append(postsHeading);

  if (!adminWorkZoneState.posts.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "This user has not posted anything yet.";
    postsPanel.append(empty);
  } else {
    adminWorkZoneState.posts.forEach(post => {
      postsPanel.append(createAdminPostItem(post));
    });
  }

  panel.append(header, form, postsPanel);

  return panel;
}

function renderAdminWorkZone() {
  adminWorkZoneContent.replaceChildren(
    createAdminMessage(),
    createAdminUserList(),
    createAdminEditor()
  );
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

    const response = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("api_token");
      window.location.href = "/login.html";
      return;
    }

    if (response.status === 403) {
      window.location.href = "/dashboard.html";
      return;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not load users");
    }

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
      message: error.message || "Could not load users"
    });
  }
}

async function loadCurrentAdmin() {
  const response = await fetch("/api/me", {
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("api_token");
    window.location.href = "/login.html";
    return null;
  }

  if (!response.ok) {
    throw new Error("Could not verify administrator account");
  }

  const user = await response.json();

  if (user.permissions?.canManageUsers !== true) {
    window.location.href = "/dashboard.html";
    return null;
  }

  setAdminWorkZoneState({
    currentUserId: user._id || user.id || ""
  });

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
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not load user details");
    }

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
      message: error.message || "Could not load user details"
    });
  }
}

async function saveAdminUser(userId, payload) {
  setAdminWorkZoneState({
    message: ""
  });

  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not save user");
    }

    setAdminWorkZoneState({
      selectedUser: data.user,
      users: adminWorkZoneState.users.map(user =>
        String(user._id) === String(data.user._id)
          ? data.user
          : user
      ),
      message: "User updated."
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || "Could not save user"
    });
  }
}

async function promoteAdminUserToDeveloper(user) {
  const displayName = getAdminDisplayName(user);

  if (
    !window.confirm(
      `Promote ${displayName} to DEVELOPER? This grants global superadmin access.`
    )
  ) {
    return;
  }

  if (
    !window.confirm(
      "Developer access can manage all users and administrative areas. Continue?"
    )
  ) {
    return;
  }

  const confirmation = window.prompt(
    'Type "DEVELOPER" to confirm this promotion.'
  );

  if (confirmation !== "DEVELOPER") {
    setAdminWorkZoneState({
      message: "Developer promotion cancelled."
    });
    return;
  }

  setAdminWorkZoneState({
    message: ""
  });

  try {
    const response = await fetch(
      `/api/admin/users/${encodeURIComponent(user._id)}/developer`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          confirmed: true,
          confirmation
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not promote user to developer");
    }

    setAdminWorkZoneState({
      selectedUser: data.user,
      users: adminWorkZoneState.users.map(existingUser =>
        String(existingUser._id) === String(data.user._id)
          ? data.user
          : existingUser
      ),
      message: "User promoted to developer."
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || "Could not promote user to developer"
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
      message: "This content type cannot be deleted here."
    });
    return;
  }

  if (
    !window.confirm(
      `Delete "${post.title || "this item"}"? This will be recorded in the audit log.`
    )
  ) {
    return;
  }

  setAdminWorkZoneState({
    message: ""
  });

  try {
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not delete content");
    }

    setAdminWorkZoneState({
      posts: adminWorkZoneState.posts.filter(
        item => String(item._id) !== String(post._id)
      ),
      message: data.message || "Content deleted."
    });

    await loadAdminUsers({
      preserveSelection: true
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || "Could not delete content"
    });
  }
}

document.addEventListener("languagechange", () => {
  renderAdminWorkZone();
});

window.addEventListener("pageshow", () => {
  if (!requireAdminToken()) {
    window.location.replace("/login.html");
  }
});

async function initializeAdminUsersPage() {
  showAdminLoading();

  try {
    const user = await loadCurrentAdmin();

    if (!user) return;

    await loadAdminUsers();
  } catch (error) {
    setAdminStatus(error.message || "Could not load admin work zone.", "error");
  }
}

if (adminToken) {
  initializeAdminUsersPage();
} else {
  setAdminStatus("Sign in to continue.");
}
