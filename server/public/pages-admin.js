const pagesAdminToken = CMCENUtils.requireAuthToken();
const pagesAdminStatus = document.getElementById("pagesAdminStatus");
const pagesAdminPage = document.getElementById("pagesAdminPage");
const pagesAdminContent = document.getElementById("pagesAdminContent");
const autoSaveDelayMs = 1200;
const minBuilderBlockSpan = 4;
const maxBuilderCanvasRows = 24;
let autoSaveTimer = null;
let autoSaveRequestId = 0;
let paletteDragBlockType = "";
let pageBuilderAutoScrollFrame = null;
let pageBuilderAutoScrollVelocity = 0;
let pageBuilderAutoScrollWindow = null;
let navigationModalPositionCleanup = null;
let pagePreviewPositionCleanup = null;

let pagesState = {
  pages: [],
  navigationItems: [],
  navigationGroups: ["about", "doctrine", "news", "benefits"],
  roles: [],
  customRoles: [],
  permissionCatalog: [],
  selectedPageId: "",
  selectedPage: null,
  selectedBlockIndex: null,
  pageDetailsOpen: false,
  message: "",
  isLoading: false,
  autoSaveStatus: "idle",
  autoSaveMessage: "",
  lastSavedAt: null,
  media: [],
  mediaNextCursor: "",
  mediaIsTruncated: false,
  mediaIsLoading: false,
  mediaPicker: null,
  cropEditor: null,
  navigationModal: false,
  navigationStep: "setup",
  navigationMode: "add",
  pagePreview: false,
  uploadProgress: {},
  canManageNavigation: false,
  canFeaturePagesOnHome: false,
};

function localized(value) {
  return CMCENUtils.getLocalizedText(value);
}

function pageApi(path, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token: pagesAdminToken,
    redirectOnUnauthorized: true,
    unauthorizedMessage: "Authentication required",
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

async function refreshSiteNavigation() {
  const navigationWindows = [window];

  try {
    if (window.parent !== window) navigationWindows.push(window.parent);
    if (window.top !== window.parent) navigationWindows.push(window.top);
  } catch {
    // The builder can still refresh its own header if an embedding window is
    // unavailable.
  }

  await Promise.all(
    [...new Set(navigationWindows)].map(async (navigationWindow) => {
      try {
        if (typeof navigationWindow.reloadSiteNavigation !== "function") return;
        await navigationWindow.reloadSiteNavigation();
      } catch {
        // A navigation refresh must not undo a completed page or header edit.
      }
    }),
  );
}

function createPreviewEyeIcon(ownerDocument) {
  const icon = ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  path.setAttribute(
    "d",
    "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 3.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z",
  );
  icon.append(path);
  return icon;
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
    ...nextState,
  };
  renderPagesAdmin();
}

function showPagesActionToast(message, color = "info") {
  CMCENUtils.showToast(message, {
    color,
    position: "bottom-right",
    animation: "slide",
  });
}

function setAutoSaveState(status, message = "") {
  pagesState = {
    ...pagesState,
    autoSaveStatus: status,
    autoSaveMessage: message,
  };
  renderAutoSaveStatus();
}

function renderAutoSaveStatus() {
  const status = pagesAdminContent.querySelector(".pages-autosave-status");
  if (!status) return;

  status.className = `pages-autosave-status is-${pagesState.autoSaveStatus || "idle"}`;
  status.textContent = getAutoSaveLabel();
}

function scheduleAutoSave() {
  if (!pagesState.selectedPage?._id) return;

  window.clearTimeout(autoSaveTimer);
  pagesState = {
    ...pagesState,
    autoSaveStatus: "pending",
    autoSaveMessage: "Unsaved changes",
  };
  renderAutoSaveStatus();

  autoSaveTimer = window.setTimeout(() => {
    saveSelectedPage({ auto: true });
  }, autoSaveDelayMs);
}

function cancelAutoSave() {
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
}

function setUploadProgress(progressKey, update) {
  pagesState = {
    ...pagesState,
    uploadProgress: {
      ...(pagesState.uploadProgress || {}),
      [progressKey]: {
        ...(pagesState.uploadProgress?.[progressKey] || {}),
        ...update,
      },
    },
  };
  renderPagesAdmin();
}

function clearUploadProgress(progressKey) {
  const uploadProgress = { ...(pagesState.uploadProgress || {}) };
  delete uploadProgress[progressKey];
  setPagesState({ uploadProgress });
}

function getUploadProgress(progressKey) {
  return pagesState.uploadProgress?.[progressKey] || null;
}

function getEmptyLocalized() {
  return { en: "", fr: "" };
}

function getDefaultCrop() {
  return {
    x: 50,
    y: 50,
    zoom: 1,
    rotate: 0,
  };
}

function getCrop(value) {
  return {
    ...getDefaultCrop(),
    ...(value || {}),
  };
}

function getNewBlock(type = "text") {
  const block = {
    type,
    level: 2,
    text: getEmptyLocalized(),
    body: getEmptyLocalized(),
    url: "",
    mediaKey: "",
    mediaUrl: "",
    mediaVariants: {},
    alt: getEmptyLocalized(),
    caption: getEmptyLocalized(),
    crop: getDefaultCrop(),
    variant: "standard",
    layout: { column: 1, row: 1, span: 4, rowSpan: 1 },
    columns: [],
    items: [],
  };

  if (type === "columns") {
    block.columns = [
      {
        title: { en: "Left column", fr: "" },
        body: getEmptyLocalized(),
        mediaKey: "",
        mediaUrl: "",
        mediaVariants: {},
        alt: getEmptyLocalized(),
        crop: getDefaultCrop(),
      },
      {
        title: { en: "Right column", fr: "" },
        body: getEmptyLocalized(),
        mediaKey: "",
        mediaUrl: "",
        mediaVariants: {},
        alt: getEmptyLocalized(),
        crop: getDefaultCrop(),
      },
    ];
  }

  if (type === "carousel") {
    block.text = {
      en: "Carousel heading",
      fr: "",
    };
    block.items = [
      {
        mediaKey: "",
        mediaUrl: "",
        alt: getEmptyLocalized(),
        caption: getEmptyLocalized(),
        crop: getDefaultCrop(),
      },
    ];
  }

  return block;
}

function getDefaultPageAccess() {
  return {
    audience: "public",
    roles: [],
    customRoles: [],
    permissions: [],
  };
}

function getSelectedPageAccess() {
  return {
    ...getDefaultPageAccess(),
    ...(pagesState.selectedPage?.access || {}),
  };
}

function getUploadMediaUpdate(data) {
  return {
    mediaKey: data.key || "",
    mediaUrl: data.url || "",
    mediaVariants: data.variants || {},
  };
}

function getPreviewMediaUrl(media = {}) {
  const variants = media.mediaVariants || {};
  return (
    variants.medium?.url ||
    variants.large?.url ||
    variants.hero?.url ||
    media.mediaUrl ||
    ""
  );
}

function getCleanSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function updateSelectedPage(update, { render = true, autosave = true } = {}) {
  const selectedPage = {
    ...pagesState.selectedPage,
    ...update,
  };

  if (!render) {
    pagesState = {
      ...pagesState,
      selectedPage,
    };

    if (autosave) {
      scheduleAutoSave();
    }

    return;
  }

  setPagesState({ selectedPage });

  if (autosave) {
    scheduleAutoSave();
  }
}

function updateLocalizedField(field, language, value) {
  updateSelectedPage(
    {
      [field]: {
        ...(pagesState.selectedPage?.[field] || {}),
        [language]: value,
      },
    },
    { render: false, autosave: true },
  );
}

function updateBlock(index, update, { render = true } = {}) {
  const blocks = [...(pagesState.selectedPage?.blocks || [])];
  blocks[index] = {
    ...blocks[index],
    ...update,
  };
  updateSelectedPage({ blocks }, { render });
}

function updateBlockLocalized(index, field, language, value) {
  const block = pagesState.selectedPage?.blocks?.[index] || getNewBlock();
  updateBlock(
    index,
    {
      [field]: {
        ...(block[field] || {}),
        [language]: value,
      },
    },
    { render: false },
  );
}

function updateBlockColumn(index, columnIndex, update, { render = true } = {}) {
  const block =
    pagesState.selectedPage?.blocks?.[index] || getNewBlock("columns");
  const columns = [...(block.columns || [])];
  columns[columnIndex] = {
    ...(columns[columnIndex] || {}),
    ...update,
  };
  updateBlock(index, { columns }, { render });
}

function updateBlockColumnLocalized(
  index,
  columnIndex,
  field,
  language,
  value,
) {
  const block =
    pagesState.selectedPage?.blocks?.[index] || getNewBlock("columns");
  const column = block.columns?.[columnIndex] || {};
  updateBlockColumn(
    index,
    columnIndex,
    {
      [field]: {
        ...(column[field] || {}),
        [language]: value,
      },
    },
    { render: false },
  );
}

function updateCarouselItem(index, itemIndex, update, { render = true } = {}) {
  const block =
    pagesState.selectedPage?.blocks?.[index] || getNewBlock("carousel");
  const items = [...(block.items || [])];
  items[itemIndex] = {
    ...(items[itemIndex] || {}),
    ...update,
  };
  updateBlock(index, { items }, { render });
}

function updateCarouselItemLocalized(index, itemIndex, field, language, value) {
  const block =
    pagesState.selectedPage?.blocks?.[index] || getNewBlock("carousel");
  const item = block.items?.[itemIndex] || {};
  updateCarouselItem(
    index,
    itemIndex,
    {
      [field]: {
        ...(item[field] || {}),
        [language]: value,
      },
    },
    { render: false },
  );
}

function updatePageAccess(update) {
  updateSelectedPage({
    access: {
      ...getSelectedPageAccess(),
      ...update,
    },
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

function openMediaPicker(target) {
  setPagesState({
    mediaPicker: target,
    mediaIsLoading: !pagesState.media.length,
  });

  if (!pagesState.media.length) {
    loadPageBuilderMedia();
  }
}

function closeMediaPicker() {
  setPagesState({ mediaPicker: null });
}

function applySelectedMedia(mediaItem) {
  const target = pagesState.mediaPicker;

  if (!target || !mediaItem) return;

  const update = {
    mediaKey: mediaItem.key || "",
    mediaUrl: mediaItem.url || "",
    mediaVariants: mediaItem.variants || {},
    crop: getCrop(getCropTargetMedia(target)?.crop),
  };

  if (target.type === "block") {
    updateBlock(target.blockIndex, update);
  } else if (target.type === "column") {
    updateBlockColumn(target.blockIndex, target.columnIndex, update);
  } else if (target.type === "carousel") {
    updateCarouselItem(target.blockIndex, target.itemIndex, update);
  }

  closeMediaPicker();
}

function openCropEditor(target) {
  setPagesState({ cropEditor: target });
}

function closeCropEditor() {
  setPagesState({ cropEditor: null });
}

function getCropTargetMedia(target = pagesState.cropEditor) {
  if (!target) return null;

  if (target.type === "block") {
    return pagesState.selectedPage?.blocks?.[target.blockIndex] || null;
  }

  if (target.type === "column") {
    return (
      pagesState.selectedPage?.blocks?.[target.blockIndex]?.columns?.[
        target.columnIndex
      ] || null
    );
  }

  if (target.type === "carousel") {
    return (
      pagesState.selectedPage?.blocks?.[target.blockIndex]?.items?.[
        target.itemIndex
      ] || null
    );
  }

  return null;
}

function updateCropTarget(crop) {
  const target = pagesState.cropEditor;
  if (!target) return;

  if (target.type === "block") {
    updateBlock(target.blockIndex, { crop });
  } else if (target.type === "column") {
    updateBlockColumn(target.blockIndex, target.columnIndex, { crop });
  } else if (target.type === "carousel") {
    updateCarouselItem(target.blockIndex, target.itemIndex, { crop });
  }
}

function getBuiltInRoleLabel(role) {
  return CMCENUtils.formatTitleCaseValue(role);
}

function getPageAccessSummary(page) {
  const access = {
    ...getDefaultPageAccess(),
    ...(page?.access || {}),
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
  input.addEventListener("change", (event) => onChange(event.target.checked));

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

  const actions = document.createElement("div");
  actions.className = "pages-library-actions";

  const manageNavigation = document.createElement("button");
  manageNavigation.type = "button";
  manageNavigation.className = "admin-work-zone-button is-secondary";
  manageNavigation.textContent = "Manage navigation";
  manageNavigation.addEventListener("click", () =>
    setPagesState({ navigationModal: true, navigationMode: "manage" }),
  );

  const create = document.createElement("button");
  create.type = "button";
  create.className = "admin-work-zone-button is-primary";
  create.textContent = "New page";
  create.addEventListener("click", createPage);

  actions.append(manageNavigation, create);
  header.append(title, actions);
  panel.append(header);

  const intro = document.createElement("div");
  intro.className = "pages-library-intro";
  const introTitle = document.createElement("strong");
  introTitle.textContent = "Create and organize custom pages";
  const introCopy = document.createElement("p");
  introCopy.textContent =
    "Start a page, add blocks on the freeform grid, then place it in the site navigation when it is ready.";
  intro.append(introTitle, introCopy);
  panel.append(intro);

  const list = document.createElement("div");
  list.className = "pages-admin-list";

  if (!pagesState.pages.length) {
    const empty = document.createElement("div");
    empty.className = "pages-list-empty";
    const emptyTitle = document.createElement("strong");
    emptyTitle.textContent = "No pages yet";
    const emptyText = document.createElement("span");
    emptyText.textContent = "Create your first page to start building.";
    empty.append(emptyTitle, emptyText);
    list.append(empty);
  } else {
    pagesState.pages.forEach((page) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pages-admin-page-row";
      button.classList.toggle(
        "is-selected",
        String(page._id) === String(pagesState.selectedPageId),
      );

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

function createPageLibrary() {
  const library = document.createElement("section");
  library.className = "pages-page-library";
  library.append(createPageList());
  return library;
}

function createLocalizedInput(label, field, type = "input") {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "pages-editor-fieldset";

  const legend = document.createElement("legend");
  legend.textContent = label;
  wrapper.append(legend);

  ["en", "fr"].forEach((language) => {
    const inputLabel = document.createElement("label");
    inputLabel.className = "pages-editor-field";

    const text = document.createElement("span");
    text.textContent = language.toUpperCase();

    const input = document.createElement(
      type === "textarea" ? "textarea" : "input",
    );
    if (type !== "textarea") input.type = "text";
    input.value = pagesState.selectedPage?.[field]?.[language] || "";
    input.addEventListener("input", (event) => {
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

  ["en", "fr"].forEach((language) => {
    const inputLabel = document.createElement("label");
    inputLabel.className = "pages-editor-field";

    const text = document.createElement("span");
    text.textContent = language.toUpperCase();

    const input = document.createElement(
      type === "textarea" ? "textarea" : "input",
    );
    if (type !== "textarea") input.type = "text";
    input.value =
      pagesState.selectedPage?.blocks?.[index]?.[field]?.[language] || "";
    input.addEventListener("input", (event) => {
      updateBlockLocalized(index, field, language, event.target.value);
    });

    inputLabel.append(text, input);
    wrapper.append(inputLabel);
  });

  return wrapper;
}

function createNestedLocalizedInput({
  label,
  value = {},
  onInput,
  type = "textarea",
}) {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "pages-editor-fieldset";

  const legend = document.createElement("legend");
  legend.textContent = label;
  wrapper.append(legend);

  ["en", "fr"].forEach((language) => {
    const inputLabel = document.createElement("label");
    inputLabel.className = "pages-editor-field";

    const text = document.createElement("span");
    text.textContent = language.toUpperCase();

    const input = document.createElement(
      type === "textarea" ? "textarea" : "input",
    );
    if (type !== "textarea") input.type = "text";
    input.value = value?.[language] || "";
    input.addEventListener("input", (event) =>
      onInput(language, event.target.value),
    );

    inputLabel.append(text, input);
    wrapper.append(inputLabel);
  });

  return wrapper;
}

function createBlockToolbar(index) {
  const toolbar = document.createElement("div");
  toolbar.className = "pages-block-toolbar";

  const moveUp = createBuilderIconButton("Move block up", "arrow-up");
  moveUp.disabled = index === 0;
  moveUp.addEventListener("click", () => moveBlock(index, -1));

  const moveDown = createBuilderIconButton("Move block down", "arrow-down");
  moveDown.disabled =
    index === (pagesState.selectedPage?.blocks || []).length - 1;
  moveDown.addEventListener("click", () => moveBlock(index, 1));

  const remove = createBuilderIconButton("Remove block", "trash", "is-danger");
  remove.addEventListener("click", () => removeBlock(index));

  toolbar.append(moveUp, moveDown, remove);
  return toolbar;
}

function getBlockSummary(block) {
  if (block.type === "image") return block.mediaUrl ? "Image selected" : "Add an image";
  if (block.type === "divider") return "";
  if (block.type === "columns") return `${(block.columns || []).length || 2} columns`;
  if (block.type === "carousel") return `${(block.items || []).length || 1} slides`;
  return localized(block.text) || localized(block.body) || "Add content";
}

function createBuilderIcon(name, ownerDocument = document) {
  const icon = ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  icon.classList.add("pages-builder-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.8");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");

  const paths = {
    heading: ["M5 5v14", "M19 5v14", "M5 12h14"],
    text: ["M5 6h14", "M5 10h10", "M5 14h14", "M5 18h9"],
    image: ["M4 5h16v14H4z", "m5 16 4-4 3 3 2-2 5 5", "M9 9h.01"],
    columns: ["M4 5h16v14H4z", "M12 5v14"],
    carousel: ["M4 7h16v10H4z", "m8 11-2 1 2 1", "m16 11 2 1-2 1"],
    callout: ["M5 5h14v11H9l-4 3V5z", "M12 8v4", "M12 14h.01"],
    button: ["M5 8h14v8H5z", "M9 12h6", "m13 10 2 2-2 2"],
    divider: ["M4 12h16", "M7 9v6", "M17 9v6"],
    "arrow-up": ["M12 19V5", "m7 10 5-5 5 5"],
    "arrow-down": ["M12 5v14", "m7 14 5 5 5-5"],
    trash: ["M5 7h14", "M10 11v5", "M14 11v5", "M9 7V5h6v2", "M7 7l1 12h8l1-12"],
  };

  (paths[name] || []).forEach((pathData) => {
    const path = ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    path.setAttribute("d", pathData);
    icon.append(path);
  });
  return icon;
}

function createBuilderIconButton(label, iconName, variant = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `pages-block-icon-button ${variant}`.trim();
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(createBuilderIcon(iconName));
  return button;
}

function getBuilderBlockSpan(block) {
  return Math.min(
    Math.max(
      Number(block?.layout?.span) || minBuilderBlockSpan,
      minBuilderBlockSpan,
    ),
    12,
  );
}

function getBuilderBlockLayout(block) {
  const span = getBuilderBlockSpan(block);
  const rowSpan = block?.type === "divider"
    ? 1
    : Math.min(
      Math.max(Number(block?.layout?.rowSpan) || 1, 1),
      24,
    );
  return {
    column: Math.min(Math.max(Number(block?.layout?.column) || 1, 1), 13 - span),
    row: Math.min(
      Math.max(Number(block?.layout?.row) || 1, 1),
      maxBuilderCanvasRows - rowSpan + 1,
    ),
    span,
    rowSpan,
  };
}

function blocksOverlap(firstLayout, secondLayout) {
  const first = getBuilderBlockLayout({ layout: firstLayout });
  const second = getBuilderBlockLayout({ layout: secondLayout });
  const firstRight = first.column + first.span - 1;
  const secondRight = second.column + second.span - 1;
  const firstBottom = first.row + first.rowSpan - 1;
  const secondBottom = second.row + second.rowSpan - 1;

  return !(
    firstRight < second.column ||
    secondRight < first.column ||
    firstBottom < second.row ||
    secondBottom < first.row
  );
}

function canPlaceBuilderBlock(layout, { ignoreIndex = null } = {}) {
  const candidate = getBuilderBlockLayout({ layout });
  if (candidate.column + candidate.span - 1 > 12) return false;

  return !(pagesState.selectedPage?.blocks || []).some((block, index) => {
    if (index === ignoreIndex) return false;
    return blocksOverlap(candidate, block.layout);
  });
}

function getCanvasPosition(canvas, event, block = {}) {
  const rect = canvas.getBoundingClientRect();
  const layout = getBuilderBlockLayout(block);
  const styles = window.getComputedStyle(canvas);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const columnGap = Number.parseFloat(styles.columnGap) || 0;
  const rowGap = Number.parseFloat(styles.rowGap) || 0;
  const columnWidth =
    (rect.width - paddingLeft - paddingRight - columnGap * 11) / 12;
  const rowHeight =
    Number.parseFloat(
      styles.getPropertyValue("--page-builder-row-height"),
    ) || 72;
  const column = Math.min(
    Math.max(
      Math.floor(
        (event.clientX - rect.left - paddingLeft) / (columnWidth + columnGap),
      ) + 1,
      1,
    ),
    13 - layout.span,
  );
  const row = Math.max(
    Math.floor(
      (event.clientY - rect.top - paddingTop) / (rowHeight + rowGap),
    ) + 1,
    1,
  );
  return {
    ...layout,
    column,
    row: Math.min(row, maxBuilderCanvasRows - layout.rowSpan + 1),
  };
}

function isPointInsideCanvas(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function showCanvasDropPreview(canvas, layout, { valid = true } = {}) {
  let preview = canvas.querySelector(".pages-builder-drop-preview");
  if (!preview) {
    preview = document.createElement("div");
    preview.className = "pages-builder-drop-preview";
    preview.setAttribute("aria-hidden", "true");
    canvas.append(preview);
  }

  preview.style.setProperty("--page-builder-preview-column", String(layout.column));
  preview.style.setProperty("--page-builder-preview-row", String(layout.row));
  preview.style.setProperty("--page-builder-preview-span", String(layout.span));
  preview.style.setProperty(
    "--page-builder-preview-row-span",
    String(layout.rowSpan),
  );
  preview.classList.toggle("is-invalid", !valid);

  const currentRows = Number(canvas.style.getPropertyValue("--page-builder-rows"));
  const neededRows = Math.min(
    layout.row + layout.rowSpan,
    maxBuilderCanvasRows,
  );
  if (neededRows > currentRows) {
    canvas.style.setProperty("--page-builder-rows", String(neededRows));
  }
}

function clearCanvasDropPreview(canvas) {
  canvas?.querySelector(".pages-builder-drop-preview")?.remove();
}

function getPageBuilderScrollContext(pointerY) {
  try {
    if (window.parent !== window && window.frameElement) {
      const frameRect = window.frameElement.getBoundingClientRect();
      return {
        scrollWindow: window.parent,
        pointerY: frameRect.top + pointerY,
      };
    }
  } catch {
    // Fall back to the current window when the embedding page is unavailable.
  }

  return { scrollWindow: window, pointerY };
}

function stopPageBuilderAutoScroll() {
  pageBuilderAutoScrollVelocity = 0;
  pageBuilderAutoScrollWindow = null;
  if (pageBuilderAutoScrollFrame) {
    window.cancelAnimationFrame(pageBuilderAutoScrollFrame);
    pageBuilderAutoScrollFrame = null;
  }
}

function updatePageBuilderAutoScroll(pointerY) {
  const { scrollWindow, pointerY: viewportY } = getPageBuilderScrollContext(
    pointerY,
  );
  const edgeSize = 92;
  const distanceFromTop = viewportY;
  const distanceFromBottom = scrollWindow.innerHeight - viewportY;
  let velocity = 0;

  if (distanceFromTop < edgeSize) {
    velocity = -Math.ceil(((edgeSize - distanceFromTop) / edgeSize) * 18);
  } else if (distanceFromBottom < edgeSize) {
    velocity = Math.ceil(((edgeSize - distanceFromBottom) / edgeSize) * 18);
  }

  pageBuilderAutoScrollWindow = scrollWindow;
  pageBuilderAutoScrollVelocity = velocity;
  if (!velocity || pageBuilderAutoScrollFrame) return;

  const scroll = () => {
    if (!pageBuilderAutoScrollVelocity || !pageBuilderAutoScrollWindow) {
      pageBuilderAutoScrollFrame = null;
      return;
    }

    pageBuilderAutoScrollWindow.scrollBy({
      top: pageBuilderAutoScrollVelocity,
    });
    pageBuilderAutoScrollFrame = window.requestAnimationFrame(scroll);
  };

  pageBuilderAutoScrollFrame = window.requestAnimationFrame(scroll);
}

function collapseBlockTile(tile) {
  pagesState = {
    ...pagesState,
    selectedBlockIndex: null,
  };
  tile?.classList.remove("is-selected");
}

function createBlockResizeHandle(index) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "pages-block-resize-handle";
  handle.setAttribute("aria-label", "Resize block width");
  handle.title = "Resize width";

  const resizeBy = (difference) => {
    const block = pagesState.selectedPage?.blocks?.[index];
    if (!block) return;
    collapseBlockTile(handle.closest(".pages-block-editor"));
    const span = Math.min(
      Math.max(getBuilderBlockSpan(block) + difference, minBuilderBlockSpan),
      12,
    );
    const layout = { ...getBuilderBlockLayout(block), span };
    if (canPlaceBuilderBlock(layout, { ignoreIndex: index })) {
      updateBlock(index, { layout });
    }
  };

  handle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeBy(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeBy(1);
    }
  });

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const block = pagesState.selectedPage?.blocks?.[index];
    const tile = handle.closest(".pages-block-editor");
    const canvas = handle.closest(".pages-builder-canvas");
    if (!block || !tile || !canvas) return;

    const startX = event.clientX;
    collapseBlockTile(tile);
    const startSpan = getBuilderBlockSpan(block);
    const canvasStyles = window.getComputedStyle(canvas);
    const cellWidth =
      (canvas.getBoundingClientRect().width -
        (Number.parseFloat(canvasStyles.paddingLeft) || 0) -
        (Number.parseFloat(canvasStyles.paddingRight) || 0) -
        (Number.parseFloat(canvasStyles.columnGap) || 0) * 11) /
      12;
    const columnStep =
      cellWidth + (Number.parseFloat(canvasStyles.columnGap) || 0);
    handle.setPointerCapture?.(event.pointerId);
    tile.classList.add("is-resizing");

    const move = (moveEvent) => {
      const nextSpan = Math.min(
        Math.max(
          Math.round(startSpan + (moveEvent.clientX - startX) / columnStep),
          minBuilderBlockSpan,
        ),
        12,
      );
      tile.style.setProperty("--page-builder-span", String(nextSpan));
      handle.dataset.span = String(nextSpan);
    };
    const finish = () => {
      const span = Number(handle.dataset.span) || startSpan;
      tile.classList.remove("is-resizing");
      delete handle.dataset.span;
      const layout = { ...getBuilderBlockLayout(block), span };
      if (canPlaceBuilderBlock(layout, { ignoreIndex: index })) {
        updateBlock(index, { layout });
      } else {
        tile.style.setProperty("--page-builder-span", String(startSpan));
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  });

  return handle;
}

function createBlockHeightResizeHandle(index) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "pages-block-height-resize-handle";
  handle.setAttribute("aria-label", "Resize block height");
  handle.title = "Resize height";

  const resizeBy = (difference) => {
    const block = pagesState.selectedPage?.blocks?.[index];
    if (!block) return;
    collapseBlockTile(handle.closest(".pages-block-editor"));
    const rowSpan = Math.min(
      Math.max(getBuilderBlockLayout(block).rowSpan + difference, 1),
      24,
    );
    const layout = { ...getBuilderBlockLayout(block), rowSpan };
    if (canPlaceBuilderBlock(layout, { ignoreIndex: index })) {
      updateBlock(index, { layout });
    }
  };

  handle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      resizeBy(-1);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      resizeBy(1);
    }
  });

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const block = pagesState.selectedPage?.blocks?.[index];
    const tile = handle.closest(".pages-block-editor");
    const canvas = handle.closest(".pages-builder-canvas");
    if (!block || !tile || !canvas) return;

    const startY = event.clientY;
    collapseBlockTile(tile);
    const startRowSpan = getBuilderBlockLayout(block).rowSpan;
    const canvasStyles = window.getComputedStyle(canvas);
    const rowHeight =
      Number.parseFloat(
        canvasStyles.getPropertyValue("--page-builder-row-height"),
      ) || 72;
    const rowStep = rowHeight + (Number.parseFloat(canvasStyles.rowGap) || 0);
    handle.setPointerCapture?.(event.pointerId);
    tile.classList.add("is-resizing");

    const move = (moveEvent) => {
      const nextRowSpan = Math.min(
        Math.max(
          Math.round(startRowSpan + (moveEvent.clientY - startY) / rowStep),
          1,
        ),
        24,
      );
      tile.style.setProperty("--page-builder-row-span", String(nextRowSpan));
      handle.dataset.rowSpan = String(nextRowSpan);
    };
    const finish = () => {
      const rowSpan = Number(handle.dataset.rowSpan) || startRowSpan;
      tile.classList.remove("is-resizing");
      delete handle.dataset.rowSpan;
      const layout = { ...getBuilderBlockLayout(block), rowSpan };
      if (canPlaceBuilderBlock(layout, { ignoreIndex: index })) {
        updateBlock(index, { layout });
      } else {
        tile.style.setProperty("--page-builder-row-span", String(startRowSpan));
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  });

  return handle;
}

function createCanvasDropZone(insertIndex) {
  const zone = document.createElement("div");
  zone.className = "pages-canvas-drop-zone";
  zone.dataset.insertIndex = String(insertIndex);

  const label = document.createElement("span");
  label.textContent =
    insertIndex === 0 ? "Drop block at top" : "Drop block here";
  zone.append(label);

  zone.addEventListener("dragover", (event) => {
    const hasBlockType = event.dataTransfer.types.includes(
      "application/x-cmcen-block-type",
    );
    const hasBlockIndex = event.dataTransfer.types.includes(
      "application/x-cmcen-block-index",
    );

    if (!hasBlockType && !hasBlockIndex) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    zone.classList.add("is-active");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("is-active");
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-active");

    const blockType =
      event.dataTransfer.getData("application/x-cmcen-block-type") ||
      paletteDragBlockType;
    const existingIndex = Number(
      event.dataTransfer.getData("application/x-cmcen-block-index"),
    );

    if (blockType) {
      insertBlock(blockType, insertIndex);
      return;
    }

    if (Number.isInteger(existingIndex)) {
      reorderBlock(existingIndex, insertIndex);
    }
  });

  return zone;
}

function createBuilderCanvas() {
  const canvas = document.createElement("section");
  canvas.className = "pages-builder-canvas";
  canvas.setAttribute("aria-label", "Page layout canvas");

  const blocks = pagesState.selectedPage?.blocks || [];
  const rowCount = Math.min(
    maxBuilderCanvasRows,
    Math.max(
      6,
      ...blocks.map((block) => {
        const layout = getBuilderBlockLayout(block);
        return layout.row + layout.rowSpan;
      }),
    ),
  );
  canvas.style.setProperty("--page-builder-rows", String(rowCount));

  const hint = document.createElement("p");
  hint.className = "pages-builder-canvas-hint";
  hint.textContent = `12 columns × ${rowCount} rows · blocks snap to open cells`;
  canvas.append(hint);
  if (!blocks.length) {
    const empty = document.createElement("div");
    empty.className = "pages-builder-empty";
    empty.textContent = "Choose an element above to start building";
    canvas.append(empty);
  } else {
    blocks.forEach((block, index) => canvas.append(createBlockEditor(block, index)));
  }

  canvas.addEventListener("dragover", (event) => {
    const canDrop = event.dataTransfer.types.includes("application/x-cmcen-block-type") ||
      event.dataTransfer.types.includes("application/x-cmcen-block-index");
    if (!canDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    updatePageBuilderAutoScroll(event.clientY);
    canvas.classList.add("is-drag-target");
    const blockType =
      event.dataTransfer.getData("application/x-cmcen-block-type") ||
      paletteDragBlockType;
    const existingIndex = Number(
      event.dataTransfer.getData("application/x-cmcen-block-index"),
    );
    const block = blockType
      ? getNewBlock(blockType)
      : pagesState.selectedPage?.blocks?.[existingIndex];
    if (block) {
      const layout = getCanvasPosition(canvas, event, block);
      showCanvasDropPreview(canvas, layout, {
        valid: canPlaceBuilderBlock(layout, {
          ignoreIndex: blockType ? null : existingIndex,
        }),
      });
    }
  });
  canvas.addEventListener("dragleave", (event) => {
    if (!canvas.contains(event.relatedTarget)) {
      canvas.classList.remove("is-drag-target");
      clearCanvasDropPreview(canvas);
      stopPageBuilderAutoScroll();
    }
  });
  canvas.addEventListener("drop", (event) => {
    event.preventDefault();
    stopPageBuilderAutoScroll();
    canvas.classList.remove("is-drag-target");
    clearCanvasDropPreview(canvas);
    const blockType =
      event.dataTransfer.getData("application/x-cmcen-block-type") ||
      paletteDragBlockType;
    const existingIndex = Number(event.dataTransfer.getData("application/x-cmcen-block-index"));
    if (blockType) {
      insertBlock(
        blockType,
        getCanvasPosition(canvas, event, getNewBlock(blockType)),
      );
    } else if (Number.isInteger(existingIndex)) {
      moveBlockToPosition(existingIndex, getCanvasPosition(
        canvas,
        event,
        pagesState.selectedPage?.blocks?.[existingIndex],
      ));
    }
    paletteDragBlockType = "";
  });

  return canvas;
}

function applyCropStyles(image, cropValue) {
  const crop = getCrop(cropValue);
  image.style.objectPosition = `${crop.x}% ${crop.y}%`;
  image.style.transform = `scale(${crop.zoom}) rotate(${crop.rotate}deg)`;
}

function createCroppedPreview({ src, alt = "", crop }) {
  const frame = document.createElement("div");
  frame.className = "pages-image-preview-frame";

  const image = document.createElement("img");
  image.className = "pages-image-preview";
  image.src = src;
  image.alt = alt;
  applyCropStyles(image, crop);

  frame.append(image);
  return frame;
}

function createPreviewParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const element = document.createElement("p");
      element.textContent = paragraph;
      return element;
    });
}

function createPublicPreviewImage(media, alt, crop) {
  const frame = document.createElement("span");
  frame.className = "cms-image-frame";
  const image = document.createElement("img");
  image.src = getPreviewMediaUrl(media);
  image.alt = alt || "";
  image.loading = "eager";
  applyCropStyles(image, crop);
  frame.append(image);
  return frame;
}

function createPublicPreviewBlock(block) {
  const section = document.createElement("section");
  section.className = `cms-block cms-block-${block.type || "text"}`;
  const layout = getBuilderBlockLayout(block);
  section.style.setProperty("--cms-block-span", String(layout.span));
  section.style.setProperty("--cms-block-column", String(layout.column));
  section.style.setProperty("--cms-block-row", String(layout.row));
  section.style.setProperty("--cms-block-row-span", String(layout.rowSpan));

  if (block.type === "heading") {
    const heading = document.createElement(block.level === 3 ? "h3" : "h2");
    heading.textContent = localized(block.text);
    section.append(heading);
  } else if (block.type === "image") {
    section.append(
      createPublicPreviewImage(block, localized(block.alt), block.crop),
    );
    const caption = localized(block.caption);
    if (caption) {
      const captionElement = document.createElement("p");
      captionElement.className = "cms-image-caption";
      captionElement.textContent = caption;
      section.append(captionElement);
    }
  } else if (block.type === "callout") {
    section.classList.toggle("is-important", block.variant === "important");
    section.append(...createPreviewParagraphs(localized(block.body)));
  } else if (block.type === "columns") {
    const columns = document.createElement("div");
    columns.className = "cms-columns";
    (block.columns || []).forEach((column) => {
      const card = document.createElement("article");
      card.className = "cms-column";
      if (column.mediaUrl) {
        card.append(
          createPublicPreviewImage(column, localized(column.alt), column.crop),
        );
      }
      const title = localized(column.title);
      if (title) {
        const heading = document.createElement("h3");
        heading.textContent = title;
        card.append(heading);
      }
      card.append(...createPreviewParagraphs(localized(column.body)));
      columns.append(card);
    });
    section.append(columns);
  } else if (block.type === "carousel") {
    const title = localized(block.text);
    if (title) {
      const heading = document.createElement("h2");
      heading.textContent = title;
      section.append(heading);
    }
    const carousel = document.createElement("div");
    carousel.className = "cms-carousel";
    (block.items || []).forEach((item) => {
      const slide = document.createElement("figure");
      slide.className = "cms-carousel-slide";
      if (item.mediaUrl) {
        slide.append(
          createPublicPreviewImage(item, localized(item.alt), item.crop),
        );
      }
      const caption = localized(item.caption);
      if (caption) {
        const captionElement = document.createElement("figcaption");
        captionElement.textContent = caption;
        slide.append(captionElement);
      }
      carousel.append(slide);
    });
    section.append(carousel);
  } else if (block.type === "button") {
    const button = document.createElement("span");
    button.className = "cms-page-button";
    button.textContent = localized(block.text) || block.url || "Open";
    section.append(button);
  } else if (block.type === "divider") {
    section.append(document.createElement("hr"));
  } else {
    section.append(...createPreviewParagraphs(localized(block.body)));
  }

  return section;
}

function createPublicPreviewPage(page) {
  const preview = document.createElement("article");
  preview.className = "cms-page";
  const heading = document.createElement("header");
  heading.className = "cms-page-heading";
  const eyebrow = document.createElement("p");
  eyebrow.className = "dashboard-eyebrow";
  eyebrow.textContent = "CMCEN / RCMCE";
  const title = document.createElement("h1");
  title.textContent = localized(page.title) || page.slug || "Untitled page";
  heading.append(eyebrow, title);
  const summary = localized(page.summary);
  if (summary) {
    const intro = document.createElement("p");
    intro.className = "cms-page-summary";
    intro.textContent = summary;
    heading.append(intro);
  }

  const body = document.createElement("div");
  body.className = "cms-page-body";
  (page.blocks || []).forEach((block) => body.append(createPublicPreviewBlock(block)));
  preview.append(heading, body);
  return preview;
}

function createMediaDropZone({
  hasMedia,
  onUpload,
  onChoose,
  onCrop,
  progressKey,
  label = "Drop image here or choose file",
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "pages-media-field";
  const progress = progressKey ? getUploadProgress(progressKey) : null;

  const zone = document.createElement("label");
  zone.className = "pages-image-drop-zone";

  const input = document.createElement("input");
  input.type = "file";
  input.accept =
    ".jpg,.jpeg,.png,.webp,.gif,.heic,image/jpeg,image/png,image/webp,image/gif,image/heic";
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) onUpload(file);
  });

  const text = document.createElement("span");
  text.textContent = hasMedia ? "Replace image" : label;

  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-dragging");
  });
  zone.addEventListener("dragleave", () => {
    zone.classList.remove("is-dragging");
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) onUpload(file);
  });

  zone.append(input, text);

  const actions = document.createElement("div");
  actions.className = "pages-media-actions";

  const choose = document.createElement("button");
  choose.type = "button";
  choose.className = "admin-work-zone-button is-secondary";
  choose.textContent = "Choose from CDN";
  choose.disabled = progress?.status === "uploading";
  choose.addEventListener("click", onChoose);

  actions.append(choose);

  if (hasMedia) {
    const crop = document.createElement("button");
    crop.type = "button";
    crop.className = "admin-work-zone-button is-secondary";
    crop.textContent = "Crop / rotate";
    crop.disabled = progress?.status === "uploading";
    crop.addEventListener("click", onCrop);
    actions.append(crop);
  }

  wrapper.append(zone, actions);

  if (progress) {
    const progressWrapper = document.createElement("div");
    progressWrapper.className = `pages-upload-progress is-${progress.status || "uploading"}`;

    const labelElement = document.createElement("span");
    labelElement.textContent =
      progress.status === "error"
        ? progress.message || "Upload failed"
        : progress.status === "complete"
          ? "Upload complete"
          : progress.message ||
            `Uploading ${Math.round(progress.percent || 0)}%`;

    const bar = document.createElement("span");
    bar.className = "pages-upload-progress-bar";
    bar.style.setProperty(
      "--upload-progress",
      `${Math.max(0, Math.min(progress.percent || 0, 100))}%`,
    );

    progressWrapper.append(labelElement, bar);
    wrapper.append(progressWrapper);
  }

  return wrapper;
}

function createColumnEditor(block, index, column, columnIndex) {
  const panel = document.createElement("section");
  panel.className = "pages-column-editor";

  const title = document.createElement("h4");
  title.textContent = `Column ${columnIndex + 1}`;
  panel.append(title);

  if (column.mediaUrl) {
    panel.append(
      createCroppedPreview({
        src: getPreviewMediaUrl(column),
        crop: column.crop,
      }),
    );
  }

  panel.append(
    createMediaDropZone({
      hasMedia: Boolean(column.mediaUrl),
      label: "Add column image",
      progressKey: `column:${index}:${columnIndex}`,
      onUpload: (file) => uploadColumnImage(index, columnIndex, file),
      onCrop: () =>
        openCropEditor({
          type: "column",
          blockIndex: index,
          columnIndex,
        }),
      onChoose: () =>
        openMediaPicker({
          type: "column",
          blockIndex: index,
          columnIndex,
        }),
    }),
    createNestedLocalizedInput({
      label: "Column title",
      value: column.title,
      type: "input",
      onInput: (language, value) =>
        updateBlockColumnLocalized(
          index,
          columnIndex,
          "title",
          language,
          value,
        ),
    }),
    createNestedLocalizedInput({
      label: "Column body",
      value: column.body,
      onInput: (language, value) =>
        updateBlockColumnLocalized(index, columnIndex, "body", language, value),
    }),
    createNestedLocalizedInput({
      label: "Image alt text",
      value: column.alt,
      type: "input",
      onInput: (language, value) =>
        updateBlockColumnLocalized(index, columnIndex, "alt", language, value),
    }),
  );

  return panel;
}

function createCarouselItemEditor(block, index, item, itemIndex) {
  const panel = document.createElement("section");
  panel.className = "pages-carousel-item-editor";

  const header = document.createElement("div");
  header.className = "pages-mini-heading";

  const title = document.createElement("h4");
  title.textContent = `Slide ${itemIndex + 1}`;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "admin-work-zone-button is-danger";
  remove.textContent = "Remove slide";
  remove.disabled = (block.items || []).length <= 1;
  remove.addEventListener("click", () => removeCarouselItem(index, itemIndex));

  header.append(title, remove);
  panel.append(header);

  if (item.mediaUrl) {
    panel.append(
      createCroppedPreview({
        src: getPreviewMediaUrl(item),
        crop: item.crop,
      }),
    );
  }

  panel.append(
    createMediaDropZone({
      hasMedia: Boolean(item.mediaUrl),
      label: "Add slide image",
      progressKey: `carousel:${index}:${itemIndex}`,
      onUpload: (file) => uploadCarouselImage(index, itemIndex, file),
      onCrop: () =>
        openCropEditor({
          type: "carousel",
          blockIndex: index,
          itemIndex,
        }),
      onChoose: () =>
        openMediaPicker({
          type: "carousel",
          blockIndex: index,
          itemIndex,
        }),
    }),
    createNestedLocalizedInput({
      label: "Alt text",
      value: item.alt,
      type: "input",
      onInput: (language, value) =>
        updateCarouselItemLocalized(index, itemIndex, "alt", language, value),
    }),
    createNestedLocalizedInput({
      label: "Caption",
      value: item.caption,
      type: "input",
      onInput: (language, value) =>
        updateCarouselItemLocalized(
          index,
          itemIndex,
          "caption",
          language,
          value,
        ),
    }),
  );

  return panel;
}

function createBlockEditContent(block, index) {
  const content = document.createElement("div");
  content.className = "pages-block-edit-content";

  if (block.type === "heading") {
    content.append(
      createBlockLocalizedInput(index, "Heading text", "text", "input"),
    );
  } else if (block.type === "image") {
    if (block.mediaUrl) {
      content.append(
        createCroppedPreview({
          src: getPreviewMediaUrl(block),
          crop: block.crop,
        }),
      );
    }
    content.append(
      createMediaDropZone({
        hasMedia: Boolean(block.mediaUrl),
        progressKey: `block:${index}`,
        onUpload: (file) => uploadBlockImage(index, file),
        onCrop: () =>
          openCropEditor({
            type: "block",
            blockIndex: index,
          }),
        onChoose: () =>
          openMediaPicker({
            type: "block",
            blockIndex: index,
          }),
      }),
      createBlockLocalizedInput(index, "Alt text", "alt", "input"),
      createBlockLocalizedInput(index, "Caption", "caption", "input"),
    );
  } else if (block.type === "button") {
    const urlLabel = document.createElement("label");
    urlLabel.className = "pages-editor-field";
    const span = document.createElement("span");
    span.textContent = "URL";
    const input = document.createElement("input");
    input.type = "text";
    input.value = block.url || "";
    input.addEventListener("input", (event) =>
      updateBlock(index, { url: event.target.value }, { render: false }),
    );
    urlLabel.append(span, input);
    content.append(
      createBlockLocalizedInput(index, "Button label", "text", "input"),
      urlLabel,
    );
  } else if (block.type === "divider") {
    const note = document.createElement("p");
    note.className = "admin-empty-state";
    note.textContent = "Divider line";
    content.append(note);
  } else if (block.type === "columns") {
    const columns = document.createElement("div");
    columns.className = "pages-column-editors";
    (block.columns?.length
      ? block.columns
      : getNewBlock("columns").columns
    ).forEach((column, columnIndex) => {
      columns.append(createColumnEditor(block, index, column, columnIndex));
    });
    content.append(columns);
  } else if (block.type === "carousel") {
    const carouselItems = document.createElement("div");
    carouselItems.className = "pages-carousel-item-editors";
    (block.items?.length ? block.items : getNewBlock("carousel").items).forEach(
      (item, itemIndex) => {
        carouselItems.append(
          createCarouselItemEditor(block, index, item, itemIndex),
        );
      },
    );

    const addSlide = document.createElement("button");
    addSlide.type = "button";
    addSlide.className = "admin-work-zone-button is-secondary";
    addSlide.textContent = "Add slide";
    addSlide.addEventListener("click", () => addCarouselItem(index));
    content.append(
      createBlockLocalizedInput(index, "Carousel heading", "text", "input"),
      carouselItems,
      addSlide,
    );
  } else {
    content.append(
      createBlockLocalizedInput(
        index,
        block.type === "callout" ? "Callout text" : "Text",
        "body",
      ),
    );
  }

  return content;
}

function createBlockEditor(block, index) {
  const article = document.createElement("article");
  article.className = `pages-block-editor is-${block.type}`;
  article.style.setProperty(
    "--page-builder-span",
    String(getBuilderBlockSpan(block)),
  );
  const layout = getBuilderBlockLayout(block);
  article.style.setProperty("--page-builder-column", String(layout.column));
  article.style.setProperty("--page-builder-row", String(layout.row));
  article.style.setProperty("--page-builder-row-span", String(layout.rowSpan));
  article.draggable = false;
  article.dataset.blockIndex = String(index);
  article.classList.toggle("is-selected", index === pagesState.selectedBlockIndex);

  let pressTimer = null;
  let dragStart = null;
  let isPointerDragging = false;
  let suppressClick = false;

  const stopPointerDrag = () => {
    window.clearTimeout(pressTimer);
    pressTimer = null;
    dragStart = null;
    document.body.classList.remove("pages-is-dragging");
    article.classList.remove("is-pointer-dragging");
    stopPageBuilderAutoScroll();
    const canvas = article.closest(".pages-builder-canvas");
    canvas?.classList.remove("is-drag-target");
    clearCanvasDropPreview(canvas);
  };

  article.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      event.target.closest("button, input, textarea, select, label, a")
    ) {
      return;
    }

    dragStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    pressTimer = window.setTimeout(() => {
      if (!dragStart) return;
      isPointerDragging = true;
      suppressClick = true;
      collapseBlockTile(article);
      article.setPointerCapture?.(dragStart.pointerId);
      article.classList.add("is-pointer-dragging");
      document.body.classList.add("pages-is-dragging");
    }, 180);
  });

  article.addEventListener("pointermove", (event) => {
    if (!dragStart) return;

    const offsetX = event.clientX - dragStart.x;
    const offsetY = event.clientY - dragStart.y;
    if (!isPointerDragging && Math.hypot(offsetX, offsetY) > 8) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
      dragStart = null;
      return;
    }

    if (!isPointerDragging) return;
    event.preventDefault();
    updatePageBuilderAutoScroll(event.clientY);
    article.style.setProperty("--page-builder-drag-x", `${offsetX}px`);
    article.style.setProperty("--page-builder-drag-y", `${offsetY}px`);
    const canvas = article.closest(".pages-builder-canvas");
    if (!canvas) return;

    if (isPointInsideCanvas(canvas, event)) {
      canvas.classList.add("is-drag-target");
      const layout = getCanvasPosition(canvas, event, block);
      showCanvasDropPreview(canvas, layout, {
        valid: canPlaceBuilderBlock(layout, { ignoreIndex: index }),
      });
    } else {
      canvas.classList.remove("is-drag-target");
      clearCanvasDropPreview(canvas);
    }
  });

  const finishPointerDrag = (event) => {
    if (!dragStart) return;
    const wasPointerDragging = isPointerDragging;
    stopPointerDrag();
    isPointerDragging = false;
    article.style.removeProperty("--page-builder-drag-x");
    article.style.removeProperty("--page-builder-drag-y");

    if (!wasPointerDragging) return;
    event.preventDefault();
    const canvas = article.closest(".pages-builder-canvas");
    if (canvas && isPointInsideCanvas(canvas, event)) {
      moveBlockToPosition(index, getCanvasPosition(canvas, event, block));
    }
  };

  article.addEventListener("pointerup", finishPointerDrag);
  article.addEventListener("pointercancel", () => {
    const wasPointerDragging = isPointerDragging;
    stopPointerDrag();
    isPointerDragging = false;
    article.style.removeProperty("--page-builder-drag-x");
    article.style.removeProperty("--page-builder-drag-y");
    if (wasPointerDragging) suppressClick = false;
  });
  article.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
      return;
    }
    if (event.target.closest("button, input, textarea, select, label, a")) return;
    if (pagesState.selectedBlockIndex !== index) {
      setPagesState({ selectedBlockIndex: index });
    }
  });
  article.addEventListener("dragover", (event) => {
    const hasBlockType = event.dataTransfer.types.includes(
      "application/x-cmcen-block-type",
    );
    const hasBlockIndex = event.dataTransfer.types.includes(
      "application/x-cmcen-block-index",
    );

    if (!hasBlockType && !hasBlockIndex) return;

    event.preventDefault();
    article.classList.add("is-drop-target");
  });
  article.addEventListener("dragleave", () => {
    article.classList.remove("is-drop-target");
  });
  article.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    article.classList.remove("is-drop-target");
    const blockType =
      event.dataTransfer.getData("application/x-cmcen-block-type") ||
      paletteDragBlockType;
    const fromIndex = Number(
      event.dataTransfer.getData("application/x-cmcen-block-index") ||
        event.dataTransfer.getData("text/plain"),
    );

    const canvas = article.closest(".pages-builder-canvas");
    if (!canvas) return;
    if (blockType) {
      insertBlock(
        blockType,
        getCanvasPosition(canvas, event, getNewBlock(blockType)),
      );
    }
    if (Number.isInteger(fromIndex)) {
      moveBlockToPosition(fromIndex, getCanvasPosition(
        canvas,
        event,
        pagesState.selectedPage?.blocks?.[fromIndex],
      ));
    }
  });

  const header = document.createElement("div");
  header.className = "pages-block-heading";

  const typeIcon = document.createElement("span");
  typeIcon.className = "pages-block-type-icon";
  typeIcon.append(createBuilderIcon(block.type));
  const type = document.createElement("strong");
  type.textContent = block.type === "columns" ? "Side-by-side" : block.type;
  header.append(typeIcon, type);
  article.append(header);

  const summaryText = getBlockSummary(block);
  if (summaryText) {
    const summary = document.createElement("p");
    summary.className = "pages-block-summary";
    summary.textContent = summaryText;
    article.append(summary);
  }
  article.append(createBlockResizeHandle(index));

  if (block.type !== "divider") {
    article.append(createBlockHeightResizeHandle(index));
  }

  return article;
}

function createSelectedBlockEditorCard() {
  const index = pagesState.selectedBlockIndex;
  const block = pagesState.selectedPage?.blocks?.[index];
  if (!Number.isInteger(index) || !block) return null;

  const overlay = document.createElement("div");
  overlay.className = "pages-block-editor-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      setPagesState({ selectedBlockIndex: null });
    }
  });

  const card = document.createElement("section");
  card.className = "pages-block-editor-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "pagesBlockEditorTitle");

  const header = document.createElement("header");
  header.className = "pages-block-editor-card-header";
  const heading = document.createElement("div");
  const title = document.createElement("h3");
  title.id = "pagesBlockEditorTitle";
  title.textContent = `Edit ${block.type === "columns" ? "side-by-side" : block.type}`;
  heading.append(title);
  const summaryText = getBlockSummary(block);
  if (summaryText) {
    const summary = document.createElement("p");
    summary.textContent = summaryText;
    heading.append(summary);
  }

  const controls = document.createElement("div");
  controls.className = "pages-block-editor-card-controls";
  controls.append(createBlockToolbar(index));
  const close = document.createElement("button");
  close.type = "button";
  close.className = "admin-work-zone-button is-secondary is-compact";
  close.textContent = "Done";
  close.addEventListener("click", () =>
    setPagesState({ selectedBlockIndex: null }),
  );
  controls.append(close);

  header.append(heading, controls);
  card.append(header, createBlockEditContent(block, index));
  overlay.append(card);
  return overlay;
}

function createBlockControls() {
  if (!pagesState.selectedPage) {
    const placeholder = document.createElement("div");
    placeholder.className = "pages-add-block-placeholder";
    return placeholder;
  }

  const controls = document.createElement("div");
  controls.className = "pages-add-block-controls";

  const paletteHeader = document.createElement("div");
  paletteHeader.className = "pages-add-block-header";
  const title = document.createElement("strong");
  title.className = "pages-add-block-title";
  title.textContent = "Builder blocks";

  const pageState = document.createElement("div");
  pageState.className = "pages-builder-state-controls";
  const status = document.createElement("span");
  status.className = `pages-page-status is-${pagesState.selectedPage.status || "draft"}`;
  status.textContent =
    pagesState.selectedPage.status === "published" ? "Published" : "Draft";
  const autoSave = document.createElement("span");
  autoSave.className = `pages-autosave-status is-${pagesState.autoSaveStatus || "idle"}`;
  autoSave.textContent = getAutoSaveLabel();
  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "admin-work-zone-button is-secondary pages-preview-button";
  preview.setAttribute("aria-label", "Preview page");
  preview.title = "Preview page";
  preview.append(createPreviewEyeIcon(document));
  preview.addEventListener("click", () =>
    setPagesState({ pagePreview: true, selectedBlockIndex: null }),
  );
  pageState.append(status, autoSave, preview);
  paletteHeader.append(title, pageState);
  controls.append(paletteHeader);

  [
    ["heading", "Heading"],
    ["text", "Text"],
    ["image", "Image"],
    ["columns", "Side-by-side"],
    ["carousel", "Carousel"],
    ["callout", "Callout"],
    ["button", "Button"],
    ["divider", "Divider"],
  ].forEach(([type, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `pages-palette-block is-${type}`;
    button.draggable = true;
    button.setAttribute("aria-label", `Add ${label} block`);
    button.title = `Add ${label} block`;
    const icon = createBuilderIcon(type);
    const buttonLabel = document.createElement("span");
    buttonLabel.textContent = label;
    button.append(icon, buttonLabel);
    button.disabled = !pagesState.selectedPage;
    button.addEventListener("click", () => addBlock(type));
    button.addEventListener("dragstart", (event) => {
      if (!pagesState.selectedPage) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-cmcen-block-type", type);
      paletteDragBlockType = type;
      document.body.classList.add("pages-is-dragging");
      button.classList.add("is-dragging");
    });
    button.addEventListener("dragend", () => {
      paletteDragBlockType = "";
      stopPageBuilderAutoScroll();
      document.body.classList.remove("pages-is-dragging");
      button.classList.remove("is-dragging");
    });
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
    ["restricted", "Selected roles or permissions"],
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    audience.append(option);
  });
  audience.value = access.audience || "public";
  audience.addEventListener("change", (event) => {
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

  (pagesState.roles || []).forEach((role) => {
    roleGroup.append(
      createCheckboxOption({
        label: getBuiltInRoleLabel(role),
        checked: (access.roles || []).includes(role),
        onChange: (isChecked) =>
          toggleAccessListValue("roles", role, isChecked),
      }),
    );
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
    pagesState.customRoles.forEach((role) => {
      customRoleGroup.append(
        createCheckboxOption({
          label: role.name,
          badgeColor: role.color,
          checked: (access.customRoles || []).some(
            (roleId) => String(roleId) === String(role._id),
          ),
          onChange: (isChecked) =>
            toggleAccessListValue("customRoles", String(role._id), isChecked),
        }),
      );
    });
  }

  const permissionGroup = document.createElement("div");
  permissionGroup.className = "pages-access-group";

  const permissionTitle = document.createElement("strong");
  permissionTitle.textContent = "Permission scopes";
  permissionGroup.append(permissionTitle);

  (pagesState.permissionCatalog || []).forEach((permission) => {
    permissionGroup.append(
      createCheckboxOption({
        label: `${permission.label} (${permission.key})`,
        checked: (access.permissions || []).includes(permission.key),
        onChange: (isChecked) =>
          toggleAccessListValue("permissions", permission.key, isChecked),
      }),
    );
  });

  fieldset.append(roleGroup, customRoleGroup, permissionGroup);
  return fieldset;
}

function createPageEditor() {
  const panel = document.createElement("section");
  panel.className = "pages-admin-editor";
  panel.classList.toggle("is-empty", !pagesState.selectedPage);

  if (!pagesState.selectedPage) {
    const empty = document.createElement("div");
    empty.className = "pages-editor-empty";

    const heading = document.createElement("strong");
    heading.textContent = "Select or create a page";

    const copy = document.createElement("span");
    copy.textContent =
      "Choose a page on the left, or create a new one to open the drag-and-drop builder.";

    empty.append(heading, copy);
    panel.append(empty);
    return panel;
  }

  const header = document.createElement("div");
  header.className = "admin-panel-heading";
  const title = document.createElement("h3");
  title.textContent =
    localized(pagesState.selectedPage.title) || "Untitled page";
  const headerMeta = document.createElement("div");
  headerMeta.className = "pages-editor-header-meta";

  const pageActions = document.createElement("div");
  pageActions.className = "pages-editor-primary-actions";

  const backToPages = document.createElement("button");
  backToPages.type = "button";
  backToPages.className = "admin-work-zone-button is-secondary pages-back-to-library";
  backToPages.textContent = "All custom pages";
  backToPages.addEventListener("click", () => {
    cancelAutoSave();
    setPagesState({
      selectedPageId: "",
      selectedPage: null,
      selectedBlockIndex: null,
      pageDetailsOpen: false,
      pagePreview: false,
    });
  });

  const manageNavigation = document.createElement("button");
  manageNavigation.type = "button";
  manageNavigation.className = "admin-work-zone-button is-secondary";
  manageNavigation.textContent = "Navigation";
  manageNavigation.addEventListener("click", () =>
    setPagesState({ navigationModal: true, navigationMode: "add" }),
  );

  const openPage = document.createElement("button");
  openPage.type = "button";
  openPage.className = "admin-work-zone-button is-secondary";
  openPage.textContent = "Visit page";
  openPage.disabled = pagesState.selectedPage.status !== "published";
  openPage.title = openPage.disabled
    ? "Publish this page to visit its public URL"
    : "Visit the published page";
  openPage.addEventListener("click", () => {
    if (openPage.disabled) return;
    window.open(
      pagesState.selectedPage.route || `/pages/${pagesState.selectedPage.slug}`,
      "_blank",
      "noopener",
    );
  });

  pageActions.append(
    backToPages,
    manageNavigation,
    openPage,
  );
  headerMeta.append(pageActions);
  header.append(title, headerMeta);

  const slugField = document.createElement("label");
  slugField.className = "pages-editor-field";
  const slugLabel = document.createElement("span");
  slugLabel.textContent = "Slug";
  const slug = document.createElement("input");
  slug.type = "text";
  slug.value = pagesState.selectedPage.slug || "";
  slug.addEventListener("input", (event) => {
    const cleanSlug = getCleanSlug(event.target.value);
    event.target.value = cleanSlug;
    updateSelectedPage({ slug: cleanSlug }, { render: false });
  });
  slugField.append(slugLabel, slug);

  const blocks = document.createElement("div");
  blocks.className = "pages-block-list";
  blocks.append(createBuilderCanvas());

  const details = document.createElement("section");
  details.className = "pages-page-details";
  details.classList.toggle("is-open", Boolean(pagesState.pageDetailsOpen));

  const detailsSummary = document.createElement(
    pagesState.pageDetailsOpen ? "div" : "button",
  );
  detailsSummary.className = "pages-page-details-heading";
  if (!pagesState.pageDetailsOpen) {
    detailsSummary.type = "button";
    detailsSummary.addEventListener("click", () =>
      setPagesState({ pageDetailsOpen: true }),
    );
  }

  const detailsTitle = document.createElement("strong");
  detailsTitle.textContent = "Page details";

  const detailsHint = document.createElement("span");
  detailsHint.className = "pages-page-details-hint";
  detailsHint.textContent = "Title, URL, summary, and audience";
  detailsSummary.append(detailsTitle, detailsHint);
  if (!pagesState.pageDetailsOpen) {
    const detailsToggle = document.createElement("span");
    detailsToggle.className = "pages-page-details-toggle";
    detailsToggle.setAttribute("aria-hidden", "true");
    detailsSummary.append(detailsToggle);
  }

  const detailsBody = document.createElement("div");
  detailsBody.className = "pages-page-details-body";
  detailsBody.append(
    createLocalizedInput("Title", "title", "input"),
    slugField,
    createLocalizedInput("Summary", "summary", "textarea"),
    createPageAccessEditor(),
  );

  const detailsActions = document.createElement("div");
  detailsActions.className = "pages-page-details-actions";
  const continueToBuilder = document.createElement("button");
  continueToBuilder.type = "button";
  continueToBuilder.className = "admin-work-zone-button is-primary";
  continueToBuilder.textContent = "Save and continue to builder";
  continueToBuilder.addEventListener("click", () =>
    saveSelectedPage({ auto: false }),
  );
  detailsActions.append(continueToBuilder);
  detailsBody.append(detailsActions);
  details.append(detailsSummary);
  if (pagesState.pageDetailsOpen) {
    details.append(detailsBody);
  }

  const builderControls = pagesState.pageDetailsOpen
    ? null
    : createBlockControls();

  const actions = document.createElement("div");
  actions.className = "pages-editor-actions";

  const continueToNavigation = document.createElement("button");
  continueToNavigation.type = "button";
  continueToNavigation.className = "admin-work-zone-button is-primary";
  const hasPublishedNavigationLink =
    pagesState.selectedPage.status === "published" &&
    pagesState.navigationItems.some(
      (item) =>
        item.type !== "group" &&
        String(item.page || "") === String(pagesState.selectedPage._id),
    );
  continueToNavigation.textContent = hasPublishedNavigationLink
    ? "Save and update header"
    : "Save and continue";
  continueToNavigation.addEventListener("click", async () => {
    const saved = await saveSelectedPage({ auto: false });
    if (saved) {
      setPagesState({ navigationModal: true, navigationMode: "add" });
    }
  });

  const saveDraft = document.createElement("button");
  saveDraft.type = "button";
  saveDraft.className = "admin-work-zone-button is-secondary";
  saveDraft.textContent = pagesState.selectedPage.status === "published"
    ? "Unpublish"
    : "Save as draft";
  saveDraft.addEventListener("click", saveDraftAndReturnToLibrary);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "admin-work-zone-button is-danger";
  remove.textContent = "Delete";
  remove.addEventListener("click", deleteSelectedPage);

  actions.append(continueToNavigation, saveDraft, remove);

  panel.append(
    header,
    details,
    ...(pagesState.pageDetailsOpen
      ? []
      : [builderControls, blocks, actions]),
  );

  return panel;
}

function createPagePreviewModal() {
  const page = pagesState.selectedPage;
  if (!pagesState.pagePreview || !page) return null;

  const overlay = document.createElement("div");
  overlay.className = "pages-page-preview-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      setPagesState({ pagePreview: false });
    }
  });

  const preview = document.createElement("section");
  preview.className = "pages-page-preview";
  preview.setAttribute("role", "dialog");
  preview.setAttribute("aria-modal", "true");
  preview.setAttribute("aria-labelledby", "pagesPagePreviewTitle");

  const header = document.createElement("header");
  header.className = "pages-page-preview-header";
  const heading = document.createElement("div");
  const title = document.createElement("h2");
  title.id = "pagesPagePreviewTitle";
  title.textContent = "Page preview";
  const copy = document.createElement("p");
  copy.textContent = "Showing your current edits, including anything not saved yet.";
  heading.append(title, copy);

  const actions = document.createElement("div");
  actions.className = "pages-page-preview-actions";
  if (page.status === "published") {
    const openPage = document.createElement("button");
    openPage.type = "button";
    openPage.className = "admin-work-zone-button is-secondary";
    openPage.textContent = "Open page";
    openPage.addEventListener("click", () =>
      window.open(page.route || `/pages/${page.slug}`, "_blank", "noopener"),
    );
    actions.append(openPage);
  }
  const back = document.createElement("button");
  back.type = "button";
  back.className = "admin-work-zone-button is-primary";
  back.textContent = "Back to builder";
  back.addEventListener("click", () => setPagesState({ pagePreview: false }));
  actions.append(back);
  header.append(heading, actions);

  const content = document.createElement("main");
  content.className = "pages-page-preview-content cms-page-main";
  content.append(createPublicPreviewPage(page));
  preview.append(header, content);
  overlay.append(preview);
  pagePreviewPositionCleanup = positionPagePreviewInViewport(overlay, preview);
  return overlay;
}

function positionPagePreviewInViewport(overlay, preview) {
  try {
    if (window.parent === window || !window.frameElement) return null;

    overlay.classList.add("is-embedded");
    const position = () => {
      const frameRect = window.frameElement.getBoundingClientRect();
      const top = Math.max(12, 12 - frameRect.top);
      const height = Math.max(240, window.parent.innerHeight - 24);
      preview.style.setProperty("--pages-preview-top", `${top}px`);
      preview.style.setProperty("--pages-preview-height", `${height}px`);
      // The preview is absolutely positioned so it does not contribute to the
      // iframe's natural height. Reserve the visible viewport while previewing
      // so the parent cannot clip it at the builder's shorter document edge.
      pagesAdminContent.style.minHeight = `${top + height + 12}px`;
    };
    const schedulePosition = () => window.requestAnimationFrame(position);
    schedulePosition();
    window.parent.addEventListener("scroll", schedulePosition, { passive: true });
    window.parent.addEventListener("resize", schedulePosition);
    return () => {
      window.parent.removeEventListener("scroll", schedulePosition);
      window.parent.removeEventListener("resize", schedulePosition);
      pagesAdminContent.style.removeProperty("min-height");
    };
  } catch {
    return null;
  }
}

function createNavigationPanel() {
  const panel = document.createElement("div");
  panel.className = "pages-navigation-panel pages-navigation-flow";
  const selectedPage = pagesState.selectedPage;

  if (!pagesState.canManageNavigation) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "You can edit pages, but not navigation.";
    panel.append(empty);
    return panel;
  }

  if (!selectedPage) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "Open a custom page to place it in the site navigation.";
    panel.append(empty);
    return panel;
  }

  const existingLinks = pagesState.navigationItems.filter(
    (item) =>
      item.type !== "group" &&
      String(item.page || "") === String(selectedPage._id),
  );
  const existingLink = existingLinks[0] || null;

  const intro = document.createElement("div");
  intro.className = "pages-navigation-flow-intro";
  const introTitle = document.createElement("h3");
  introTitle.textContent = existingLink
    ? "Update this page in navigation"
    : "Place this page in navigation";
  const introCopy = document.createElement("p");
  introCopy.textContent =
    existingLink
      ? "Change the link name or move it to a different header."
      : "Give the link a name and choose the header where visitors will find it.";
  intro.append(introTitle, introCopy);

  const form = document.createElement("form");
  form.className = "pages-navigation-flow-form";

  const linkName = document.createElement("label");
  linkName.className = "pages-navigation-flow-field";
  const linkNameLabel = document.createElement("span");
  linkNameLabel.textContent = "Navigation link name";
  const linkNameInput = document.createElement("input");
  linkNameInput.type = "text";
  linkNameInput.value =
    localized(existingLink?.label) ||
    localized(selectedPage.title) ||
    selectedPage.slug;
  linkNameInput.required = true;
  linkName.append(linkNameLabel, linkNameInput);

  const groupField = document.createElement("div");
  groupField.className = "pages-navigation-flow-field";
  const groupLabel = document.createElement("span");
  groupLabel.textContent = "Header menu";
  const groupPicker = document.createElement("div");
  groupPicker.className = "pages-navigation-header-picker";
  const groupSearch = document.createElement("input");
  groupSearch.type = "search";
  groupSearch.className = "pages-navigation-header-search";
  groupSearch.placeholder = "Search headers";
  groupSearch.setAttribute("autocomplete", "off");
  groupSearch.setAttribute("role", "combobox");
  groupSearch.setAttribute("aria-expanded", "false");
  groupSearch.setAttribute("aria-controls", "pagesNavigationHeaderOptions");
  const groupMenu = document.createElement("div");
  groupMenu.id = "pagesNavigationHeaderOptions";
  groupMenu.className = "pages-navigation-header-options";
  groupMenu.setAttribute("role", "listbox");
  groupMenu.hidden = true;
  groupPicker.append(groupSearch, groupMenu);

  // Navigation groups normally arrive in navigationGroups, but include the
  // group records themselves as well. That keeps newly created custom headers
  // searchable immediately, even before a refresh returns the derived list.
  const groupsByKey = new Map();
  const addGroup = (group, label) => {
    const key = getNavigationGroupKey(group);
    if (!key) return;

    groupsByKey.set(key, {
      key,
      label: localized(label) || getNavigationGroupLabel(group),
    });
  };
  pagesState.navigationGroups.forEach((group) => addGroup(group));
  pagesState.navigationItems
    .filter((item) => item.type === "group")
    .forEach((item) => addGroup(item.group, item.label));
  const groups = [...groupsByKey.values()];
  let selectedGroup = existingLink?.group || "";

  const setGroupMenuOpen = (isOpen) => {
    groupMenu.hidden = !isOpen;
    groupPicker.classList.toggle("is-open", isOpen);
    groupPicker
      .closest(".pages-navigation-modal")
      ?.classList.toggle("is-header-menu-open", isOpen);
    groupSearch.setAttribute("aria-expanded", String(isOpen));
  };

  const selectGroup = (group) => {
    selectedGroup = group.key;
    groupSearch.value = group.label;
    setGroupMenuOpen(false);
    groupPicker.classList.remove("is-open", "opens-upward");
  };

  const makeGroupOptionSelectable = (option, group) => {
    const select = (event) => {
      event.preventDefault();
      selectGroup(group);
    };

    // Select before the search input blurs; otherwise the delayed blur handler
    // can close a floating menu before its result receives the click.
    option.addEventListener("pointerdown", select);
    option.addEventListener("click", select);
  };

  const renderGroupOptions = () => {
    const query = groupSearch.value.trim().toLocaleLowerCase();
    const matches = groups.filter((group) =>
      group.label.toLocaleLowerCase().includes(query) ||
      group.key.toLocaleLowerCase().includes(query),
    );
    groupMenu.replaceChildren();

    matches.forEach((group) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "pages-navigation-header-result";
      option.textContent = group.label;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(group.key === selectedGroup));
      makeGroupOptionSelectable(option, group);
      groupMenu.append(option);
    });

    const exactMatch = groups.some(
      (group) =>
        group.label.toLocaleLowerCase() === query ||
        group.key.toLocaleLowerCase() === query,
    );
    if (query && !exactMatch) {
      const create = document.createElement("button");
      create.type = "button";
      create.className = "pages-navigation-header-result is-create";
      create.textContent = `Create “${groupSearch.value.trim()}”`;
      create.setAttribute("role", "option");
      makeGroupOptionSelectable(
        create,
        { key: "__new__", label: groupSearch.value.trim() },
      );
      groupMenu.append(create);
    }

    const isOpen = Boolean(groupMenu.childElementCount);
    groupPicker.classList.remove("opens-upward");
    groupMenu.style.maxHeight = isOpen ? "min(300px, 38vh)" : "";
    setGroupMenuOpen(isOpen);
  };

  const initialGroup = groups.find((group) => group.key === selectedGroup);
  groupSearch.value = initialGroup?.label || "";
  groupSearch.addEventListener("focus", () => {
    groupSearch.select();
    renderGroupOptions();
  });
  groupSearch.addEventListener("input", () => {
    selectedGroup = "";
    renderGroupOptions();
  });
  groupSearch.addEventListener("blur", () => {
    window.setTimeout(() => {
      setGroupMenuOpen(false);
      groupPicker.classList.remove("is-open", "opens-upward");
    }, 120);
  });
  groupField.append(groupLabel, groupPicker);

  const continueButton = document.createElement("button");
  continueButton.type = "submit";
  continueButton.className = "admin-work-zone-button is-primary";
  continueButton.textContent = existingLink ? "Update link" : "Continue";

  form.append(linkName, groupField, continueButton);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const headerName = groupSearch.value.trim();
    const matchingGroup = groups.find(
      (group) =>
        group.label.toLocaleLowerCase() === headerName.toLocaleLowerCase() ||
        group.key.toLocaleLowerCase() === headerName.toLocaleLowerCase(),
    );
    continueNavigationSetup({
      linkName: linkNameInput.value,
      group: matchingGroup?.key || selectedGroup || "__new__",
      newGroupName: headerName,
      existingItemId: existingLink?._id || "",
    });
  });

  panel.append(intro, form);

  return panel;
}

function getNavigationItemsForGroup(groupKey) {
  return pagesState.navigationItems.filter(
    (item) => item.type !== "group" && item.group === groupKey,
  );
}

function createNavigationManagementPanel() {
  const panel = document.createElement("section");
  panel.className = "pages-navigation-management";

  if (!pagesState.canManageNavigation) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "You do not have permission to manage navigation.";
    panel.append(empty);
    return panel;
  }

  const intro = document.createElement("div");
  intro.className = "pages-navigation-management-intro";
  const title = document.createElement("h3");
  title.textContent = "Current navigation";
  const copy = document.createElement("p");
  copy.textContent =
    "Remove a link to take it out of the header. Removing a custom header also removes the links inside it.";
  intro.append(title, copy);
  panel.append(intro);

  const customGroups = pagesState.navigationItems.filter(
    (item) => item.type === "group",
  );
  const groupKeys = [...new Set([
    ...pagesState.navigationItems.map((item) => item.group).filter(Boolean),
    ...customGroups.map((item) => item.group).filter(Boolean),
  ])];

  if (!groupKeys.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "There are no custom navigation items yet.";
    panel.append(empty);
    return panel;
  }

  const list = document.createElement("div");
  list.className = "pages-navigation-management-list";

  groupKeys.forEach((groupKey) => {
    const groupItem = customGroups.find((item) => item.group === groupKey);
    const links = getNavigationItemsForGroup(groupKey);
    const groupCard = document.createElement("section");
    groupCard.className = "pages-navigation-management-group";

    const groupHeader = document.createElement("div");
    groupHeader.className = "pages-navigation-management-group-header";
    const groupHeading = document.createElement("div");
    const groupName = document.createElement("strong");
    groupName.textContent = groupItem
      ? localized(groupItem.label) || getNavigationGroupLabel(groupKey)
      : getNavigationGroupLabel(groupKey);
    const groupMeta = document.createElement("span");
    groupMeta.textContent = `${links.length} link${links.length === 1 ? "" : "s"}`;
    groupHeading.append(groupName, groupMeta);
    groupHeader.append(groupHeading);

    if (groupItem) {
      const removeGroup = document.createElement("button");
      removeGroup.type = "button";
      removeGroup.className = "admin-work-zone-button is-danger is-compact";
      removeGroup.textContent = "Remove header";
      removeGroup.addEventListener("click", async () => {
        const headerName = groupName.textContent || "this header";
        const confirmation = links.length
          ? `Remove “${headerName}” and its ${links.length} navigation link${links.length === 1 ? "" : "s"}? This cannot be undone.`
          : `Remove “${headerName}” from navigation? This cannot be undone.`;
        if (!(await CMCENModal.confirm(confirmation, {
          title: "Remove header",
          confirmText: "Remove header",
          destructive: true,
        }))) return;
        await deleteNavigationItem(groupItem._id);
      });
      groupHeader.append(removeGroup);
    }

    groupCard.append(groupHeader);

    const linkList = document.createElement("div");
    linkList.className = "pages-navigation-management-links";
    if (!links.length) {
      const emptyLinks = document.createElement("span");
      emptyLinks.className = "pages-navigation-management-empty";
      emptyLinks.textContent = "No links in this header.";
      linkList.append(emptyLinks);
    }

    links.forEach((item) => {
      const row = document.createElement("div");
      row.className = "pages-navigation-management-link";
      const details = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = localized(item.label) || item.route || "Untitled link";
      const route = document.createElement("span");
      route.textContent = item.route || "Custom link";
      details.append(label, route);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "admin-work-zone-button is-danger is-compact";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        if (!(await CMCENModal.confirm(
          `Remove “${label.textContent}” from navigation? This cannot be undone.`,
          {
            title: "Remove navigation link",
            confirmText: "Remove link",
            destructive: true,
          },
        ))) return;
        await deleteNavigationItem(item._id);
      });
      row.append(details, remove);
      linkList.append(row);
    });

    groupCard.append(linkList);
    list.append(groupCard);
  });

  panel.append(list);
  return panel;
}

async function continueNavigationSetup({
  linkName,
  group,
  newGroupName,
  existingItemId = "",
}) {
  const page = pagesState.selectedPage;
  const label = String(linkName || "").trim();
  let groupKey = group;

  if (!page?._id || !label) return;

  try {
    if (group === "__new__") {
      const headerName = String(newGroupName || "").trim();
      if (!headerName) {
        showPagesActionToast("Name the new header before continuing", "error");
        return;
      }

      groupKey = getCleanSlug(headerName);
      await pageApi("/api/admin/navigation-items", {
        method: "POST",
        body: {
          type: "group",
          group: groupKey,
          label: { en: headerName, fr: "" },
          route: "",
          visible: true,
          order: pagesState.navigationGroups.length + 1,
        },
        errorMessage: "Could not create header",
      });
    }

    const matchingLink = pagesState.navigationItems.find(
      (item) =>
        item.type !== "group" &&
        item.group === groupKey &&
        String(item.page || "") === String(page._id),
    );
    const itemId = matchingLink?._id || existingItemId;
    const payload = {
      group: groupKey,
      page: page._id,
      route: page.route,
      label: { en: label, fr: "" },
      visible: true,
      order: matchingLink?.order || pagesState.navigationItems.length + 1,
    };

    await pageApi(
      itemId
        ? `/api/admin/navigation-items/${encodeURIComponent(itemId)}`
        : "/api/admin/navigation-items",
      {
        method: itemId ? "PATCH" : "POST",
        body: payload,
        errorMessage: itemId
          ? "Could not update page navigation"
          : "Could not add page to navigation",
      },
    );

    await refreshSiteNavigation();
    setPagesState({ navigationStep: "publish" });
  } catch (error) {
    showPagesActionToast(error.message || "Could not update navigation", "error");
  }
}

function createNavigationPublishPanel() {
  const panel = document.createElement("section");
  panel.className = "pages-navigation-publish-choice";

  const title = document.createElement("h3");
  title.textContent = "Your page is ready";
  const copy = document.createElement("p");
  copy.textContent =
    "Save it as a draft to keep it hidden, or publish it now so it appears in its selected header.";

  let featureOnHome = null;
  if (pagesState.canFeaturePagesOnHome) {
    featureOnHome = document.createElement("label");
    featureOnHome.className = "pages-home-feature-option";

    const featureInput = document.createElement("input");
    featureInput.type = "checkbox";
    featureInput.checked = Boolean(pagesState.selectedPage?.featuredOnHome);

    const featureCopy = document.createElement("span");
    const featureTitle = document.createElement("strong");
    featureTitle.textContent = "Show in homepage news";
    const featureHint = document.createElement("small");
    featureHint.textContent =
      "Feature this published public page in the homepage news feed.";
    featureCopy.append(featureTitle, featureHint);
    featureOnHome.append(featureInput, featureCopy);
  }

  const actions = document.createElement("div");
  actions.className = "pages-navigation-publish-actions";

  const saveDraft = document.createElement("button");
  saveDraft.type = "button";
  saveDraft.className = "admin-work-zone-button is-secondary";
  saveDraft.textContent = "Save as draft";
  saveDraft.addEventListener("click", saveDraftAndReturnToLibrary);

  const publish = document.createElement("button");
  publish.type = "button";
  publish.className = "admin-work-zone-button is-primary";
  publish.textContent = "Publish now";
  publish.addEventListener("click", () =>
    publishPageAndReturnToLibrary({
      featureOnHome: featureOnHome?.querySelector("input")?.checked,
    }),
  );

  actions.append(saveDraft, publish);
  panel.append(title, copy);
  if (featureOnHome) panel.append(featureOnHome);
  panel.append(actions);
  return panel;
}

function positionNavigationModalInViewport(overlay, modal) {
  try {
    if (window.parent === window || !window.frameElement) return null;

    overlay.classList.add("is-embedded");
    const position = () => {
      const frameRect = window.frameElement.getBoundingClientRect();
      const modalHeight = modal.getBoundingClientRect().height;
      const top = Math.max(
        16,
        window.parent.innerHeight / 2 - frameRect.top - modalHeight / 2,
      );
      modal.style.setProperty("--pages-navigation-modal-top", `${top}px`);
      // This modal is absolutely positioned, so reserve the visible viewport
      // in the iframe rather than clipping it at the builder's document edge.
      pagesAdminContent.style.minHeight = `${Math.max(
        240,
        top + window.parent.innerHeight,
      )}px`;
    };

    const schedulePosition = () => window.requestAnimationFrame(position);
    schedulePosition();
    window.addEventListener("resize", schedulePosition);
    window.parent.addEventListener("scroll", schedulePosition, { passive: true });
    window.parent.addEventListener("resize", schedulePosition);
    return () => {
      window.removeEventListener("resize", schedulePosition);
      window.parent.removeEventListener("scroll", schedulePosition);
      window.parent.removeEventListener("resize", schedulePosition);
      pagesAdminContent.style.removeProperty("min-height");
    };
  } catch {
    return null;
  }
}

function bringNavigationModalIntoView() {
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (window.parent !== window) {
      window.parent.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch {
    // The modal remains usable even when the parent frame cannot be controlled.
  }
}

function createNavigationModal() {
  if (!pagesState.navigationModal) {
    return null;
  }

  const closeNavigationModal = () =>
    setPagesState({
      navigationModal: false,
      navigationStep: "setup",
      navigationMode: "add",
    });

  const overlay = document.createElement("div");
  overlay.className = "pages-navigation-modal-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeNavigationModal();
    }
  });

  const modal = document.createElement("section");
  modal.className = "pages-navigation-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "pagesNavigationModalTitle");

  const header = document.createElement("div");
  header.className = "pages-navigation-modal-header";

  const heading = document.createElement("div");
  const title = document.createElement("h2");
  title.id = "pagesNavigationModalTitle";
  title.textContent = pagesState.navigationStep === "publish"
    ? "Finish your page"
    : pagesState.navigationMode === "manage"
      ? "Manage navigation"
      : "Navigation";
  const copy = document.createElement("p");
  copy.textContent =
    pagesState.navigationStep === "publish"
      ? "Choose how to finish this page."
      : pagesState.navigationMode === "manage"
        ? "Review the links and custom headers shown in the site header."
        : "Choose where this page belongs in the site header.";
  heading.append(title, copy);

  header.append(heading);
  modal.append(
    header,
    pagesState.navigationStep === "publish"
      ? createNavigationPublishPanel()
      : pagesState.navigationMode === "manage"
        ? createNavigationManagementPanel()
        : createNavigationPanel(),
  );
  overlay.append(modal);
  bringNavigationModalIntoView();
  navigationModalPositionCleanup = positionNavigationModalInViewport(
    overlay,
    modal,
  );
  return overlay;
}

function createMediaPickerModal() {
  if (!pagesState.mediaPicker) {
    return null;
  }

  const overlay = document.createElement("div");
  overlay.className = "pages-media-picker-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeMediaPicker();
    }
  });

  const modal = document.createElement("section");
  modal.className = "pages-media-picker";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "pagesMediaPickerTitle");

  const header = document.createElement("div");
  header.className = "pages-media-picker-header";

  const title = document.createElement("h3");
  title.id = "pagesMediaPickerTitle";
  title.textContent = "Choose from CDN";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "admin-work-zone-button is-secondary";
  close.textContent = "Close";
  close.addEventListener("click", closeMediaPicker);

  header.append(title, close);

  const body = document.createElement("div");
  body.className = "pages-media-picker-body";

  if (pagesState.mediaIsLoading && !pagesState.media.length) {
    body.append(CMCENUtils.createLoadingSpinner("Loading media..."));
  } else if (!pagesState.media.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent =
      "No CDN media found yet. Upload an image from a page block to add one.";
    body.append(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "pages-media-picker-grid";

    pagesState.media.forEach((mediaItem) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pages-media-picker-item";
      button.addEventListener("click", () => applySelectedMedia(mediaItem));

      const image = document.createElement("img");
      image.src = mediaItem.url;
      image.alt = mediaItem.key;
      image.loading = "lazy";

      const label = document.createElement("span");
      label.textContent = mediaItem.key;

      button.append(image, label);
      grid.append(button);
    });

    body.append(grid);
  }

  const footer = document.createElement("div");
  footer.className = "pages-media-picker-footer";

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "admin-work-zone-button is-secondary";
  refresh.textContent = pagesState.mediaIsLoading ? "Loading..." : "Refresh";
  refresh.disabled = pagesState.mediaIsLoading;
  refresh.addEventListener("click", () =>
    loadPageBuilderMedia({ reset: true }),
  );
  footer.append(refresh);

  if (pagesState.mediaIsTruncated) {
    const loadMore = document.createElement("button");
    loadMore.type = "button";
    loadMore.className = "admin-work-zone-button is-secondary";
    loadMore.textContent = pagesState.mediaIsLoading
      ? "Loading..."
      : "Load more";
    loadMore.disabled = pagesState.mediaIsLoading;
    loadMore.addEventListener("click", () => loadPageBuilderMedia());
    footer.append(loadMore);
  }

  modal.append(header, body, footer);
  overlay.append(modal);
  return overlay;
}

function createCropEditorModal() {
  const media = getCropTargetMedia();

  if (!pagesState.cropEditor || !media?.mediaUrl) {
    return null;
  }

  const crop = getCrop(media.crop);
  const overlay = document.createElement("div");
  overlay.className = "pages-media-picker-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeCropEditor();
    }
  });

  const modal = document.createElement("section");
  modal.className = "pages-crop-editor";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "pagesCropEditorTitle");

  const header = document.createElement("div");
  header.className = "pages-media-picker-header";

  const title = document.createElement("h3");
  title.id = "pagesCropEditorTitle";
  title.textContent = "Crop and rotate";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "admin-work-zone-button is-secondary";
  close.textContent = "Done";
  close.addEventListener("click", closeCropEditor);
  header.append(title, close);

  const body = document.createElement("div");
  body.className = "pages-crop-editor-body";

  const preview = createCroppedPreview({
    src: getPreviewMediaUrl(media),
    crop,
  });
  preview.classList.add("pages-crop-preview");

  const controls = document.createElement("div");
  controls.className = "pages-crop-controls";

  function addRange(label, key, min, max, step = 1) {
    const field = document.createElement("label");
    field.className = "pages-editor-field";
    const text = document.createElement("span");
    text.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(crop[key]);
    input.addEventListener("change", (event) => {
      updateCropTarget({
        ...getCrop(getCropTargetMedia()?.crop),
        [key]: Number(event.target.value),
      });
    });
    field.append(text, input);
    controls.append(field);
  }

  addRange("Horizontal", "x", 0, 100);
  addRange("Vertical", "y", 0, 100);
  addRange("Zoom", "zoom", 1, 3, 0.05);

  const rotateField = document.createElement("div");
  rotateField.className = "pages-crop-rotate-controls";

  [0, 90, 180, 270].forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-work-zone-button is-secondary";
    button.classList.toggle("is-active", Number(crop.rotate) === value);
    button.textContent = `${value}deg`;
    button.addEventListener("click", () => {
      updateCropTarget({
        ...getCrop(getCropTargetMedia()?.crop),
        rotate: value,
      });
    });
    rotateField.append(button);
  });

  controls.append(rotateField);
  body.append(preview, controls);
  modal.append(header, body);
  overlay.append(modal);
  return overlay;
}

function renderPagesAdmin() {
  navigationModalPositionCleanup?.();
  navigationModalPositionCleanup = null;
  pagePreviewPositionCleanup?.();
  pagePreviewPositionCleanup = null;
  if (!pagesState.pagePreview && !pagesState.navigationModal) {
    pagesAdminContent.style.removeProperty("min-height");
  }
  pagesAdminContent.classList.toggle(
    "is-page-selected",
    Boolean(pagesState.selectedPage),
  );

  const children = [
    createMessage(),
    pagesState.selectedPage ? createPageEditor() : createPageLibrary(),
  ];
  const blockEditorCard = createSelectedBlockEditorCard();
  const pagePreview = createPagePreviewModal();
  const navigationModal = createNavigationModal();
  const mediaPicker = createMediaPickerModal();
  const cropEditor = createCropEditorModal();

  if (blockEditorCard) {
    children.push(blockEditorCard);
  }

  if (pagePreview) {
    children.push(pagePreview);
  }

  if (navigationModal) {
    children.push(navigationModal);
  }

  if (mediaPicker) {
    children.push(mediaPicker);
  }

  if (cropEditor) {
    children.push(cropEditor);
  }

  pagesAdminContent.replaceChildren(...children);
}

async function verifyAccess() {
  const user = await pageApi("/api/me", {
    errorMessage: "Could not verify account",
  });

  if (user.permissions?.canManagePages !== true) {
    window.location.href = "/dashboard";
    return null;
  }

  pagesState.canManageNavigation =
    user.permissions?.canManageNavigation === true;
  pagesState.canFeaturePagesOnHome =
    user.permissions?.canFeaturePagesOnHome === true;
  window.updateAdminWorkZoneTabsForUser(user);
  return user;
}

async function loadPages() {
  cancelAutoSave();
  const data = await pageApi("/api/admin/pages", {
    errorMessage: "Could not load pages",
  });
  const selectedPageId =
    pagesState.selectedPageId &&
    data.pages?.some(
      (page) => String(page._id) === String(pagesState.selectedPageId),
    )
      ? pagesState.selectedPageId
      : "";

  setPagesState({
    pages: data.pages || [],
    navigationItems: data.navigationItems || [],
    navigationGroups: data.navigationGroups || pagesState.navigationGroups,
    roles: data.roles || pagesState.roles,
    customRoles: data.customRoles || [],
    permissionCatalog: data.permissionCatalog || [],
    selectedPageId,
    selectedPage:
      selectedPageId === pagesState.selectedPageId
        ? pagesState.selectedPage
        : null,
    message: "",
    autoSaveStatus: "idle",
    autoSaveMessage: "",
  });
  showPagesPage();

  if (selectedPageId && !pagesState.selectedPage) {
    await loadPageDetail(selectedPageId);
  }
}

async function loadPageDetail(pageId) {
  cancelAutoSave();
  const data = await pageApi(`/api/admin/pages/${encodeURIComponent(pageId)}`, {
    errorMessage: "Could not load page",
  });
  setPagesState({
    selectedPageId: data.page._id,
    selectedPage: data.page,
    selectedBlockIndex: null,
    pageDetailsOpen: false,
    message: "",
    autoSaveStatus: "idle",
    autoSaveMessage: "",
    lastSavedAt: data.page.updatedAt || null,
  });
}

async function loadPageBuilderMedia({ reset = false } = {}) {
  setPagesState({
    mediaIsLoading: true,
    ...(reset
      ? {
          media: [],
          mediaNextCursor: "",
          mediaIsTruncated: false,
        }
      : {}),
  });

  try {
    const params = new URLSearchParams({ limit: "60" });
    const cursor = reset ? "" : pagesState.mediaNextCursor;

    if (cursor) {
      params.set("cursor", cursor);
    }

    const data = await pageApi(`/api/admin/pages/media?${params}`, {
      errorMessage: "Could not load CDN media",
    });

    setPagesState({
      media: reset
        ? data.media || []
        : [...pagesState.media, ...(data.media || [])],
      mediaNextCursor: data.nextCursor || "",
      mediaIsTruncated: Boolean(data.isTruncated),
      mediaIsLoading: false,
    });
  } catch (error) {
    setPagesState({
      mediaIsLoading: false,
      message: error.message || "Could not load CDN media",
    });
  }
}

async function createPage() {
  const title = "New page";
  try {
    const data = await pageApi("/api/admin/pages", {
      method: "POST",
      body: {
        title: { en: title, fr: "" },
        slug: `new-page-${Date.now()}`,
        blocks: [],
      },
      errorMessage: "Could not create page",
    });

    await loadPages();
    await loadPageDetail(data.page._id);
    setPagesState({ pageDetailsOpen: true });
    showPagesActionToast(data.message || "Page created", "success");
  } catch (error) {
    showPagesActionToast(error.message || "Could not create page", "error");
  }
}

function getAutoSaveLabel() {
  if (!pagesState.selectedPage) return "";

  if (pagesState.autoSaveStatus === "pending") {
    return "Unsaved changes";
  }

  if (pagesState.autoSaveStatus === "saving") {
    return "Saving...";
  }

  if (pagesState.autoSaveStatus === "error") {
    return pagesState.autoSaveMessage || "Autosave failed";
  }

  if (pagesState.lastSavedAt) {
    return "Saved";
  }

  return "Draft autosaves";
}

async function saveSelectedPage({ auto = false, toast = true } = {}) {
  if (!pagesState.selectedPage?._id) return false;

  cancelAutoSave();
  const requestId = ++autoSaveRequestId;
  const pageId = pagesState.selectedPage._id;

  if (auto) {
    setAutoSaveState("saving", "Saving...");
  }

  let data;

  try {
    data = await pageApi(
      `/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}`,
      {
        method: "PATCH",
        body: {
          title: pagesState.selectedPage.title,
          slug: pagesState.selectedPage.slug,
          summary: pagesState.selectedPage.summary,
          access: getSelectedPageAccess(),
          blocks: pagesState.selectedPage.blocks || [],
        },
        errorMessage: "Could not save page",
      },
    );
  } catch (error) {
    if (auto) {
      setAutoSaveState("error", error.message || "Autosave failed");
      return false;
    }

    showPagesActionToast(error.message || "Could not save page", "error");
    return false;
  }

  if (
    requestId !== autoSaveRequestId ||
    String(pagesState.selectedPageId) !== String(pageId)
  ) {
    return false;
  }

  if (auto) {
    pagesState = {
      ...pagesState,
      autoSaveStatus: "saved",
      autoSaveMessage: "Saved",
      lastSavedAt: data.page.updatedAt || new Date().toISOString(),
    };
    renderAutoSaveStatus();
    return true;
  }

  setPagesState({
    selectedPage: data.page,
    message: "",
    pageDetailsOpen: false,
    autoSaveStatus: "saved",
    autoSaveMessage: "Saved",
    lastSavedAt: data.page.updatedAt || new Date().toISOString(),
  });
  if (toast) {
    showPagesActionToast(data.message || "Page saved", "success");
  }

  const listData = await pageApi("/api/admin/pages", {
    errorMessage: "Could not refresh page list",
  }).catch(() => null);

  if (listData && String(pagesState.selectedPageId) === String(pageId)) {
    setPagesState({
      pages: listData.pages || pagesState.pages,
      navigationItems: listData.navigationItems || pagesState.navigationItems,
      navigationGroups:
        listData.navigationGroups || pagesState.navigationGroups,
      roles: listData.roles || pagesState.roles,
      customRoles: listData.customRoles || pagesState.customRoles,
      permissionCatalog:
        listData.permissionCatalog || pagesState.permissionCatalog,
    });
  }

  return true;
}

function returnToPageLibrary() {
  cancelAutoSave();
  setPagesState({
    selectedPageId: "",
    selectedPage: null,
    selectedBlockIndex: null,
    pageDetailsOpen: false,
    pagePreview: false,
    navigationModal: false,
    navigationStep: "setup",
    navigationMode: "add",
  });
}

async function saveDraftAndReturnToLibrary() {
  const saved = await saveSelectedPage({ auto: false, toast: false });
  if (!saved) return;

  if (pagesState.selectedPage?.status !== "draft") {
    try {
      await pageApi(
        `/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}/status`,
        {
          method: "PATCH",
          body: { status: "draft" },
          errorMessage: "Could not save page as a draft",
        },
      );
      await refreshSiteNavigation();
    } catch (error) {
      showPagesActionToast(error.message || "Could not save page as a draft", "error");
      return;
    }
  }

  returnToPageLibrary();
  await loadPages();
  showPagesActionToast("Draft saved", "success");
}

async function publishPageAndReturnToLibrary({ featureOnHome } = {}) {
  const pageId = pagesState.selectedPage?._id;
  if (!pageId) return;

  cancelAutoSave();
  try {
    await pageApi(
      `/api/admin/pages/${encodeURIComponent(pageId)}/status`,
      {
        method: "PATCH",
        body: {
          status: "published",
          ...(pagesState.canFeaturePagesOnHome &&
          typeof featureOnHome === "boolean"
            ? { featureOnHome }
            : {}),
        },
        errorMessage: "Could not publish page",
      },
    );
    await refreshSiteNavigation();
    returnToPageLibrary();
    await loadPages();
    showPagesActionToast("Page published", "success");
  } catch (error) {
    showPagesActionToast(error.message || "Could not publish page", "error");
  }
}

async function updatePageStatus(status) {
  if (!pagesState.selectedPage?._id) return;
  cancelAutoSave();

  try {
    const data = await pageApi(
      `/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}/status`,
      {
        method: "PATCH",
        body: { status },
        errorMessage: "Could not update page status",
      },
    );

    setPagesState({
      selectedPage: data.page,
      message: "",
    });
    await refreshSiteNavigation();
    await loadPages();
    showPagesActionToast(data.message || "Page status updated", "success");
  } catch (error) {
    showPagesActionToast(
      error.message || "Could not update page status",
      "error",
    );
  }
}

async function deleteSelectedPage() {
  if (!pagesState.selectedPage?._id) return;
  if (
    !(await CMCENModal.confirm("Delete this page?", {
      title: "Delete page",
      confirmText: "Delete",
      destructive: true,
    }))
  )
    return;
  cancelAutoSave();

  try {
    await pageApi(
      `/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}`,
      {
        method: "DELETE",
        errorMessage: "Could not delete page",
      },
    );

    setPagesState({
      selectedPageId: "",
      selectedPage: null,
      pagePreview: false,
      message: "",
    });
    await refreshSiteNavigation();
    await loadPages();
    showPagesActionToast("Page deleted", "success");
  } catch (error) {
    showPagesActionToast(error.message || "Could not delete page", "error");
  }
}

function addBlock(type) {
  const blocks = pagesState.selectedPage?.blocks || [];
  const nextRow = Math.max(
    1,
    ...blocks.map((block) => {
      const layout = getBuilderBlockLayout(block);
      return layout.row + layout.rowSpan;
    }),
  );
  insertBlock(type, { column: 1, row: nextRow, span: 4, rowSpan: 1 });
}

function insertBlock(type, layout = {}) {
  const blocks = [...(pagesState.selectedPage?.blocks || [])];
  const block = getNewBlock(type);
  block.layout = { ...block.layout, ...layout };
  if (type === "divider") {
    block.layout.rowSpan = 1;
  }
  if (!canPlaceBuilderBlock(block.layout)) return false;
  blocks.push(block);
  pagesState.selectedBlockIndex = null;
  updateSelectedPage({ blocks });
  return true;
}

function moveBlockToPosition(index, layout) {
  const block = pagesState.selectedPage?.blocks?.[index];
  if (!block) return false;
  const nextLayout = { ...getBuilderBlockLayout(block), ...layout };
  if (!canPlaceBuilderBlock(nextLayout, { ignoreIndex: index })) return false;
  updateBlock(index, { layout: nextLayout });
  return true;
}

function removeBlock(index) {
  const blocks = [...(pagesState.selectedPage?.blocks || [])];
  blocks.splice(index, 1);
  pagesState.selectedBlockIndex = Math.min(index, blocks.length - 1);
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

function reorderBlock(fromIndex, toIndex) {
  const blocks = [...(pagesState.selectedPage?.blocks || [])];
  if (fromIndex < 0 || fromIndex >= blocks.length) return;

  const [block] = blocks.splice(fromIndex, 1);
  const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  const insertIndex = Math.max(0, Math.min(adjustedToIndex, blocks.length));
  blocks.splice(insertIndex, 0, block);
  updateSelectedPage({ blocks });
}

function addCarouselItem(index) {
  const block =
    pagesState.selectedPage?.blocks?.[index] || getNewBlock("carousel");
  updateBlock(index, {
    items: [
      ...(block.items || []),
      {
        mediaKey: "",
        mediaUrl: "",
        mediaVariants: {},
        alt: getEmptyLocalized(),
        caption: getEmptyLocalized(),
      },
    ],
  });
}

function removeCarouselItem(index, itemIndex) {
  const block =
    pagesState.selectedPage?.blocks?.[index] || getNewBlock("carousel");
  const items = [...(block.items || [])];
  items.splice(itemIndex, 1);
  updateBlock(index, { items });
}

async function uploadBlockImage(index, file) {
  const data = await uploadImageToCdn(file, `block:${index}`);

  updateBlock(index, {
    ...getUploadMediaUpdate(data),
    crop: getCrop(pagesState.selectedPage?.blocks?.[index]?.crop),
  });
}

async function uploadColumnImage(index, columnIndex, file) {
  const data = await uploadImageToCdn(file, `column:${index}:${columnIndex}`);

  updateBlockColumn(index, columnIndex, {
    ...getUploadMediaUpdate(data),
    crop: getCrop(
      pagesState.selectedPage?.blocks?.[index]?.columns?.[columnIndex]?.crop,
    ),
  });
}

async function uploadCarouselImage(index, itemIndex, file) {
  const data = await uploadImageToCdn(file, `carousel:${index}:${itemIndex}`);

  updateCarouselItem(index, itemIndex, {
    ...getUploadMediaUpdate(data),
    crop: getCrop(
      pagesState.selectedPage?.blocks?.[index]?.items?.[itemIndex]?.crop,
    ),
  });
}

function uploadImageToCdn(file, progressKey) {
  setUploadProgress(progressKey, {
    status: "uploading",
    percent: 0,
    message: "Preparing image",
  });

  return uploadImageToCdnThroughServer(file, progressKey);
}

function uploadImageToCdnThroughServer(file, progressKey) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("uploadSource", "pageBuilder");
  formData.append("uploadContext", "page-builder");
  formData.append("sourceField", progressKey || "pageImage");
  formData.append("sourceId", pagesState.selectedPage?._id || "");
  formData.append("sourceSlug", pagesState.selectedPage?.slug || "");
  formData.append(
    "sourceName",
    pagesState.selectedPage?.title?.en ||
      pagesState.selectedPage?.title?.fr ||
      file.name ||
      "Page image",
  );

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", "/api/upload");
    request.setRequestHeader("Authorization", `Bearer ${pagesAdminToken}`);

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;

      setUploadProgress(progressKey, {
        status: "uploading",
        percent: Math.round((event.loaded / event.total) * 100),
      });
    });

    request.addEventListener("load", () => {
      const data = JSON.parse(request.responseText || "{}");

      if (request.status < 200 || request.status >= 300) {
        const message = data.error || "Could not upload image";
        setUploadProgress(progressKey, {
          status: "error",
          percent: 0,
          message,
        });
        reject(new Error(message));
        return;
      }

      setUploadProgress(progressKey, {
        status: "complete",
        percent: 100,
        message: "Upload complete",
      });
      window.setTimeout(() => clearUploadProgress(progressKey), 900);
      resolve(data);
    });

    request.addEventListener("error", () => {
      const message = "Could not upload image";
      setUploadProgress(progressKey, {
        status: "error",
        percent: 0,
        message,
      });
      reject(new Error(message));
    });

    request.send(formData);
  });
}

async function createNavigationItem(payload) {
  try {
    await pageApi("/api/admin/navigation-items", {
      method: "POST",
      body: payload,
      errorMessage: "Could not add navigation item",
    });
    await loadPages();
    await refreshSiteNavigation();
    showPagesActionToast("Navigation item added", "success");
  } catch (error) {
    showPagesActionToast(
      error.message || "Could not add navigation item",
      "error",
    );
  }
}

async function deleteNavigationItem(itemId) {
  try {
    await pageApi(`/api/admin/navigation-items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      errorMessage: "Could not remove navigation item",
    });
    // Management is launched from the custom-pages list. Once a destructive
    // navigation change is confirmed, return there instead of leaving the
    // now-stale management modal on screen.
    returnToPageLibrary();
    await loadPages();
    await refreshSiteNavigation();
    showPagesActionToast("Navigation item removed", "success");
  } catch (error) {
    showPagesActionToast(
      error.message || "Could not remove navigation item",
      "error",
    );
  }
}

async function updateNavigationItem(itemId, payload) {
  try {
    await pageApi(`/api/admin/navigation-items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: payload,
      errorMessage: "Could not update navigation item",
    });
    await loadPages();
    await refreshSiteNavigation();
  } catch (error) {
    showPagesActionToast(error.message || "Could not update navigation item", "error");
  }
}

document.addEventListener(
  "click",
  (event) => {
    const openBlockIndex = pagesState.selectedBlockIndex;
    if (!Number.isInteger(openBlockIndex)) return;

    const target = event.target instanceof Element ? event.target : null;
    const clickedBlock = target?.closest(".pages-block-editor");
    if (
      Number(clickedBlock?.dataset.blockIndex) === openBlockIndex ||
      target?.closest(".pages-block-editor-card")
    ) {
      return;
    }

    queueMicrotask(() => {
      // Let a click on another block select that block before closing anything.
      if (pagesState.selectedBlockIndex === openBlockIndex) {
        setPagesState({ selectedBlockIndex: null });
      }
    });
  },
  true,
);

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
