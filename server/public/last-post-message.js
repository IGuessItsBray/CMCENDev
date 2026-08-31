const lastPostDetailContent = document.getElementById("lastPostDetailContent");
const lastPostDetailMessage = document.getElementById("lastPostDetailMessage");
const lastPostDetailTitle = document.getElementById("lastPostDetailTitle");
const lastPostDetailDate = document.getElementById("lastPostDetailDate");
const lastPostDetailImage = document.getElementById("lastPostDetailImage");
const lastPostDetailText = document.getElementById("lastPostDetailText");

const LAST_POST_PLACEHOLDER_IMAGE_URL = "/images/logo.png";

let currentLastPost = null;
let currentLastPostId = "";
let canOpenLastPostWorkspace = false;

function removeLastPostAdminActions() {
  document
    .querySelector("[data-content-workspace-shortcut='lastPost']")
    ?.remove();
}

function renderLastPostAdminActions() {
  removeLastPostAdminActions();

  if (!canOpenLastPostWorkspace || !currentLastPostId) return;

  const shortcut = CMCENUtils.createContentWorkspaceShortcut({
    contentType: "lastPost",
    contentId: currentLastPostId,
    label: translate(
      "content_workspace_open_record",
      "Open in Content Workspace",
    ),
  });
  if (shortcut) document.body.append(shortcut);
}

async function setupLastPostAdminAccess() {
  const token = CMCENUtils.getStoredAuthToken();

  if (!token) {
    canOpenLastPostWorkspace = false;
    removeLastPostAdminActions();
    return;
  }

  CMCENUtils.storeAuthToken(token);

  try {
    const user = await CMCENUtils.apiJson("/api/me", {
      token,
      errorMessage: "Could not verify Last Post permissions",
    });
    canOpenLastPostWorkspace = user.permissions?.canReviewAndPublish === true;
    renderLastPostAdminActions();
  } catch {
    canOpenLastPostWorkspace = false;
    removeLastPostAdminActions();
  }
}

function showDetailMessage(message, type = "neutral") {
  lastPostDetailMessage.textContent = message;
  lastPostDetailMessage.className = `last-post-message is-${type}`;
  lastPostDetailMessage.hidden = false;
  lastPostDetailContent.hidden = true;
}

function showDetailLoading() {
  const message = translate("last_post_detail_loading");
  const skeleton = document.createElement("div");
  skeleton.className =
    "content-detail-skeleton content-detail-skeleton--last-post";
  skeleton.setAttribute("aria-hidden", "true");
  skeleton.append(
    CMCENUtils.createSkeleton("skeleton--detail-title"),
    CMCENUtils.createSkeleton("skeleton--line skeleton--line-short"),
    CMCENUtils.createSkeleton("skeleton--detail-photo"),
    CMCENUtils.createSkeleton("skeleton--detail-block"),
    CMCENUtils.createSkeleton(
      "skeleton--detail-block skeleton--detail-block-short",
    ),
  );
  const accessibleLabel = document.createElement("span");
  accessibleLabel.className = "visually-hidden";
  accessibleLabel.textContent = message;

  lastPostDetailMessage.replaceChildren(skeleton, accessibleLabel);
  lastPostDetailMessage.className = "last-post-message is-loading";
  lastPostDetailMessage.setAttribute("aria-label", message);
  lastPostDetailMessage.hidden = false;
  lastPostDetailContent.hidden = true;
}

function getLastPostName(lastPost) {
  return lastPost?.displayName || translate("last_post_default_name");
}

function formatPublishedDate(value) {
  if (!value) return "";

  return CMCENUtils.formatDate(value, {
    dateStyle: "long",
    timeZone: "UTC",
    fallback: "",
  });
}

function renderImage(lastPost, name) {
  lastPostDetailImage.replaceChildren();
  const hasPersonImage =
    Boolean(lastPost.imageUrl) &&
    !CMCENUtils.isSitePlaceholderImage(lastPost.imageUrl);

  const image = document.createElement("img");
  image.src = hasPersonImage
    ? lastPost.imageUrl
    : LAST_POST_PLACEHOLDER_IMAGE_URL;
  image.alt = hasPersonImage ? translate("last_post_image_alt", { name }) : "";

  if (hasPersonImage) {
    image.addEventListener(
      "error",
      () => {
        image.src = LAST_POST_PLACEHOLDER_IMAGE_URL;
        image.alt = "";
        image.className = "last-post-detail-image-logo";
        image.setAttribute("aria-hidden", "true");
      },
      { once: true },
    );
  } else {
    image.className = "last-post-detail-image-logo";
    image.setAttribute("aria-hidden", "true");
  }

  lastPostDetailImage.appendChild(image);
  lastPostDetailImage.hidden = false;
}

function renderLastPost(lastPost) {
  currentLastPost = lastPost;
  currentLastPostId = String(lastPost?._id || currentLastPostId);
  const name = getLastPostName(lastPost);
  document.title = `${name} | ${translate("last_post_heading")} | CMCEN / RCMCE`;
  lastPostDetailTitle.textContent = name;
  lastPostDetailDate.textContent = formatPublishedDate(lastPost.publishedAt);
  CMCENUtils.setLinkifiedText(
    lastPostDetailText,
    CMCENUtils.getLocalizedText(lastPost.messages),
  );
  renderImage(lastPost, name);
  lastPostDetailMessage.hidden = true;
  lastPostDetailContent.hidden = false;
}

async function loadLastPost() {
  const messageId = new URLSearchParams(window.location.search).get("id") || "";
  if (!messageId) {
    showDetailMessage(translate("last_post_detail_no_selection"), "error");
    return;
  }

  showDetailLoading();
  try {
    const data = await CMCENUtils.apiJson(
      `/api/last-posts/${encodeURIComponent(messageId)}`,
      { errorMessage: translate("last_post_detail_load_error") },
    );
    if (!data.lastPost)
      throw new Error(translate("last_post_detail_load_error"));
    renderLastPost(data.lastPost);
    await setupLastPostAdminAccess();
  } catch (error) {
    showDetailMessage(
      error.message || translate("last_post_detail_load_error"),
      "error",
    );
  }
}

document.addEventListener("languagechange", () => {
  if (currentLastPost) {
    renderLastPost(currentLastPost);
    renderLastPostAdminActions();
  }
});

loadLastPost();
