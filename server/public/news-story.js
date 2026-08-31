const newsDetailContent = document.getElementById("newsDetailContent");
const newsDetailMessage = document.getElementById("newsDetailMessage");
const newsDetailDate = document.getElementById("newsDetailDate");
const newsDetailTitle = document.getElementById("newsDetailTitle");
const newsDetailImage = document.getElementById("newsDetailImage");
const newsDetailText = document.getElementById("newsDetailText");
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
    if (!user.permissions?.canManageNews || !currentNewsArticle?._id) return;

    const shortcut = CMCENUtils.createContentWorkspaceShortcut({
      contentType: "newsArticle",
      contentId: currentNewsArticle._id,
      label:
        typeof window.translate === "function"
          ? window.translate(
              "content_workspace_open_record",
              "Open in Content Workspace",
            )
          : "Open in Content Workspace",
    });
    if (shortcut) document.body.append(shortcut);
  } catch {}
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

loadNewsStory();
