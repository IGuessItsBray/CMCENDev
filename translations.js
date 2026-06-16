const translations = {
  en: {
    title: "CMCEN",
    menu_one:   "About",
    menu_two:   "Doctrine & Professional Development",
    menu_three: "News & Events",
    option_1:   "About the C&E Family",
    option_2:   "Option 2",
    option_3:   "Option 3",
    footer_copyright: "This website is owned and operated by the C&E Association, a not-for-profit organization. It is not operated by the Government of Canada or the Department of National Defence. © 2026 All Rights Reserved."
  },
  fr: {
    title: "RCMCE",
    menu_one:   "À propos",
    menu_two:   "Doctrine et développement professionnel",
    menu_three: "Actualités et événements",
    option_1:   "Option 1",
    option_2:   "Option 2",
    option_3:   "Option 3",
    footer_copyright: "Ce site Web est la propriété de l’Association C&E, un organisme sans but lucratif, et est exploité par celle-ci. Il n’est pas exploité par le gouvernement du Canada ni par le ministère de la Défense nationale. © 2026 Tous droits réservés."
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