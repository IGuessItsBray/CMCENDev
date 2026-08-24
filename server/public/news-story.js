const newsDetailContent = document.getElementById("newsDetailContent");
const newsDetailMessage = document.getElementById("newsDetailMessage");
const newsDetailDate = document.getElementById("newsDetailDate");
const newsDetailTitle = document.getElementById("newsDetailTitle");
const newsDetailImage = document.getElementById("newsDetailImage");
const newsDetailText = document.getElementById("newsDetailText");
const newsDetailEdit = document.getElementById("newsDetailEdit");
const newsDetailEditorDialog = document.getElementById(
  "newsDetailEditorDialog",
);
const newsDetailEditorForm = document.getElementById("newsDetailEditorForm");
const newsDetailEditorCancel = document.getElementById(
  "newsDetailEditorCancel",
);
const newsDetailSave = document.getElementById("newsDetailSave");
const newsDetailImageCrop = CMCENUtils.createImageCropController({
  input: document.getElementById("newsDetailImageInput"),
  container: document.getElementById("newsDetailImageCrop"),
  labels: {
    heading: "Position the photo in news cards",
    hint: "The original photo stays intact for the full news story.",
    horizontal: "Horizontal position",
    vertical: "Vertical position",
    previewAlt: "News card image crop preview",
  },
});
let currentNewsArticle = null;

function getNewsDetailText(value) {
  const language = CMCENUtils.getCurrentLanguage();
  return (
    CMCENUtils.getLocalizedText(value, language) ||
    CMCENUtils.getLocalizedText(value, language === "fr" ? "en" : "fr") ||
    ""
  );
}

function formatNewsDetailDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return CMCENUtils.formatDate(value, {
    locale: CMCENUtils.getCurrentLanguage() === "fr" ? "fr-CA" : "en-CA",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function showNewsDetailMessage(message, type = "neutral") {
  newsDetailMessage.textContent = message;
  newsDetailMessage.className = `news-message is-${type}`;
  newsDetailMessage.hidden = false;
  newsDetailContent.hidden = true;
}

function renderNewsStory(article) {
  currentNewsArticle = article;
  const title = getNewsDetailText(article.title) || "News story";
  document.title = `${title} | CMCEN / RCMCE`;
  newsDetailDate.textContent = formatNewsDetailDate(article.publishedAt);
  newsDetailTitle.textContent = title;
  newsDetailImage.src = article.imageUrl;
  newsDetailImage.alt = title;
  newsDetailText.textContent = getNewsDetailText(article.content);
  newsDetailMessage.hidden = true;
  newsDetailContent.hidden = false;
}

async function addNewsEditLink() {
  const token = CMCENUtils.getStoredAuthToken();
  if (!token) return;
  try {
    const user = await CMCENUtils.apiJson("/api/me", { token });
    if (!user.permissions?.canManageNews) return;
    newsDetailEdit.hidden = false;
  } catch (error) {
  }
}

function openNewsDetailEditor() {
  if (!currentNewsArticle) return;
  document.getElementById("newsDetailTitleEn").value =
    currentNewsArticle.title?.en || "";
  document.getElementById("newsDetailTitleFr").value =
    currentNewsArticle.title?.fr || "";
  document.getElementById("newsDetailContentEn").value =
    currentNewsArticle.content?.en || "";
  document.getElementById("newsDetailContentFr").value =
    currentNewsArticle.content?.fr || "";
  document.getElementById("newsDetailDraft").checked =
    currentNewsArticle.status === "draft";
  document.getElementById("newsDetailImageInput").value = "";
  newsDetailImageCrop.reset();
  newsDetailEditorDialog.showModal();
}

function closeNewsDetailEditor() {
  newsDetailEditorDialog.close();
}

async function uploadNewsDetailImage(token) {
  const file = document.getElementById("newsDetailImageInput").files?.[0];
  if (!file) return { imageUrl: "", imageDisplayUrl: "" };
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a valid image file.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("News photos must be 10 MB or smaller.");
  }
  const formData = new FormData();
  formData.append("image", await CMCENUtils.prepareImageUploadFile(file));
  formData.append("uploadSource", "newsArticle");
  formData.append("uploadContext", "news-story");
  formData.append("sourceField", "imageUrl");
  formData.append("displayAspectRatio", "16:9");
  const crop = newsDetailImageCrop.getCrop();
  formData.append("displayCropX", String(crop.x));
  formData.append("displayCropY", String(crop.y));
  formData.append(
    "sourceName",
    document.getElementById("newsDetailTitleEn").value.trim(),
  );
  const data = await CMCENUtils.apiFetch("/api/upload", {
    method: "POST",
    body: formData,
    token,
    errorMessage: "Could not upload the news photo.",
  });
  return {
    imageUrl: data.url || "",
    imageDisplayUrl: data.display?.url || "",
  };
}

async function loadNewsStory() {
  const articleId = new URLSearchParams(window.location.search).get("id");
  if (!articleId) {
    showNewsDetailMessage("Choose a news story to read.", "error");
    return;
  }
  showNewsDetailMessage("Loading news story...");
  try {
    const data = await CMCENUtils.apiJson(
      `/api/news/${encodeURIComponent(articleId)}`,
      { errorMessage: "Could not load this news story." },
    );
    if (!data.article) throw new Error("Could not load this news story.");
    renderNewsStory(data.article);
    addNewsEditLink();
  } catch (error) {
    showNewsDetailMessage(
      error.message || "Could not load this news story.",
      "error",
    );
  }
}

document.addEventListener("languagechange", () => {
  if (currentNewsArticle) renderNewsStory(currentNewsArticle);
});

newsDetailEdit.addEventListener("click", openNewsDetailEditor);
newsDetailEditorCancel.addEventListener("click", closeNewsDetailEditor);
newsDetailEditorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!newsDetailEditorForm.checkValidity()) {
    newsDetailEditorForm.reportValidity();
    return;
  }
  const token = CMCENUtils.requireAuthToken();
  if (!token || !currentNewsArticle) return;
  newsDetailSave.disabled = true;
  try {
    const uploadResult = await uploadNewsDetailImage(token);
    const payload = {
      title: {
        en: document.getElementById("newsDetailTitleEn").value.trim(),
        fr: document.getElementById("newsDetailTitleFr").value.trim(),
      },
      content: {
        en: document.getElementById("newsDetailContentEn").value.trim(),
        fr: document.getElementById("newsDetailContentFr").value.trim(),
      },
      imageUrl: uploadResult.imageUrl || currentNewsArticle.imageUrl || "",
      imageDisplayUrl:
        uploadResult.imageDisplayUrl ||
        currentNewsArticle.imageDisplayUrl ||
        "",
      status: document.getElementById("newsDetailDraft").checked
        ? "draft"
        : "published",
    };
    const data = await CMCENUtils.apiJson(
      `/api/news/${encodeURIComponent(currentNewsArticle._id)}`,
      {
        method: "PATCH",
        token,
        body: payload,
        errorMessage: "Could not save news story.",
      },
    );
    renderNewsStory(data.article);
    closeNewsDetailEditor();
    CMCENUtils.showToast("News story updated and recorded in the audit log.", {
      color: "success",
    });
  } catch (error) {
    CMCENUtils.showToast(error.message || "Could not save news story.", {
      color: "error",
    });
  } finally {
    newsDetailSave.disabled = false;
  }
});

loadNewsStory();
