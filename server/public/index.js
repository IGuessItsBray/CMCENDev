function loadHeader() {
  document.getElementById('header').innerHTML = `
        <a href="/index.html" class="logo-link">
            <img src="images/logo.png" alt="Logo" class="logo" />
        </a>
      <nav class="nav-bar">
        <div class="dropdown">
          <div class="dropdown-toggle" data-i18n="menu_one">Menu One</div>
          <ul class="dropdown-menu">
            <li><a href="#" data-i18n="option_1">Option 1</a></li>
            <li><a href="#" data-i18n="option_2">Option 2</a></li>
            <li><a href="#" data-i18n="option_3">Option 3</a></li>
          </ul>
        </div>
 
        <div class="dropdown">
          <div class="dropdown-toggle" data-i18n="menu_two">Menu Two</div>
          <ul class="dropdown-menu">
            <li><a href="#" data-i18n="option_1">Option 1</a></li>
            <li><a href="#" data-i18n="option_2">Option 2</a></li>
            <li><a href="#" data-i18n="option_3">Option 3</a></li>
          </ul>
        </div>
        <div class="dropdown">
          <div class="dropdown-toggle" data-i18n="menu_three">Menu Three</div>
          <ul class="dropdown-menu">
            <li><a href="#" data-i18n="option_1">Option 1</a></li>
            <li><a href="#" data-i18n="option_2">Option 2</a></li>
            <li><a href="#" data-i18n="option_3">Option 3</a></li>
          </ul>
        </div>
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
      updateAuthButtons();
    });
  } else {
    authButtons.innerHTML = `
      <a href="login.html" class="auth-link" data-i18n="login_btn">Login</a>
      <a href="register.html" class="auth-link auth-link--primary" data-i18n="register_btn">Register</a>
    `;
    applyLanguage(currentLang);
  }
}

updateAuthButtons();