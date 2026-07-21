(function () {
  const COUNTDOWN_INTERVAL_MS = 1000;
  let timersRoot = null;
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
    return window.location.pathname === "/" || window.location.pathname === "/index"
      ? "home"
      : "global";
  }

  function createTimerElement(timer) {
    const banner = document.createElement("aside");
    banner.className = "site-timer";
    banner.style.setProperty("--timer-background", timer.color || "#1d4ed8");
    banner.style.setProperty("--timer-text", timer.textColor || "#ffffff");

    const track = document.createElement("div");
    track.className = "site-timer-track";

    const text = document.createElement("span");
    text.className = "site-timer-text";
    text.textContent = localized(timer.text) || timer.title || "Countdown";
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

    requestAnimationFrame(() => {
      banner.classList.toggle("is-marquee", text.scrollWidth > track.clientWidth);
    });

    return banner;
  }

  function updateCountdowns(root) {
    root.querySelectorAll("[data-countdown-at]").forEach(element => {
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

    if (timersRoot) {
      timersRoot.remove();
      timersRoot = null;
    }
  }

  function renderTimers() {
    clearTimers();

    if (!activeTimers.length) return;

    const root = document.createElement("div");
    root.className = "site-timers";
    activeTimers.forEach(timer => root.append(createTimerElement(timer)));
    document.body.prepend(root);
    timersRoot = root;
    updateCountdowns(root);
    countdownInterval = window.setInterval(
      () => updateCountdowns(root),
      COUNTDOWN_INTERVAL_MS
    );
  }

  async function loadTimers() {
    try {
      clearTimers();
      activeTimers = [];

      const data = await CMCENUtils.apiJson(
        `/api/timers/active?scope=${encodeURIComponent(getScope())}`,
        { errorMessage: "Banners unavailable" }
      );
      activeTimers = Array.isArray(data.timers) ? data.timers : [];
      renderTimers();
    } catch (error) {
      console.warn("Banners unavailable:", error);
    }
  }

  window.CMCENTimers = {
    reload: loadTimers
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadTimers);
  } else {
    loadTimers();
  }

  document.addEventListener("languagechange", renderTimers);
})();
