// the header'z dropdown menus are built from this
const themeStorageKey = "theme";
const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

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
        : key => {
          const fallbacks = {
            theme_switch_to_light_label: "Switch to light mode",
            theme_switch_to_dark_label: "Switch to dark mode"
          };

          return fallbacks[key] || key;
        };

    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute(
      "aria-label",
      isDark
        ? translateText("theme_switch_to_light_label")
        : translateText("theme_switch_to_dark_label")
    );
  }

  if (persist) {
    localStorage.setItem(themeStorageKey, nextTheme);
  }

  document.dispatchEvent(
    new CustomEvent("themechange", {
      bubbles: true,
      detail: { theme: nextTheme }
    })
  );
}

function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme;

  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

applyTheme(getPreferredTheme(), { persist: false });

darkModeQuery.addEventListener("change", event => {
  if (!localStorage.getItem(themeStorageKey)) {
    applyTheme(event.matches ? "dark" : "light", {
      persist: false
    });
  }
});

document.addEventListener("languagechange", () => {
  applyTheme(document.documentElement.dataset.theme || getPreferredTheme(), {
    persist: false
  });
  updateDynamicNavigationLabels();
});

const navLinks = {
  about: {
    titleKey: "menu_about_title",
    items: [
      { route: "/about-family.html", i18n: "menu_about_option_1" },
      { route: "/about_branch.html", i18n: "menu_about_option_2" },
      { route: "/about_association.html", i18n: "menu_about_option_3" },
      { route: "/about_foundation.html", i18n: "menu_about_option_4" },
      { route: "/about_museum.html", i18n: "menu_about_option_5" },
      { route: "/ownership.html", i18n: "menu_about_option_6" },
    ]
  },
  doctrine: {
    titleKey: "menu_doctrine_title",
    items: [
      { route: "/doctrine_hub.html", i18n: "menu_doctrine_option_1" },
      { route: "/awards.html", i18n: "menu_doctrine_option_2" },
    ]
  },
  news: {
    titleKey: "menu_news_title",
    items: [
      { route: "/calendar.html", i18n: "menu_news_option_1" },
      {
        route: "/submit-event.html",
        i18n: "menu_news_option_2",
        permission: "canCreateDrafts"
      },
      {
        route: '/review-submissions.html',
        i18n: 'menu_review_events',
        permission: 'canReviewAndPublish'
      },
      { route: "/news_stories.html", i18n: "menu_news_option_3" },
      { route: "/last_post.html", i18n: "menu_news_option_4" },
      { route: "/retirements.html", i18n: "menu_news_option_5" },
      { route: "/certificates.html", i18n: "menu_news_option_6" },
      { route: "/promotions.html", i18n: "menu_news_option_7" },
      { route: "/history.html", i18n: "menu_news_option_8" },
      { route: "/gallery.html", i18n: "menu_news_option_9" },
    ]
  },
  benefits: {
    titleKey: "menu_benefits_title",
    items: [
      { route: "/veteran_services.html", i18n: "menu_benefits_option_1" },
      { route: "/cfmws.html", i18n: "menu_benefits_option_2" },
      { route: "/bursaries.html", i18n: "menu_benefits_option_3" },
      { route: "/affiliate_offers.html", i18n: "menu_benefits_option_4" },
      { route: "/support_troops.html", i18n: "menu_benefits_option_5" },
    ]
  }
};

// header links that aren't dropdowns
const standaloneLinks = [
  //{ route: "/contact.html", i18n: "menu_connections", protected: true },
];
let customNavigationItems = [];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCssIdentifier(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function getLocalizedNavigationLabel(label) {
  const language = CMCENUtils?.getCurrentLanguage?.() || 'en';
  const fallbackLanguage = language === 'fr' ? 'en' : 'fr';

  return String(label?.[language] || label?.[fallbackLanguage] || '').trim();
}

function updateDynamicNavigationLabels() {
  document.querySelectorAll('[data-nav-label-en], [data-nav-label-fr]').forEach(link => {
    link.textContent = getLocalizedNavigationLabel({
      en: link.dataset.navLabelEn || '',
      fr: link.dataset.navLabelFr || ''
    });
  });
}

function applyCurrentLanguage() {
  if (typeof applyLanguage === 'function') {
    applyLanguage(
      typeof currentLang === 'string'
        ? currentLang
        : CMCENUtils?.getCurrentLanguage?.() || 'en'
    );
  }

  updateDynamicNavigationLabels();
}

// list of only protected pages
const protectedPages = new Set([
  "/dashboard.html",
  "/notifications.html",
  "/submit-event.html",
  "/review-submissions.html",
  "/translations-admin.html",
  "/pages-admin.html",
  "/admin-users.html",

  ...Object.values(navLinks)
    .flatMap(dropdown => dropdown.items)
    .filter(item => item.protected || item.permission)
    .map(item => item.route),

  ...standaloneLinks
    .filter(item => item.protected || item.permission)
    .map(item => item.route)
]);

function getAccessAttributes(item) {
  if (item.permission) {
    return `data-permission="${item.permission}" hidden`;
  }

  if (item.protected) {
    return 'data-auth-required hidden';
  }

  return '';
}

function renderDropdown(dropdown, index) {
  const menuId = `primaryNavigationDropdown${index}`;
  const itemsHtml = dropdown.items.map(item => `
    <li ${getAccessAttributes(item)}>
      <a
        href="${item.route}"
        data-i18n="${item.i18n}"
      ></a>
    </li>
  `).join('');

  return `
    <div class="dropdown">
      <button
        type="button"
        class="dropdown-toggle"
        data-i18n="${dropdown.titleKey}"
        aria-controls="${menuId}"
        aria-expanded="false"
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
    .join('');

  const standaloneHtml = standaloneLinks
    .map(renderStandaloneLink)
    .join('');

  const header = document.getElementById('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="header-identity-row">
      <div class="header-inner">
        <a
          href="/index.html"
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
          action="/search.html"
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

  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const primaryNavigation = document.getElementById('primaryNavigation');

  function isMobileNavigation() {
    return window.matchMedia('(max-width: 700px)').matches;
  }

  function setMobileDropdownOpen(dropdown, isOpen) {
    dropdown.classList.toggle('is-mobile-dropdown-open', isOpen);
    dropdown.querySelector('.dropdown-toggle')?.setAttribute(
      'aria-expanded',
      String(isOpen)
    );
  }

  function openCurrentMobileDropdown() {
    const currentPath = window.location.pathname;
    const currentLink = primaryNavigation?.querySelector(
      `.dropdown-menu a[href="${currentPath}"]`
    );
    const currentDropdown = currentLink?.closest('.dropdown');

    if (currentDropdown) {
      setMobileDropdownOpen(currentDropdown, true);
    }
  }

  function updateMobileMenuOffset() {
    const identityRow = header.querySelector('.header-identity-row');

    header.style.setProperty(
      '--mobile-header-height',
      `${identityRow?.offsetHeight || header.offsetHeight}px`
    );
  }

  function setMobileMenuOpen(isOpen) {
    if (isOpen) {
      updateMobileMenuOffset();
    }

    header.classList.toggle('is-mobile-menu-open', isOpen);
    document.body.classList.toggle('mobile-menu-lock', isOpen);

    mobileMenuToggle?.setAttribute('aria-expanded', String(isOpen));
    mobileMenuToggle?.setAttribute(
      'aria-label',
      isOpen ? 'Close menu' : 'Open menu'
    );

    if (isOpen) {
      openCurrentMobileDropdown();
    }
  }

  mobileMenuToggle?.addEventListener('click', () => {
    setMobileMenuOpen(!header.classList.contains('is-mobile-menu-open'));
  });

  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
  applyTheme(document.documentElement.dataset.theme || getPreferredTheme(), {
    persist: false
  });

  primaryNavigation?.addEventListener('click', event => {
    const dropdownToggle = event.target.closest('.dropdown-toggle');

    if (dropdownToggle && isMobileNavigation()) {
      event.preventDefault();

      const dropdown = dropdownToggle.closest('.dropdown');
      const isOpen = dropdown.classList.contains('is-mobile-dropdown-open');

      setMobileDropdownOpen(dropdown, !isOpen);
      return;
    }

    if (event.target.closest('a')) {
      setMobileMenuOpen(false);
    }
  });

  window.addEventListener('resize', () => {
    if (header.classList.contains('is-mobile-menu-open')) {
      updateMobileMenuOffset();
    }

    if (window.innerWidth > 700) {
      setMobileMenuOpen(false);
    }
  });
}

const footerSocialLinks = [
  {
    label: 'Facebook',
    url: 'https://www.facebook.com/'
  },
  {
    label: 'Instagram',
    url: 'https://www.instagram.com/'
  }
];

function loadFooter() {
  const footer = document.getElementById('footer');

  if (!footer) return;

  const socialLinksHtml = footerSocialLinks
    .map(link => `
      <a
        href="${link.url}"
        class="footer-social-link"
        target="_blank"
        rel="noopener"
      >
        ${link.label}
      </a>
    `)
    .join('');

  footer.className = 'site-footer';

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
            href="/index.html"
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
              <a href="/calendar.html" data-i18n="calendar_title">
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
              <a href="mailto:contact@example.ca">
                contact@example.ca
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
              <a href="/casl.html" data-i18n="casl_disclosure">
                CASL Disclosure
              </a>
            </li>

            <li>
              <a href="/accessibility.html" data-i18n="accessibility">
                Accessibility
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
      </div>
    </div>
  `;

  const yearElement = document.getElementById('copyrightYear');

  if (yearElement) {
    yearElement.textContent =
      new Date().getFullYear();
  }

  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
}

loadHeader();
loadFooter();

async function loadCustomNavigationItems() {
  try {
    const response = await fetch('/api/navigation');

    if (!response.ok) {
      throw new Error('Navigation request failed');
    }

    const data = await response.json();
    customNavigationItems = Array.isArray(data.items) ? data.items : [];

    renderCustomNavigationItems();
    updateAuthRestrictedItems();
  } catch (error) {
    console.warn('Custom navigation unavailable:', error);
  }
}

function renderCustomNavigationItems() {
  const primaryNavigation = document.getElementById('primaryNavigation');
  primaryNavigation
    ?.querySelectorAll('[data-custom-nav-group], [data-custom-nav-item]')
    .forEach(item => item.remove());

  const groupKeys = Object.keys(navLinks);
  const customGroups = customNavigationItems.filter(item =>
    item.type === 'group' && !groupKeys.includes(item.group)
  );

  customGroups.forEach(group => {
    const wrapper = document.createElement('div');
    const menuId = `primaryNavigationCustom${group.group}`;
    wrapper.className = 'dropdown';
    wrapper.dataset.customNavGroup = group.group;
    wrapper.innerHTML = `
      <button
        type="button"
        class="dropdown-toggle"
        aria-controls="${escapeHtml(menuId)}"
        aria-expanded="false"
        data-nav-label-en="${escapeHtml(group.label?.en || '')}"
        data-nav-label-fr="${escapeHtml(group.label?.fr || '')}"
      >${escapeHtml(getLocalizedNavigationLabel(group.label))}</button>

      <ul
        class="dropdown-menu"
        id="${escapeHtml(menuId)}"
      ></ul>
    `;

    primaryNavigation?.append(wrapper);
  });

  customNavigationItems.forEach(item => {
    if (item.type === 'group') return;

    const groupIndex = groupKeys.indexOf(item.group);
    const menu = groupIndex >= 0
      ? document.getElementById(`primaryNavigationDropdown${groupIndex}`)
      : document.querySelector(`[data-custom-nav-group="${escapeCssIdentifier(item.group)}"] .dropdown-menu`);

    if (!menu || !item.route) return;

    const listItem = document.createElement('li');
    listItem.dataset.customNavItem = 'true';

    if (item.permission) {
      listItem.dataset.permission = item.permission;
      listItem.hidden = true;
    }

    const link = document.createElement('a');
    link.href = item.route;
    link.dataset.navLabelEn = item.label?.en || '';
    link.dataset.navLabelFr = item.label?.fr || '';
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
  return CMCENUtils.storeAuthToken(
    CMCENUtils.getStoredAuthToken()
  );
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

let signOutModal = null;
let signOutTrigger = null;

function setSignOutModalOpen(isOpen) {
  if (!signOutModal) return;

  signOutModal.hidden = !isOpen;
  document.body.classList.toggle('signout-modal-lock', isOpen);

  if (isOpen) {
    signOutModal
      .querySelector('[data-signout-cancel]')
      ?.focus();
    return;
  }

  signOutTrigger?.focus();
  signOutTrigger = null;
}

function createSignOutModal() {
  if (signOutModal) return signOutModal;

  const modal = document.createElement('div');
  modal.className = 'signout-modal-overlay';
  modal.hidden = true;
  modal.innerHTML = `
    <section
      class="signout-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signOutModalTitle"
      aria-describedby="signOutModalDescription"
    >
      <header class="signout-modal-header">
        <span class="signout-modal-icon-wrap" aria-hidden="true">
          <svg
            class="signout-modal-icon"
            viewBox="0 0 24 24"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <path d="M16 17l5-5-5-5"></path>
            <path d="M21 12H9"></path>
          </svg>
        </span>

        <div>
          <h2
            id="signOutModalTitle"
            data-i18n="signout_confirm_title"
          >
            Sign out?
          </h2>
        </div>
      </header>

      <div class="signout-modal-body">
        <p
          id="signOutModalDescription"
          data-i18n="signout_confirm_message"
        >
          Are you sure you want to sign out?
        </p>

        <div class="signout-modal-actions">
          <button
            type="button"
            class="signout-modal-button signout-modal-button-secondary"
            data-signout-cancel
            data-i18n="signout_cancel"
          >
            Cancel
          </button>

          <button
            type="button"
            class="signout-modal-button signout-modal-button-danger"
            data-signout-confirm
            data-i18n="signout_confirm"
          >
            Sign out
          </button>
        </div>
      </div>
    </section>
  `;

  modal.addEventListener('click', event => {
    if (
      event.target === modal ||
      event.target.closest('[data-signout-cancel]')
    ) {
      setSignOutModalOpen(false);
    }

    if (event.target.closest('[data-signout-confirm]')) {
      setSignOutModalOpen(false);
      performSignOut();
    }
  });

  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setSignOutModalOpen(false);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(
      modal.querySelectorAll('button')
    ).filter(element => !element.disabled);

    if (!focusableElements.length) return;

    const firstElement = focusableElements[0];
    const lastElement =
      focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  });

  document.body.appendChild(modal);
  signOutModal = modal;

  return signOutModal;
}

function showSignOutModal(trigger) {
  signOutTrigger = trigger || document.activeElement;
  createSignOutModal();

  if (typeof applyLanguage === "function") {
    applyLanguage(currentLang);
  }

  setSignOutModalOpen(true);
}

function performSignOut() {
  CMCENUtils.clearMfaSession();

  document.getElementById('header')?.classList.remove('is-mobile-menu-open');
  document.body.classList.remove('mobile-menu-lock');
  document.getElementById('mobileMenuToggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('mobileMenuToggle')?.setAttribute('aria-label', 'Open menu');

  CMCENUtils.redirectToLogin();
}

function handleSignOut(event) {
  event?.preventDefault();
  showSignOutModal(event?.currentTarget);
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
    .forEach(badge => badge.remove());

  const badgeHtml = getNotificationBadge(count);

  if (!badgeHtml) {
    return;
  }

  document
    .querySelectorAll(".account-link, .mobile-menu-account-link")
    .forEach(link => {
      link.insertAdjacentHTML("beforeend", badgeHtml);
    });
}

function updateAuthButtons() {
  const token = getStoredAuthToken();
  const authButtons = document.querySelector('.auth-buttons');
  const mobileMenuAccount = document.getElementById('mobileMenuAccount');

  if (!authButtons || !mobileMenuAccount) {
    return;
  }

  if (token) {
    authButtons.innerHTML = `
      <a
        href="/dashboard.html"
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
        href="/dashboard.html"
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

    document.getElementById("signOutBtn").addEventListener("click", handleSignOut);
    document.getElementById("mobileSignOutBtn").addEventListener("click", handleSignOut);
  } else {
    authButtons.innerHTML = `
      <a
        href="/login.html"
        class="utility-link account-link"
      >
        ${getAccountIcon()}
        <span data-i18n="login_btn">Login</span>
      </a>
    `;

    mobileMenuAccount.innerHTML = `
      <a
        href="/login.html"
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

  const authRequiredItems = document.querySelectorAll('[data-auth-required]');

  const permissionRequiredItems = document.querySelectorAll('[data-permission]');

  authRequiredItems.forEach(element => {
    element.hidden = true;
  });

  permissionRequiredItems.forEach(element => {
    element.hidden = true;
  });

  if (!token) return;

  try {
    const response = await fetch('/api/me', {
      headers: CMCENUtils.authHeaders(token)
    });

    if (response.status === 401) {
      CMCENUtils.clearAuthToken();
      document.getElementById('header')?.classList.remove('is-mobile-menu-open');
      document.body.classList.remove('mobile-menu-lock');
      updateAuthButtons();
      return;
    }

    if (!response.ok) {
      throw new Error(
        'Could not verify navigation permissions'
      );
    }

    const user = await response.json();

    updateNotificationBadges(user.notifications?.count || 0);

    authRequiredItems.forEach(element => {
      element.hidden = false;
    });

    permissionRequiredItems.forEach(element => {
      const permissionName = element.dataset.permission;
      element.hidden = user.permissions?.[permissionName] !== true;
    });
  } catch (error) {
    console.error(
      'Navigation permission check failed:',
      error
    );
  }
}

window.refreshAuthUI = function refreshAuthUI() {
  updateAuthButtons();
  updateAuthRestrictedItems();
};

updateAuthButtons();
updateAuthRestrictedItems();
