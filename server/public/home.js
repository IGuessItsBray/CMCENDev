const homeEventsList = document.getElementById("homeEventsList");
const homeEventsMessage = document.getElementById("homeEventsMessage");
const homeRetirementsList = document.getElementById("homeRetirementsList");
const homeRetirementsMessage =
  document.getElementById("homeRetirementsMessage");

let homeEvents = [];
let homeRetirementMessages = [];
let homeEventsState = "loading";
let homeRetirementsState = "loading";

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
    ...(event.allDay ? { timeZone: "UTC" } : {})
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
    minute: "2-digit"
  });
}

function formatRetireeName(retirementMessage) {
  const retiree = retirementMessage.retiree || {};

  return [
    retiree.rank,
    retiree.firstName,
    retiree.lastName
  ]
    .filter(Boolean)
    .join(" ") ||
    getHomeTranslation("retirement_card_default_name");
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
          timeZone: "UTC"
        })
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
    count === 1
      ? "retirement_comment_singular"
      : "retirement_comment_plural",
    { count }
  );
}

function isHomeRetirementPlaceholderPhoto(photoUrl) {
  if (!photoUrl) {
    return false;
  }

  try {
    const url =
      new URL(photoUrl, window.location.origin);
    const pathname =
      url.pathname.toLowerCase();
    const fileName =
      pathname.split("/").pop();

    return fileName === "logo.png" ||
      fileName.includes("cmcen-crest") ||
      pathname.includes("/legacy/wordpress/348036/");
  } catch (error) {
    const pathname =
      String(photoUrl)
        .toLowerCase()
        .split(/[?#]/)[0];
    const fileName =
      pathname.split("/").pop();

    return fileName === "logo.png" ||
      fileName.includes("cmcen-crest") ||
      pathname.includes("/legacy/wordpress/348036/");
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
    const isPlaceholderPhoto =
      isHomeRetirementPlaceholderPhoto(
        retirementMessage.photoUrl
      );

    image.src = isPlaceholderPhoto
      ? "/images/logo.png"
      : retirementMessage.photoUrl;
    image.alt = isPlaceholderPhoto
      ? ""
      : getHomeTranslation(
        "retirement_photo_alt",
        { name }
      );
    image.loading = "lazy";

    if (isPlaceholderPhoto) {
      image.className =
        "home-retirement-photo-placeholder";
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
  item.href =
    `/event.html?id=${encodeURIComponent(event._id)}`;

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
    location || getHomeTranslation("home_event_location_pending")
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
  item.href =
    `/retirement-message.html?id=${encodeURIComponent(
      retirementMessage._id
    )}`;

  const media = createHomeRetirementMedia(
    retirementMessage,
    name
  );

  const content = document.createElement("span");
  content.className = "home-feed-content";

  const title = document.createElement("strong");
  title.textContent = name;

  const meta = document.createElement("span");
  meta.className = "home-feed-meta";

  const retirementMeta = formatRetirementMeta(
    retirementMessage,
    language
  );

  meta.textContent = retirementMeta ||
    getHomeTranslation("retirement_mosid_pending");

  const comments = document.createElement("span");
  comments.className = "home-feed-note";
  comments.textContent = formatHomeCommentCount(
    getHomeCommentCount(retirementMessage)
  );

  content.append(title, meta, comments);
  item.append(media, content);

  return item;
}

function renderHomeEvents() {
  const language = getHomeLanguage();

  homeEventsList?.replaceChildren();

  if (homeEventsState === "loading") {
    setHomeMessage(
      homeEventsMessage,
      getHomeTranslation("home_events_loading")
    );
    return;
  }

  if (homeEventsState === "error") {
    setHomeMessage(
      homeEventsMessage,
      getHomeTranslation("events_load_error"),
      "error"
    );
    return;
  }

  if (!homeEvents.length) {
    setHomeMessage(
      homeEventsMessage,
      getHomeTranslation("no_upcoming_events"),
      "empty"
    );
    return;
  }

  clearHomeMessage(homeEventsMessage);

  homeEvents
    .slice(0, 3)
    .forEach(event => {
      homeEventsList?.appendChild(
        createHomeEventItem(event, language)
      );
    });
}

function renderHomeRetirements() {
  const language = getHomeLanguage();

  homeRetirementsList?.replaceChildren();

  if (homeRetirementsState === "loading") {
    setHomeMessage(
      homeRetirementsMessage,
      getHomeTranslation("home_retirements_loading")
    );
    return;
  }

  if (homeRetirementsState === "error") {
    setHomeMessage(
      homeRetirementsMessage,
      getHomeTranslation("retirements_load_error"),
      "error"
    );
    return;
  }

  if (!homeRetirementMessages.length) {
    setHomeMessage(
      homeRetirementsMessage,
      getHomeTranslation("retirements_empty"),
      "empty"
    );
    return;
  }

  clearHomeMessage(homeRetirementsMessage);

  homeRetirementMessages
    .slice(0, 3)
    .forEach(retirementMessage => {
      homeRetirementsList?.appendChild(
        createHomeRetirementItem(
          retirementMessage,
          language
        )
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
            new Date(firstEvent.startDate) -
            new Date(secondEvent.startDate)
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
    const response = await fetch("/api/retirement-messages");
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error ||
          "Could not load retirement messages"
      );
    }

    homeRetirementMessages =
      Array.isArray(data.retirementMessages)
        ? data.retirementMessages
        : [];
    homeRetirementsState = "ready";
  } catch (error) {
    console.error(
      "Homepage retirement messages failed to load:",
      error
    );
    homeRetirementsState = "error";
  }

  renderHomeRetirements();
}

document.addEventListener("languagechange", () => {
  renderHomeEvents();
  renderHomeRetirements();
});

renderHomeEvents();
renderHomeRetirements();
loadHomeEvents();
loadHomeRetirements();
