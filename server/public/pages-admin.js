const pagesAdminToken = CMCENUtils.requireAuthToken();
const pagesAdminStatus = document.getElementById("pagesAdminStatus");
const pagesAdminPage = document.getElementById("pagesAdminPage");
const pagesAdminContent = document.getElementById("pagesAdminContent");

let pagesState = {
  pages: [],
  navigationItems: [],
  navigationGroups: ["about", "doctrine", "news", "benefits"],
  roles: [],
  customRoles: [],
  permissionCatalog: [],
  selectedPageId: "",
  selectedPage: null,
  message: "",
  isLoading: false,
  canManageNavigation: false
};

function localized(value) {
  return CMCENUtils.getLocalizedText(value);
}

function pageApi(path, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token: pagesAdminToken,
    redirectOnUnauthorized: true,
    unauthorizedMessage: "Authentication required"
  });
}

function getNavigationGroupKey(group) {
  return typeof group === "string" ? group : group?.key || "";
}

function getNavigationGroupLabel(group) {
  if (typeof group === "string") {
    return CMCENUtils.formatTitleCaseValue(group);
  }

  return localized(group?.label) || CMCENUtils.formatTitleCaseValue(group?.key);
}

function showPagesStatus(message, state = "") {
  CMCENUtils.setStatusMessage(pagesAdminStatus, message, state);
  pagesAdminPage.hidden = true;
}

function showPagesLoading(message = "Loading pages...") {
  CMCENUtils.setStatusLoading(pagesAdminStatus, message);
  pagesAdminPage.hidden = true;
}

function showPagesPage() {
  pagesAdminStatus.hidden = true;
  pagesAdminStatus.removeAttribute("aria-label");
  pagesAdminPage.hidden = false;
}

function setPagesState(nextState) {
  pagesState = {
    ...pagesState,
    ...nextState
  };
  renderPagesAdmin();
}

function getEmptyLocalized() {
  return { en: "", fr: "" };
}

function getNewBlock(type = "text") {
  return {
    type,
    level: 2,
    text: getEmptyLocalized(),
    body: getEmptyLocalized(),
    url: "",
    mediaKey: "",
    mediaUrl: "",
    alt: getEmptyLocalized(),
    caption: getEmptyLocalized(),
    variant: "standard"
  };
}

function getDefaultPageAccess() {
  return {
    audience: "public",
    roles: [],
    customRoles: [],
    permissions: []
  };
}

function getSelectedPageAccess() {
  return {
    ...getDefaultPageAccess(),
    ...(pagesState.selectedPage?.access || {})
  };
}

function getCleanSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function updateSelectedPage(update, { render = true } = {}) {
  const selectedPage = {
    ...pagesState.selectedPage,
    ...update
  };

  if (!render) {
    pagesState = {
      ...pagesState,
      selectedPage
    };
    return;
  }

  setPagesState({ selectedPage });
}

function updateLocalizedField(field, language, value) {
  updateSelectedPage({
    [field]: {
      ...(pagesState.selectedPage?.[field] || {}),
      [language]: value
    }
  }, { render: false });
}

function updateBlock(index, update, { render = true } = {}) {
  const blocks = [...(pagesState.selectedPage?.blocks || [])];
  blocks[index] = {
    ...blocks[index],
    ...update
  };
  updateSelectedPage({ blocks }, { render });
}

function updateBlockLocalized(index, field, language, value) {
  const block = pagesState.selectedPage?.blocks?.[index] || getNewBlock();
  updateBlock(index, {
    [field]: {
      ...(block[field] || {}),
      [language]: value
    }
  }, { render: false });
}

function updatePageAccess(update) {
  updateSelectedPage({
    access: {
      ...getSelectedPageAccess(),
      ...update
    }
  });
}

function toggleAccessListValue(field, value, isChecked) {
  const access = getSelectedPageAccess();
  const values = new Set(access[field] || []);

  if (isChecked) {
    values.add(value);
  } else {
    values.delete(value);
  }

  updatePageAccess({ [field]: [...values] });
}

function getBuiltInRoleLabel(role) {
  return CMCENUtils.formatTitleCaseValue(role);
}

function getPageAccessSummary(page) {
  const access = {
    ...getDefaultPageAccess(),
    ...(page?.access || {})
  };

  if (access.audience === "public") {
    return "Everyone";
  }

  if (access.audience === "authenticated") {
    return "Signed-in members";
  }

  const count =
    (access.roles || []).length +
    (access.customRoles || []).length +
    (access.permissions || []).length;

  return count
    ? `Restricted · ${count} rule${count === 1 ? "" : "s"}`
    : "Restricted";
}

function createCheckboxOption({ label, checked, onChange, badgeColor = "" }) {
  const option = document.createElement("label");
  option.className = "pages-access-option";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", event => onChange(event.target.checked));

  if (badgeColor) {
    const swatch = document.createElement("span");
    swatch.className = "pages-access-role-swatch";
    swatch.style.backgroundColor = badgeColor;
    option.append(input, swatch, document.createTextNode(label));
    return option;
  }

  option.append(input, document.createTextNode(label));
  return option;
}

function createMessage() {
  const message = document.createElement("p");
  message.className = "admin-work-zone-message";
  message.hidden = !pagesState.message;
  message.textContent = pagesState.message;
  return message;
}

function createPageList() {
  const panel = document.createElement("div");
  panel.className = "pages-admin-list-panel";

  const header = document.createElement("div");
  header.className = "admin-panel-heading";

  const title = document.createElement("h3");
  title.textContent = "Pages";

  const create = document.createElement("button");
  create.type = "button";
  create.className = "admin-work-zone-button is-primary";
  create.textContent = "New page";
  create.addEventListener("click", createPage);

  header.append(title, create);
  panel.append(header);

  const list = document.createElement("div");
  list.className = "pages-admin-list";

  if (!pagesState.pages.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "No pages yet.";
    list.append(empty);
  } else {
    pagesState.pages.forEach(page => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pages-admin-page-row";
      button.classList.toggle("is-selected", String(page._id) === String(pagesState.selectedPageId));

      const name = document.createElement("strong");
      name.textContent = localized(page.title) || page.slug;

      const meta = document.createElement("span");
      meta.textContent = `${page.status} · ${getPageAccessSummary(page)} · ${page.route}`;

      button.append(name, meta);
      button.addEventListener("click", () => loadPageDetail(page._id));
      list.append(button);
    });
  }

  panel.append(list);
  return panel;
}

function createLocalizedInput(label, field, type = "input") {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "pages-editor-fieldset";

  const legend = document.createElement("legend");
  legend.textContent = label;
  wrapper.append(legend);

  ["en", "fr"].forEach(language => {
    const inputLabel = document.createElement("label");
    inputLabel.className = "pages-editor-field";

    const text = document.createElement("span");
    text.textContent = language.toUpperCase();

    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") input.type = "text";
    input.value = pagesState.selectedPage?.[field]?.[language] || "";
    input.addEventListener("input", event => {
      updateLocalizedField(field, language, event.target.value);
    });

    inputLabel.append(text, input);
    wrapper.append(inputLabel);
  });

  return wrapper;
}

function createBlockLocalizedInput(index, label, field, type = "textarea") {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "pages-editor-fieldset";

  const legend = document.createElement("legend");
  legend.textContent = label;
  wrapper.append(legend);

  ["en", "fr"].forEach(language => {
    const inputLabel = document.createElement("label");
    inputLabel.className = "pages-editor-field";

    const text = document.createElement("span");
    text.textContent = language.toUpperCase();

    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") input.type = "text";
    input.value = pagesState.selectedPage?.blocks?.[index]?.[field]?.[language] || "";
    input.addEventListener("input", event => {
      updateBlockLocalized(index, field, language, event.target.value);
    });

    inputLabel.append(text, input);
    wrapper.append(inputLabel);
  });

  return wrapper;
}

function createBlockToolbar(index) {
  const toolbar = document.createElement("div");
  toolbar.className = "pages-block-toolbar";

  const moveUp = document.createElement("button");
  moveUp.type = "button";
  moveUp.textContent = "Up";
  moveUp.disabled = index === 0;
  moveUp.className = "admin-work-zone-button is-secondary";
  moveUp.addEventListener("click", () => moveBlock(index, -1));

  const moveDown = document.createElement("button");
  moveDown.type = "button";
  moveDown.textContent = "Down";
  moveDown.disabled = index === (pagesState.selectedPage?.blocks || []).length - 1;
  moveDown.className = "admin-work-zone-button is-secondary";
  moveDown.addEventListener("click", () => moveBlock(index, 1));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.className = "admin-work-zone-button is-danger";
  remove.addEventListener("click", () => removeBlock(index));

  toolbar.append(moveUp, moveDown, remove);
  return toolbar;
}

function createImageDropZone(index, block) {
  const zone = document.createElement("label");
  zone.className = "pages-image-drop-zone";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) uploadBlockImage(index, file);
  });

  const text = document.createElement("span");
  text.textContent = block.mediaUrl
    ? "Replace image"
    : "Drop image here or choose file";

  zone.addEventListener("dragover", event => {
    event.preventDefault();
    zone.classList.add("is-dragging");
  });
  zone.addEventListener("dragleave", () => {
    zone.classList.remove("is-dragging");
  });
  zone.addEventListener("drop", event => {
    event.preventDefault();
    zone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) uploadBlockImage(index, file);
  });

  zone.append(input, text);
  return zone;
}

function createBlockEditor(block, index) {
  const article = document.createElement("article");
  article.className = `pages-block-editor is-${block.type}`;

  const header = document.createElement("div");
  header.className = "pages-block-heading";

  const type = document.createElement("strong");
  type.textContent = block.type;
  header.append(type, createBlockToolbar(index));
  article.append(header);

  if (block.type === "heading") {
    article.append(createBlockLocalizedInput(index, "Heading text", "text", "input"));
  } else if (block.type === "image") {
    if (block.mediaUrl) {
      const preview = document.createElement("img");
      preview.className = "pages-image-preview";
      preview.src = block.mediaUrl;
      preview.alt = "";
      article.append(preview);
    }
    article.append(
      createImageDropZone(index, block),
      createBlockLocalizedInput(index, "Alt text", "alt", "input"),
      createBlockLocalizedInput(index, "Caption", "caption", "input")
    );
  } else if (block.type === "button") {
    const urlLabel = document.createElement("label");
    urlLabel.className = "pages-editor-field";
    const span = document.createElement("span");
    span.textContent = "URL";
    const input = document.createElement("input");
    input.type = "text";
    input.value = block.url || "";
    input.addEventListener("input", event => updateBlock(
      index,
      { url: event.target.value },
      { render: false }
    ));
    urlLabel.append(span, input);
    article.append(createBlockLocalizedInput(index, "Button label", "text", "input"), urlLabel);
  } else if (block.type === "divider") {
    const note = document.createElement("p");
    note.className = "admin-empty-state";
    note.textContent = "Divider line";
    article.append(note);
  } else {
    article.append(createBlockLocalizedInput(index, block.type === "callout" ? "Callout text" : "Text", "body"));
  }

  return article;
}

function createBlockControls() {
  const controls = document.createElement("div");
  controls.className = "pages-add-block-controls";

  const title = document.createElement("strong");
  title.className = "pages-add-block-title";
  title.textContent = "Add block";
  controls.append(title);

  ["heading", "text", "image", "callout", "button", "divider"].forEach(type => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-work-zone-button is-secondary";
    button.textContent = `Add ${type}`;
    button.disabled = !pagesState.selectedPage;
    button.addEventListener("click", () => addBlock(type));
    controls.append(button);
  });

  return controls;
}

function createPageAccessEditor() {
  const access = getSelectedPageAccess();
  const fieldset = document.createElement("fieldset");
  fieldset.className = "pages-editor-fieldset pages-access-editor";

  const legend = document.createElement("legend");
  legend.textContent = "Visibility";
  fieldset.append(legend);

  const audienceLabel = document.createElement("label");
  audienceLabel.className = "pages-editor-field";

  const audienceText = document.createElement("span");
  audienceText.textContent = "Who can see this page";

  const audience = document.createElement("select");
  [
    ["public", "Everyone"],
    ["authenticated", "Signed-in members"],
    ["restricted", "Selected roles or permissions"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    audience.append(option);
  });
  audience.value = access.audience || "public";
  audience.addEventListener("change", event => {
    updatePageAccess({ audience: event.target.value });
  });

  audienceLabel.append(audienceText, audience);
  fieldset.append(audienceLabel);

  if (access.audience !== "restricted") {
    return fieldset;
  }

  const roleGroup = document.createElement("div");
  roleGroup.className = "pages-access-group";

  const roleTitle = document.createElement("strong");
  roleTitle.textContent = "Built-in roles";
  roleGroup.append(roleTitle);

  (pagesState.roles || []).forEach(role => {
    roleGroup.append(createCheckboxOption({
      label: getBuiltInRoleLabel(role),
      checked: (access.roles || []).includes(role),
      onChange: isChecked => toggleAccessListValue("roles", role, isChecked)
    }));
  });

  const customRoleGroup = document.createElement("div");
  customRoleGroup.className = "pages-access-group";

  const customRoleTitle = document.createElement("strong");
  customRoleTitle.textContent = "Custom roles";
  customRoleGroup.append(customRoleTitle);

  if (!pagesState.customRoles.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "No custom roles yet.";
    customRoleGroup.append(empty);
  } else {
    pagesState.customRoles.forEach(role => {
      customRoleGroup.append(createCheckboxOption({
        label: role.name,
        badgeColor: role.color,
        checked: (access.customRoles || []).some(roleId => String(roleId) === String(role._id)),
        onChange: isChecked => toggleAccessListValue("customRoles", String(role._id), isChecked)
      }));
    });
  }

  const permissionGroup = document.createElement("div");
  permissionGroup.className = "pages-access-group";

  const permissionTitle = document.createElement("strong");
  permissionTitle.textContent = "Permission scopes";
  permissionGroup.append(permissionTitle);

  (pagesState.permissionCatalog || []).forEach(permission => {
    permissionGroup.append(createCheckboxOption({
      label: `${permission.label} (${permission.key})`,
      checked: (access.permissions || []).includes(permission.key),
      onChange: isChecked => toggleAccessListValue("permissions", permission.key, isChecked)
    }));
  });

  fieldset.append(roleGroup, customRoleGroup, permissionGroup);
  return fieldset;
}

function createPageEditor() {
  const panel = document.createElement("form");
  panel.className = "pages-admin-editor";

  if (!pagesState.selectedPage) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "Select or create a page.";
    panel.append(empty);
    return panel;
  }

  const header = document.createElement("div");
  header.className = "admin-panel-heading";
  const title = document.createElement("h3");
  title.textContent = localized(pagesState.selectedPage.title) || "Untitled page";
  const status = document.createElement("span");
  status.className = "admin-user-role-badge";
  status.textContent = pagesState.selectedPage.status;
  header.append(title, status);

  const slugField = document.createElement("label");
  slugField.className = "pages-editor-field";
  const slugLabel = document.createElement("span");
  slugLabel.textContent = "Slug";
  const slug = document.createElement("input");
  slug.type = "text";
  slug.value = pagesState.selectedPage.slug || "";
  slug.addEventListener("input", event => {
    const cleanSlug = getCleanSlug(event.target.value);
    event.target.value = cleanSlug;
    updateSelectedPage({ slug: cleanSlug }, { render: false });
  });
  slugField.append(slugLabel, slug);

  const blocks = document.createElement("div");
  blocks.className = "pages-block-list";
  (pagesState.selectedPage.blocks || []).forEach((block, index) => {
    blocks.append(createBlockEditor(block, index));
  });

  const actions = document.createElement("div");
  actions.className = "pages-editor-actions";

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "admin-work-zone-button is-primary";
  save.textContent = "Save draft";

  const publish = document.createElement("button");
  publish.type = "button";
  publish.className = "admin-work-zone-button is-secondary";
  publish.textContent = pagesState.selectedPage.status === "published" ? "Unpublish" : "Publish";
  publish.addEventListener("click", () => updatePageStatus(
    pagesState.selectedPage.status === "published" ? "draft" : "published"
  ));

  const preview = document.createElement("a");
  preview.className = "admin-work-zone-button is-secondary";
  preview.href = `${pagesState.selectedPage.route || `/pages/${pagesState.selectedPage.slug}`}?preview=${encodeURIComponent(pagesState.selectedPage._id)}`;
  preview.target = "_blank";
  preview.rel = "noopener";
  preview.textContent = "Open page";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "admin-work-zone-button is-danger";
  remove.textContent = "Delete";
  remove.addEventListener("click", deleteSelectedPage);

  actions.append(save, publish, preview, remove);

  panel.append(
    header,
    createLocalizedInput("Title", "title", "input"),
    slugField,
    createLocalizedInput("Summary", "summary", "textarea"),
    createPageAccessEditor(),
    blocks,
    actions
  );

  panel.addEventListener("submit", event => {
    event.preventDefault();
    saveSelectedPage();
  });

  return panel;
}

function createNavigationPanel() {
  const panel = document.createElement("div");
  panel.className = "pages-navigation-panel";

  const header = document.createElement("div");
  header.className = "admin-panel-heading";
  const title = document.createElement("h3");
  title.textContent = "Navbar";
  header.append(title);
  panel.append(header);

  if (!pagesState.canManageNavigation) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "You can edit pages, but not navigation.";
    panel.append(empty);
    return panel;
  }

  const form = document.createElement("form");
  form.className = "pages-navigation-form";

  const groupForm = document.createElement("form");
  groupForm.className = "pages-navigation-form";

  const groupName = document.createElement("input");
  groupName.type = "text";
  groupName.placeholder = "New navbar parent";

  const groupNameFr = document.createElement("input");
  groupNameFr.type = "text";
  groupNameFr.placeholder = "French label";

  const addGroup = document.createElement("button");
  addGroup.type = "submit";
  addGroup.className = "admin-work-zone-button is-secondary";
  addGroup.textContent = "Add parent";

  groupForm.append(groupName, groupNameFr, addGroup);
  groupForm.addEventListener("submit", event => {
    event.preventDefault();
    const labelEn = groupName.value.trim();
    const labelFr = groupNameFr.value.trim();

    if (!labelEn && !labelFr) return;

    createNavigationItem({
      type: "group",
      group: getCleanSlug(labelEn || labelFr),
      label: {
        en: labelEn,
        fr: labelFr
      },
      route: "",
      visible: true,
      order: pagesState.navigationGroups.length + 1
    });
  });

  const group = document.createElement("select");
  pagesState.navigationGroups.forEach(groupName => {
    const option = document.createElement("option");
    option.value = getNavigationGroupKey(groupName);
    option.textContent = getNavigationGroupLabel(groupName);
    group.append(option);
  });

  const page = document.createElement("select");
  pagesState.pages
    .filter(existingPage => existingPage.status === "published")
    .forEach(existingPage => {
      const option = document.createElement("option");
      option.value = existingPage._id;
      option.textContent = localized(existingPage.title) || existingPage.slug;
      option.dataset.route = existingPage.route;
      option.dataset.labelEn = existingPage.title?.en || "";
      option.dataset.labelFr = existingPage.title?.fr || "";
      page.append(option);
    });

  const add = document.createElement("button");
  add.type = "submit";
  add.className = "admin-work-zone-button is-primary";
  add.textContent = "Add to navbar";

  form.append(group, page, add);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const option = page.selectedOptions[0];
    if (!option) return;
    createNavigationItem({
      group: group.value,
      page: page.value,
      route: option.dataset.route,
      label: {
        en: option.dataset.labelEn,
        fr: option.dataset.labelFr
      },
      visible: true,
      order: pagesState.navigationItems.length + 1
    });
  });

  panel.append(groupForm, form);

  const list = document.createElement("div");
  list.className = "pages-navigation-list";
  pagesState.navigationItems.forEach(item => {
    const row = document.createElement("div");
    row.className = "pages-navigation-row";
    const label = document.createElement("span");
    const groupLabel = getNavigationGroupLabel(
      pagesState.navigationGroups.find(group => getNavigationGroupKey(group) === item.group) ||
      item.group
    );
    label.textContent = item.type === "group"
      ? `${groupLabel} · parent`
      : `${groupLabel} · ${localized(item.label)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "admin-work-zone-button is-danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => deleteNavigationItem(item._id));
    row.append(label, remove);
    list.append(row);
  });
  panel.append(list);

  return panel;
}

function renderPagesAdmin() {
  pagesAdminContent.replaceChildren(
    createMessage(),
    createPageList(),
    createBlockControls(),
    createPageEditor(),
    createNavigationPanel()
  );
}

async function verifyAccess() {
  const user = await pageApi("/api/me", {
    errorMessage: "Could not verify account"
  });

  if (user.permissions?.canManagePages !== true) {
    window.location.href = "/dashboard.html";
    return null;
  }

  pagesState.canManageNavigation = user.permissions?.canManageNavigation === true;
  window.updateAdminWorkZoneTabsForUser(user);
  return user;
}

async function loadPages() {
  const data = await pageApi("/api/admin/pages", {
    errorMessage: "Could not load pages"
  });
  const selectedPageId = pagesState.selectedPageId &&
    data.pages?.some(page => String(page._id) === String(pagesState.selectedPageId))
    ? pagesState.selectedPageId
    : data.pages?.[0]?._id || "";

  setPagesState({
    pages: data.pages || [],
    navigationItems: data.navigationItems || [],
    navigationGroups: data.navigationGroups || pagesState.navigationGroups,
    roles: data.roles || pagesState.roles,
    customRoles: data.customRoles || [],
    permissionCatalog: data.permissionCatalog || [],
    selectedPageId,
    selectedPage: selectedPageId === pagesState.selectedPageId
      ? pagesState.selectedPage
      : null,
    message: ""
  });
  showPagesPage();

  if (selectedPageId && !pagesState.selectedPage) {
    await loadPageDetail(selectedPageId);
  }
}

async function loadPageDetail(pageId) {
  const data = await pageApi(`/api/admin/pages/${encodeURIComponent(pageId)}`, {
    errorMessage: "Could not load page"
  });
  setPagesState({
    selectedPageId: data.page._id,
    selectedPage: data.page,
    message: ""
  });
}

async function createPage() {
  const title = "New page";
  const data = await pageApi("/api/admin/pages", {
    method: "POST",
    body: {
      title: { en: title, fr: "" },
      slug: `new-page-${Date.now()}`,
      blocks: [getNewBlock("text")]
    },
    errorMessage: "Could not create page"
  });

  await loadPages();
  await loadPageDetail(data.page._id);
}

async function saveSelectedPage() {
  if (!pagesState.selectedPage?._id) return;

  const data = await pageApi(`/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}`, {
    method: "PATCH",
    body: {
      title: pagesState.selectedPage.title,
      slug: pagesState.selectedPage.slug,
      summary: pagesState.selectedPage.summary,
      access: getSelectedPageAccess(),
      blocks: pagesState.selectedPage.blocks || []
    },
    errorMessage: "Could not save page"
  });

  setPagesState({
    selectedPage: data.page,
    message: data.message || "Page saved"
  });
  await loadPages();
}

async function updatePageStatus(status) {
  if (!pagesState.selectedPage?._id) return;

  const data = await pageApi(`/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}/status`, {
    method: "PATCH",
    body: { status },
    errorMessage: "Could not update page status"
  });

  setPagesState({
    selectedPage: data.page,
    message: data.message || "Page status updated"
  });
  await loadPages();
}

async function deleteSelectedPage() {
  if (!pagesState.selectedPage?._id) return;
  if (!window.confirm("Delete this page?")) return;

  await pageApi(`/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}`, {
    method: "DELETE",
    errorMessage: "Could not delete page"
  });

  setPagesState({
    selectedPageId: "",
    selectedPage: null,
    message: "Page deleted"
  });
  await loadPages();
}

function addBlock(type) {
  updateSelectedPage({
    blocks: [
      ...(pagesState.selectedPage?.blocks || []),
      getNewBlock(type)
    ]
  });
}

function removeBlock(index) {
  const blocks = [...(pagesState.selectedPage?.blocks || [])];
  blocks.splice(index, 1);
  updateSelectedPage({ blocks });
}

function moveBlock(index, direction) {
  const blocks = [...(pagesState.selectedPage?.blocks || [])];
  const nextIndex = index + direction;
  const block = blocks[index];
  blocks[index] = blocks[nextIndex];
  blocks[nextIndex] = block;
  updateSelectedPage({ blocks });
}

async function uploadBlockImage(index, file) {
  const formData = new FormData();
  formData.append("image", file);

  const data = await pageApi("/api/upload", {
    method: "POST",
    body: formData,
    json: false,
    errorMessage: "Could not upload image"
  });

  updateBlock(index, {
    mediaKey: data.key || "",
    mediaUrl: data.url || ""
  });
}

async function createNavigationItem(payload) {
  await pageApi("/api/admin/navigation-items", {
    method: "POST",
    body: payload,
    errorMessage: "Could not add navigation item"
  });
  await loadPages();
  await window.reloadSiteNavigation?.();
}

async function deleteNavigationItem(itemId) {
  await pageApi(`/api/admin/navigation-items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    errorMessage: "Could not remove navigation item"
  });
  await loadPages();
  await window.reloadSiteNavigation?.();
}

document.addEventListener("languagechange", renderPagesAdmin);

async function initializePagesAdmin() {
  showPagesLoading();

  try {
    const user = await verifyAccess();
    if (!user) return;
    await loadPages();
  } catch (error) {
    showPagesStatus(error.message || "Could not load pages", "error");
  }
}

if (pagesAdminToken) {
  initializePagesAdmin();
} else {
  showPagesStatus("Sign in to continue");
}
