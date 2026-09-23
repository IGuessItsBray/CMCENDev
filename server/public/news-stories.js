const newsPageMessage = document.getElementById("newsPageMessage");
const newsStoriesList = document.getElementById("newsStoriesList");
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
  card.href = `/${article.layout === "newsletter" ? "newsletter" : "news-story"}?id=${encodeURIComponent(article._id)}`;
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
  date.textContent = formatNewsDate(article.displayDate || article.publishedAt);
  const title = document.createElement("h2");
  title.textContent = newsText(article.title) || "News story";
  const body = document.createElement("p");
  body.textContent = newsText(article.excerpt || article.content) || "";
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

async function showArticleManagement() {
  const token = CMCENUtils.getStoredAuthToken();
  if (!token) return;
  try {
    const user = await CMCENUtils.apiJson("/api/me", { token });
    document.getElementById("newsCreateButton").hidden =
      !user.permissions?.canManageNews;
  } catch {}
}
document.addEventListener("languagechange", loadPublicNews);
loadPublicNews();
showArticleManagement();
