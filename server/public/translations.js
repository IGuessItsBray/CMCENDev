const translations = {
  en: {
    title: "CMCEN",
    login_btn: "Login",
    login_title: "Login",
    register_btn: "Register",
    register_title: "Register",
    signout_btn: "Sign out",
    username: "Username",
    password: "Password",
    email: "Email",
    account_name: "Account name",
    account: "Account",
    have_account: "Already have an account?",
    no_account: "Don't have an account?",
    username_placeholder: "Enter username",
    password_placeholder: "Enter password",
    menu_one:   "About",
    menu_two:   "Doctrine & Professional Development",
    menu_three: "News & Events",
    option_1:   "One",
    option_2:   "Two",
    option_3:   "Three",
    footer_copyright: "This website is owned and operated by the C&E Association, a not-for-profit organization. It is not operated by the Government of Canada or the Department of National Defence. © 2026 All Rights Reserved."
  },
  fr: {
    title: "RCMCE",
    login_btn: "Se connecter",
    login_title: "Connexion",
    register_btn: "S'inscrire",
    register_title: "S'inscrire",
    signout_btn: "Déconnexion",
    username: "Nom d'utilisateur",
    password: "Mot de passe",
    email: "Adresse courriel",
    account_name: "Nom du compte",
    account: "Compte",
    have_account: "Vous avez déja un compte ?",
    no_account: "Vous n'avez pas de compte ?",
    username_placeholder: "Username",
    password_placeholder: "Password",

    menu_one:   "À propos",
    menu_two:   "Doctrine et développement professionnel",
    menu_three: "Actualités et événements",
    option_1:   "Un",
    option_2:   "Deux",
    option_3:   "Trois",
    footer_copyright: "Ce site Web est la propriété de l'Association C&E, un organisme sans but lucratif, et est exploité par celle-ci. Il n'est pas exploité par le gouvernement du Canada ni par le ministère de la Défense nationale. © 2026 Tous droits réservés."
  }
};
 
const langToggle = document.getElementById("langToggle");
let currentLang = localStorage.getItem("lang") || "en";
 
function applyLanguage(lang) {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });

  // For input placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (translations[lang][key]) {
      el.placeholder = translations[lang][key];
    }
  });

  document.documentElement.setAttribute("lang", lang);
  langToggle.textContent = lang === "en" ? "FR" : "EN";
  localStorage.setItem("lang", lang);
  currentLang = lang;
}
 
langToggle.addEventListener("click", () => {
  applyLanguage(currentLang === "en" ? "fr" : "en");
});
 
// Apply on load
applyLanguage(currentLang);