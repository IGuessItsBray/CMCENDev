// the header'z dropdown menus are built from this
const navLinks = {
  about: {
    titleKey: "menu_about_title",
    items: [
      { route: "/about_family.html",      i18n: "menu_about_option_1" },
      { route: "/about_branch.html",      i18n: "menu_about_option_2" },
      { route: "/about_association.html", i18n: "menu_about_option_3" },
      { route: "/about_foundation.html",  i18n: "menu_about_option_4" },
      { route: "/about_museum.html",      i18n: "menu_about_option_5" },
      { route: "/ownership.html",         i18n: "menu_about_option_6" },
    ]
  },
  doctrine: {
    titleKey: "menu_doctrine_title",
    items: [
      { route: "/doctrine_hub.html", i18n: "menu_doctrine_option_1" },
      { route: "/awards.html",       i18n: "menu_doctrine_option_2" },
    ]
  },
  news: {
    titleKey: "menu_news_title",
    items: [
      { route: "/calendar.html",      i18n: "menu_news_option_1" },
      { route: "/protected.html",     i18n: "menu_news_option_2", protected: true },
      { route: "/news_stories.html",  i18n: "menu_news_option_3" },
      { route: "/last_post.html",     i18n: "menu_news_option_4" },
      { route: "/retirement.html",    i18n: "menu_news_option_5" },
      { route: "/certificates.html",  i18n: "menu_news_option_6" },
      { route: "/promotions.html",    i18n: "menu_news_option_7" },
      { route: "/history.html",       i18n: "menu_news_option_8" },
      { route: "/gallery.html",       i18n: "menu_news_option_9" },
    ]
  },
  benefits: {
    titleKey: "menu_benefits_title",
    items: [
      { route: "/veteran_services.html", i18n: "menu_benefits_option_1" },
      { route: "/cfmws.html",            i18n: "menu_benefits_option_2" },
      { route: "/bursaries.html",        i18n: "menu_benefits_option_3" },
      { route: "/affiliate_offers.html", i18n: "menu_benefits_option_4" },
      { route: "/support_troops.html",   i18n: "menu_benefits_option_5" },
    ]
  }
};

// header links that aren't dropdowns
const standaloneLinks = [
  { route: "/contact.html", i18n: "menu_connections", protected: true }
];


function renderDropdown(dropdown) {
  const itemsHtml = dropdown.items.map(item => `
    <li ${item.protected ? 'data-auth-required' : ''}>
      <a href="${item.route}" data-i18n="${item.i18n}"></a>
    </li>
  `).join('');

  return `
    <div class="dropdown">
      <div class="dropdown-toggle" data-i18n="${dropdown.titleKey}"></div>
      <ul class="dropdown-menu">${itemsHtml}</ul>
    </div>
  `;
}

function renderStandaloneLink(link) {
  return `<a ${link.protected ? 'data-auth-required' : ''} href="${link.route}" class="dropdown-toggle" data-i18n="${link.i18n}"></a>`;
}

function loadHeader() {
  const dropdownsHtml = Object.values(navLinks).map(renderDropdown).join('');
  const standaloneHtml = standaloneLinks.map(renderStandaloneLink).join('');

  document.getElementById('header').innerHTML = `
    <a href="/index.html" class="logo-link">
      <img src="images/logo.png" alt="Logo" class="logo" />
    </a>
    <nav class="nav-bar">
      ${dropdownsHtml}
      ${standaloneHtml}
    </nav>
    <div class="auth-buttons">
      <a href="login.html" class="auth-link" data-i18n="login_btn">Login</a>
      <a href="register.html" class="auth-link auth-link--primary" data-i18n="register_btn">Register</a>
    </div>
    <button class="lang-toggle" id="langToggle">FR</button>
  `;
}

function loadFooter() {
  document.getElementById('footer').innerHTML = `
      <p data-i18n="footer_copyright"></p>
  `;
}

loadHeader();
loadFooter();

const authButtons = document.querySelector('.auth-buttons');

function updateAuthButtons() {
  const token = localStorage.getItem('token');
  if (token) {
    authButtons.innerHTML = `<button class="auth-link auth-link--primary" id="signOutBtn" data-i18n="signout_btn">Sign Out</button>`;
    document.getElementById('signOutBtn').addEventListener('click', () => {
      localStorage.removeItem('token');
      updateAuthRestrictedItems();
      if (window.location.pathname === '/protected.html') {
        window.location.href = '/index.html';
      } else {
        updateAuthButtons();
      }
    });
    
  } else {
    authButtons.innerHTML = `
      <a href="login.html" class="auth-link" data-i18n="login_btn">Login</a>
      <a href="register.html" class="auth-link auth-link--primary" data-i18n="register_btn">Register</a>
    `;
  }
}

function updateAuthRestrictedItems() {
  const isAuthed = !!localStorage.getItem('token');
  document.querySelectorAll('[data-auth-required]').forEach(el => {
    el.style.display = isAuthed ? '' : 'none';
  });
}

updateAuthButtons();
updateAuthRestrictedItems();