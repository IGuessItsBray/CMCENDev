const newsPageMessage = document.getElementById("newsPageMessage");
const newsStoriesList = document.getElementById("newsStoriesList");
const newsEditor = document.getElementById("newsEditor");
const newsStoryForm = document.getElementById("newsStoryForm");
const newsManageList = document.getElementById("newsManageList");
const newsEditorTitle = document.getElementById("newsEditorTitle");
const newsEditorCancel = document.getElementById("newsEditorCancel");
const newsSaveButton = document.getElementById("newsSaveButton");
const newsCreateButton = document.getElementById("newsCreateButton");
const newsImageCrop = CMCENUtils.createImageCropController({
  input: document.getElementById("newsImage"),
  container: document.getElementById("newsImageCrop"),
  labels: {
    heading: "Position the photo in news cards",
    hint: "The original photo stays intact for the full news story.",
    horizontal: "Horizontal position",
    vertical: "Vertical position",
    previewAlt: "News card image crop preview",
  },
});
let managedArticles = [];

function currentNewsLanguage() {
  return CMCENUtils.getCurrentLanguage();
}

function newsText(value, language = currentNewsLanguage()) {
  return (
    CMCENUtils.getLocalizedText(value, language) ||
    CMCENUtils.getLocalizedText(value, language === "fr" ? "en" : "fr")
  );
}

function setNewsMessage(message, type = "neutral") {
  newsPageMessage.textContent = message;
  newsPageMessage.className = `news-message is-${type}`;
  newsPageMessage.hidden = false;
}

function clearNewsMessage() {
  newsPageMessage.hidden = true;
}

function formatNewsDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return CMCENUtils.formatDate(value, {
    locale: currentNewsLanguage() === "fr" ? "fr-CA" : "en-CA",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function createNewsCard(article) {
  const card = document.createElement("a");
  card.className = "news-card";
  card.id = String(article._id);
  card.href = `/news-story?id=${encodeURIComponent(article._id)}`;
  if (article.imageDisplayUrl || article.imageUrl) {
    const image = document.createElement("img");
    image.src = article.imageDisplayUrl || article.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    card.appendChild(image);
  }
  const content = document.createElement("div");
  content.className = "news-card-content";
  const date = document.createElement("p");
  date.className = "news-card-date";
  date.textContent = formatNewsDate(article.publishedAt);
  const title = document.createElement("h2");
  title.textContent = newsText(article.title) || "News story";
  const body = document.createElement("p");
  body.textContent = newsText(article.content) || "";
  content.append(date, title, body);
  card.appendChild(content);
  return card;
}

function renderPublicNews(articles) {
  newsStoriesList.replaceChildren();
  if (!articles.length) {
    setNewsMessage("No news stories have been published yet.", "empty");
    return;
  }
  clearNewsMessage();
  articles.forEach((article) =>
    newsStoriesList.appendChild(createNewsCard(article)),
  );
}

async function loadPublicNews() {
  try {
    const response = await fetch("/api/news?limit=48");
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.error || "Could not load news stories");
    renderPublicNews(Array.isArray(data.articles) ? data.articles : []);
  } catch (error) {
    setNewsMessage(error.message || "Could not load news stories.", "error");
  }
}

function resetNewsEditor() {
  newsStoryForm.reset();
  newsImageCrop.reset();
  document.getElementById("newsArticleId").value = "";
  newsEditorTitle.textContent = "Create a news story";
  newsSaveButton.textContent = "Publish story";
  newsEditorCancel.hidden = true;
}

function closeNewsEditor() {
  resetNewsEditor();
  newsEditor.hidden = true;
}

function openNewsEditor() {
  resetNewsEditor();
  newsEditor.hidden = false;
  newsEditor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function beginEdit(article) {
  document.getElementById("newsArticleId").value = article._id;
  document.getElementById("newsTitleEn").value = article.title?.en || "";
  document.getElementById("newsTitleFr").value = article.title?.fr || "";
  document.getElementById("newsContentEn").value = article.content?.en || "";
  document.getElementById("newsContentFr").value = article.content?.fr || "";
  document.getElementById("newsDraft").checked = article.status === "draft";
  newsEditorTitle.textContent = "Edit news story";
  newsSaveButton.textContent = "Save changes";
  newsEditorCancel.hidden = false;
  newsEditor.hidden = false;
  newsEditor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderManagedNews() {
  newsManageList.replaceChildren();
  if (!managedArticles.length) return;
  const heading = document.createElement("h3");
  heading.textContent = "Manage news stories";
  newsManageList.appendChild(heading);
  managedArticles.forEach((article) => {
    const row = document.createElement("div");
    row.className = "news-manage-row";
    const text = document.createElement("span");
    text.textContent = `${article.title?.en || article.title?.fr || "Untitled story"} · ${article.status}`;
    const actions = document.createElement("span");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "news-secondary-button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => beginEdit(article));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "news-delete-button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteArticle(article));
    actions.append(edit, remove);
    row.append(text, actions);
    newsManageList.appendChild(row);
  });
}

async function loadNewsManagement(token) {
  try {
    const data = await CMCENUtils.apiJson("/api/news/manage", {
      token,
      errorMessage: "Could not load news management.",
    });
    managedArticles = Array.isArray(data.articles) ? data.articles : [];
    renderManagedNews();
  } catch (error) {
    CMCENUtils.showToast(error.message || "Could not load news management.", {
      color: "error",
    });
  }
}

async function uploadNewsImage(token) {
  const file = document.getElementById("newsImage").files?.[0];
  if (!file) return { imageUrl: "", imageDisplayUrl: "" };
  if (!file.type.startsWith("image/"))
    throw new Error("Choose a valid image file.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("News photos must be 10 MB or smaller.");
  const formData = new FormData();
  formData.append("image", await CMCENUtils.prepareImageUploadFile(file));
  formData.append("uploadSource", "newsArticle");
  formData.append("uploadContext", "news-story");
  formData.append("sourceField", "imageUrl");
  formData.append("displayAspectRatio", "16:9");
  const crop = newsImageCrop.getCrop();
  formData.append("displayCropX", String(crop.x));
  formData.append("displayCropY", String(crop.y));
  formData.append(
    "sourceName",
    document.getElementById("newsTitleEn").value.trim(),
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

async function deleteArticle(article) {
  if (
    !window.confirm(
      `Delete “${article.title?.en || article.title?.fr || "this story"}”?`,
    )
  )
    return;
  const token = CMCENUtils.requireAuthToken();
  if (!token) return;
  try {
    await CMCENUtils.apiJson(`/api/news/${encodeURIComponent(article._id)}`, {
      method: "DELETE",
      token,
      errorMessage: "Could not delete news story.",
    });
    CMCENUtils.showToast("News story deleted and recorded in the audit log.", {
      color: "success",
    });
    await Promise.all([loadPublicNews(), loadNewsManagement(token)]);
    closeNewsEditor();
  } catch (error) {
    CMCENUtils.showToast(error.message || "Could not delete news story.", {
      color: "error",
    });
  }
}

async function initializeNewsEditor() {
  const token = CMCENUtils.getStoredAuthToken();
  if (!token) return;
  try {
    const user = await CMCENUtils.apiJson("/api/me", { token });
    if (!user.permissions?.canManageNews) return;
    newsCreateButton.hidden = false;
    await loadNewsManagement(token);
    const articleId = new URLSearchParams(window.location.search).get("edit");
    const article = managedArticles.find((item) => item._id === articleId);
    if (article) beginEdit(article);
  } catch (error) {}
}

newsCreateButton.addEventListener("click", openNewsEditor);
newsEditorCancel.addEventListener("click", closeNewsEditor);
newsStoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!newsStoryForm.checkValidity()) return newsStoryForm.reportValidity();
  const token = CMCENUtils.requireAuthToken();
  if (!token) return;
  newsSaveButton.disabled = true;
  try {
    const articleId = document.getElementById("newsArticleId").value;
    const uploadResult = await uploadNewsImage(token);
    const existing = managedArticles.find(
      (article) => article._id === articleId,
    );
    const payload = {
      title: {
        en: document.getElementById("newsTitleEn").value.trim(),
        fr: document.getElementById("newsTitleFr").value.trim(),
      },
      content: {
        en: document.getElementById("newsContentEn").value.trim(),
        fr: document.getElementById("newsContentFr").value.trim(),
      },
      imageUrl: uploadResult.imageUrl || existing?.imageUrl || "",
      imageDisplayUrl:
        uploadResult.imageDisplayUrl || existing?.imageDisplayUrl || "",
      status: document.getElementById("newsDraft").checked
        ? "draft"
        : "published",
    };
    await CMCENUtils.apiJson(
      articleId ? `/api/news/${encodeURIComponent(articleId)}` : "/api/news",
      {
        method: articleId ? "PATCH" : "POST",
        token,
        body: payload,
        errorMessage: "Could not save news story.",
      },
    );
    CMCENUtils.showToast(
      articleId
        ? "News story updated and recorded in the audit log."
        : "News story saved and recorded in the audit log.",
      { color: "success" },
    );
    closeNewsEditor();
    await Promise.all([loadPublicNews(), loadNewsManagement(token)]);
  } catch (error) {
    CMCENUtils.showToast(error.message || "Could not save news story.", {
      color: "error",
    });
  } finally {
    newsSaveButton.disabled = false;
  }
});

document.addEventListener("languagechange", loadPublicNews);
loadPublicNews();
initializeNewsEditor();
