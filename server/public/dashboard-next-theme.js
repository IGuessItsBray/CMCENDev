"use strict";

(() => {
  // Match the public site's preference without loading its header/footer script.
  const key = "theme";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;
  function readPreference() {
    try {
      const value = localStorage.getItem(key);
      return ["light", "dark"].includes(value) ? value : null;
    } catch {
      return null;
    }
  }
  let preference = readPreference();
  function updateButton() {
    const button = document.getElementById("adminThemeToggle");
    if (!button) return;
    const dark = root.dataset.theme === "dark";
    const label =
      window.translate?.(
        dark ? "theme_switch_to_light_label" : "theme_switch_to_dark_label",
      ) || (dark ? "Switch to light mode" : "Switch to dark mode");
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  function apply() {
    const theme = preference || (system.matches ? "dark" : "light");
    root.dataset.theme = theme;
    updateButton();
    document.dispatchEvent(
      new CustomEvent("themechange", { detail: { theme }, bubbles: true }),
    );
  }
  // Runs in the head so the initial paint already uses the selected theme.
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    updateButton();
    document
      .getElementById("adminThemeToggle")
      ?.addEventListener("click", () => {
        preference = root.dataset.theme === "dark" ? "light" : "dark";
        try {
          localStorage.setItem(key, preference);
        } catch {
          /* Keep the choice for this page. */
        }
        apply();
      });
  });
  document.addEventListener("languagechange", updateButton);
  system.addEventListener("change", () => {
    if (!preference) apply();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      preference = readPreference();
      apply();
    }
  });
})();
