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

function newsPreview(article) {
  const text = newsText(article.excerpt || article.content)
    .replace(/\s+/g, " ")
    .trim();
  let sentenceStart = 0;
  for (const match of text.matchAll(/[.!?](?=\s|$)/g)) {
    if (match[0] === "." && /\d/.test(text[match.index - 1])) continue;
    const sentence = text.slice(sentenceStart, match.index + 1).trim();
    if (sentence.length >= 40 && sentence.length <= 250) return sentence;
    if (sentence.length > 250) return "";
    sentenceStart = match.index + 1;
  }
  return text.length <= 250 ? text : "";
}

function createNewsCard(article) {
  const card = document.createElement("a");
  card.className = "news-card";
  card.id = String(article._id);
  card.href = `/news-story?id=${encodeURIComponent(article._id)}`;
  if (article.imageDisplayUrl || article.imageUrl) {
    const media = document.createElement("span");
    media.className = "news-card-media";
    const image = document.createElement("img");
    image.src = article.imageDisplayUrl || article.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    media.appendChild(image);
    card.appendChild(media);
  } else {
    card.classList.add("news-card--without-image");
  }
  const content = document.createElement("div");
  content.className = "news-card-content";
  const date = document.createElement("p");
  date.className = "news-card-date";
  const category =
    article.category ||
    (article.layout === "newsletter" ? "newsletter" : "news");
  date.textContent = [
    window.translate?.(`article_category_${category}`, category) || category,
    formatNewsDate(article.displayDate || article.publishedAt),
  ]
    .filter(Boolean)
    .join(" · ");
  const title = document.createElement("h2");
  title.textContent = newsText(article.title) || "News story";
  content.append(date, title);
  const preview = newsPreview(article);
  if (preview) {
    const body = document.createElement("p");
    body.textContent = preview;
    content.appendChild(body);
  }
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

document.addEventListener("languagechange", loadPublicNews);
loadPublicNews();
