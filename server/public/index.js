// the header'z dropdown menus are built from this
const navLinks = {
  about: {
    titleKey: "menu_about_title",
    items: [
      { route: "/about_family.html", i18n: "menu_about_option_1" },
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
  route: "/protected.html",
  i18n: "menu_news_option_2",
  permission: "canCreateDrafts"
},
      { route: "/news_stories.html", i18n: "menu_news_option_3" },
      { route: "/last_post.html", i18n: "menu_news_option_4" },
      { route: "/retirement.html", i18n: "menu_news_option_5" },
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
  { route: "/contact.html", i18n: "menu_connections", protected: true },
  { route: "/dashboard.html", i18n: "dashboard_title", protected: true}
];

// list of only protected pages
const protectedPages = [
  ...Object.values(navLinks).flatMap(
    dropdown => dropdown.items
  ),
  ...standaloneLinks
]
  .filter(item => item.protected || item.permission)
  .map(item => item.route);

  function getAccessAttributes(item) {
  if (item.permission) {
    return `data-permission="${item.permission}" hidden`;
  }

  if (item.protected) {
    return 'data-auth-required hidden';
  }

  return '';
}

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

function renderDropdown(dropdown) {
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
      <div
        class="dropdown-toggle"
        data-i18n="${dropdown.titleKey}"
      ></div>

      <ul class="dropdown-menu">
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
      if (protectedPages.includes(window.location.pathname)) {
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

async function updateAuthRestrictedItems() {
  const token = localStorage.getItem('token');

  const authRequiredItems =
    document.querySelectorAll('[data-auth-required]');

  const permissionRequiredItems =
    document.querySelectorAll('[data-permission]');

  // Hide restricted links until the server verifies the account.
  authRequiredItems.forEach(element => {
    element.hidden = true;
  });

  permissionRequiredItems.forEach(element => {
    element.hidden = true;
  });

  if (!token) return;

  try {
    const response = await fetch('/api/me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      localStorage.removeItem('token');
      updateAuthButtons();
      return;
    }

    if (!response.ok) {
      throw new Error(
        'Could not verify navigation permissions'
      );
    }

    const user = await response.json();

    authRequiredItems.forEach(element => {
      element.hidden = false;
    });

    permissionRequiredItems.forEach(element => {
      const permissionName =
        element.dataset.permission;

      element.hidden =
        user.permissions?.[permissionName] !== true;
    });
  } catch (error) {
    console.error(
      'Navigation permission check failed:',
      error
    );
  }
}

updateAuthButtons();
updateAuthRestrictedItems();