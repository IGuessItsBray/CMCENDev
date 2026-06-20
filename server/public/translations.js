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
    about_family_heading: "About the C&E Family",
    menu_about_title: "About",
    menu_about_option_1: "About the C&E Family",
    menu_about_option_2: "About the C&E Branch",
    menu_about_option_3: "About the C&E Association",
    menu_about_option_4: "About the C&E Foundation",
    menu_about_option_5: "About the C&E Museum",
    menu_about_option_6: "Site Ownership & Disclaimer",
    menu_doctrine_title: "Doctrine & Professional Development",
    menu_doctrine_option_1: "CAF Doctrine Hub",
    menu_doctrine_option_2: "Professional Awards",
    menu_news_title: "News & Events", 
    menu_news_option_1: "Calendar",
    menu_news_option_2: "Submit / Edit an Event [Form] [Auth]",
    menu_news_option_3: "News & Stories",
    menu_news_option_4: "Last Post [Form]",
    menu_news_option_5: "Retirement Messages [Form]",
    menu_news_option_6: "Certificate Requests [Form]",
    menu_news_option_7: "Promotions",
    menu_news_option_8: "History Project",
    menu_news_option_9: "Photo & Video Gallery",
    menu_benefits_title: "Benefits",
    menu_benefits_option_1: "Veteran Services",
    menu_benefits_option_2: "CFMWS Programs",
    menu_benefits_option_3: "Bursaries & Grants",
    menu_benefits_option_4: "Affiliate Offers (TD Insurance, etc.)",
    menu_benefits_option_5: "Support Our Troops",
    menu_connections: "Connections",
    about_family_heading: "About the C&E Family",
    about_family_para_1: "Introduce the C&E Family as a unified whole and describe the relationships between its four constituent entities (Branch, Association, Foundation, Museum) and their relationship to the Services they support (RCCS, RCAF, RCN, CAFCYBERCOM). Acts as the orientation page for visitors who do not yet know how the entities relate.",
    footer_copyright: "This website is owned and operated by the C&E Association, a not-for-profit organization. It is not operated by the Government of Canada or the Department of National Defence. © 2026 All Rights Reserved.",
    field_username: "Username",
    field_email: "Email",
    field_account_name: "Account name",
    dashboard_title: "Dashboard",
    loading_text: "Loading...",
    editable_tag: "Editable",
    field_role: 'Role',
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
    username_placeholder: "Nom d'utilisateur",
    password_placeholder: "Mot de passe",
    menu_about_title: "À propos",
    menu_about_option_1: "À propos de la famille C&E",
    menu_about_option_2: "À propos de la Branche C&E",
    menu_about_option_3: "À propos de l'Association C&E",
    menu_about_option_4: "À propos de la Fondation C&E",
    menu_about_option_5: "À propos du Musée C&E",
    menu_about_option_6: "Propriété du site et avis de non-responsabilité",
    menu_doctrine_title: "Doctrine et perfectionnement professionnel",
    menu_doctrine_option_1: "Carrefour de la doctrine des FAC",
    menu_doctrine_option_2: "Prix professionnels",
    menu_news_title: "Nouvelles et événements",
    menu_news_option_1: "Calendrier",
    menu_news_option_2: "Soumettre / Modifier un événement [Formulaire] [Authentification]",
    menu_news_option_3: "Nouvelles et histoires",
    menu_news_option_4: "Dernière publication [Formulaire]",
    menu_news_option_5: "Messages de retraite [Formulaire]",
    menu_news_option_6: "Demandes de certificat [Formulaire]",
    menu_news_option_7: "Promotions",
    menu_news_option_8: "Projet d'histoire",
    menu_news_option_9: "Galerie de photos et vidéos",
    menu_benefits_title: "Avantages",
    menu_benefits_option_1: "Services aux vétérans",
    menu_benefits_option_2: "Programmes des SBMFC",
    menu_benefits_option_3: "Bourses et subventions",
    menu_benefits_option_4: "Offres des partenaires (Assurance TD, etc.)",
    menu_benefits_option_5: "Soutenez nos troupes",
    menu_connections: "Connections",
    about_family_heading: "À propos de la famille C&E",
    about_family_para_1: "Présenter la famille C&E comme un tout unifié et décrire les liens entre ses quatre entités constituantes (la Branche, l'Association, la Fondation, le Musée) ainsi que leur relation avec les Services qu'elles soutiennent (CTRC, ARC, MRC, COMCYBERFAC). Sert de page d'orientation pour les visiteurs qui ne connaissent pas encore les liens entre ces entités.",
    footer_copyright: "Ce site Web est la propriété de l'Association C&E, un organisme sans but lucratif, et est exploité par celle-ci. Il n'est pas exploité par le gouvernement du Canada ni par le ministère de la Défense nationale. © 2026 Tous droits réservés.",
    field_username: "Username",
    field_email: "Email",
    field_account_name: "Account name",
    dashboard_title: "Dashboard",
    loading_text: "Loading...",
    editable_tag: "Editable",
    field_role: 'Rôle',
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