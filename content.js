// Twitch Auto Theme — тема Twitch следует системной; в кинотеатре всегда тёмная.
//
// Как это работает (проверено на живом Twitch 17.10.2026):
//   • Тема страницы хранится в localStorage['twilight.theme']: '1' — тёмная,
//     '0' — светлая. Ключ пишется при document_start, поэтому Twitch сразу
//     стартует в теме системы, без мигания и без кнопок.
//   • Смена темы «на лету» (без кнопок, без перезагрузки, без входа в аккаунт):
//     цвета на странице собраны из CSS-переменных, а переменные, которыми
//     отличаются темы между собой, лежат в vars.js (TWITCH_THEME_DIFF).
//     Расширение переставляет классы tw-root--theme-dark|light и инлайново
//     задаёт эти переменные на <html> и на элементах-обёртках, чья таблица
//     переменных зеркалит тему страницы (styled-components-правила .X.X).
//     Обёртки со «своей» палитрой (например, оверлеи плеера) не трогаются:
//     у них переменные и так одинаковые в обеих темах.
//   • Кинотеатр: всегда тёмная. Twitch сам темнит страницу, но если расширение
//     до этого переставило классы под светлую тему, темнение получается
//     половинчатым (белый чат с бледным текстом). Поэтому в кинотеатре
//     расширение само доводит страницу до тёмной: снимает светлые правки и
//     возвращает классы к тёмным (или, на светло-отрисованной странице, само
//     ставит тёмные переменные). После выхода — возвращает тему системы.
//   • Кнопка «Тёмная тема» в меню профиля не нужна и не используется.
(() => {
  'use strict';

  const THEME_DIFF = window.TWITCH_THEME_DIFF;
  if (!THEME_DIFF) return;

  const KEY = 'twilight.theme';
  const CLASS_DARK = 'tw-root--theme-dark';
  const CLASS_LIGHT = 'tw-root--theme-light';
  const THEATRE_SELECTOR = '.persistent-player--theatre';
  const DIFF_KEYS = Object.keys(THEME_DIFF.dark);

  const media = window.matchMedia('(prefers-color-scheme: dark)');

  // Системная тема сохраняется для следующей загрузки страницы.
  function writeKey() {
    try {
      const value = media.matches ? '1' : '0';
      if (window.localStorage.getItem(KEY) !== value) window.localStorage.setItem(KEY, value);
    } catch (e) { /* localStorage недоступен — не критично */ }
  }

  let naturalDark = null;   // тема, в которой Twitch отрисовал страницу
  let appliedTheme = null;  // 'dark' | 'light' — какие правки стоят сейчас
  let overriddenEls = new Set();
  let classSwapped = false; // переставляли ли мы классы темы

  // --- Поиск обёрток, чья таблица переменных зеркалит текущую тему страницы ---
  // В inline-стилях Twitch есть несколько огромных правил с CSS-переменными:
  // :root (тема страницы) и правила вида .X.X на обёртках. Обёртки с «зеркальной»
  // таблицей надо перебивать вместе с :root; обёртки со своими палитрами — нет.

  const MIRROR_CHECK_KEYS = [
    '--color-background-body',
    '--color-text-base',
    '--color-background-base',
    '--color-background-chat'
  ];
  let mirrorCache = { classes: [], at: 0 };

  function bigThemeRules() {
    const found = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules) {
        const text = rule.cssText;
        if (text && text.length > 20000 && text.indexOf('--color-background-body:') !== -1) {
          found.push({ selector: rule.selectorText || '', text });
        }
      }
    }
    return found;
  }

  function rawValues(text) {
    const values = {};
    for (const key of MIRROR_CHECK_KEYS) {
      const match = new RegExp(key + '\\s*:\\s*([^;]+)').exec(text);
      values[key] = match ? match[1].trim() : null;
    }
    return values;
  }

  function mirrorClasses() {
    const now = Date.now();
    if (now - mirrorCache.at < 8000) return mirrorCache.classes;

    const classes = [];
    const rules = bigThemeRules();
    const rootRule = rules.find((r) => r.selector === ':root');
    const rootVals = rootRule ? rawValues(rootRule.text) : null;

    for (const rule of rules) {
      const match = /^\.([A-Za-z0-9_-]+)\.\1$/.exec(rule.selector);
      if (!match) continue;
      if (rootVals) {
        const vals = rawValues(rule.text);
        if (!MIRROR_CHECK_KEYS.every((k) => vals[k] === rootVals[k])) continue;
      }
      classes.push(match[1]);
    }

    mirrorCache = { classes, at: now };
    return classes;
  }

  function mirrorEls() {
    const els = [];
    for (const cls of mirrorClasses()) {
      const list = document.getElementsByClassName(cls);
      for (const el of list) els.push(el);
    }
    return els;
  }

  // --- Инлайновые правки переменных ---

  function applyOverrides(theme) {
    const table = THEME_DIFF[theme];
    const targets = [document.documentElement, ...mirrorEls()];
    if (appliedTheme === theme && targets.every((el) => overriddenEls.has(el))) return;

    clearOverrides();
    for (const el of targets) {
      for (const key of DIFF_KEYS) el.style.setProperty(key, table[key]);
    }
    overriddenEls = new Set(targets);
    appliedTheme = theme;
  }

  function clearOverrides() {
    if (!overriddenEls.size) { appliedTheme = null; return; }
    for (const el of overriddenEls) {
      for (const key of DIFF_KEYS) el.style.removeProperty(key);
    }
    overriddenEls = new Set();
    appliedTheme = null;
  }

  // --- Классы темы на всех носителях (html и обёртки) ---

  function normalizeClasses(dark) {
    const want = dark ? CLASS_DARK : CLASS_LIGHT;
    const other = dark ? CLASS_LIGHT : CLASS_DARK;
    const els = document.querySelectorAll('.' + other);
    for (const el of els) {
      el.classList.remove(other);
      el.classList.add(want);
    }
  }

  // --- Согласование состояния ---

  function inTheatre() {
    return !!document.querySelector(THEATRE_SELECTOR);
  }

  function normalize() {
    writeKey(); // подстраховка: ключ всегда отражает системную тему

    const html = document.documentElement;
    if (!html) return;

    if (naturalDark === null) {
      if (html.classList.contains(CLASS_DARK)) naturalDark = true;
      else if (html.classList.contains(CLASS_LIGHT)) naturalDark = false;
      else return; // Twitch ещё не отрисовал тему
    }

    if (inTheatre()) {
      // Кинотеатр: всегда тёмная — доводим до неё сами.
      if (naturalDark) {
        // Страница отрисована тёмной: убираем светлые правки и возвращаем
        // классы к тёмным, дальше Twitch темнит сам.
        clearOverrides();
        if (classSwapped) {
          normalizeClasses(true);
          classSwapped = false;
        }
      } else {
        // Страница отрисована светлой: ставим тёмные переменные и классы сами.
        applyOverrides('dark');
        normalizeClasses(true);
        classSwapped = true;
      }
      return;
    }

    const want = media.matches;
    if (want === naturalDark) {
      clearOverrides();
      if (classSwapped) {
        normalizeClasses(naturalDark);
        classSwapped = false;
      }
      return;
    }

    applyOverrides(want ? 'dark' : 'light');
    normalizeClasses(want);
    classSwapped = true;
  }

  // --- Запуск ---

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      normalize();
    }, 120);
  }

  writeKey();

  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class']
  });

  const onMediaChange = () => {
    writeKey();
    schedule();
  };
  if (typeof media.addEventListener === 'function') media.addEventListener('change', onMediaChange);
  else if (typeof media.addListener === 'function') media.addListener(onMediaChange);

  window.addEventListener('load', schedule, { once: true });
  schedule();
})();
