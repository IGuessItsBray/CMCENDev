const pagesAdminToken = CMCENUtils.requireAuthToken();
const pagesAdminStatus = document.getElementById("pagesAdminStatus");
const pagesAdminPage = document.getElementById("pagesAdminPage");
const pagesAdminContent = document.getElementById("pagesAdminContent");
const autoSaveDelayMs = 1200;
let autoSaveTimer = null;
let autoSaveRequestId = 0;

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
  autoSaveStatus: "idle",
  autoSaveMessage: "",
  lastSavedAt: null,
  media: [],
  mediaNextCursor: "",
  mediaIsTruncated: false,
  mediaIsLoading: false,
  mediaPicker: null,
  cropEditor: null,
  uploadProgress: {},
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

function showPagesActionToast(message, color = "info") {
  CMCENUtils.showToast(message, {
    color,
    position: "bottom-right",
    animation: "slide"
  });
}

function setAutoSaveState(status, message = "") {
  pagesState = {
    ...pagesState,
    autoSaveStatus: status,
    autoSaveMessage: message
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
    autoSaveMessage: "Unsaved changes"
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
        ...update
      }
    }
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
    rotate: 0
  };
}

function getCrop(value) {
  return {
    ...getDefaultCrop(),
    ...(value || {})
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
    columns: [],
    items: []
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
        crop: getDefaultCrop()
      },
      {
        title: { en: "Right column", fr: "" },
        body: getEmptyLocalized(),
        mediaKey: "",
        mediaUrl: "",
        mediaVariants: {},
        alt: getEmptyLocalized(),
        crop: getDefaultCrop()
      }
    ];
  }

  if (type === "carousel") {
    block.text = {
      en: "Carousel heading",
      fr: ""
    };
    block.items = [
      {
        mediaKey: "",
        mediaUrl: "",
        alt: getEmptyLocalized(),
        caption: getEmptyLocalized(),
        crop: getDefaultCrop()
      }
    ];
  }

  return block;
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

function getUploadMediaUpdate(data) {
  return {
    mediaKey: data.key || "",
    mediaUrl: data.url || "",
    mediaVariants: data.variants || {}
  };
}

function getPreviewMediaUrl(media = {}) {
  const variants = media.mediaVariants || {};
  return variants.medium?.url ||
    variants.large?.url ||
    variants.hero?.url ||
    media.mediaUrl ||
    "";
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
    ...update
  };

  if (!render) {
    pagesState = {
      ...pagesState,
      selectedPage
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
  updateSelectedPage({
    [field]: {
      ...(pagesState.selectedPage?.[field] || {}),
      [language]: value
    }
  }, { render: false, autosave: true });
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

function updateBlockColumn(index, columnIndex, update, { render = true } = {}) {
  const block = pagesState.selectedPage?.blocks?.[index] || getNewBlock("columns");
  const columns = [...(block.columns || [])];
  columns[columnIndex] = {
    ...(columns[columnIndex] || {}),
    ...update
  };
  updateBlock(index, { columns }, { render });
}

function updateBlockColumnLocalized(index, columnIndex, field, language, value) {
  const block = pagesState.selectedPage?.blocks?.[index] || getNewBlock("columns");
  const column = block.columns?.[columnIndex] || {};
  updateBlockColumn(index, columnIndex, {
    [field]: {
      ...(column[field] || {}),
      [language]: value
    }
  }, { render: false });
}

function updateCarouselItem(index, itemIndex, update, { render = true } = {}) {
  const block = pagesState.selectedPage?.blocks?.[index] || getNewBlock("carousel");
  const items = [...(block.items || [])];
  items[itemIndex] = {
    ...(items[itemIndex] || {}),
    ...update
  };
  updateBlock(index, { items }, { render });
}

function updateCarouselItemLocalized(index, itemIndex, field, language, value) {
  const block = pagesState.selectedPage?.blocks?.[index] || getNewBlock("carousel");
  const item = block.items?.[itemIndex] || {};
  updateCarouselItem(index, itemIndex, {
    [field]: {
      ...(item[field] || {}),
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

function openMediaPicker(target) {
  setPagesState({
    mediaPicker: target,
    mediaIsLoading: !pagesState.media.length
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
    crop: getCrop(getCropTargetMedia(target)?.crop)
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
    return pagesState.selectedPage?.blocks?.[target.blockIndex]?.columns?.[target.columnIndex] || null;
  }

  if (target.type === "carousel") {
    return pagesState.selectedPage?.blocks?.[target.blockIndex]?.items?.[target.itemIndex] || null;
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
    const empty = document.createElement("div");
    empty.className = "pages-list-empty";
    const emptyTitle = document.createElement("strong");
    emptyTitle.textContent = "No pages yet";
    const emptyText = document.createElement("span");
    emptyText.textContent = "Create your first page to start building.";
    empty.append(emptyTitle, emptyText);
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

function createPagesSidebar() {
  const sidebar = document.createElement("div");
  sidebar.className = "pages-admin-sidebar";
  sidebar.append(createPageList(), createNavigationPanel());
  return sidebar;
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

function createNestedLocalizedInput({ label, value = {}, onInput, type = "textarea" }) {
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
    input.value = value?.[language] || "";
    input.addEventListener("input", event => onInput(language, event.target.value));

    inputLabel.append(text, input);
    wrapper.append(inputLabel);
  });

  return wrapper;
}

function createBlockToolbar(index) {
  const toolbar = document.createElement("div");
  toolbar.className = "pages-block-toolbar";

  const handle = document.createElement("span");
  handle.className = "pages-block-drag-handle";
  handle.textContent = "Drag";

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

  toolbar.append(handle, moveUp, moveDown, remove);
  return toolbar;
}

function createCanvasDropZone(insertIndex) {
  const zone = document.createElement("div");
  zone.className = "pages-canvas-drop-zone";
  zone.dataset.insertIndex = String(insertIndex);

  const label = document.createElement("span");
  label.textContent = insertIndex === 0
    ? "Drop block at top"
    : "Drop block here";
  zone.append(label);

  zone.addEventListener("dragover", event => {
    const hasBlockType = event.dataTransfer.types.includes("application/x-cmcen-block-type");
    const hasBlockIndex = event.dataTransfer.types.includes("application/x-cmcen-block-index");

    if (!hasBlockType && !hasBlockIndex) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    zone.classList.add("is-active");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("is-active");
  });

  zone.addEventListener("drop", event => {
    event.preventDefault();
    zone.classList.remove("is-active");

    const blockType = event.dataTransfer.getData("application/x-cmcen-block-type");
    const existingIndex = Number(event.dataTransfer.getData("application/x-cmcen-block-index"));

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

function createMediaDropZone({
  hasMedia,
  onUpload,
  onChoose,
  onCrop,
  progressKey,
  label = "Drop image here or choose file"
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "pages-media-field";
  const progress = progressKey ? getUploadProgress(progressKey) : null;

  const zone = document.createElement("label");
  zone.className = "pages-image-drop-zone";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) onUpload(file);
  });

  const text = document.createElement("span");
  text.textContent = hasMedia ? "Replace image" : label;

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
    labelElement.textContent = progress.status === "error"
      ? progress.message || "Upload failed"
      : progress.status === "complete"
        ? "Upload complete"
        : progress.message || `Uploading ${Math.round(progress.percent || 0)}%`;

    const bar = document.createElement("span");
    bar.className = "pages-upload-progress-bar";
    bar.style.setProperty("--upload-progress", `${Math.max(0, Math.min(progress.percent || 0, 100))}%`);

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
    panel.append(createCroppedPreview({
      src: getPreviewMediaUrl(column),
      crop: column.crop
    }));
  }

  panel.append(
    createMediaDropZone({
      hasMedia: Boolean(column.mediaUrl),
      label: "Add column image",
      progressKey: `column:${index}:${columnIndex}`,
      onUpload: file => uploadColumnImage(index, columnIndex, file),
      onCrop: () => openCropEditor({
        type: "column",
        blockIndex: index,
        columnIndex
      }),
      onChoose: () => openMediaPicker({
        type: "column",
        blockIndex: index,
        columnIndex
      })
    }),
    createNestedLocalizedInput({
      label: "Column title",
      value: column.title,
      type: "input",
      onInput: (language, value) => updateBlockColumnLocalized(index, columnIndex, "title", language, value)
    }),
    createNestedLocalizedInput({
      label: "Column body",
      value: column.body,
      onInput: (language, value) => updateBlockColumnLocalized(index, columnIndex, "body", language, value)
    }),
    createNestedLocalizedInput({
      label: "Image alt text",
      value: column.alt,
      type: "input",
      onInput: (language, value) => updateBlockColumnLocalized(index, columnIndex, "alt", language, value)
    })
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
    panel.append(createCroppedPreview({
      src: getPreviewMediaUrl(item),
      crop: item.crop
    }));
  }

  panel.append(
    createMediaDropZone({
      hasMedia: Boolean(item.mediaUrl),
      label: "Add slide image",
      progressKey: `carousel:${index}:${itemIndex}`,
      onUpload: file => uploadCarouselImage(index, itemIndex, file),
      onCrop: () => openCropEditor({
        type: "carousel",
        blockIndex: index,
        itemIndex
      }),
      onChoose: () => openMediaPicker({
        type: "carousel",
        blockIndex: index,
        itemIndex
      })
    }),
    createNestedLocalizedInput({
      label: "Alt text",
      value: item.alt,
      type: "input",
      onInput: (language, value) => updateCarouselItemLocalized(index, itemIndex, "alt", language, value)
    }),
    createNestedLocalizedInput({
      label: "Caption",
      value: item.caption,
      type: "input",
      onInput: (language, value) => updateCarouselItemLocalized(index, itemIndex, "caption", language, value)
    })
  );

  return panel;
}

function createBlockEditor(block, index) {
  const article = document.createElement("article");
  article.className = `pages-block-editor is-${block.type}`;
  article.draggable = true;
  article.dataset.blockIndex = String(index);

  article.addEventListener("dragstart", event => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.setData("application/x-cmcen-block-index", String(index));
    document.body.classList.add("pages-is-dragging");
    article.classList.add("is-dragging");
  });
  article.addEventListener("dragend", () => {
    document.body.classList.remove("pages-is-dragging");
    article.classList.remove("is-dragging");
  });
  article.addEventListener("dragover", event => {
    const hasBlockType = event.dataTransfer.types.includes("application/x-cmcen-block-type");
    const hasBlockIndex = event.dataTransfer.types.includes("application/x-cmcen-block-index");

    if (!hasBlockType && !hasBlockIndex) return;

    event.preventDefault();
    article.classList.add("is-drop-target");
  });
  article.addEventListener("dragleave", () => {
    article.classList.remove("is-drop-target");
  });
  article.addEventListener("drop", event => {
    event.preventDefault();
    article.classList.remove("is-drop-target");
    const blockType = event.dataTransfer.getData("application/x-cmcen-block-type");
    const fromIndex = Number(
      event.dataTransfer.getData("application/x-cmcen-block-index") ||
      event.dataTransfer.getData("text/plain")
    );

    if (blockType) {
      insertBlock(blockType, index);
      return;
    }

    if (Number.isInteger(fromIndex) && fromIndex !== index) {
      reorderBlock(fromIndex, index);
    }
  });

  const header = document.createElement("div");
  header.className = "pages-block-heading";

  const type = document.createElement("strong");
  type.textContent = block.type === "columns" ? "Side-by-side" : block.type;
  header.append(type, createBlockToolbar(index));
  article.append(header);

  if (block.type === "heading") {
    article.append(createBlockLocalizedInput(index, "Heading text", "text", "input"));
  } else if (block.type === "image") {
    if (block.mediaUrl) {
      article.append(createCroppedPreview({
        src: getPreviewMediaUrl(block),
        crop: block.crop
      }));
    }
    article.append(
      createMediaDropZone({
        hasMedia: Boolean(block.mediaUrl),
        progressKey: `block:${index}`,
        onUpload: file => uploadBlockImage(index, file),
        onCrop: () => openCropEditor({
          type: "block",
          blockIndex: index
        }),
        onChoose: () => openMediaPicker({
          type: "block",
          blockIndex: index
        })
      }),
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
  } else if (block.type === "columns") {
    const columns = document.createElement("div");
    columns.className = "pages-column-editors";
    (block.columns?.length ? block.columns : getNewBlock("columns").columns).forEach((column, columnIndex) => {
      columns.append(createColumnEditor(block, index, column, columnIndex));
    });
    article.append(columns);
  } else if (block.type === "carousel") {
    const carouselItems = document.createElement("div");
    carouselItems.className = "pages-carousel-item-editors";
    (block.items?.length ? block.items : getNewBlock("carousel").items).forEach((item, itemIndex) => {
      carouselItems.append(createCarouselItemEditor(block, index, item, itemIndex));
    });

    const addSlide = document.createElement("button");
    addSlide.type = "button";
    addSlide.className = "admin-work-zone-button is-secondary";
    addSlide.textContent = "Add slide";
    addSlide.addEventListener("click", () => addCarouselItem(index));
    article.append(
      createBlockLocalizedInput(index, "Carousel heading", "text", "input"),
      carouselItems,
      addSlide
    );
  } else {
    article.append(createBlockLocalizedInput(index, block.type === "callout" ? "Callout text" : "Text", "body"));
  }

  return article;
}

function createBlockControls() {
  if (!pagesState.selectedPage) {
    const placeholder = document.createElement("div");
    placeholder.className = "pages-add-block-placeholder";
    return placeholder;
  }

  const controls = document.createElement("div");
  controls.className = "pages-add-block-controls";

  const title = document.createElement("strong");
  title.className = "pages-add-block-title";
  title.textContent = "Builder blocks";

  const help = document.createElement("span");
  help.className = "pages-add-block-help";
  help.textContent = "Click to append, or drag into the page canvas.";
  controls.append(title, help);

  [
    ["heading", "Heading"],
    ["text", "Text"],
    ["image", "Image"],
    ["columns", "Side-by-side"],
    ["carousel", "Carousel"],
    ["callout", "Callout"],
    ["button", "Button"],
    ["divider", "Divider"]
  ].forEach(([type, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pages-palette-block";
    button.draggable = true;
    button.textContent = label;
    button.disabled = !pagesState.selectedPage;
    button.addEventListener("click", () => addBlock(type));
    button.addEventListener("dragstart", event => {
      if (!pagesState.selectedPage) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-cmcen-block-type", type);
      document.body.classList.add("pages-is-dragging");
      button.classList.add("is-dragging");
    });
    button.addEventListener("dragend", () => {
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
  panel.classList.toggle("is-empty", !pagesState.selectedPage);

  if (!pagesState.selectedPage) {
    const empty = document.createElement("div");
    empty.className = "pages-editor-empty";

    const heading = document.createElement("strong");
    heading.textContent = "Select or create a page";

    const copy = document.createElement("span");
    copy.textContent = "Choose a page on the left, or create a new one to open the drag-and-drop builder.";

    empty.append(heading, copy);
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

  const headerMeta = document.createElement("div");
  headerMeta.className = "pages-editor-header-meta";

  const autoSave = document.createElement("span");
  autoSave.className = `pages-autosave-status is-${pagesState.autoSaveStatus || "idle"}`;
  autoSave.textContent = getAutoSaveLabel();

  headerMeta.append(status, autoSave);
  header.append(title, headerMeta);

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
  if ((pagesState.selectedPage.blocks || []).length) {
    blocks.append(createCanvasDropZone(0));
    (pagesState.selectedPage.blocks || []).forEach((block, index) => {
      blocks.append(createBlockEditor(block, index));
      blocks.append(createCanvasDropZone(index + 1));
    });
  } else {
    const empty = document.createElement("div");
    empty.className = "pages-builder-empty";
    empty.append(createCanvasDropZone(0));
    blocks.append(empty);
  }

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
    saveSelectedPage({ auto: false });
  });

  return panel;
}

function createNavigationPanel() {
  const panel = document.createElement("div");
  panel.className = "pages-navigation-panel";
  const selectedPage = pagesState.selectedPage;
  const selectedPageIsPublished = selectedPage?.status === "published";
  const publishedPages = pagesState.pages.filter(existingPage => existingPage.status === "published");

  const header = document.createElement("div");
  header.className = "admin-panel-heading";
  const title = document.createElement("h3");
  title.textContent = "Navbar links";
  header.append(title);
  panel.append(header);

  if (!pagesState.canManageNavigation) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "You can edit pages, but not navigation.";
    panel.append(empty);
    return panel;
  }

  const intro = document.createElement("div");
  intro.className = "pages-navigation-intro";
  const introTitle = document.createElement("strong");
  introTitle.textContent = "Published pages only";
  const introCopy = document.createElement("p");
  introCopy.textContent = "Draft pages cannot be added to the public navbar. Publish a page first, then add it under a navbar parent.";
  intro.append(introTitle, introCopy);

  if (selectedPage && !selectedPageIsPublished) {
    const selectedWarning = document.createElement("p");
    selectedWarning.className = "pages-navigation-note";
    selectedWarning.textContent = "The selected page is still a draft, so it is hidden from the Add page menu.";
    intro.append(selectedWarning);
  }

  const form = document.createElement("form");
  form.className = "pages-navigation-form pages-navigation-add-page-form";

  const groupForm = document.createElement("form");
  groupForm.className = "pages-navigation-form pages-navigation-group-form";

  const groupFormTitle = document.createElement("strong");
  groupFormTitle.className = "pages-navigation-form-title";
  groupFormTitle.textContent = "Create navbar parent";

  const groupHelp = document.createElement("p");
  groupHelp.className = "pages-navigation-help";
  groupHelp.textContent = "Parents are top-level dropdown labels in the site header.";

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

  groupForm.append(groupFormTitle, groupHelp, groupName, groupNameFr, addGroup);
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
  if (!publishedPages.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Publish a page first";
    page.append(option);
  }
  publishedPages
    .forEach(existingPage => {
      const option = document.createElement("option");
      option.value = existingPage._id;
      option.textContent = localized(existingPage.title) || existingPage.slug;
      option.dataset.route = existingPage.route;
      option.dataset.labelEn = existingPage.title?.en || "";
      option.dataset.labelFr = existingPage.title?.fr || "";
      page.append(option);
    });
  page.disabled = !publishedPages.length;

  const add = document.createElement("button");
  add.type = "submit";
  add.className = "admin-work-zone-button is-primary";
  add.textContent = "Add to navbar";
  add.disabled = !publishedPages.length;

  const addPageTitle = document.createElement("strong");
  addPageTitle.className = "pages-navigation-form-title";
  addPageTitle.textContent = "Add published page";

  const addPageHelp = document.createElement("p");
  addPageHelp.className = "pages-navigation-help";
  addPageHelp.textContent = publishedPages.length
    ? "Choose a parent and a published page. Drafts are intentionally excluded."
    : "No published pages are available yet. Publish a page before adding it to the navbar.";

  form.append(addPageTitle, addPageHelp, group, page, add);
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

  panel.append(intro, groupForm, form);

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

function createMediaPickerModal() {
  if (!pagesState.mediaPicker) {
    return null;
  }

  const overlay = document.createElement("div");
  overlay.className = "pages-media-picker-overlay";
  overlay.addEventListener("click", event => {
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
    empty.textContent = "No CDN media found yet. Upload an image from a page block to add one.";
    body.append(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "pages-media-picker-grid";

    pagesState.media.forEach(mediaItem => {
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
  refresh.addEventListener("click", () => loadPageBuilderMedia({ reset: true }));
  footer.append(refresh);

  if (pagesState.mediaIsTruncated) {
    const loadMore = document.createElement("button");
    loadMore.type = "button";
    loadMore.className = "admin-work-zone-button is-secondary";
    loadMore.textContent = pagesState.mediaIsLoading ? "Loading..." : "Load more";
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
  overlay.addEventListener("click", event => {
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
    crop
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
    input.addEventListener("change", event => {
      updateCropTarget({
        ...getCrop(getCropTargetMedia()?.crop),
        [key]: Number(event.target.value)
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

  [0, 90, 180, 270].forEach(value => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-work-zone-button is-secondary";
    button.classList.toggle("is-active", Number(crop.rotate) === value);
    button.textContent = `${value}deg`;
    button.addEventListener("click", () => {
      updateCropTarget({
        ...getCrop(getCropTargetMedia()?.crop),
        rotate: value
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
  pagesAdminContent.classList.toggle("is-page-selected", Boolean(pagesState.selectedPage));

  const children = [
    createMessage(),
    createPagesSidebar(),
    createBlockControls(),
    createPageEditor()
  ];
  const mediaPicker = createMediaPickerModal();
  const cropEditor = createCropEditorModal();

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
    errorMessage: "Could not verify account"
  });

  if (user.permissions?.canManagePages !== true) {
    window.location.href = "/dashboard";
    return null;
  }

  pagesState.canManageNavigation = user.permissions?.canManageNavigation === true;
  window.updateAdminWorkZoneTabsForUser(user);
  return user;
}

async function loadPages() {
  cancelAutoSave();
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
    message: "",
    autoSaveStatus: "idle",
    autoSaveMessage: ""
  });
  showPagesPage();

  if (selectedPageId && !pagesState.selectedPage) {
    await loadPageDetail(selectedPageId);
  }
}

async function loadPageDetail(pageId) {
  cancelAutoSave();
  const data = await pageApi(`/api/admin/pages/${encodeURIComponent(pageId)}`, {
    errorMessage: "Could not load page"
  });
  setPagesState({
    selectedPageId: data.page._id,
    selectedPage: data.page,
    message: "",
    autoSaveStatus: "idle",
    autoSaveMessage: "",
    lastSavedAt: data.page.updatedAt || null
  });
}

async function loadPageBuilderMedia({ reset = false } = {}) {
  setPagesState({
    mediaIsLoading: true,
    ...(reset
      ? {
        media: [],
        mediaNextCursor: "",
        mediaIsTruncated: false
      }
      : {})
  });

  try {
    const params = new URLSearchParams({ limit: "60" });
    const cursor = reset ? "" : pagesState.mediaNextCursor;

    if (cursor) {
      params.set("cursor", cursor);
    }

    const data = await pageApi(`/api/admin/pages/media?${params}`, {
      errorMessage: "Could not load CDN media"
    });

    setPagesState({
      media: reset
        ? data.media || []
        : [...pagesState.media, ...(data.media || [])],
      mediaNextCursor: data.nextCursor || "",
      mediaIsTruncated: Boolean(data.isTruncated),
      mediaIsLoading: false
    });
  } catch (error) {
    setPagesState({
      mediaIsLoading: false,
      message: error.message || "Could not load CDN media"
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
        blocks: [getNewBlock("text")]
      },
      errorMessage: "Could not create page"
    });

    await loadPages();
    await loadPageDetail(data.page._id);
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

async function saveSelectedPage({ auto = false } = {}) {
  if (!pagesState.selectedPage?._id) return;

  cancelAutoSave();
  const requestId = ++autoSaveRequestId;
  const pageId = pagesState.selectedPage._id;

  if (auto) {
    setAutoSaveState("saving", "Saving...");
  }

  let data;

  try {
    data = await pageApi(`/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}`, {
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
  } catch (error) {
    if (auto) {
      setAutoSaveState("error", error.message || "Autosave failed");
      return;
    }

    showPagesActionToast(error.message || "Could not save page", "error");
    return;
  }

  if (requestId !== autoSaveRequestId || String(pagesState.selectedPageId) !== String(pageId)) {
    return;
  }

  if (auto) {
    pagesState = {
      ...pagesState,
      autoSaveStatus: "saved",
      autoSaveMessage: "Saved",
      lastSavedAt: data.page.updatedAt || new Date().toISOString()
    };
    renderAutoSaveStatus();
    return;
  }

  setPagesState({
    selectedPage: data.page,
    message: "",
    autoSaveStatus: "saved",
    autoSaveMessage: "Saved",
    lastSavedAt: data.page.updatedAt || new Date().toISOString()
  });
  showPagesActionToast(data.message || "Page saved", "success");

  const listData = await pageApi("/api/admin/pages", {
    errorMessage: "Could not refresh page list"
  }).catch(() => null);

  if (listData && String(pagesState.selectedPageId) === String(pageId)) {
    setPagesState({
      pages: listData.pages || pagesState.pages,
      navigationItems: listData.navigationItems || pagesState.navigationItems,
      navigationGroups: listData.navigationGroups || pagesState.navigationGroups,
      roles: listData.roles || pagesState.roles,
      customRoles: listData.customRoles || pagesState.customRoles,
      permissionCatalog: listData.permissionCatalog || pagesState.permissionCatalog
    });
  }
}

async function updatePageStatus(status) {
  if (!pagesState.selectedPage?._id) return;
  cancelAutoSave();

  try {
    const data = await pageApi(`/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}/status`, {
      method: "PATCH",
      body: { status },
      errorMessage: "Could not update page status"
    });

    setPagesState({
      selectedPage: data.page,
      message: ""
    });
    await loadPages();
    showPagesActionToast(data.message || "Page status updated", "success");
  } catch (error) {
    showPagesActionToast(error.message || "Could not update page status", "error");
  }
}

async function deleteSelectedPage() {
  if (!pagesState.selectedPage?._id) return;
  if (!await CMCENModal.confirm("Delete this page?", {
    title: "Delete page",
    confirmText: "Delete",
    destructive: true
  })) return;
  cancelAutoSave();

  try {
    await pageApi(`/api/admin/pages/${encodeURIComponent(pagesState.selectedPage._id)}`, {
      method: "DELETE",
      errorMessage: "Could not delete page"
    });

    setPagesState({
      selectedPageId: "",
      selectedPage: null,
      message: ""
    });
    await loadPages();
    showPagesActionToast("Page deleted", "success");
  } catch (error) {
    showPagesActionToast(error.message || "Could not delete page", "error");
  }
}

function addBlock(type) {
  insertBlock(type, (pagesState.selectedPage?.blocks || []).length);
}

function insertBlock(type, index) {
  const blocks = [...(pagesState.selectedPage?.blocks || [])];
  const insertIndex = Math.max(0, Math.min(index, blocks.length));
  blocks.splice(insertIndex, 0, getNewBlock(type));
  updateSelectedPage({ blocks });
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
  const block = pagesState.selectedPage?.blocks?.[index] || getNewBlock("carousel");
  updateBlock(index, {
    items: [
      ...(block.items || []),
      {
        mediaKey: "",
        mediaUrl: "",
        mediaVariants: {},
        alt: getEmptyLocalized(),
        caption: getEmptyLocalized()
      }
    ]
  });
}

function removeCarouselItem(index, itemIndex) {
  const block = pagesState.selectedPage?.blocks?.[index] || getNewBlock("carousel");
  const items = [...(block.items || [])];
  items.splice(itemIndex, 1);
  updateBlock(index, { items });
}

async function uploadBlockImage(index, file) {
  const data = await uploadImageToCdn(file, `block:${index}`);

  updateBlock(index, {
    ...getUploadMediaUpdate(data),
    crop: getCrop(pagesState.selectedPage?.blocks?.[index]?.crop)
  });
}

async function uploadColumnImage(index, columnIndex, file) {
  const data = await uploadImageToCdn(file, `column:${index}:${columnIndex}`);

  updateBlockColumn(index, columnIndex, {
    ...getUploadMediaUpdate(data),
    crop: getCrop(pagesState.selectedPage?.blocks?.[index]?.columns?.[columnIndex]?.crop)
  });
}

async function uploadCarouselImage(index, itemIndex, file) {
  const data = await uploadImageToCdn(file, `carousel:${index}:${itemIndex}`);

  updateCarouselItem(index, itemIndex, {
    ...getUploadMediaUpdate(data),
    crop: getCrop(pagesState.selectedPage?.blocks?.[index]?.items?.[itemIndex]?.crop)
  });
}

function uploadImageToCdn(file, progressKey) {
  setUploadProgress(progressKey, {
    status: "uploading",
    percent: 0,
    message: "Preparing image"
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
    "Page image"
  );

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", "/api/upload");
    request.setRequestHeader("Authorization", `Bearer ${pagesAdminToken}`);

    request.upload.addEventListener("progress", event => {
      if (!event.lengthComputable) return;

      setUploadProgress(progressKey, {
        status: "uploading",
        percent: Math.round((event.loaded / event.total) * 100)
      });
    });

    request.addEventListener("load", () => {
      const data = JSON.parse(request.responseText || "{}");

      if (request.status < 200 || request.status >= 300) {
        const message = data.error || "Could not upload image";
        setUploadProgress(progressKey, {
          status: "error",
          percent: 0,
          message
        });
        reject(new Error(message));
        return;
      }

      setUploadProgress(progressKey, {
        status: "complete",
        percent: 100,
        message: "Upload complete"
      });
      window.setTimeout(() => clearUploadProgress(progressKey), 900);
      resolve(data);
    });

    request.addEventListener("error", () => {
      const message = "Could not upload image";
      setUploadProgress(progressKey, {
        status: "error",
        percent: 0,
        message
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
      errorMessage: "Could not add navigation item"
    });
    await loadPages();
    await window.reloadSiteNavigation?.();
    showPagesActionToast("Navigation item added", "success");
  } catch (error) {
    showPagesActionToast(error.message || "Could not add navigation item", "error");
  }
}

async function deleteNavigationItem(itemId) {
  try {
    await pageApi(`/api/admin/navigation-items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      errorMessage: "Could not remove navigation item"
    });
    await loadPages();
    await window.reloadSiteNavigation?.();
    showPagesActionToast("Navigation item removed", "success");
  } catch (error) {
    showPagesActionToast(error.message || "Could not remove navigation item", "error");
  }
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
