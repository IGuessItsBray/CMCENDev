// the header'z dropdown menus are built from this
const themeStorageKey = "theme";
const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function setHeadElement(selector, attributes) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement("meta");
    document.head.append(element);
  }

  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
}

function configureSiteMetadata() {
  const url = new URL(window.location.href);
  ["fbclid", "gclid"].forEach((name) => url.searchParams.delete(name));
  [...url.searchParams.keys()]
    .filter((name) => name.toLowerCase().startsWith("utm_"))
    .forEach((name) => url.searchParams.delete(name));
  url.hash = "";

  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = url.href;

  if (!document.head.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/site.webmanifest";
    document.head.append(manifest);
  }

  setHeadElement('meta[name="theme-color"]', {
    name: "theme-color",
    content: "#202642",
  });

  const description =
    document.head.querySelector('meta[name="description"]')?.content ||
    document.querySelector("main h1 + p")?.textContent?.trim() ||
    "Canadian Military Communications and Electronics Network.";
  setHeadElement('meta[name="description"]', {
    name: "description",
    content: description,
  });
  setHeadElement('meta[property="og:title"]', {
    property: "og:title",
    content: document.title,
  });
  setHeadElement('meta[property="og:description"]', {
    property: "og:description",
    content: description,
  });
  setHeadElement('meta[property="og:type"]', {
    property: "og:type",
    content: "website",
  });
  setHeadElement('meta[property="og:url"]', {
    property: "og:url",
    content: canonical.href,
  });
  setHeadElement('meta[property="og:image"]', {
    property: "og:image",
    content: `${window.location.origin}/images/logo.png`,
  });
}

configureSiteMetadata();

function getPreferredTheme() {
  const savedTheme = localStorage.getItem(themeStorageKey);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return darkModeQuery.matches ? "dark" : "light";
}

function applyTheme(nextTheme, { persist = true } = {}) {
  const isDark = nextTheme === "dark";

  document.documentElement.dataset.theme = nextTheme;

  const themeToggle = document.getElementById("themeToggle");

  if (themeToggle) {
    const isDark = nextTheme === "dark";

    const translateText =
      typeof window.translate === "function"
        ? window.translate
        : (key) => {
            const fallbacks = {
              theme_switch_to_light_label: "Switch to light mode",
              theme_switch_to_dark_label: "Switch to dark mode",
            };

            return fallbacks[key] || key;
          };

    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute(
      "aria-label",
      isDark
        ? translateText("theme_switch_to_light_label")
        : translateText("theme_switch_to_dark_label"),
    );
  }

  if (persist) {
    localStorage.setItem(themeStorageKey, nextTheme);
  }

  document.dispatchEvent(
    new CustomEvent("themechange", {
      bubbles: true,
      detail: { theme: nextTheme },
    }),
  );
}

function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme;

  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

applyTheme(getPreferredTheme(), { persist: false });

darkModeQuery.addEventListener("change", (event) => {
  if (!localStorage.getItem(themeStorageKey)) {
    applyTheme(event.matches ? "dark" : "light", {
      persist: false,
    });
  }
});

document.addEventListener("languagechange", () => {
  applyTheme(document.documentElement.dataset.theme || getPreferredTheme(), {
    persist: false,
  });
  updateDynamicNavigationLabels();
});

const navLinks = {
  about: {
    titleKey: "menu_about_title",
    items: [
      { route: "/about-family", i18n: "menu_about_option_1" },
      { route: "/about_branch.html", i18n: "menu_about_option_2" },
      { route: "/about_association.html", i18n: "menu_about_option_3" },
      {
        route: "/about_museum_foundation.html",
        label: { en: "About the C&E Museum & Foundation", fr: "Musée et Fondation des C et E" },
      },
    ],
  },
  doctrine: {
    titleKey: "menu_doctrine_title",
    items: [
      { route: "/doctrine_hub.html", i18n: "menu_doctrine_option_1" },
      { route: "/awards.html", i18n: "menu_doctrine_option_2" },
    ],
  },
  news: {
    titleKey: "menu_news_title",
    items: [
      { route: "/calendar", i18n: "menu_news_option_1" },
      {
        route: "/submit-event",
        i18n: "menu_news_option_2",
        permission: "canCreateDrafts",
      },
      {
        route: "/review-submissions",
        i18n: "menu_review_events",
        permission: "canReviewAndPublish",
      },
      { route: "/news_stories.html", i18n: "menu_news_option_3" },
      { route: "/last-post", i18n: "menu_news_option_4" },
      { route: "/retirements", i18n: "menu_news_option_5" },
      { route: "/certificates.html", i18n: "menu_news_option_6" },
      { route: "/promotions.html", i18n: "menu_news_option_7" },
      { route: "/history.html", i18n: "menu_news_option_8" },
      { route: "/gallery.html", i18n: "menu_news_option_9" },
    ],
  },
  benefits: {
    titleKey: "menu_benefits_title",
    items: [
      { route: "/veteran_services.html", i18n: "menu_benefits_option_1" },
      { route: "/cfmws.html", i18n: "menu_benefits_option_2" },
      { route: "/bursaries.html", i18n: "menu_benefits_option_3" },
      { route: "/affiliate_offers.html", i18n: "menu_benefits_option_4" },
      { route: "/support_troops.html", i18n: "menu_benefits_option_5" },
    ],
  },
};

// header links that aren't dropdowns
const standaloneLinks = [
  //{ route: "/contact.html", i18n: "menu_connections", protected: true },
];
let customNavigationItems = [];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCssIdentifier(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function getLocalizedNavigationLabel(label) {
  const language = CMCENUtils?.getCurrentLanguage?.() || "en";
  const fallbackLanguage = language === "fr" ? "en" : "fr";

  return String(label?.[language] || label?.[fallbackLanguage] || "").trim();
}

function updateDynamicNavigationLabels() {
  document
    .querySelectorAll("[data-nav-label-en], [data-nav-label-fr]")
    .forEach((link) => {
      link.textContent = getLocalizedNavigationLabel({
        en: link.dataset.navLabelEn || "",
        fr: link.dataset.navLabelFr || "",
      });
    });
}

function applyCurrentLanguage() {
  if (typeof applyLanguage === "function") {
    applyLanguage(
      typeof currentLang === "string"
        ? currentLang
        : CMCENUtils?.getCurrentLanguage?.() || "en",
    );
  }

  updateDynamicNavigationLabels();
}

// list of only protected pages
const protectedPages = new Set([
  "/dashboard",
  "/notifications",
  "/submit-event",
  "/review-submissions",
  "/translations-admin",
  "/pages-admin",
  "/timers-admin",
  "/admin-users",

  ...Object.values(navLinks)
    .flatMap((dropdown) => dropdown.items)
    .filter((item) => item.protected || item.permission)
    .map((item) => item.route),

  ...standaloneLinks
    .filter((item) => item.protected || item.permission)
    .map((item) => item.route),
]);

function getAccessAttributes(item) {
  if (item.permission) {
    return `data-permission="${item.permission}" hidden`;
  }

  if (item.protected) {
    return "data-auth-required hidden";
  }

  return "";
}

function renderDropdown(dropdown, index) {
  const menuId = `primaryNavigationDropdown${index}`;
  const itemsHtml = dropdown.items
    .map(
      (item) => `
    <li ${getAccessAttributes(item)}>
      <a
        href="${item.route}"
        ${item.label ? `data-nav-label-en="${item.label.en}" data-nav-label-fr="${item.label.fr}"` : `data-i18n="${item.i18n}"`}
      ></a>
    </li>
  `,
    )
    .join("");

  return `
    <div class="dropdown">
      <button
        type="button"
        class="dropdown-toggle"
        data-i18n="${dropdown.titleKey}"
        aria-controls="${menuId}"
        aria-expanded="false"
        aria-haspopup="true"
      ></button>

      <ul
        class="dropdown-menu"
        id="${menuId}"
      >
        ${itemsHtml}
      </ul>
    </div>
  `;
}

function renderStandaloneLink(link) {
  return `
    <a
      ${getAccessAttributes(link)}
      href="${link.route}"
      class="dropdown-toggle"
      data-i18n="${link.i18n}"
    ></a>
  `;
}

function loadHeader() {
  const dropdownsHtml = Object.values(navLinks)
    .map((dropdown, index) => renderDropdown(dropdown, index))
    .join("");

  const standaloneHtml = standaloneLinks.map(renderStandaloneLink).join("");

  const header = document.getElementById("header");
  const main = document.querySelector("main");

  if (main) {
    main.id ||= "mainContent";
    main.tabIndex = -1;
  }

  if (main && !document.querySelector(".skip-link")) {
    const skipLink = document.createElement("a");
    skipLink.className = "skip-link";
    skipLink.href = `#${main.id}`;
    skipLink.dataset.i18n = "skip_to_main_content";
    skipLink.textContent = "Skip to main content";
    skipLink.addEventListener("click", () => {
      window.requestAnimationFrame(() => main.focus());
    });
    document.body.prepend(skipLink);
  }

  header.className = "site-header";
  header.innerHTML = `
    <div class="header-identity-row">
      <div class="header-inner">
        <a
          href="/index"
          class="site-identity"
          aria-label="CMCEN / RCMCE home"
        >
          <img
            src="/images/logo.png"
            alt=""
            class="site-logo"
          />

          <span class="identity-copy">
            <span class="identity-acronym">
              CMCEN <span aria-hidden="true">/</span> RCMCE
            </span>

            <span
              class="identity-name"
              data-i18n="site_name_full"
            ></span>
          </span>
        </a>

        <div class="header-utilities">
          <div class="auth-buttons"></div>

          <button
            type="button"
            class="lang-toggle"
            id="langToggle"
            aria-label="Change language"
            data-i18n-aria-label="change_language"
          >
            FR
          </button>

          <a
            href="/donate.html"
            class="donate-link"
            data-i18n="donate_now"
          >
            Donate
          </a>

          <button
            type="button"
            class="mobile-menu-toggle"
            id="mobileMenuToggle"
            aria-controls="primaryNavigation"
            aria-expanded="false"
            aria-label="Open menu"
          >
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>

    <div class="header-navigation-row">
      <div class="header-inner header-navigation-inner">
        <nav
          class="nav-bar"
          id="primaryNavigation"
          aria-label="Primary navigation"
        >
          ${dropdownsHtml}
          ${standaloneHtml}
        </nav>

        <form
          class="header-search"
          action="/search"
          method="get"
          role="search"
        >
          <label
            for="headerSearchInput"
            class="visually-hidden"
            data-i18n="search_site"
          >
            Search the site
          </label>

          <input
            type="search"
            id="headerSearchInput"
            name="q"
            data-i18n-placeholder="search_placeholder"
            placeholder="Search"
          />

          <button
            type="submit"
            class="header-search-button"
            aria-label="Search"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5"></circle>
              <path d="M16 16l4 4"></path>
            </svg>
          </button>
        </form>

        <div
          class="mobile-menu-account"
          id="mobileMenuAccount"
        ></div>
      </div>
    </div>
  `;

  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const primaryNavigation = document.getElementById("primaryNavigation");
  let suppressNextDesktopDropdownFocusOpen = false;

  function isMobileNavigation() {
    return window.matchMedia("(max-width: 700px)").matches;
  }

  function setMobileDropdownOpen(dropdown, isOpen) {
    dropdown.classList.toggle("is-mobile-dropdown-open", isOpen);
    dropdown
      .querySelector(".dropdown-toggle")
      ?.setAttribute("aria-expanded", String(isOpen));
  }

  function setDesktopDropdownOpen(dropdown, isOpen) {
    if (isMobileNavigation()) return;

    dropdown.classList.toggle("is-dropdown-open", isOpen);
    dropdown
      .querySelector(".dropdown-toggle")
      ?.setAttribute("aria-expanded", String(isOpen));
  }

  function openCurrentMobileDropdown() {
    const currentPath = window.location.pathname;
    const currentLink = primaryNavigation?.querySelector(
      `.dropdown-menu a[href="${currentPath}"]`,
    );
    const currentDropdown = currentLink?.closest(".dropdown");

    if (currentDropdown) {
      setMobileDropdownOpen(currentDropdown, true);
    }
  }

  function updateMobileMenuOffset() {
    header.style.setProperty(
      "--mobile-header-height",
      `${header.offsetHeight}px`,
    );
  }

  function setMobileMenuOpen(isOpen) {
    if (isOpen) {
      updateMobileMenuOffset();
    }

    header.classList.toggle("is-mobile-menu-open", isOpen);
    document.body.classList.toggle("mobile-menu-lock", isOpen);

    mobileMenuToggle?.setAttribute("aria-expanded", String(isOpen));
    mobileMenuToggle?.setAttribute(
      "aria-label",
      isOpen ? "Close menu" : "Open menu",
    );

    if (isOpen) {
      openCurrentMobileDropdown();
    } else {
      primaryNavigation
        ?.querySelectorAll(".dropdown")
        .forEach((dropdown) => setMobileDropdownOpen(dropdown, false));
    }
  }

  mobileMenuToggle?.addEventListener("click", () => {
    setMobileMenuOpen(!header.classList.contains("is-mobile-menu-open"));
  });

  document
    .getElementById("themeToggle")
    ?.addEventListener("click", toggleTheme);
  applyTheme(document.documentElement.dataset.theme || getPreferredTheme(), {
    persist: false,
  });

  primaryNavigation?.addEventListener("click", (event) => {
    const dropdownToggle = event.target.closest(".dropdown-toggle");

    if (dropdownToggle) {
      event.preventDefault();

      const dropdown = dropdownToggle.closest(".dropdown");
      const activeClass = isMobileNavigation()
        ? "is-mobile-dropdown-open"
        : "is-dropdown-open";
      const isOpen = dropdown.classList.contains(activeClass);

      if (isMobileNavigation()) {
        setMobileDropdownOpen(dropdown, !isOpen);
      } else {
        setDesktopDropdownOpen(dropdown, !isOpen);
      }
      return;
    }

    if (event.target.closest("a")) {
      setMobileMenuOpen(false);
    }
  });

  primaryNavigation?.querySelectorAll(".dropdown").forEach((dropdown) => {
    const toggle = dropdown.querySelector(".dropdown-toggle");

    dropdown.addEventListener("mouseenter", () => {
      setDesktopDropdownOpen(dropdown, true);
    });

    dropdown.addEventListener("mouseleave", () => {
      if (!dropdown.contains(document.activeElement)) {
        setDesktopDropdownOpen(dropdown, false);
      }
    });

    dropdown.addEventListener("focusin", () => {
      if (suppressNextDesktopDropdownFocusOpen) {
        suppressNextDesktopDropdownFocusOpen = false;
        return;
      }

      setDesktopDropdownOpen(dropdown, true);
    });

    dropdown.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!dropdown.contains(document.activeElement)) {
          setDesktopDropdownOpen(dropdown, false);
        }
      });
    });

    toggle?.addEventListener("keydown", (event) => {
      if (isMobileNavigation()) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setDesktopDropdownOpen(dropdown, true);
        dropdown.querySelector(".dropdown-menu a")?.focus();
      }
    });

    dropdown.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      if (isMobileNavigation()) {
        setMobileDropdownOpen(dropdown, false);
      } else {
        setDesktopDropdownOpen(dropdown, false);
      }
      suppressNextDesktopDropdownFocusOpen = true;
      toggle?.focus();
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (isMobileNavigation() || primaryNavigation?.contains(event.target)) {
      return;
    }

    primaryNavigation
      ?.querySelectorAll(".dropdown")
      .forEach((dropdown) => setDesktopDropdownOpen(dropdown, false));
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      isMobileNavigation() &&
      header.classList.contains("is-mobile-menu-open")
    ) {
      event.preventDefault();
      setMobileMenuOpen(false);
      mobileMenuToggle?.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (header.classList.contains("is-mobile-menu-open")) {
      updateMobileMenuOffset();
    }

    if (window.innerWidth > 700) {
      setMobileMenuOpen(false);
    }
  });

  document.dispatchEvent(new Event("cmcenheaderready"));
}

const footerSocialLinks = [
  {
    label: "Facebook",
    url: "https://www.facebook.com/",
  },
  {
    label: "Instagram",
    url: "https://www.instagram.com/",
  },
];

function loadFooter() {
  const footer = document.getElementById("footer");

  if (!footer) return;

  const socialLinksHtml = footerSocialLinks
    .map(
      (link) => `
      <a
        href="${link.url}"
        class="footer-social-link"
        target="_blank"
        rel="noopener"
      >
        ${link.label}
      </a>
    `,
    )
    .join("");

  footer.className = "site-footer";

  footer.innerHTML = `
    <section class="ownership-band">
      <div class="footer-inner ownership-inner">
        <span
          class="ownership-label"
          data-i18n="site_ownership_label"
        >
          Site ownership
        </span>

        <p data-i18n="site_ownership_statement">
          This website is owned and operated by the C&E Association,
          a not-for-profit organization. It is not operated by the
          Government of Canada or the Department of National Defence.
        </p>
      </div>
    </section>

    <div class="footer-main">
      <div class="footer-inner footer-grid">
        <section class="footer-brand">
          <a
            href="/index"
            class="footer-identity"
            aria-label="CMCEN / RCMCE home"
          >
            <img
              src="/images/logo.png"
              alt=""
              class="footer-logo"
            />

            <span>
              <strong>CMCEN / RCMCE</strong>

              <span
                class="footer-full-name"
                data-i18n="site_name_full"
              ></span>
            </span>
          </a>

          <p
            class="footer-mission"
            data-i18n="footer_mission"
          >
            Connecting members, supporting veterans,
            and preserving the history of the Branch.
          </p>
            <button
  id="themeToggle"
  class="theme-toggle"
  type="button"
  aria-label="Switch to dark mode"
  aria-pressed="false"
>
  <span class="theme-toggle__icon" aria-hidden="true">
    <!-- Sun -->
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4"></circle>
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42
           M17.66 17.66l1.41 1.41M2 12h2M20 12h2
           M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"
      ></path>
    </svg>
  </span>

  <span class="theme-toggle__icon" aria-hidden="true">
    <!-- Moon -->
    <svg viewBox="0 0 24 24">
      <path d="M21 12.8A9 9 0 1 1 11.2 3A7 7 0 0 0 21 12.8Z"></path>
    </svg>
  </span>
</button>
        </section>

        <nav
          class="footer-column"
          aria-labelledby="footerQuickLinks"
        >
          <h2
            id="footerQuickLinks"
            data-i18n="footer_quick_links"
          >
            Quick links
          </h2>

          <ul>
            <li>
              <a href="/about.html" data-i18n="menu_about">
                About
              </a>
            </li>

            <li>
              <a href="/donate.html" data-i18n="donate_now">
                Donate
              </a>
            </li>

            <li>
              <a href="/calendar" data-i18n="calendar_title">
                Events Calendar
              </a>
            </li>

            <li>
              <a href="/subscribe.html" data-i18n="subscribe">
                Subscribe
              </a>
            </li>

            <li>
              <a href="/contact.html" data-i18n="menu_contact">
                Contact
              </a>
            </li>
          </ul>
        </nav>

        <section class="footer-column">
          <h2 data-i18n="footer_contact">
            Contact
          </h2>

          <address class="footer-contact">
            <p>
              <span data-i18n="footer_address_label">Address</span><br />
              <span>Association address to be confirmed</span>
            </p>

            <p>
              <a href="mailto:contact@cmcen.ca">
                contact@cmcen.ca
              </a>
            </p>

            <p>
              <a href="/contact.html" data-i18n="contact_form_link">
                Contact form
              </a>
            </p>
          </address>
        </section>

        <section class="footer-column footer-legal">
          <h2 data-i18n="footer_information">
            Information
          </h2>

          <ul>
            <li>
              <a href="/privacy.html" data-i18n="privacy_policy">
                Privacy Policy
              </a>
            </li>

            <li>
              <a href="mailto:privacy@cmcen.ca" data-i18n="privacy_contact">
                Privacy inquiries
              </a>
            </li>

            <li>
              <a href="mailto:legal@cmcen.ca" data-i18n="legal_contact">
                Legal notices
              </a>
            </li>

            <li>
              <a href="mailto:security@cmcen.ca" data-i18n="security_contact">
                Security concerns
              </a>
            </li>

            <li>
              <a href="/casl.html" data-i18n="casl_disclosure">
                CASL Disclosure
              </a>
            </li>

            <li>
              <a href="/accessibility.html" data-i18n="accessibility">
                Accessibility
              </a>
            </li>

            <li>
              <a href="/sitemap" data-i18n="site_map">
                Site map
              </a>
            </li>
          </ul>

          <div
            class="footer-social"
            aria-label="Social media"
          >
            ${socialLinksHtml}
          </div>
  
        </section>
      </div>
    </div>

    <div class="footer-bottom">
      <div class="footer-inner footer-bottom-inner">
        <p>
          &copy;
          <span id="copyrightYear"></span>
          <span data-i18n="footer_copyright">
            C&E Association. All rights reserved.
          </span>
        </p>

        <p class="footer-language-mark">
          CMCEN <span aria-hidden="true">/</span> RCMCE
        </p>

        <p class="footer-credit">
          <a class="footer-credit-link" href="/devs">Made with ♥ by Bray &amp; Eric</a>
        </p>

        <p
          class="footer-version"
          id="footerVersion"
          hidden
        ></p>
      </div>
    </div>
  `;

  const yearElement = document.getElementById("copyrightYear");

  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  updateFooterVersion();

  document
    .getElementById("themeToggle")
    ?.addEventListener("click", toggleTheme);
}

async function updateFooterVersion() {
  const versionElement = document.getElementById("footerVersion");

  if (!versionElement) return;

  const hostname = window.location.hostname;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
  const showsCommit =
    hostname === "cmcen-staging.corebot.ca" ||
    hostname === "beta.cmcen-rcmce.ca";

  if (isLocal) {
    versionElement.textContent = "Running version: Local development";
    versionElement.hidden = false;
    return;
  }

  if (!showsCommit) return;

  try {
    const response = await fetch("/api/version", {
      cache: "no-store",
    });

    if (!response.ok) return;

    const data = await response.json();
    const hash = data.shortCommit || data.commit;

    if (hash) {
      versionElement.textContent = `Running version: ${hash}`;
      versionElement.hidden = false;
    }
  } catch (error) {
    console.warn("Version unavailable:", error);
  }
}

loadHeader();
loadFooter();

async function loadCustomNavigationItems() {
  try {
    const response = await fetch("/api/navigation");

    if (!response.ok) {
      throw new Error("Navigation request failed");
    }

    const data = await response.json();
    customNavigationItems = Array.isArray(data.items) ? data.items : [];

    renderCustomNavigationItems();
    updateAuthRestrictedItems();
  } catch (error) {
    console.warn("Custom navigation unavailable:", error);
  }
}

function renderCustomNavigationItems() {
  const primaryNavigation = document.getElementById("primaryNavigation");
  primaryNavigation
    ?.querySelectorAll("[data-custom-nav-group], [data-custom-nav-item]")
    .forEach((item) => item.remove());

  const groupKeys = Object.keys(navLinks);
  const customGroups = customNavigationItems.filter(
    (item) => item.type === "group" && !groupKeys.includes(item.group),
  );

  customGroups.forEach((group) => {
    const wrapper = document.createElement("div");
    const menuId = `primaryNavigationCustom${group.group}`;
    wrapper.className = "dropdown";
    wrapper.dataset.customNavGroup = group.group;
    wrapper.innerHTML = `
      <button
        type="button"
        class="dropdown-toggle"
        aria-controls="${escapeHtml(menuId)}"
        aria-expanded="false"
        data-nav-label-en="${escapeHtml(group.label?.en || "")}"
        data-nav-label-fr="${escapeHtml(group.label?.fr || "")}"
      >${escapeHtml(getLocalizedNavigationLabel(group.label))}</button>

      <ul
        class="dropdown-menu"
        id="${escapeHtml(menuId)}"
      ></ul>
    `;

    primaryNavigation?.append(wrapper);
  });

  customNavigationItems.forEach((item) => {
    if (item.type === "group") return;

    const groupIndex = groupKeys.indexOf(item.group);
    const menu =
      groupIndex >= 0
        ? document.getElementById(`primaryNavigationDropdown${groupIndex}`)
        : document.querySelector(
            `[data-custom-nav-group="${escapeCssIdentifier(item.group)}"] .dropdown-menu`,
          );

    if (!menu || !item.route) return;

    const listItem = document.createElement("li");
    listItem.dataset.customNavItem = "true";

    if (item.permission) {
      listItem.dataset.permission = item.permission;
      listItem.hidden = true;
    }

    const link = document.createElement("a");
    link.href = item.route;
    link.dataset.navLabelEn = item.label?.en || "";
    link.dataset.navLabelFr = item.label?.fr || "";
    link.textContent = getLocalizedNavigationLabel(item.label);

    listItem.append(link);
    menu.append(listItem);
  });
}

loadCustomNavigationItems();

window.reloadSiteNavigation = async function reloadSiteNavigation() {
  loadHeader();
  await loadCustomNavigationItems();
  applyCurrentLanguage();
  updateAuthButtons();
  updateAuthRestrictedItems();
};

function getStoredAuthToken() {
  return CMCENUtils.storeAuthToken(CMCENUtils.getStoredAuthToken());
}

function getAccountIcon() {
  return `
    <svg
      class="utility-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4"></circle>
      <path d="M4.5 21c.7-4.2 3.1-6.3 7.5-6.3s6.8 2.1 7.5 6.3"></path>
    </svg>
  `;
}

function getSignOutTranslation(key, fallback) {
  if (typeof window.translate !== "function") {
    return fallback;
  }

  const translated = window.translate(key);
  return translated && translated !== key ? translated : fallback;
}

async function showSignOutModal() {
  const confirmed = await CMCENModal.confirm(
    getSignOutTranslation(
      "signout_confirm_message",
      "Are you sure you want to sign out?",
    ),
    {
      title: getSignOutTranslation("signout_confirm_title", "Sign out?"),
      cancelText: getSignOutTranslation("signout_cancel", "Cancel"),
      confirmText: getSignOutTranslation("signout_confirm", "Sign out"),
    },
  );

  if (confirmed) {
    await performSignOut();
  }
}

async function performSignOut() {
  CMCENUtils.clearMfaSession();

  document.getElementById("header")?.classList.remove("is-mobile-menu-open");
  document.body.classList.remove("mobile-menu-lock");
  document
    .getElementById("mobileMenuToggle")
    ?.setAttribute("aria-expanded", "false");
  document
    .getElementById("mobileMenuToggle")
    ?.setAttribute("aria-label", "Open menu");

  await CMCENUtils.signOut();
  window.location.href = "/login";
}

async function handleSignOut(event) {
  event?.preventDefault();
  await showSignOutModal();
}

function getNotificationBadge(count) {
  const notificationCount = Number(count) || 0;

  if (notificationCount <= 0) {
    return "";
  }

  const label = `${notificationCount} notification${notificationCount === 1 ? "" : "s"}`;

  return `
    <span
      class="notification-badge"
      aria-label="${label}"
    >${notificationCount}</span>
  `;
}

function updateNotificationBadges(count = 0) {
  document
    .querySelectorAll(".notification-badge")
    .forEach((badge) => badge.remove());

  const badgeHtml = getNotificationBadge(count);

  if (!badgeHtml) {
    return;
  }

  document
    .querySelectorAll(".account-link, .mobile-menu-account-link")
    .forEach((link) => {
      link.insertAdjacentHTML("beforeend", badgeHtml);
    });
}

function updateAuthButtons() {
  const token = getStoredAuthToken();
  const authButtons = document.querySelector(".auth-buttons");
  const mobileMenuAccount = document.getElementById("mobileMenuAccount");

  if (!authButtons || !mobileMenuAccount) {
    return;
  }

  if (token) {
    authButtons.innerHTML = `
      <a
        href="/dashboard"
        class="utility-link account-link"
      >
        ${getAccountIcon()}
        <span data-i18n="account">Account</span>
      </a>

      <button
        type="button"
        class="utility-link signout-link"
        id="signOutBtn"
        data-i18n="signout_btn"
      >
        Sign out
      </button>
    `;

    mobileMenuAccount.innerHTML = `
      <a
        href="/dashboard"
        class="mobile-menu-account-link"
      >
        ${getAccountIcon()}
        <span data-i18n="account">Account</span>
      </a>

      <button
        type="button"
        class="mobile-signout-link"
        id="mobileSignOutBtn"
        data-i18n="signout_btn"
      >
        Sign out
      </button>
    `;

    document
      .getElementById("signOutBtn")
      .addEventListener("click", handleSignOut);
    document
      .getElementById("mobileSignOutBtn")
      .addEventListener("click", handleSignOut);
  } else {
    authButtons.innerHTML = `
      <a
        href="/login"
        class="utility-link account-link"
      >
        ${getAccountIcon()}
        <span data-i18n="login_btn">Login</span>
      </a>
    `;

    mobileMenuAccount.innerHTML = `
      <a
        href="/login"
        class="mobile-menu-account-link"
      >
        ${getAccountIcon()}
        <span data-i18n="login_btn">Login</span>
      </a>
    `;
  }

  applyCurrentLanguage();

  updateNotificationBadges(0);
}

async function updateAuthRestrictedItems() {
  const token = getStoredAuthToken();

  const authRequiredItems = document.querySelectorAll("[data-auth-required]");

  const permissionRequiredItems =
    document.querySelectorAll("[data-permission]");

  authRequiredItems.forEach((element) => {
    element.hidden = true;
  });

  permissionRequiredItems.forEach((element) => {
    element.hidden = true;
  });

  if (!token) return;

  try {
    const user = await CMCENUtils.apiJson("/api/me", {
      token,
      errorMessage: "Could not verify navigation permissions",
    });

    updateNotificationBadges(user.notifications?.count || 0);

    authRequiredItems.forEach((element) => {
      element.hidden = false;
    });

    permissionRequiredItems.forEach((element) => {
      const permissionName = element.dataset.permission;
      element.hidden = user.permissions?.[permissionName] !== true;
    });
  } catch (error) {
    if (error.status === 401) {
      CMCENUtils.clearAuthToken();
      document
        .getElementById("header")
        ?.classList.remove("is-mobile-menu-open");
      document.body.classList.remove("mobile-menu-lock");
      updateAuthButtons();
      return;
    }

    console.error("Navigation permission check failed:", error);
  }
}

window.refreshAuthUI = function refreshAuthUI() {
  updateAuthButtons();
  updateAuthRestrictedItems();
};

updateAuthButtons();
updateAuthRestrictedItems();

const betaNoticeStorageKey = "cmcen_beta_notice_2026_acknowledged";

function hasAcknowledgedBetaNotice() {
  try {
    return localStorage.getItem(betaNoticeStorageKey) === "true";
  } catch {
    return false;
  }
}

function showBetaNotice() {
  if (hasAcknowledgedBetaNotice()) {
    return;
  }

  const previouslyFocusedElement = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "beta-notice-overlay";
  overlay.setAttribute("role", "presentation");

  const notice = document.createElement("section");
  notice.className = "beta-notice";
  notice.setAttribute("role", "dialog");
  notice.setAttribute("aria-modal", "true");
  notice.setAttribute("aria-labelledby", "betaNoticeTitle");
  notice.setAttribute("aria-describedby", "betaNoticeMessage");
  notice.innerHTML = `
    <div class="beta-notice-brand" aria-hidden="true">
      <img src="/images/logo.png" alt="" />
      <span>CMCEN</span>
    </div>
    <div class="beta-notice-content">
      <p class="beta-notice-kicker">Internal beta</p>
      <h1 id="betaNoticeTitle">Welcome to CMCEN</h1>
      <div class="beta-notice-message" id="betaNoticeMessage">
        <p>Welcome to the internal beta for CMCEN. This beta will run from 21 August 2026 until 2 October 2026.</p>
        <p>For any feedback or ideas, please email <a href="mailto:support@cmcen.ca">support@cmcen.ca</a>.</p>
        <p>For any bugs or issues, please either email <a href="mailto:support@cmcen.ca">support@cmcen.ca</a> or file a bug report at <a href="https://git.corebot.ca/Eric/CMCENDev/issues" target="_blank" rel="noopener noreferrer">git.corebot.ca/Eric/CMCENDev/issues</a>.</p>
        <p>Happy beta testing!</p>
        <p class="beta-notice-signature">&ndash; Bray &amp; Eric</p>
      </div>
      <button class="beta-notice-continue" type="button">Continue to CMCEN</button>
    </div>
  `;

  const continueButton = notice.querySelector(".beta-notice-continue");

  function dismissNotice() {
    try {
      localStorage.setItem(betaNoticeStorageKey, "true");
    } catch {
      // The notice will be displayed again when browser storage is unavailable.
    }

    document.removeEventListener("keydown", trapFocus);
    document.body.classList.remove("beta-notice-lock");
    overlay.remove();

    if (previouslyFocusedElement instanceof HTMLElement) {
      previouslyFocusedElement.focus();
    }
  }

  function trapFocus(event) {
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = [
      ...notice.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements.at(-1);

    if (!firstFocusableElement || !lastFocusableElement) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && document.activeElement === firstFocusableElement) {
      event.preventDefault();
      lastFocusableElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus();
    }
  }

  continueButton.addEventListener("click", dismissNotice);
  overlay.append(notice);
  document.body.append(overlay);
  document.body.classList.add("beta-notice-lock");
  document.addEventListener("keydown", trapFocus);
  continueButton.focus();
}

showBetaNotice();
