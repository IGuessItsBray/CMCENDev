const adminToken = CMCENUtils.requireAuthToken();
const adminWorkZone = document.getElementById("adminWorkZone");
const adminWorkZoneStatus = document.getElementById("adminWorkZoneStatus");

let adminWorkZoneState = {
  activeView: ["media", "roles"].includes(new URLSearchParams(window.location.search).get("view"))
    ? new URLSearchParams(window.location.search).get("view")
    : "users",
  currentUserId: "",
  currentUserPermissions: {},
  users: [],
  roles: [],
  customRoles: [],
  permissionCatalog: [],
  userListLimit: 50,
  userListHasMore: false,
  selectedRoleId: "",
  contentAreas: [],
  selectedUserId: "",
  selectedUser: null,
  posts: [],
  media: [],
  mediaNextCursor: "",
  mediaIsTruncated: false,
  mediaBucket: "",
  mediaIsLoading: false,
  mediaSort: "newest",
  selectedMediaKeys: [],
  mediaUploadQueue: [],
  mediaIsUploading: false,
  isLoading: false,
  message: "",
  searchQuery: ""
};
let adminSearchTimeout = 0;
let adminUserSearchRequestId = 0;

const adminUsersView = CMCENAdminUsersView.create({
  root: document.getElementById("adminWorkZoneContent"),
  getState: () => adminWorkZoneState,
  actions: {
    loadUserDetail: loadAdminUserDetail,
    searchUsers: scheduleAdminUserSearch,
    refreshUsers: () => loadAdminUsers(),
    showMoreUsers: () => loadAdminUsers({
      limit: Math.min((adminWorkZoneState.userListLimit || 50) + 50, 100),
      preserveSelection: true
    }),
    exportUsers: exportAdminUsers,
    saveUser: saveAdminUser,
    resetMfa: resetAdminUserMfa,
    promoteDeveloper: promoteAdminUserToDeveloper,
    selectRole: selectAdminRole,
    createRole: createAdminRole,
    saveRole: saveAdminRole,
    deleteRole: deleteAdminRole,
    deletePost: deleteAdminPost,
    refreshMedia: () => loadAdminMedia(),
    loadMoreMedia: cursor => loadAdminMedia({
      append: true,
      cursor
    }),
    setMediaSort: sort => {
      setAdminWorkZoneState({ mediaSort: sort || "newest" });
      loadAdminMedia({ sort: sort || "newest" });
    },
    toggleMediaSelection: toggleAdminMediaSelection,
    selectVisibleMedia: selectVisibleAdminMedia,
    clearMediaSelection: clearAdminMediaSelection,
    uploadMediaFiles: uploadAdminMediaFiles,
    deleteMedia: deleteAdminMedia,
    deleteSelectedMedia: deleteSelectedAdminMedia
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
      window.location.href = "/dashboard";
    }

    throw error;
  }
}

async function adminApiBlob(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${adminToken}`
    }
  });

  if (response.status === 401) {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new Error(translate("admin_verify_error"));
  }

  if (response.status === 403) {
    window.location.href = "/dashboard";
    throw new Error(translate("admin_verify_error"));
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || options.errorMessage || translate("admin_verify_error"));
  }

  return {
    blob: await response.blob(),
    filename: getDownloadFilename(response.headers.get("Content-Disposition"))
  };
}

function getDownloadFilename(contentDisposition) {
  const header = String(contentDisposition || "");
  const match = header.match(/filename="?([^"]+)"?/iu);

  return match?.[1] || "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function setAdminWorkZoneState(nextState, { render = true } = {}) {
  adminWorkZoneState = {
    ...adminWorkZoneState,
    ...nextState
  };

  if (render) {
    adminUsersView.render();
  }
}

function scheduleAdminUserSearch(value) {
  const query = String(value || "");
  const requestId = adminUserSearchRequestId + 1;

  adminUserSearchRequestId = requestId;

  window.clearTimeout(adminSearchTimeout);
  setAdminWorkZoneState({
    searchQuery: query
  }, {
    render: false
  });

  adminSearchTimeout = window.setTimeout(() => {
    loadAdminUsers({
      query,
      preserveSelection: false,
      restoreSearchFocus: true,
      suppressLoadingRender: true,
      searchRequestId: requestId
    });
  }, 250);
}

async function loadAdminUsers({
  query = adminWorkZoneState.searchQuery,
  limit = adminWorkZoneState.userListLimit || 50,
  preserveSelection = true,
  restoreSearchFocus = false,
  suppressLoadingRender = false,
  searchRequestId = null
} = {}) {
  const cleanQuery = String(query || "").trim();
  const requestId = searchRequestId || adminUserSearchRequestId;

  if (restoreSearchFocus) {
    adminUsersView.restoreSearchFocus();
  }

  setAdminWorkZoneState({
    isLoading: true,
    message: "",
    searchQuery: cleanQuery
  }, {
    render: !suppressLoadingRender
  });

  try {
    const params = new URLSearchParams();

    if (cleanQuery) {
      params.set("query", cleanQuery);
    }
    params.set("limit", String(limit));

    const requestUrl = params.toString()
      ? `/api/admin/users?${params}`
      : "/api/admin/users";

    const data = await adminApiJson(requestUrl, {
      errorMessage: translate("admin_users_load_error")
    });

    if (restoreSearchFocus && requestId !== adminUserSearchRequestId) {
      return;
    }

    const selectedUserId = preserveSelection &&
      data.users?.some(user => String(user._id) === adminWorkZoneState.selectedUserId)
      ? adminWorkZoneState.selectedUserId
      : "";
    const selectionChanged =
      selectedUserId !== adminWorkZoneState.selectedUserId;

    if (restoreSearchFocus) {
      adminUsersView.restoreSearchFocus();
    }

    setAdminWorkZoneState({
      users: data.users || [],
      userListLimit: data.limit || limit,
      userListHasMore: Boolean(data.hasMore),
      roles: data.roles || [],
      customRoles: data.customRoles || [],
      permissionCatalog: data.permissionCatalog || [],
      selectedRoleId:
        adminWorkZoneState.selectedRoleId &&
        data.customRoles?.some(role => String(role._id) === adminWorkZoneState.selectedRoleId)
          ? adminWorkZoneState.selectedRoleId
          : data.customRoles?.[0]?._id || "",
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

    if (selectedUserId && selectionChanged) {
      await loadAdminUserDetail(selectedUserId, {
        restoreSearchFocus
      });
    }
  } catch (error) {
    if (restoreSearchFocus && requestId !== adminUserSearchRequestId) {
      return;
    }

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

async function loadAdminRoles() {
  setAdminWorkZoneState({
    isLoading: true,
    message: ""
  });

  try {
    const data = await adminApiJson("/api/admin/roles", {
      errorMessage: "Could not load roles"
    });
    const roles = data.roles || [];

    setAdminWorkZoneState({
      customRoles: roles,
      permissionCatalog: data.permissionCatalog || [],
      selectedRoleId:
        adminWorkZoneState.selectedRoleId &&
        roles.some(role => String(role._id) === adminWorkZoneState.selectedRoleId)
          ? adminWorkZoneState.selectedRoleId
          : roles[0]?._id || "",
      isLoading: false
    });
    showAdminWorkZone();
  } catch (error) {
    showAdminWorkZone();
    setAdminWorkZoneState({
      isLoading: false,
      message: error.message || "Could not load roles"
    });
  }
}

async function loadAdminMedia({
  append = false,
  cursor = "",
  sort = adminWorkZoneState.mediaSort || "newest"
} = {}) {
  setAdminWorkZoneState({
    mediaIsLoading: true,
    message: ""
  });

  try {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("sort", sort);

    if (cursor) {
      params.set("cursor", cursor);
    }

    const data = await adminApiJson(`/api/admin/media?${params}`, {
      errorMessage: translate("admin_media_load_error")
    });

    const nextMedia = append
      ? [...adminWorkZoneState.media, ...(data.media || [])]
      : data.media || [];
    const visibleKeys = new Set(nextMedia.map(item => item.key));

    setAdminWorkZoneState({
      media: nextMedia,
      mediaNextCursor: data.nextCursor || "",
      mediaIsTruncated: Boolean(data.isTruncated),
      mediaBucket: data.bucket || "",
      mediaSort: data.sort || sort,
      selectedMediaKeys: (adminWorkZoneState.selectedMediaKeys || [])
        .filter(key => visibleKeys.has(key)),
      mediaIsLoading: false
    });
    showAdminWorkZone();
  } catch (error) {
    showAdminWorkZone();
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

  if (!await CMCENModal.confirm(
    translate("admin_media_delete_confirm", {
      key: mediaItem.key
    }),
    {
      title: translate("mfa_delete"),
      confirmText: translate("mfa_delete"),
      destructive: true
    }
  )) {
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
      selectedMediaKeys: (adminWorkZoneState.selectedMediaKeys || [])
        .filter(key => key !== mediaItem.key),
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

function toggleAdminMediaSelection(mediaItem, selected) {
  const key = mediaItem?.key;
  if (!key) return;

  const selectedKeys = new Set(adminWorkZoneState.selectedMediaKeys || []);

  if (selected) {
    selectedKeys.add(key);
  } else {
    selectedKeys.delete(key);
  }

  setAdminWorkZoneState({
    selectedMediaKeys: [...selectedKeys]
  });
}

function selectVisibleAdminMedia() {
  setAdminWorkZoneState({
    selectedMediaKeys: [
      ...new Set([
        ...(adminWorkZoneState.selectedMediaKeys || []),
        ...adminWorkZoneState.media.map(item => item.key).filter(Boolean)
      ])
    ]
  });
}

function clearAdminMediaSelection() {
  setAdminWorkZoneState({
    selectedMediaKeys: []
  });
}

async function deleteSelectedAdminMedia() {
  const selectedKeys = new Set(adminWorkZoneState.selectedMediaKeys || []);
  const selectedItems = adminWorkZoneState.media.filter(item => selectedKeys.has(item.key));
  const removableItems = selectedItems.filter(item => !Number(item.attachedPostCount || 0));

  if (!removableItems.length) {
    setAdminWorkZoneState({
      message: translate("admin_media_bulk_delete_none")
    });
    return;
  }

  if (!await CMCENModal.confirm(
    translate("admin_media_bulk_delete_confirm", {
      count: removableItems.length
    }),
    {
      title: translate("mfa_delete"),
      confirmText: translate("mfa_delete"),
      destructive: true
    }
  )) {
    return;
  }

  setAdminWorkZoneState({
    message: ""
  });

  try {
    const data = await adminApiJson("/api/admin/media/bulk-delete", {
      method: "POST",
      body: JSON.stringify({
        keys: removableItems.map(item => item.key)
      }),
      errorMessage: translate("admin_media_bulk_delete_error")
    });
    const deletedKeys = new Set(data.deleted || []);
    const skippedCount = Number(data.skipped?.length || 0);
    const missingCount = Number(data.missing?.length || 0);
    const parts = [
      translate("admin_media_bulk_delete_success", {
        count: deletedKeys.size
      })
    ];

    if (skippedCount) {
      parts.push(translate("admin_media_bulk_delete_skipped", {
        count: skippedCount
      }));
    }

    if (missingCount) {
      parts.push(translate("admin_media_bulk_delete_missing", {
        count: missingCount
      }));
    }

    setAdminWorkZoneState({
      media: adminWorkZoneState.media.filter(item => !deletedKeys.has(item.key)),
      selectedMediaKeys: (adminWorkZoneState.selectedMediaKeys || [])
        .filter(key => !deletedKeys.has(key)),
      message: parts.join(" ")
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || translate("admin_media_bulk_delete_error")
    });
  }
}

function updateMediaUploadItem(id, update) {
  setAdminWorkZoneState({
    mediaUploadQueue: adminWorkZoneState.mediaUploadQueue.map(item =>
      item.id === id
        ? { ...item, ...update }
        : item
    )
  });
}

function uploadSingleAdminMediaFile(file, id) {
  const formData = new FormData();
  formData.append("image", file);

  return new Promise(resolve => {
    const request = new XMLHttpRequest();

    request.open("POST", "/api/upload");
    request.setRequestHeader("Authorization", `Bearer ${adminToken}`);

    request.upload.addEventListener("progress", event => {
      if (!event.lengthComputable) return;

      updateMediaUploadItem(id, {
        status: "uploading",
        progress: Math.round((event.loaded / event.total) * 100)
      });
    });

    request.addEventListener("load", () => {
      const data = JSON.parse(request.responseText || "{}");

      if (request.status < 200 || request.status >= 300) {
        updateMediaUploadItem(id, {
          status: "error",
          progress: 0,
          message: data.error || "Upload failed"
        });
        resolve(null);
        return;
      }

      updateMediaUploadItem(id, {
        status: "complete",
        progress: 100,
        message: "Uploaded"
      });
      resolve(data);
    });

    request.addEventListener("error", () => {
      updateMediaUploadItem(id, {
        status: "error",
        progress: 0,
        message: "Upload failed"
      });
      resolve(null);
    });

    request.send(formData);
  });
}

async function uploadAdminMediaFiles(files) {
  const imageFiles = [...(files || [])].filter(file => file.type.startsWith("image/"));

  if (!imageFiles.length) {
    setAdminWorkZoneState({ message: "Choose one or more image files to upload." });
    return;
  }

  const uploadItems = imageFiles.map((file, index) => ({
    id: `${Date.now()}-${index}-${file.name}`,
    name: file.name,
    size: file.size,
    status: "queued",
    progress: 0,
    message: ""
  }));

  setAdminWorkZoneState({
    mediaUploadQueue: uploadItems,
    mediaIsUploading: true,
    message: ""
  });

  const uploadConcurrency = 4;
  let nextUploadIndex = 0;
  const uploadWorker = async () => {
    while (nextUploadIndex < uploadItems.length) {
      const itemIndex = nextUploadIndex;
      nextUploadIndex += 1;
      const item = uploadItems[itemIndex];
      const file = imageFiles[itemIndex];
      if (!file) continue;
      updateMediaUploadItem(item.id, {
        status: "uploading",
        progress: 0,
        message: "Preparing image"
      });
      updateMediaUploadItem(item.id, {
        name: file.name,
        size: file.size,
        message: "Processing variants"
      });
      await uploadSingleAdminMediaFile(file, item.id);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(uploadConcurrency, uploadItems.length) },
      () => uploadWorker()
    )
  );

  setAdminWorkZoneState({
    mediaIsUploading: false
  });
  await loadAdminMedia();
}

async function loadCurrentAdmin() {
  const user = await adminApiJson("/api/me", {
    errorMessage: translate("admin_verify_error")
  });
  const requiredPermission = {
    media: "canViewMediaLibrary",
    roles: "canManageRoles",
    users: "canReadUsers"
  }[adminWorkZoneState.activeView] || "canReadUsers";

  if (user.permissions?.[requiredPermission] !== true) {
    window.location.href = "/dashboard";
    return null;
  }

  setAdminWorkZoneState({
    currentUserId: user._id || user.id || "",
    currentUserPermissions: user.permissions || {}
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
      customRoles: data.customRoles || adminWorkZoneState.customRoles,
      permissionCatalog: data.permissionCatalog || adminWorkZoneState.permissionCatalog,
      selectedRoleId:
        adminWorkZoneState.selectedRoleId &&
        (data.customRoles || adminWorkZoneState.customRoles)
          .some(role => String(role._id) === adminWorkZoneState.selectedRoleId)
          ? adminWorkZoneState.selectedRoleId
          : (data.customRoles || adminWorkZoneState.customRoles)[0]?._id || "",
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
      customRoles: data.customRoles || adminWorkZoneState.customRoles,
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

async function exportAdminUsers(format, options = {}) {
  const params = new URLSearchParams();

  params.set("format", format === "pdf" ? "pdf" : "csv");

  params.set("includeRoles", (options.includeRoles || []).join(","));
  params.set("includeAccountTypes", (options.includeAccountTypes || []).join(","));

  setAdminWorkZoneState({
    message: translate("admin_users_export_preparing")
  });

  try {
    const { blob, filename } = await adminApiBlob(
      `/api/admin/users/export?${params}`,
      {
        errorMessage: translate("admin_users_export_error")
      }
    );

    downloadBlob(
      blob,
      filename || `cmcen-users.${format === "pdf" ? "pdf" : "csv"}`
    );
    setAdminWorkZoneState({
      message: translate("admin_users_export_success")
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || translate("admin_users_export_error")
    });
  }
}

async function resetAdminUserMfa(user) {
  if (!user?._id) return;

  if (!await CMCENModal.confirm(
    translate("admin_users_mfa_reset_confirm", {
      name: CMCENUtils.getUserDisplayName(user, translate("unknown_user"))
    }),
    {
      title: translate("admin_users_mfa_reset"),
      confirmText: translate("admin_users_mfa_reset"),
      destructive: true
    }
  )) {
    return;
  }

  setAdminWorkZoneState({
    message: ""
  });

  try {
    const data = await adminApiJson(
      `/api/admin/users/${encodeURIComponent(user._id)}/mfa-reset`,
      {
        method: "PATCH",
        errorMessage: translate("admin_users_mfa_reset_error")
      }
    );

    setAdminWorkZoneState({
      selectedUser: data.user,
      users: adminWorkZoneState.users.map(existingUser =>
        String(existingUser._id) === String(data.user._id)
          ? data.user
          : existingUser
      ),
      message: translate("admin_users_mfa_reset_success")
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || translate("admin_users_mfa_reset_error")
    });
  }
}

function selectAdminRole(roleId) {
  setAdminWorkZoneState({
    selectedRoleId: String(roleId || "")
  });
}

function syncAssignedCustomRoles(users, customRoles) {
  const rolesById = new Map(
    (customRoles || []).map(role => [String(role._id), role])
  );

  return (users || []).map(user => ({
    ...user,
    customRoles: (user.customRoleIds || [])
      .map(roleId => rolesById.get(String(roleId)))
      .filter(Boolean)
  }));
}

async function createAdminRole(payload) {
  setAdminWorkZoneState({
    message: ""
  });

  try {
    const data = await adminApiJson("/api/admin/roles", {
      method: "POST",
      body: payload,
      errorMessage: "Could not create role"
    });

    setAdminWorkZoneState({
      customRoles: data.roles || adminWorkZoneState.customRoles,
      users: syncAssignedCustomRoles(
        adminWorkZoneState.users,
        data.roles || adminWorkZoneState.customRoles
      ),
      selectedUser: adminWorkZoneState.selectedUser
        ? syncAssignedCustomRoles(
          [adminWorkZoneState.selectedUser],
          data.roles || adminWorkZoneState.customRoles
        )[0]
        : null,
      selectedRoleId: data.role?._id || adminWorkZoneState.selectedRoleId,
      message: data.message || "Role created"
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || "Could not create role"
    });
  }
}

async function saveAdminRole(roleId, payload) {
  if (!roleId) return;

  setAdminWorkZoneState({
    message: ""
  });

  try {
    const data = await adminApiJson(`/api/admin/roles/${encodeURIComponent(roleId)}`, {
      method: "PATCH",
      body: payload,
      errorMessage: "Could not save role"
    });

    setAdminWorkZoneState({
      customRoles: data.roles || adminWorkZoneState.customRoles,
      users: syncAssignedCustomRoles(
        adminWorkZoneState.users,
        data.roles || adminWorkZoneState.customRoles
      ),
      selectedUser: adminWorkZoneState.selectedUser
        ? syncAssignedCustomRoles(
          [adminWorkZoneState.selectedUser],
          data.roles || adminWorkZoneState.customRoles
        )[0]
        : null,
      selectedRoleId: data.role?._id || roleId,
      message: data.message || "Role updated"
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || "Could not save role"
    });
  }
}

async function deleteAdminRole(role) {
  if (!role?._id) return;

  if (!await CMCENModal.confirm(
    `Delete role "${role.name}"? It will be removed from every assigned member.`,
    {
      title: translate("mfa_delete"),
      confirmText: translate("mfa_delete"),
      destructive: true
    }
  )) {
    return;
  }

  setAdminWorkZoneState({
    message: ""
  });

  try {
    const data = await adminApiJson(`/api/admin/roles/${encodeURIComponent(role._id)}`, {
      method: "DELETE",
      errorMessage: "Could not delete role"
    });
    const nextRoles = data.roles || [];

    setAdminWorkZoneState({
      customRoles: nextRoles,
      selectedRoleId: nextRoles[0]?._id || "",
      users: adminWorkZoneState.users.map(user => ({
        ...user,
        customRoles: (user.customRoles || []).filter(
          assignedRole => String(assignedRole._id) !== String(role._id)
        ),
        customRoleIds: (user.customRoleIds || []).filter(
          assignedRoleId => String(assignedRoleId) !== String(role._id)
        )
      })),
      selectedUser: adminWorkZoneState.selectedUser
        ? {
          ...adminWorkZoneState.selectedUser,
          customRoles: (adminWorkZoneState.selectedUser.customRoles || []).filter(
            assignedRole => String(assignedRole._id) !== String(role._id)
          ),
          customRoleIds: (adminWorkZoneState.selectedUser.customRoleIds || []).filter(
            assignedRoleId => String(assignedRoleId) !== String(role._id)
          )
        }
        : null,
      message: data.message || "Role deleted"
    });
  } catch (error) {
    setAdminWorkZoneState({
      message: error.message || "Could not delete role"
    });
  }
}

async function promoteAdminUserToDeveloper(user) {
  const displayName = CMCENUtils.getUserDisplayName(
    user,
    translate("unknown_user")
  );

  if (!await CMCENModal.confirm(
    translate("admin_users_promote_confirm", {
      name: displayName
    }),
    {
      title: translate("admin_users_promote_developer"),
      confirmText: translate("modal_confirm")
    }
  )) {
    return;
  }

  if (!await CMCENModal.confirm(
    translate("admin_users_promote_access_confirm"),
    {
      title: translate("admin_users_promote_developer"),
      confirmText: translate("modal_confirm")
    }
  )) {
    return;
  }

  const confirmation = await CMCENModal.prompt(
    translate("admin_users_promote_prompt"),
    {
      title: translate("admin_users_promote_developer"),
      inputLabel: "DEVELOPER",
      confirmText: translate("modal_confirm")
    }
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

  if (!await CMCENModal.confirm(
    translate("admin_content_delete_confirm", {
      title: post.title || translate("admin_content_this_item")
    }),
    {
      title: translate("mfa_delete"),
      confirmText: translate("mfa_delete"),
      destructive: true
    }
  )) {
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
    window.location.replace("/login");
  }
});

async function initializeAdminUsersPage() {
  showAdminLoading();

  try {
    const user = await loadCurrentAdmin();

    if (!user) return;

    if (adminWorkZoneState.activeView === "roles") {
      await loadAdminRoles();
    } else if (adminWorkZoneState.activeView === "media") {
      await loadAdminMedia();
    } else {
      await loadAdminUsers();
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
