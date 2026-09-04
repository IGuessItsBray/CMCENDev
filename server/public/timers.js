(function () {
  const COUNTDOWN_INTERVAL_MS = 1000;
  const TIMER_DISMISSAL_DURATION_MS = 24 * 60 * 60 * 1000;
  const TIMER_CACHE_KEY_PREFIX = "cmcen.active-timers.";
  const TIMER_DISMISSAL_KEY_PREFIX = "cmcen.dismissed-timer.";
  let timersRoots = [];
  let countdownInterval = 0;
  let activeTimers = [];
  const dismissedTimerKeys = new Set();

  function localized(value = {}) {
    return CMCENUtils.getLocalizedText(value);
  }

  function getTimerMessage(timer) {
    const language = CMCENUtils.getCurrentLanguage();
    const frenchText = String(timer.text?.fr || "").trim();
    const englishText = String(timer.text?.en || "").trim();

    // Older non-countdown banners were saved with the new-banner French
    // placeholder. Preserve their existing English notice until an editor
    // supplies a French translation instead of replacing it with that label.
    if (
      language === "fr" &&
      !timer.countdownAt &&
      /^compte à rebours$/iu.test(frenchText) &&
      englishText
    ) {
      return englishText;
    }

    return localized(timer.text) || timer.title || "Countdown";
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

  function getTimerDismissalKey(timer) {
    const id = String(timer?._id || "").trim();
    const fallback = [
      timer?.title,
      timer?.text?.en,
      timer?.text?.fr,
      timer?.startsAt,
      timer?.endsAt,
      timer?.countdownAt,
      timer?.placement,
      timer?.screenPosition,
    ].join("|");
    const identity = id || fallback;
    const revision = String(timer?.updatedAt || "").trim();

    return `${TIMER_DISMISSAL_KEY_PREFIX}${encodeURIComponent(
      `${identity}|${revision}`,
    )}`;
  }

  function isTimerDismissed(timer) {
    const key = getTimerDismissalKey(timer);

    if (dismissedTimerKeys.has(key)) return true;

    try {
      const storedExpiry = localStorage.getItem(key);

      if (storedExpiry === null) return false;

      const expiresAt = Number(storedExpiry);

      if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        dismissedTimerKeys.add(key);
        return true;
      }

      localStorage.removeItem(key);
    } catch (error) {
      // A visitor can still dismiss a banner for the rest of this page view.
    }

    return false;
  }

  function dismissTimer(key) {
    dismissedTimerKeys.add(key);

    try {
      localStorage.setItem(
        key,
        String(Date.now() + TIMER_DISMISSAL_DURATION_MS),
      );
    } catch (error) {
      // Storage can be disabled; retain the dismissal until the page reloads.
    }
  }

  function getTimerDismissLabel() {
    return CMCENUtils.getCurrentLanguage() === "fr"
      ? "Masquer cette bannière pendant 24 heures"
      : "Dismiss this banner for 24 hours";
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
    banner.setAttribute("role", "status");
    banner.style.setProperty("--timer-background", timer.color || "#202642");
    banner.style.setProperty("--timer-text", timer.textColor || "#ffffff");

    const track = document.createElement("div");
    track.className = "site-timer-track";

    const accent = document.createElement("span");
    accent.className = "site-timer-accent";
    accent.setAttribute("aria-hidden", "true");
    accent.textContent = "!";
    track.append(accent);

    const text = document.createElement("span");
    text.className = "site-timer-text";
    const message = document.createElement("span");
    message.className = "site-timer-message";
    appendLinkedText(message, getTimerMessage(timer));
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

    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "site-timer-dismiss";
    dismissButton.setAttribute("aria-label", getTimerDismissLabel());
    dismissButton.title = getTimerDismissLabel();
    dismissButton.dataset.timerDismissalKey = getTimerDismissalKey(timer);
    const dismissIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    dismissIcon.classList.add("site-timer-dismiss-icon");
    dismissIcon.setAttribute("aria-hidden", "true");
    dismissIcon.setAttribute("focusable", "false");
    dismissIcon.setAttribute("viewBox", "0 0 24 24");

    [
      ["6", "6", "18", "18"],
      ["18", "6", "6", "18"],
    ].forEach(([x1, y1, x2, y2]) => {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("stroke-width", "2.5");
      dismissIcon.append(line);
    });

    dismissButton.append(dismissIcon);
    track.append(dismissButton);

    banner.append(track);

    return banner;
  }

  function updateCountdowns(root) {
    root.querySelectorAll("[data-countdown-at]").forEach((element) => {
      const target = new Date(element.dataset.countdownAt || "");

      if (!Number.isNaN(target.getTime())) {
        element.textContent = formatCountdown(target);
      }
    });
  }

  function stopCountdownUpdates() {
    if (countdownInterval) {
      window.clearInterval(countdownInterval);
      countdownInterval = 0;
    }
  }

  function hasVisibleCountdown() {
    return timersRoots.some((root) =>
      root.querySelector("[data-countdown-at]"),
    );
  }

  function clearTimers() {
    stopCountdownUpdates();

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
    root.addEventListener("click", (event) => {
      const dismissButton = event.target.closest?.(".site-timer-dismiss");

      if (!dismissButton || !root.contains(dismissButton)) return;

      const banner = dismissButton.closest(".site-timer");
      const dismissalKey = dismissButton.dataset.timerDismissalKey;

      if (!banner || !dismissalKey) return;

      dismissTimer(dismissalKey);
      banner.remove();

      if (!root.querySelector(".site-timer")) {
        root.remove();
        timersRoots = timersRoots.filter((timerRoot) => timerRoot !== root);
      }

      if (!hasVisibleCountdown()) {
        stopCountdownUpdates();
      }

      updateHeaderOffset();
    });

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

    const visibleTimers = activeTimers.filter(
      (timer) => !isTimerDismissed(timer),
    );

    if (!visibleTimers.length || !document.body) return;

    const header = getHeader();
    const headerTimers = visibleTimers.filter(
      (timer) => timer.screenPosition !== "below-header",
    );
    const belowHeaderTimers = visibleTimers.filter(
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

    if (hasVisibleCountdown()) {
      countdownInterval = window.setInterval(
        () => timersRoots.forEach(updateCountdowns),
        COUNTDOWN_INTERVAL_MS,
      );
    }
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
    } catch (error) {}
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
  window.addEventListener("resize", updateHeaderOffset);
})();
