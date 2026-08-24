(function () {
  const COUNTDOWN_INTERVAL_MS = 1000;
  const TIMER_CACHE_KEY_PREFIX = "cmcen.active-timers.";
  let timersRoots = [];
  let countdownInterval = 0;
  let activeTimers = [];

  function localized(value = {}) {
    return CMCENUtils.getLocalizedText(value);
  }

  function formatCountdown(targetDate) {
    const remaining = Math.max(targetDate.getTime() - Date.now(), 0);
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }

    return `${hours}h ${minutes}m ${seconds}s`;
  }

  function getScope() {
    return window.location.pathname === "/" ||
      window.location.pathname === "/index"
      ? "home"
      : "global";
  }

  function getCacheKey(scope = getScope()) {
    return `${TIMER_CACHE_KEY_PREFIX}${scope}`;
  }

  function readCachedTimers(scope = getScope()) {
    try {
      const cached = JSON.parse(
        sessionStorage.getItem(getCacheKey(scope)) || "null",
      );

      if (
        !cached ||
        !Array.isArray(cached.timers) ||
        !Number.isFinite(cached.savedAt)
      ) {
        return null;
      }

      return cached.timers;
    } catch (error) {
      return null;
    }
  }

  function writeTimerCache(scope, timers) {
    try {
      sessionStorage.setItem(
        getCacheKey(scope),
        JSON.stringify({
          savedAt: Date.now(),
          timers,
        }),
      );
    } catch (error) {
      // Browsers can disable session storage; banners still load normally.
    }
  }

  function cacheTimers(timers) {
    const scope = getScope();
    writeTimerCache(scope, timers);

    if (scope === "home") {
      writeTimerCache(
        "global",
        timers.filter((timer) => timer.placement === "global"),
      );
    }
  }

  function getCachedTimersForCurrentScope() {
    const scope = getScope();
    const timers = readCachedTimers(scope);

    if (timers !== null) {
      return timers;
    }

    const otherScope = scope === "home" ? "global" : "home";
    const sharedTimers = readCachedTimers(otherScope);

    if (sharedTimers === null) {
      return [];
    }

    return sharedTimers.filter((timer) => timer.placement === "global");
  }

  function timersMatch(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
  }

  function appendLinkedText(element, value) {
    const text = String(value || "");
    const urlPattern = /https?:\/\/[^\s<>'"]+/giu;
    let lastIndex = 0;

    for (const match of text.matchAll(urlPattern)) {
      const matchedUrl = match[0];
      const trailingPunctuation = matchedUrl.match(/[.,!?;:]+$/u)?.[0] || "";
      const url = matchedUrl.slice(
        0,
        matchedUrl.length - trailingPunctuation.length,
      );
      const index = match.index || 0;

      if (index > lastIndex) {
        element.append(document.createTextNode(text.slice(lastIndex, index)));
      }

      try {
        const destination = new URL(url);

        if (
          destination.protocol !== "http:" &&
          destination.protocol !== "https:"
        ) {
          throw new Error("Unsupported banner link protocol");
        }

        const link = document.createElement("a");
        link.href = destination.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = url;
        element.append(link);
      } catch (error) {
        element.append(document.createTextNode(url));
      }

      if (trailingPunctuation) {
        element.append(document.createTextNode(trailingPunctuation));
      }

      lastIndex = index + matchedUrl.length;
    }

    if (lastIndex < text.length) {
      element.append(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function createTimerElement(timer) {
    const banner = document.createElement("aside");
    banner.className = "site-timer";
    banner.style.setProperty("--timer-background", timer.color || "#202642");
    banner.style.setProperty("--timer-text", timer.textColor || "#ffffff");

    const track = document.createElement("div");
    track.className = "site-timer-track";

    const text = document.createElement("span");
    text.className = "site-timer-text";
    const message = document.createElement("span");
    message.className = "site-timer-message";
    appendLinkedText(message, localized(timer.text) || timer.title || "Countdown");
    text.append(message);
    track.append(text);

    if (timer.countdownAt) {
      const target = new Date(timer.countdownAt);

      if (!Number.isNaN(target.getTime())) {
        const countdown = document.createElement("strong");
        countdown.className = "site-timer-countdown";
        countdown.dataset.countdownAt = target.toISOString();
        countdown.textContent = formatCountdown(target);
        track.append(countdown);
      }
    }

    banner.append(track);

    requestAnimationFrame(() => updateMarqueeState(banner));

    return banner;
  }

  function updateMarqueeState(banner) {
    const track = banner.querySelector(".site-timer-track");
    const text = banner.querySelector(".site-timer-text");
    const message = banner.querySelector(".site-timer-message");

    if (!track || !text || !message) return;

    // Measure the text in its normal, constrained state before enabling motion.
    banner.classList.remove("is-marquee");
    const shouldScroll = text.scrollWidth > text.clientWidth;
    banner.classList.toggle("is-marquee", shouldScroll);

    if (shouldScroll) {
      // About 28 pixels per second keeps notice copy comfortable to read.
      const durationSeconds = Math.max(16, Math.ceil(message.scrollWidth / 28));
      banner.style.setProperty(
        "--site-timer-marquee-duration",
        `${durationSeconds}s`,
      );
    } else {
      banner.style.removeProperty("--site-timer-marquee-duration");
    }
  }

  function updateMarqueeStates() {
    timersRoots.forEach((root) => {
      root.querySelectorAll(".site-timer").forEach(updateMarqueeState);
    });
  }

  function updateCountdowns(root) {
    root.querySelectorAll("[data-countdown-at]").forEach((element) => {
      const target = new Date(element.dataset.countdownAt || "");

      if (!Number.isNaN(target.getTime())) {
        element.textContent = formatCountdown(target);
      }
    });
  }

  function clearTimers() {
    if (countdownInterval) {
      window.clearInterval(countdownInterval);
      countdownInterval = 0;
    }

    timersRoots.forEach((root) => root.remove());
    timersRoots = [];
  }

  function getHeader() {
    const header = document.getElementById("header");
    return header?.classList.contains("site-header") ? header : null;
  }

  function updateHeaderOffset() {
    const header = getHeader();

    if (header) {
      document.documentElement.style.setProperty(
        "--site-header-height",
        `${header.offsetHeight}px`,
      );
    }
  }

  function appendTimers(timers, screenPosition, header) {
    const root = document.createElement("div");
    root.className = "site-timers";
    root.classList.toggle(
      "site-timers-below-header",
      screenPosition === "below-header",
    );
    timers.forEach((timer) => root.append(createTimerElement(timer)));

    if (!header) {
      document.body.prepend(root);
    } else if (screenPosition === "below-header") {
      header.insertAdjacentElement("afterend", root);
    } else {
      header.prepend(root);
    }

    return root;
  }

  function renderTimers() {
    clearTimers();

    if (!activeTimers.length || !document.body) return;

    const header = getHeader();
    const headerTimers = activeTimers.filter(
      (timer) => timer.screenPosition !== "below-header",
    );
    const belowHeaderTimers = activeTimers.filter(
      (timer) => timer.screenPosition === "below-header",
    );

    if (headerTimers.length) {
      timersRoots.push(appendTimers(headerTimers, "header", header));
    }

    if (belowHeaderTimers.length) {
      timersRoots.push(appendTimers(belowHeaderTimers, "below-header", header));
    }

    updateHeaderOffset();
    timersRoots.forEach(updateCountdowns);
    countdownInterval = window.setInterval(
      () => timersRoots.forEach(updateCountdowns),
      COUNTDOWN_INTERVAL_MS,
    );
  }

  async function loadTimers() {
    try {
      const data = await CMCENUtils.apiJson(
        `/api/timers/active?scope=${encodeURIComponent(getScope())}`,
        { errorMessage: "Banners unavailable" },
      );
      const nextTimers = Array.isArray(data.timers) ? data.timers : [];
      cacheTimers(nextTimers);

      if (!timersMatch(activeTimers, nextTimers)) {
        activeTimers = nextTimers;
        renderTimers();
      }
    } catch (error) {
    }
  }

  window.CMCENTimers = {
    reload: loadTimers,
  };

  activeTimers = getCachedTimersForCurrentScope();

  if (activeTimers.length) {
    if (document.body) {
      renderTimers();
    } else {
      document.addEventListener("DOMContentLoaded", renderTimers, {
        once: true,
      });
    }
  }

  loadTimers();

  document.addEventListener("languagechange", renderTimers);
  document.addEventListener("cmcenheaderready", renderTimers);
  window.addEventListener("resize", () => {
    updateHeaderOffset();
    updateMarqueeStates();
  });
})();
