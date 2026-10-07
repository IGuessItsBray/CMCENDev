const lastPostDetailContent = document.getElementById("lastPostDetailContent");
const lastPostDetailMessage = document.getElementById("lastPostDetailMessage");
const lastPostDetailTitle = document.getElementById("lastPostDetailTitle");
const lastPostDetailDate = document.getElementById("lastPostDetailDate");
const lastPostDetailImage = document.getElementById("lastPostDetailImage");
const lastPostDetailText = document.getElementById("lastPostDetailText");
const lastPostPreviewNotice = document.getElementById("lastPostPreviewNotice");
CMCENUtils.setDetailReturnLink(
  document.getElementById("lastPostBack"),
  "/last-post",
);
const lastPostStaffActions = document.getElementById("lastPostStaffActions");
const lastPostStaffLabel = document.getElementById("lastPostStaffLabel");
const lastPostStaffEdit = document.getElementById("lastPostStaffEdit");

const LAST_POST_PLACEHOLDER_IMAGE_URL = "/assets/images/logo.png";

let currentLastPost = null;
let currentLastPostId = "";
let canOpenLastPostWorkspace = false;

function renderLastPostAdminActions() {
  lastPostStaffActions.hidden = !canOpenLastPostWorkspace || !currentLastPostId;
  if (lastPostStaffActions.hidden) return;
  lastPostStaffLabel.textContent =
    CMCENUtils.getCurrentLanguage() === "fr"
      ? "Actions administratives"
      : "Admin actions";
  lastPostStaffEdit.textContent =
    CMCENUtils.getCurrentLanguage() === "fr" ? "Modifier" : "Edit";
  lastPostStaffEdit.href = `/content-workspace?id=${encodeURIComponent(currentLastPostId)}`;
}

async function setupLastPostAdminAccess() {
  const token = CMCENUtils.getStoredAuthToken();

  if (!token) {
    canOpenLastPostWorkspace = false;
    lastPostStaffActions.hidden = true;
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
    lastPostStaffActions.hidden = true;
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
  return CMCENUtils.getLastPostName(lastPost) || translate("last_post_default_name");
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
  const text = CMCENUtils.getLocalizedText(lastPost.messages);
  BodyContent.render(
    lastPostDetailText,
    lastPost,
    BodyContent.languageFor(lastPost.messages, window.currentLang || 'en', text),
    text,
    CMCENUtils.setLinkifiedText,
  );
  renderImage(lastPost, name);
  lastPostDetailMessage.hidden = true;
  lastPostDetailContent.hidden = false;
}

async function loadLastPost() {
  lastPostStaffActions.hidden = true;
  const preview =
    new URLSearchParams(window.location.search).get("preview") === "1";
  lastPostPreviewNotice.hidden = true;
  const messageId = new URLSearchParams(window.location.search).get("id") || "";
  if (!messageId) {
    showDetailMessage(translate("last_post_detail_no_selection"), "error");
    return;
  }

  showDetailLoading();
  try {
    const data = await CMCENUtils.apiJson(
      `/api/last-posts/${encodeURIComponent(messageId)}${preview ? "/preview" : ""}`,
      {
        errorMessage: translate("last_post_detail_load_error"),
        ...(preview ? { token: CMCENUtils.getStoredAuthToken() } : {}),
      },
    );
    if (!data.lastPost)
      throw new Error(translate("last_post_detail_load_error"));
    renderLastPost(data.lastPost);
    lastPostPreviewNotice.hidden = !preview;
    await setupLastPostAdminAccess();
  } catch (error) {
    lastPostPreviewNotice.hidden = true;
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
