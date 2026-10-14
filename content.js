// Тема Twitch в DOM задаётся классами на <html>:
//   tw-root--theme-dark / tw-root--theme-light.
// Twitch сам переключает их в useLayoutEffect при смене темы пользователя.
// Мы делаем то же самое по теме системы, без перезагрузки страницы.
//
// Дополнительно держим localStorage["twilight.theme"] = "1"/"0", чтобы при
// полной загрузке страницы Twitch сразу стартовал в нужной теме.
(() => {
  "use strict";

  const THEME_KEY = "twilight.theme";
  const DARK_CLASS = "tw-root--theme-dark";
  const LIGHT_CLASS = "tw-root--theme-light";
  const BODY_DARK_CLASS = "dark-theme"; // тема для страниц без входа

  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const persistTheme = () => {
    try {
      const value = media.matches ? "1" : "0";
      if (window.localStorage.getItem(THEME_KEY) !== value) {
        window.localStorage.setItem(THEME_KEY, value);
      }
    } catch (error) {
      // localStorage может быть недоступен: приватный режим, политика.
    }
  };

  const applyClasses = () => {
    const root = document.documentElement;
    if (root) {
      root.classList.toggle(DARK_CLASS, media.matches);
      root.classList.toggle(LIGHT_CLASS, !media.matches);
    }
    const body = document.body;
    if (body) {
      body.classList.toggle(BODY_DARK_CLASS, media.matches);
    }
  };

  const apply = () => {
    persistTheme();
    applyClasses();
  };

  apply();

  // Смена темы системы на открытой вкладке: без перезагрузки.
  media.addEventListener("change", apply);

  // Следим за <html>, чтобы вернуть нужные классы, если Twitch перерисует их
  // при навигации внутри приложения.
  const observeRoot = () => {
    const root = document.documentElement;
    if (!root) return;
    const observer = new MutationObserver(() => {
      const hasDark = root.classList.contains(DARK_CLASS);
      const hasLight = root.classList.contains(LIGHT_CLASS);
      if (media.matches ? !hasDark || hasLight : hasDark || !hasLight) {
        applyClasses();
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      apply();
      observeRoot();
    });
  } else {
    observeRoot();
  }
})();