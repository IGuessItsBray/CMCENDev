const searchPageForm = document.getElementById("searchPageForm");
const searchPageInput = document.getElementById("searchPageInput");
const searchStatus = document.getElementById("searchStatus");
const searchResults = document.getElementById("searchResults");

let lastSearchQuery = "";

function getCurrentLanguage() {
  return CMCENUtils.getCurrentLanguage();
}

function getInitialQuery() {
  return new URLSearchParams(window.location.search).get("q") || "";
}

function getTypeLabel(type) {
  const labels = {
    event: translate("search_type_event"),
    "retirement-message": translate("search_type_retirement_message"),
    "last-post-message": translate("search_type_last_post_message"),
    "news-story": translate("search_type_news_story"),
    page: translate("search_type_page"),
  };

  return labels[type] || type;
}

function formatResultDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return CMCENUtils.formatDate(value, {
    locale: CMCENUtils.getCurrentLocale(),
    year: "numeric",
    month: "short",
    day: "numeric",
    fallback: "",
  });
}

function setStatus(messageKey, replacements = {}) {
  searchStatus.textContent = translate(messageKey, replacements);
}

function renderResult(result) {
  if (!result.url) return null;

  const article = document.createElement("article");
  article.className = "search-result";

  const meta = document.createElement("div");
  meta.className = "search-result-meta";

  const type = document.createElement("span");
  type.className = "search-result-type";
  type.textContent = getTypeLabel(result.type);
  meta.appendChild(type);

  const date = formatResultDate(result.date);

  if (date) {
    const dateElement = document.createElement("span");
    dateElement.textContent = date;
    meta.appendChild(dateElement);
  }

  const title = document.createElement("h2");
  title.className = "search-result-title";

  const link = document.createElement("a");
  link.href = result.url;
  link.textContent = result.title;
  title.appendChild(link);

  const summary = document.createElement("p");
  summary.className = "search-result-summary";
  summary.textContent = result.summary || "";

  article.append(meta, title, summary);

  return article;
}

function renderResults(data) {
  searchResults.replaceChildren();

  if (!data.results.length) {
    setStatus("search_no_results", {
      query: data.query,
    });
    return;
  }

  setStatus("search_results_count", {
    count: data.total,
    query: data.query,
  });

  const fragment = document.createDocumentFragment();

  data.results
    .map(renderResult)
    .filter(Boolean)
    .forEach((result) => fragment.appendChild(result));

  searchResults.appendChild(fragment);
}

function renderSearchSkeletons() {
  searchResults.replaceChildren(
    ...Array.from({ length: 5 }, () => {
      const result = document.createElement("article");
      result.className = "search-result search-result--skeleton";
      result.setAttribute("aria-hidden", "true");
      result.append(
        CMCENUtils.createSkeleton("skeleton--line skeleton--line-short"),
        CMCENUtils.createSkeleton("skeleton--line skeleton--line-title"),
        CMCENUtils.createSkeleton("skeleton--line"),
        CMCENUtils.createSkeleton("skeleton--line skeleton--line-medium"),
      );
      return result;
    }),
  );
}

async function runSearch(query) {
  const cleanQuery = query.trim();
  lastSearchQuery = cleanQuery;
  searchPageInput.value = cleanQuery;
  searchResults.replaceChildren();

  if (cleanQuery.length < 2) {
    setStatus("search_enter_query");
    return;
  }

  setStatus("search_loading");
  renderSearchSkeletons();

  try {
    const params = new URLSearchParams({
      q: cleanQuery,
      lang: getCurrentLanguage(),
    });

    const response = await fetch(`/api/search?${params.toString()}`);

    if (!response.ok) {
      throw new Error("Search request failed");
    }

    const data = await response.json();
    renderResults(data);
  } catch (error) {
    setStatus("search_error");
  }
}

searchPageForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const query = searchPageInput.value.trim();
  const url = new URL(window.location.href);
  url.searchParams.set("q", query);
  window.history.replaceState({}, "", url);

  runSearch(query);
});

document.addEventListener("languagechange", () => {
  if (lastSearchQuery) {
    runSearch(lastSearchQuery);
  }
});

runSearch(getInitialQuery());
