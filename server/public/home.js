const homeEventsList = document.getElementById("homeEventsList");
const homeEventsMessage = document.getElementById("homeEventsMessage");
const homeRetirementsList = document.getElementById("homeRetirementsList");
const homeRetirementsMessage = document.getElementById(
  "homeRetirementsMessage",
);
const homeNewsRail = document.getElementById("homeNewsRail");
const homeNewsMessage = document.getElementById("homeNewsMessage");

let homeEvents = [];
let homeRetirementMessages = [];
let homeEventsState = "loading";
let homeRetirementsState = "loading";
let homeNewsItems = [];
let homeNewsState = "loading";

function getHomeLanguage() {
  return CMCENUtils.getCurrentLanguage();
}

function getHomeLocale(language) {
  return language === "fr" ? "fr-CA" : "en-CA";
}

function getHomeLocalizedText(value, language) {
  return CMCENUtils.getLocalizedText(value, language);
}

function getHomeTranslation(key, replacements = {}) {
  if (typeof translate === "function") {
    return translate(key, replacements);
  }

  return key;
}

function setHomeMessage(element, message, type = "neutral") {
  if (!element) return;

  element.textContent = message;
  element.className = `home-feed-message is-${type}`;
  element.hidden = false;
}

function clearHomeMessage(element) {
  if (!element) return;

  element.hidden = true;
}

function formatHomeEventDate(event, language) {
  const startDate = new Date(event.startDate);

  if (Number.isNaN(startDate.getTime())) {
    return "";
  }

  return CMCENUtils.formatDate(event.startDate, {
    locale: getHomeLocale(language),
    month: "short",
    day: "numeric",
    ...(event.allDay ? { timeZone: "UTC" } : {}),
  });
}

function formatHomeEventTime(event, language) {
  if (event.allDay) {
    return getHomeTranslation("all_day");
  }

  const startDate = new Date(event.startDate);

  if (Number.isNaN(startDate.getTime())) {
    return "";
  }

  return CMCENUtils.formatDate(event.startDate, {
    locale: getHomeLocale(language),
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRetireeName(retirementMessage) {
  const { name } = CMCENUtils.getRetireeNameParts(retirementMessage.retiree);

  return name || getHomeTranslation("retirement_card_default_name");
}

function formatRetirementMeta(retirementMessage, language) {
  const retiree = retirementMessage.retiree || {};
  const details = [];

  if (retiree.tradeRole) {
    details.push(retiree.tradeRole);
  }

  if (retiree.retirementDate) {
    const date = new Date(retiree.retirementDate);

    if (!Number.isNaN(date.getTime())) {
      details.push(
        CMCENUtils.formatDate(retiree.retirementDate, {
          locale: getHomeLocale(language),
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }),
      );
    }
  }

  return details.join(" / ");
}

function getHomeCommentCount(retirementMessage) {
  return typeof retirementMessage.commentCount === "number"
    ? retirementMessage.commentCount
    : 0;
}

function formatHomeCommentCount(count) {
  return getHomeTranslation(
    count === 1 ? "retirement_comment_singular" : "retirement_comment_plural",
    { count },
  );
}

function isHomeRetirementPlaceholderPhoto(photoUrl) {
  if (!photoUrl) {
    return false;
  }

  try {
    const url = new URL(photoUrl, window.location.origin);
    const pathname = url.pathname.toLowerCase();
    const fileName = pathname.split("/").pop();

    return (
      fileName === "logo.png" ||
      fileName.includes("cmcen-crest") ||
      pathname.includes("/branch-crest/") ||
      pathname.includes("/legacy/wordpress/348036/")
    );
  } catch (error) {
    const pathname = String(photoUrl).toLowerCase().split(/[?#]/)[0];
    const fileName = pathname.split("/").pop();

    return (
      fileName === "logo.png" ||
      fileName.includes("cmcen-crest") ||
      pathname.includes("/branch-crest/") ||
      pathname.includes("/legacy/wordpress/348036/")
    );
  }
}

function createHomeRetirementPlaceholderImage() {
  const image = document.createElement("img");

  image.className = "home-retirement-photo-placeholder";
  image.src = "/images/logo.png";
  image.alt = "";
  image.loading = "lazy";
  image.setAttribute("aria-hidden", "true");

  return image;
}

function createHomeRetirementMedia(retirementMessage, name) {
  const media = document.createElement("span");
  media.className = "home-retirement-photo";

  if (retirementMessage.photoUrl) {
    const image = document.createElement("img");
    const displayPhotoUrl =
      retirementMessage.photoDisplayUrl || retirementMessage.photoUrl;
    const isPlaceholderPhoto = isHomeRetirementPlaceholderPhoto(
      retirementMessage.photoUrl,
    );

    image.src = isPlaceholderPhoto ? "/images/logo.png" : displayPhotoUrl;
    image.alt = isPlaceholderPhoto
      ? ""
      : getHomeTranslation("retirement_photo_alt", { name });
    image.loading = "lazy";

    if (isPlaceholderPhoto) {
      image.className = "home-retirement-photo-placeholder";
      image.setAttribute("aria-hidden", "true");
    }

    media.appendChild(image);
    return media;
  }

  media.appendChild(createHomeRetirementPlaceholderImage());
  return media;
}

function createHomeEventItem(event, language) {
  const item = document.createElement("a");
  item.className = "home-feed-item home-event-item";
  item.href = `/event?id=${encodeURIComponent(event._id)}`;

  const date = document.createElement("span");
  date.className = "home-feed-date";
  date.textContent = formatHomeEventDate(event, language);

  const content = document.createElement("span");
  content.className = "home-feed-content";

  const title = document.createElement("strong");
  title.textContent =
    getHomeLocalizedText(event.title, language) ||
    getHomeTranslation("home_event_untitled");

  const meta = document.createElement("span");
  meta.className = "home-feed-meta";

  const location =
    getHomeLocalizedText(event.location, language) ||
    [event.city, event.provinceRegion].filter(Boolean).join(", ");

  meta.textContent = [
    formatHomeEventTime(event, language),
    location || getHomeTranslation("home_event_location_pending"),
  ]
    .filter(Boolean)
    .join(" / ");

  content.append(title, meta);
  item.append(date, content);

  return item;
}

function createHomeRetirementItem(retirementMessage, language) {
  const item = document.createElement("a");
  const name = formatRetireeName(retirementMessage);

  item.className = "home-feed-item home-retirement-item";
  item.href = `/retirement-message?id=${encodeURIComponent(
    retirementMessage._id,
  )}`;

  const media = createHomeRetirementMedia(retirementMessage, name);

  const content = document.createElement("span");
  content.className = "home-feed-content";

  const title = document.createElement("strong");
  title.textContent = name;

  const meta = document.createElement("span");
  meta.className = "home-feed-meta";

  const retirementMeta = formatRetirementMeta(retirementMessage, language);

  meta.textContent =
    retirementMeta || getHomeTranslation("retirement_mosid_pending");

  const comments = document.createElement("span");
  comments.className = "home-feed-note";
  comments.textContent = formatHomeCommentCount(
    getHomeCommentCount(retirementMessage),
  );

  content.append(title, meta, comments);
  item.append(media, content);

  return item;
}

function createHomeFeedSkeleton({ withMedia = false } = {}) {
  const item = document.createElement("div");
  item.className = "home-feed-item home-feed-item--skeleton";
  item.setAttribute("aria-hidden", "true");
  item.appendChild(
    CMCENUtils.createSkeleton(
      withMedia ? "skeleton--home-media" : "skeleton--home-date",
    ),
  );

  const content = document.createElement("span");
  content.className = "home-feed-content";
  content.append(
    CMCENUtils.createSkeleton("skeleton--line skeleton--line-title"),
    CMCENUtils.createSkeleton("skeleton--line skeleton--line-medium"),
    CMCENUtils.createSkeleton("skeleton--line skeleton--line-short"),
  );
  item.appendChild(content);

  return item;
}

function getHomeNewsDate(value, language) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return CMCENUtils.formatDate(value, {
    locale: getHomeLocale(language),
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function createHomeNewsItem(item, language) {
  const link = document.createElement("a");
  link.className = "home-news-card";
  link.href =
    item.type === "lastPost"
      ? `/last-post-message?id=${encodeURIComponent(item._id)}`
      : `/news-story?id=${encodeURIComponent(item._id)}`;

  if (item.imageUrl) {
    const image = document.createElement("img");
    image.src = item.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    link.appendChild(image);
  }

  const content = document.createElement("span");
  content.className = "home-news-card-content";
  const type = document.createElement("span");
  type.className = "home-news-card-type";
  type.textContent = item.type === "lastPost" ? "Last Post" : "News";
  const title = document.createElement("strong");
  title.textContent =
    getHomeLocalizedText(item.title, language) ||
    (item.type === "lastPost" ? "In Memoriam" : "News story");
  const date = document.createElement("span");
  date.className = "home-news-card-date";
  date.textContent = getHomeNewsDate(item.publishedAt, language);
  content.append(type, title, date);
  link.appendChild(content);
  return link;
}

function renderHomeNews() {
  const language = getHomeLanguage();
  homeNewsRail?.replaceChildren();

  if (homeNewsState === "loading") {
    homeNewsRail?.append(
      ...Array.from({ length: 4 }, () => {
        const item = document.createElement("div");
        item.className = "home-news-card home-news-card--skeleton";
        item.append(CMCENUtils.createSkeleton("skeleton--home-media"));
        return item;
      }),
    );
    setHomeMessage(homeNewsMessage, "Loading news and stories...");
    return;
  }
  if (homeNewsState === "error") {
    setHomeMessage(
      homeNewsMessage,
      "News and stories could not be loaded.",
      "error",
    );
    return;
  }
  if (!homeNewsItems.length) {
    setHomeMessage(
      homeNewsMessage,
      "No news or Last Post notices have been published yet.",
      "empty",
    );
    return;
  }
  clearHomeMessage(homeNewsMessage);
  homeNewsItems.forEach((item) =>
    homeNewsRail?.appendChild(createHomeNewsItem(item, language)),
  );
}

function renderHomeEvents() {
  const language = getHomeLanguage();

  homeEventsList?.replaceChildren();

  if (homeEventsState === "loading") {
    homeEventsList?.append(
      ...Array.from({ length: 3 }, () => createHomeFeedSkeleton()),
    );
    setHomeMessage(
      homeEventsMessage,
      getHomeTranslation("home_events_loading"),
    );
    return;
  }

  if (homeEventsState === "error") {
    setHomeMessage(
      homeEventsMessage,
      getHomeTranslation("events_load_error"),
      "error",
    );
    return;
  }

  if (!homeEvents.length) {
    setHomeMessage(
      homeEventsMessage,
      getHomeTranslation("no_upcoming_events"),
      "empty",
    );
    return;
  }

  clearHomeMessage(homeEventsMessage);

  homeEvents.slice(0, 3).forEach((event) => {
    homeEventsList?.appendChild(createHomeEventItem(event, language));
  });
}

function renderHomeRetirements() {
  const language = getHomeLanguage();

  homeRetirementsList?.replaceChildren();

  if (homeRetirementsState === "loading") {
    homeRetirementsList?.append(
      ...Array.from({ length: 3 }, () =>
        createHomeFeedSkeleton({ withMedia: true }),
      ),
    );
    setHomeMessage(
      homeRetirementsMessage,
      getHomeTranslation("home_retirements_loading"),
    );
    return;
  }

  if (homeRetirementsState === "error") {
    setHomeMessage(
      homeRetirementsMessage,
      getHomeTranslation("retirements_load_error"),
      "error",
    );
    return;
  }

  if (!homeRetirementMessages.length) {
    setHomeMessage(
      homeRetirementsMessage,
      getHomeTranslation("retirements_empty"),
      "empty",
    );
    return;
  }

  clearHomeMessage(homeRetirementsMessage);

  homeRetirementMessages.slice(0, 3).forEach((retirementMessage) => {
    homeRetirementsList?.appendChild(
      createHomeRetirementItem(retirementMessage, language),
    );
  });
}

async function loadHomeEvents() {
  try {
    const response = await fetch("/api/events");
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not load events");
    }

    homeEvents = Array.isArray(data.events)
      ? data.events.sort(
          (firstEvent, secondEvent) =>
            new Date(firstEvent.startDate) - new Date(secondEvent.startDate),
        )
      : [];
    homeEventsState = "ready";
  } catch (error) {
    console.error("Homepage events failed to load:", error);
    homeEventsState = "error";
  }

  renderHomeEvents();
}

async function loadHomeRetirements() {
  try {
    const response = await fetch("/api/retirement-messages?limit=3");
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not load retirement messages");
    }

    homeRetirementMessages = Array.isArray(data.retirementMessages)
      ? data.retirementMessages
      : [];
    homeRetirementsState = "ready";
  } catch (error) {
    console.error("Homepage retirement messages failed to load:", error);
    homeRetirementsState = "error";
  }

  renderHomeRetirements();
}

async function loadHomeNews() {
  try {
    const response = await fetch("/api/news/feed?limit=10");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load news");
    homeNewsItems = Array.isArray(data.items) ? data.items : [];
    homeNewsState = "ready";
  } catch (error) {
    console.error("Homepage news failed to load:", error);
    homeNewsState = "error";
  }
  renderHomeNews();
}

document.addEventListener("languagechange", () => {
  renderHomeEvents();
  renderHomeRetirements();
  renderHomeNews();
});

renderHomeEvents();
renderHomeRetirements();
renderHomeNews();
loadHomeEvents();
loadHomeRetirements();
loadHomeNews();
