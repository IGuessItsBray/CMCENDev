const adminToken = CMCENUtils.requireAuthToken();
const adminWorkZone = document.getElementById("adminWorkZone");
const adminWorkZoneStatus = document.getElementById("adminWorkZoneStatus");

let adminWorkZoneState = {
  activeView: new URLSearchParams(window.location.search).get("view") === "media"
    ? "media"
    : "users",
  currentUserId: "",
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

const adminUsersView = CMCENAdminUsersView.create({
  root: document.getElementById("adminWorkZoneContent"),
  getState: () => adminWorkZoneState,
  actions: {
    loadUserDetail: loadAdminUserDetail,
    searchUsers: scheduleAdminUserSearch,
    refreshUsers: () => loadAdminUsers(),
    saveUser: saveAdminUser,
    promoteDeveloper: promoteAdminUserToDeveloper,
    deletePost: deleteAdminPost,
    refreshMedia: () => loadAdminMedia(),
    loadMoreMedia: cursor => loadAdminMedia({
      append: true,
      cursor
    }),
    deleteMedia: deleteAdminMedia
  }
});

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

function setAdminWorkZoneState(nextState) {
  adminWorkZoneState = {
    ...adminWorkZoneState,
    ...nextState
  };
  adminUsersView.render();
}

function scheduleAdminUserSearch(value) {
  window.clearTimeout(adminSearchTimeout);
  adminUsersView.restoreSearchFocus();
  adminSearchTimeout = window.setTimeout(() => {
    loadAdminUsers({
      query: value,
      preserveSelection: false,
      restoreSearchFocus: true
    });
  }, 250);
}

async function loadAdminUsers({
  query = adminWorkZoneState.searchQuery,
  preserveSelection = true,
  restoreSearchFocus = false
} = {}) {
  const cleanQuery = String(query || "").trim();

  if (restoreSearchFocus) {
    adminUsersView.restoreSearchFocus();
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
      adminUsersView.restoreSearchFocus();
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
      adminUsersView.restoreSearchFocus();
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
    currentUserId: user._id || user.id || ""
  });

  window.updateAdminWorkZoneTabsForUser(user);

  return user;
}

async function loadAdminUserDetail(userId, {
  restoreSearchFocus = false
} = {}) {
  if (!userId) return;

  if (restoreSearchFocus) {
    adminUsersView.restoreSearchFocus();
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
      adminUsersView.restoreSearchFocus();
    }

    setAdminWorkZoneState({
      selectedUser: data.user,
      posts: data.posts || [],
      roles: data.roles || adminWorkZoneState.roles,
      contentAreas: data.contentAreas || adminWorkZoneState.contentAreas
    });
  } catch (error) {
    if (restoreSearchFocus) {
      adminUsersView.restoreSearchFocus();
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
  const displayName = CMCENUtils.getUserDisplayName(
    user,
    translate("unknown_user")
  );

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
  adminUsersView.render();
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
