const retirementsGrid = document.getElementById("retirementsGrid");

const retirementsMessage = document.getElementById("retirementsMessage");

const retirementsLoadMore = document.getElementById("retirementsLoadMore");

const retirementsLoadMoreButton = document.getElementById(
  "retirementsLoadMoreButton",
);

const retirementsLoadMoreLabel = document.getElementById(
  "retirementsLoadMoreLabel",
);

const retirementsLoadMoreMessage = document.getElementById(
  "retirementsLoadMoreMessage",
);

const retirementsFilter = document.getElementById("retirementsFilter");

const retirementsSearch = document.getElementById("retirementsSearch");

const retirementsYear = document.getElementById("retirementsYear");

const retirementsFilterClear = document.getElementById(
  "retirementsFilterClear",
);

const RETIREMENT_PLACEHOLDER_PHOTO_URL = "/images/logo.png";
const RETIREMENT_PAGE_SIZE = 24;

let loadedRetirementMessages = [];
let retirementNextCursor = "";
let retirementHasMore = false;
let isLoadingMoreRetirements = false;

function getRetirementFilters() {
  return {
    q: retirementsSearch.value.trim(),
    year: /^\d{4}$/.test(retirementsYear.value.trim())
      ? retirementsYear.value.trim()
      : "",
  };
}

function updateRetirementFilterUrl() {
  const url = new URL(window.location.href);
  const { q, year } = getRetirementFilters();

  if (q) {
    url.searchParams.set("q", q);
  } else {
    url.searchParams.delete("q");
  }

  if (year) {
    url.searchParams.set("year", year);
  } else {
    url.searchParams.delete("year");
  }

  window.history.replaceState({}, "", url);
}

function loadFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  retirementsSearch.value = params.get("q") || "";
  retirementsYear.value = params.get("year") || "";
}

function createRetirementLoadingContent(message) {
  const loading = CMCENUtils.createLoadingSpinner(message);

  return Array.from(loading.childNodes);
}

function showRetirementsMessage(message, type = "neutral") {
  retirementsMessage.textContent = message;
  retirementsMessage.className = `retirements-message is-${type}`;
  retirementsMessage.removeAttribute("aria-label");
  retirementsMessage.hidden = false;
  retirementsGrid.hidden = true;
  retirementsGrid.classList.remove("is-skeleton-loading");
  retirementsLoadMore.hidden = true;
}

function showRetirementsLoading() {
  const message = translate("retirements_loading");

  retirementsMessage.replaceChildren(
    ...createRetirementLoadingContent(message),
  );
  retirementsMessage.className =
    "retirements-message is-loading visually-hidden";
  retirementsMessage.setAttribute("aria-label", message);
  retirementsMessage.hidden = false;
  renderRetirementsSkeletons();
  retirementsLoadMore.hidden = true;
}

function updateRetirementsLoadMore() {
  const showLoadMore = retirementHasMore && loadedRetirementMessages.length;

  retirementsLoadMore.hidden = !showLoadMore;
  retirementsLoadMoreButton.disabled = isLoadingMoreRetirements;
  retirementsLoadMoreButton.setAttribute(
    "aria-busy",
    String(isLoadingMoreRetirements),
  );
  retirementsLoadMoreLabel.textContent = translate(
    isLoadingMoreRetirements
      ? "retirements_loading_more"
      : "retirements_load_more",
  );
}

function showRetirementsLoadMoreMessage(message = "") {
  retirementsLoadMoreMessage.textContent = message;
  retirementsLoadMoreMessage.hidden = !message;
}

function formatRetireeName(retirementMessage) {
  const { name, postNominals } = CMCENUtils.getRetireeNameParts(
    retirementMessage.retiree,
  );

  return (
    [name, postNominals].filter(Boolean).join(", ") ||
    translate("retirement_card_default_name")
  );
}

function getMosid(retirementMessage) {
  return (
    retirementMessage.retiree?.tradeRole ||
    translate("retirement_mosid_pending")
  );
}

function getCommentCount(retirementMessage) {
  if (typeof retirementMessage.commentCount === "number") {
    return retirementMessage.commentCount;
  }

  if (Array.isArray(retirementMessage.comments)) {
    return retirementMessage.comments.length;
  }

  return 0;
}

function formatCommentCount(count) {
  return translate(
    count === 1 ? "retirement_comment_singular" : "retirement_comment_plural",
    { count },
  );
}

function createRetirementPlaceholderImage(className) {
  const image = document.createElement("img");

  image.className = className;
  image.src = RETIREMENT_PLACEHOLDER_PHOTO_URL;
  image.alt = "";
  image.loading = "lazy";
  image.setAttribute("aria-hidden", "true");

  return image;
}

function createPhotoElement(retirementMessage, name) {
  if (retirementMessage.photoUrl) {
    const image = document.createElement("img");
    const displayPhotoUrl =
      retirementMessage.photoDisplayUrl || retirementMessage.photoUrl;
    const isPlaceholderPhoto = CMCENUtils.isSitePlaceholderImage(
      retirementMessage.photoUrl,
    );

    image.src = isPlaceholderPhoto
      ? RETIREMENT_PLACEHOLDER_PHOTO_URL
      : displayPhotoUrl;
    image.alt = isPlaceholderPhoto
      ? ""
      : translate("retirement_photo_alt", { name });
    image.loading = "lazy";

    if (isPlaceholderPhoto) {
      image.className =
        "retirement-card-photo-placeholder retirement-card-photo-logo";
      image.setAttribute("aria-hidden", "true");
    }

    return image;
  }

  return createRetirementPlaceholderImage(
    "retirement-card-photo-placeholder retirement-card-photo-logo",
  );
}

function createRetirementCard(retirementMessage) {
  const card = document.createElement("a");
  const name = formatRetireeName(retirementMessage);
  const commentCount = getCommentCount(retirementMessage);

  card.className = "retirement-card";
  card.href = `/retirement-message?id=${encodeURIComponent(
    retirementMessage._id,
  )}`;
  card.setAttribute("aria-label", translate("retirement_card_aria", { name }));

  const header = document.createElement("header");
  header.className = "retirement-card-header";

  const title = document.createElement("h2");
  title.textContent = name;

  const mosid = document.createElement("p");
  mosid.textContent = getMosid(retirementMessage);

  header.append(title, mosid);

  const photo = document.createElement("div");
  photo.className = "retirement-card-photo";
  photo.appendChild(createPhotoElement(retirementMessage, name));

  const footer = document.createElement("footer");
  footer.className = "retirement-card-footer";
  footer.textContent = formatCommentCount(commentCount);

  card.append(header, photo, footer);

  return card;
}

function createRetirementSkeletonCard() {
  const card = document.createElement("div");
  card.className = "retirement-card retirement-card--skeleton";
  card.setAttribute("aria-hidden", "true");

  const header = document.createElement("div");
  header.className = "retirement-card-header";
  header.append(
    CMCENUtils.createSkeleton("skeleton--line skeleton--line-title"),
    CMCENUtils.createSkeleton("skeleton--line skeleton--line-medium"),
  );

  card.append(
    header,
    CMCENUtils.createSkeleton("skeleton--retirement-photo"),
    CMCENUtils.createSkeleton("skeleton--retirement-footer"),
  );

  return card;
}

function renderRetirementsSkeletons() {
  retirementsGrid.replaceChildren(
    ...Array.from({ length: 6 }, createRetirementSkeletonCard),
  );
  retirementsGrid.classList.add("is-skeleton-loading");
  retirementsGrid.hidden = false;
}

function renderRetirements(retirementMessages) {
  retirementsGrid.replaceChildren();

  if (!retirementMessages.length) {
    const { q, year } = getRetirementFilters();
    showRetirementsMessage(
      translate(q || year ? "retirements_search_empty" : "retirements_empty"),
      "empty",
    );
    return;
  }

  retirementMessages.forEach((retirementMessage) => {
    retirementsGrid.appendChild(createRetirementCard(retirementMessage));
  });

  retirementsMessage.hidden = true;
  retirementsGrid.classList.remove("is-skeleton-loading");
  retirementsGrid.hidden = false;
  updateRetirementsLoadMore();
}

function appendRetirements(retirementMessages) {
  retirementMessages.forEach((retirementMessage) => {
    retirementsGrid.appendChild(createRetirementCard(retirementMessage));
  });

  updateRetirementsLoadMore();
}

async function loadRetirements({ append = false } = {}) {
  if (append) {
    isLoadingMoreRetirements = true;
    showRetirementsLoadMoreMessage();
    updateRetirementsLoadMore();
  } else {
    showRetirementsLoading();
  }

  try {
    const params = new URLSearchParams({
      limit: String(RETIREMENT_PAGE_SIZE),
    });

    const { q, year } = getRetirementFilters();

    if (q) {
      params.set("q", q);
    }

    if (year) {
      params.set("year", year);
    }

    if (append && retirementNextCursor) {
      params.set("cursor", retirementNextCursor);
    }

    const response = await fetch(`/api/retirement-messages?${params}`);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || translate("retirements_load_error"));
    }

    const retirementMessages = Array.isArray(data.retirementMessages)
      ? data.retirementMessages
      : [];

    retirementHasMore = data.hasMore === true;
    retirementNextCursor =
      typeof data.nextCursor === "string" ? data.nextCursor : "";

    if (append) {
      loadedRetirementMessages.push(...retirementMessages);
      appendRetirements(retirementMessages);
      return;
    }

    loadedRetirementMessages = retirementMessages;
    renderRetirements(loadedRetirementMessages);
  } catch (error) {
    if (append) {
      showRetirementsLoadMoreMessage(
        error.message || translate("retirements_load_more_error"),
      );
      return;
    }

    showRetirementsMessage(
      error.message || translate("retirements_load_error"),
      "error",
    );
  } finally {
    if (append) {
      isLoadingMoreRetirements = false;
      updateRetirementsLoadMore();
    }
  }
}

retirementsLoadMoreButton.addEventListener("click", () =>
  loadRetirements({ append: true }),
);

retirementsFilter.addEventListener("submit", (event) => {
  event.preventDefault();
  updateRetirementFilterUrl();
  retirementNextCursor = "";
  retirementHasMore = false;
  loadedRetirementMessages = [];
  loadRetirements();
});

retirementsFilterClear.addEventListener("click", () => {
  if (!retirementsSearch.value && !retirementsYear.value) {
    return;
  }

  retirementsSearch.value = "";
  retirementsYear.value = "";
  updateRetirementFilterUrl();
  retirementNextCursor = "";
  retirementHasMore = false;
  loadedRetirementMessages = [];
  loadRetirements();
  retirementsSearch.focus();
});

document.addEventListener("languagechange", () => {
  if (loadedRetirementMessages.length) {
    renderRetirements(loadedRetirementMessages);
    showRetirementsLoadMoreMessage();
    return;
  }

  if (!retirementsMessage.hidden) {
    const isError = retirementsMessage.classList.contains("is-error");
    const isEmpty = retirementsMessage.classList.contains("is-empty");

    if (!isError && !isEmpty) {
      showRetirementsLoading();
      return;
    }

    showRetirementsMessage(
      translate(
        isError
          ? "retirements_load_error"
          : isEmpty
            ? "retirements_empty"
            : "retirements_loading",
      ),
      isError ? "error" : isEmpty ? "empty" : "neutral",
    );
  }
});

loadFiltersFromUrl();
loadRetirements();
